/**
 * Cliente do assistente RAG.
 *
 * A chave da API nunca chega ao browser: este hook apenas monta o contexto
 * (notícias filtradas + atores com SNA) e delega a chamada ao Gemini para a
 * função serverless `/api/chat`.
 */
import { useCallback, useRef, useState } from 'react';
import type {
  AtorComSNA,
  ChatMessage,
  ChatRequest,
  ContextoRAG,
  MetricasGerais,
  ModeloGemini,
  Noticia,
} from '@/types';
import { MODELO_PADRAO } from '@/types';

/** Limites de contexto — evitam estourar o payload da função serverless. */
const MAX_NOTICIAS_CONTEXTO = 40;
const MAX_ATORES_CONTEXTO = 40;
const MAX_CARACTERES_CONTEUDO = 1500;

function novoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Seleciona as notícias mais relevantes para a pergunta.
 *
 * Recuperação lexical simples (mesma estratégia do `responder_chat` original):
 * pontua por ocorrência dos termos da pergunta no título e no conteúdo, com peso
 * maior para o título. Se nada casar, devolve as mais recentes.
 */
const STOPWORDS_BUSCA = new Set([
  'quais', 'quantas', 'quantos', 'sobre', 'noticias', 'notícias', 'citam',
  'falam', 'tem', 'que', 'para', 'como', 'qual', 'onde', 'das', 'dos', 'quem',
  'é', 'o', 'a', 'de', 'da', 'do', 'em', 'no', 'na', 'os', 'as', 'um', 'uma',
]);

function extrairTermos(pergunta: string): string[] {
  return pergunta
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((termo) => termo.length > 2 && !STOPWORDS_BUSCA.has(termo));
}

function selecionarNoticias(noticias: Noticia[], pergunta: string): Noticia[] {
  const termos = extrairTermos(pergunta);

  if (termos.length === 0) {
    return [...noticias]
      .sort((a, b) => (b.dataConvertida?.getTime() ?? 0) - (a.dataConvertida?.getTime() ?? 0))
      .slice(0, MAX_NOTICIAS_CONTEXTO);
  }

  const pontuadas = noticias
    .map((noticia) => {
      const titulo = noticia.titulo.toLowerCase();
      const conteudo = noticia.conteudo.toLowerCase();
      let pontos = 0;
      for (const termo of termos) {
        if (titulo.includes(termo)) pontos += 3;
        if (conteudo.includes(termo)) pontos += 1;
      }
      return { noticia, pontos };
    })
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);

  if (pontuadas.length === 0) {
    return [...noticias]
      .sort((a, b) => (b.dataConvertida?.getTime() ?? 0) - (a.dataConvertida?.getTime() ?? 0))
      .slice(0, MAX_NOTICIAS_CONTEXTO);
  }

  return pontuadas.slice(0, MAX_NOTICIAS_CONTEXTO).map((item) => item.noticia);
}

function selecionarAtores(atores: AtorComSNA[], pergunta: string): AtorComSNA[] {
  const termos = extrairTermos(pergunta);

  const relevantes =
    termos.length > 0
      ? atores.filter((ator) => {
          const alvo = `${ator.nome} ${ator.descricao}`.toLowerCase();
          return termos.some((termo) => alvo.includes(termo));
        })
      : [];

  // Complementa com os atores mais centrais, dando à IA o panorama da rede.
  const maisCentrais = [...atores]
    .sort((a, b) => b.grauAbsoluto - a.grauAbsoluto)
    .slice(0, MAX_ATORES_CONTEXTO);

  const vistos = new Set<string>();
  const resultado: AtorComSNA[] = [];
  for (const ator of [...relevantes, ...maisCentrais]) {
    if (vistos.has(ator.nome)) continue;
    vistos.add(ator.nome);
    resultado.push(ator);
    if (resultado.length >= MAX_ATORES_CONTEXTO) break;
  }
  return resultado;
}

function montarContexto(
  pergunta: string,
  noticias: Noticia[],
  atores: AtorComSNA[],
  metricas: MetricasGerais,
): ContextoRAG {
  return {
    metricas,
    noticias: selecionarNoticias(noticias, pergunta).map((n) => ({
      id: n.id,
      titulo: n.titulo,
      data: n.data,
      url: n.url,
      categorias: n.categorias,
      conteudo: n.conteudo.slice(0, MAX_CARACTERES_CONTEUDO),
    })),
    atores: selecionarAtores(atores, pergunta).map((a) => ({
      nome: a.nome,
      tipo: a.tipo,
      descricao: a.descricao,
      citacoes: a.citacoes,
      grauAbsoluto: a.grauAbsoluto,
      betweenness: a.betweenness,
      closeness: a.closeness,
    })),
  };
}

interface OpcoesChat {
  noticias: Noticia[];
  atores: AtorComSNA[];
  metricas: MetricasGerais;
}

export function useGeminiChat({ noticias, atores, metricas }: OpcoesChat) {
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [modelo, setModelo] = useState<ModeloGemini>(MODELO_PADRAO);

  // Mantém os dados atuais acessíveis sem recriar `enviar` a cada filtro alterado.
  const dadosRef = useRef({ noticias, atores, metricas });
  dadosRef.current = { noticias, atores, metricas };

  const abortRef = useRef<AbortController | null>(null);

  const enviar = useCallback(
    async (pergunta: string) => {
      const texto = pergunta.trim();
      if (!texto || carregando) return;

      const mensagemUsuario: ChatMessage = {
        id: novoId(),
        role: 'user',
        content: texto,
      };
      const idResposta = novoId();

      // Histórico enviado à IA: tudo que já existe + a pergunta nova.
      const historico = [...mensagens, mensagemUsuario].map(({ role, content }) => ({
        role,
        content,
      }));

      setMensagens((atual) => [
        ...atual,
        mensagemUsuario,
        { id: idResposta, role: 'assistant', content: '', carregando: true },
      ]);
      setCarregando(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { noticias: n, atores: a, metricas: m } = dadosRef.current;
        const corpo: ChatRequest = {
          mensagens: historico,
          modelo,
          contexto: montarContexto(texto, n, a, m),
        };

        const resposta = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
          signal: controller.signal,
        });

        const dados = (await resposta.json().catch(() => null)) as
          | { texto?: string; erro?: string }
          | null;

        if (!resposta.ok || !dados || dados.erro) {
          throw new Error(dados?.erro ?? `Falha na resposta (HTTP ${resposta.status})`);
        }

        setMensagens((atual) =>
          atual.map((msg) =>
            msg.id === idResposta
              ? { ...msg, content: dados.texto ?? '', carregando: false }
              : msg,
          ),
        );
      } catch (erro) {
        if (controller.signal.aborted) return;
        const detalhe = erro instanceof Error ? erro.message : 'Erro desconhecido';
        setMensagens((atual) =>
          atual.map((msg) =>
            msg.id === idResposta
              ? {
                  ...msg,
                  content: `Não consegui responder agora. ${detalhe}`,
                  carregando: false,
                  erro: true,
                }
              : msg,
          ),
        );
      } finally {
        setCarregando(false);
      }
    },
    [carregando, mensagens, modelo],
  );

  const limpar = useCallback(() => {
    abortRef.current?.abort();
    setMensagens([]);
    setCarregando(false);
  }, []);

  return { mensagens, carregando, modelo, setModelo, enviar, limpar };
}
