/**
 * Estado de interface do assistente editorial. A lógica de cada rodada
 * (contexto, guardrails de saída, chamada ao modelo) vive em `lib/ia/conversa`.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '@/types';
import { useIA } from '@/lib/ia/conexao';
import { ErroIA, type MensagemIA } from '@/lib/ia/cliente';
import { criarIndice } from '@/lib/ia/contexto';
import { executarRodada, type DadosAssistente } from '@/lib/ia/conversa';
import { avaliarEntrada, gerarCanario } from '@/lib/ia/guardrails';
import { PROVEDORES } from '@/lib/ia/provedores';

const novoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Trocas bem-sucedidas anteriores a `ate` (exclusivo), no formato do modelo. */
function historicoAte(mensagens: ChatMessage[], ate: number): MensagemIA[] {
  return mensagens
    .slice(0, ate)
    .filter((m) => !m.erro && m.content && !m.carregando)
    .map(({ role, content }) => ({ role, content }));
}

export function useAssistente(dados: DadosAssistente) {
  const { conexao, modelo } = useIA();
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [avisoEntrada, setAvisoEntrada] = useState<string | null>(null);

  // O índice de busca só é refeito quando o acervo muda (não a cada filtro).
  const indice = useMemo(() => criarIndice(dados.acervo), [dados.acervo]);
  const canario = useMemo(gerarCanario, []);

  const dadosRef = useRef(dados);
  dadosRef.current = dados;
  const abortRef = useRef<AbortController | null>(null);
  const ultimoEnvioRef = useRef(0);

  const atualizar = (id: string, parcial: Partial<ChatMessage>) =>
    setMensagens((atual) => atual.map((m) => (m.id === id ? { ...m, ...parcial } : m)));

  /** Roda o modelo e escreve o resultado na mensagem `idResposta`. */
  const rodar = useCallback(
    async (opcoes: {
      idResposta: string;
      pergunta: string;
      suspeitaInjecao: boolean;
      historico: MensagemIA[];
      continuarDe?: string;
    }) => {
      if (!conexao || !modelo) return;
      setCarregando(true);
      abortRef.current?.abort();
      const controle = new AbortController();
      abortRef.current = controle;

      // Repinta no máximo uma vez por quadro, por mais rápido que o stream chegue.
      let pendente = opcoes.continuarDe ?? '';
      let quadro = 0;
      const pintar = () => {
        quadro = 0;
        atualizar(opcoes.idResposta, { content: pendente, carregando: false, streaming: true });
      };

      try {
        const resultado = await executarRodada({
          conexao,
          modelo,
          pergunta: opcoes.pergunta,
          suspeitaInjecao: opcoes.suspeitaInjecao,
          historico: opcoes.historico,
          dados: dadosRef.current,
          indice,
          canario,
          signal: controle.signal,
          continuarDe: opcoes.continuarDe,
          onParcial: (texto) => {
            pendente = texto;
            if (!quadro) quadro = requestAnimationFrame(pintar);
          },
        });
        cancelAnimationFrame(quadro);
        const vazio = !resultado.texto.trim();
        atualizar(opcoes.idResposta, {
          content: vazio
            ? 'O modelo não retornou texto. Tente reformular a pergunta ou trocar de modelo.'
            : resultado.texto,
          carregando: false,
          streaming: false,
          erro: vazio,
          cortado: resultado.cortado,
          urlsVerificadas: resultado.urls,
        });
      } catch (erro) {
        cancelAnimationFrame(quadro);
        if (controle.signal.aborted) {
          // Parada pelo usuário: mantém o que já chegou.
          atualizar(opcoes.idResposta, {
            content: pendente ? `${pendente}\n\n*(resposta interrompida)*` : 'Resposta interrompida.',
            carregando: false,
            streaming: false,
          });
        } else if (opcoes.continuarDe) {
          // Falha ao continuar: preserva o trecho anterior e permite tentar de novo.
          atualizar(opcoes.idResposta, { content: opcoes.continuarDe, streaming: false, cortado: true });
          setAvisoEntrada(erro instanceof ErroIA ? erro.message : 'Não foi possível continuar a resposta.');
        } else {
          atualizar(opcoes.idResposta, {
            content: erro instanceof ErroIA ? erro.message : 'Erro inesperado ao consultar o modelo. Tente novamente.',
            carregando: false,
            streaming: false,
            erro: true,
          });
        }
      } finally {
        if (abortRef.current === controle) abortRef.current = null;
        setCarregando(false);
      }
    },
    [conexao, modelo, indice, canario],
  );

  const enviar = useCallback(
    async (pergunta: string): Promise<boolean> => {
      if (carregando || !conexao || !modelo) return false;

      const avaliacao = avaliarEntrada(pergunta, ultimoEnvioRef.current);
      if (!avaliacao.ok) {
        setAvisoEntrada(avaliacao.motivo);
        return false;
      }
      setAvisoEntrada(null);
      ultimoEnvioRef.current = Date.now();

      const agora = Date.now();
      const idResposta = novoId();
      const historico = historicoAte(mensagens, mensagens.length);
      setMensagens((atual) => [
        ...atual,
        { id: novoId(), role: 'user', content: avaliacao.texto, criadaEm: agora },
        {
          id: idResposta,
          role: 'assistant',
          content: '',
          carregando: true,
          criadaEm: agora,
          modelo: `${modelo} · ${PROVEDORES[conexao.provedor].nome}`,
          pergunta: avaliacao.texto,
          suspeitaInjecao: avaliacao.suspeitaInjecao,
        },
      ]);
      void rodar({ idResposta, pergunta: avaliacao.texto, suspeitaInjecao: avaliacao.suspeitaInjecao, historico });
      return true;
    },
    [carregando, conexao, modelo, mensagens, rodar],
  );

  /** Pede ao modelo que prossiga uma resposta cortada pelo limite de tokens. */
  const continuar = useCallback(
    (id: string) => {
      const posicao = mensagens.findIndex((m) => m.id === id);
      const alvo = mensagens[posicao];
      if (carregando || !alvo?.pergunta) return;
      setAvisoEntrada(null);
      atualizar(id, { cortado: false, streaming: true });
      // Histórico até antes da pergunta que originou esta resposta.
      void rodar({
        idResposta: id,
        pergunta: alvo.pergunta,
        suspeitaInjecao: Boolean(alvo.suspeitaInjecao),
        historico: historicoAte(mensagens, Math.max(0, posicao - 1)),
        continuarDe: alvo.content,
      });
    },
    [carregando, mensagens, rodar],
  );

  const parar = useCallback(() => abortRef.current?.abort(), []);

  const limpar = useCallback(() => {
    abortRef.current?.abort();
    setMensagens([]);
    setAvisoEntrada(null);
    setCarregando(false);
  }, []);

  return { mensagens, carregando, enviar, continuar, parar, limpar, avisoEntrada, setAvisoEntrada };
}
