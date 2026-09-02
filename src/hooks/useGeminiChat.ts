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

/** Caractere de controle usado pela função `/api/chat` para sinalizar um erro em pleno stream. */
const MARCA_ERRO_NO_STREAM = String.fromCharCode(0);

/** Intervalo entre "toques" da revelação, em ms — controla a velocidade da digitação. */
const INTERVALO_REVELACAO_MS = 18;

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
  const revelacaoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararRevelacao = useCallback(() => {
    if (revelacaoRef.current !== null) {
      clearInterval(revelacaoRef.current);
      revelacaoRef.current = null;
    }
  }, []);

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
      pararRevelacao();
      const controller = new AbortController();
      abortRef.current = controller;

      /**
       * O texto chega em pedaços (streaming real do Gemini quando o runtime
       * suporta, ou de uma vez só em ambientes que armazenam a resposta em
       * buffer). Em ambos os casos, um relógio próprio "revela" o buffer
       * caractere a caractere na tela — daí o efeito de máquina de escrever
       * ser sempre visível, independente da granularidade da rede.
       */
      let bufferCompleto = '';
      let posicaoRevelada = 0;
      let streamEncerrado = false;
      let mensagemErro: string | null = null;

      const finalizarMensagem = () => {
        pararRevelacao();
        setCarregando(false);
        setMensagens((atual) =>
          atual.map((msg) =>
            msg.id === idResposta
              ? {
                  ...msg,
                  content: mensagemErro
                    ? `Não consegui responder agora. ${mensagemErro}`
                    : bufferCompleto,
                  carregando: false,
                  streaming: false,
                  erro: Boolean(mensagemErro),
                }
              : msg,
          ),
        );
      };

      const iniciarRevelacao = () => {
        if (revelacaoRef.current !== null) return;
        revelacaoRef.current = setInterval(() => {
          const restante = bufferCompleto.length - posicaoRevelada;

          if (restante <= 0) {
            if (streamEncerrado) finalizarMensagem();
            return;
          }

          // Digitação suave enquanto os dados ainda chegam; se o stream já
          // terminou e sobrou muito texto acumulado, acelera para não deixar
          // o usuário esperando uma animação longa por nada.
          const porToque = streamEncerrado
            ? Math.max(4, Math.ceil(restante / 30))
            : Math.max(1, Math.ceil(restante / 8));
          posicaoRevelada = Math.min(bufferCompleto.length, posicaoRevelada + porToque);

          setMensagens((atual) =>
            atual.map((msg) =>
              msg.id === idResposta
                ? {
                    ...msg,
                    content: bufferCompleto.slice(0, posicaoRevelada),
                    carregando: false,
                    streaming: true,
                  }
                : msg,
            ),
          );

          if (posicaoRevelada >= bufferCompleto.length && streamEncerrado) {
            finalizarMensagem();
          }
        }, INTERVALO_REVELACAO_MS);
      };

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

        if (!resposta.ok) {
          const dados = (await resposta.json().catch(() => null)) as { erro?: string } | null;
          throw new Error(dados?.erro ?? `Falha na resposta (HTTP ${resposta.status})`);
        }
        if (!resposta.body) {
          throw new Error('O servidor não retornou conteúdo.');
        }

        const leitor = resposta.body.getReader();
        const decodificador = new TextDecoder();
        iniciarRevelacao();

        while (true) {
          const { value, done } = await leitor.read();
          if (done) break;

          const pedaco = decodificador.decode(value, { stream: true });
          const indiceErro = pedaco.indexOf(MARCA_ERRO_NO_STREAM);

          if (indiceErro !== -1) {
            bufferCompleto += pedaco.slice(0, indiceErro);
            mensagemErro = pedaco.slice(indiceErro + 1) || 'Resposta interrompida.';
            break;
          }

          bufferCompleto += pedaco;
        }

        streamEncerrado = true;
        if (bufferCompleto.length === 0 && !mensagemErro) {
          mensagemErro = 'O modelo retornou uma resposta vazia. Tente reformular a pergunta.';
        }
        // Cobre o caso em que o corpo inteiro já chegou antes do primeiro
        // toque do relógio de revelação (comum fora de streaming real).
        if (posicaoRevelada >= bufferCompleto.length) finalizarMensagem();
      } catch (erro) {
        if (controller.signal.aborted) return;
        pararRevelacao();
        const detalhe = erro instanceof Error ? erro.message : 'Erro desconhecido';
        setCarregando(false);
        setMensagens((atual) =>
          atual.map((msg) =>
            msg.id === idResposta
              ? {
                  ...msg,
                  content: `Não consegui responder agora. ${detalhe}`,
                  carregando: false,
                  streaming: false,
                  erro: true,
                }
              : msg,
          ),
        );
      }
    },
    [carregando, mensagens, modelo, pararRevelacao],
  );

  const limpar = useCallback(() => {
    abortRef.current?.abort();
    pararRevelacao();
    setMensagens([]);
    setCarregando(false);
  }, [pararRevelacao]);

  return { mensagens, carregando, modelo, setModelo, enviar, limpar };
}
