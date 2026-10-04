/**
 * Uma rodada do assistente, sem React: guardrails de saída, montagem do
 * contexto, chamada ao modelo e pós-processamento. O hook `useAssistente`
 * cuida só do estado da interface; os testes exercitam esta função direto.
 */
import type { AtorComSNA, Filtros, MetricasGerais, Noticia } from '@/types';
import { conversar, type MensagemIA } from './cliente';
import { montarContexto, montarSistema, type IndiceAcervo } from './contexto';
import { AVISO_INJECAO, LIMITES, RESPOSTA_VAZAMENTO } from './guardrails';
import type { Conexao } from './provedores';

export interface DadosAssistente {
  acervo: Noticia[];
  recorte: Noticia[];
  filtros: Filtros;
  periodoCompleto: { inicio: string; fim: string };
  metricas: MetricasGerais;
  atores: AtorComSNA[];
}

export interface PedidoRodada {
  conexao: Conexao;
  modelo: string;
  /** Pergunta já validada por `avaliarEntrada`. */
  pergunta: string;
  suspeitaInjecao: boolean;
  /** Trocas anteriores bem-sucedidas (sem a pergunta atual). */
  historico: MensagemIA[];
  dados: DadosAssistente;
  indice: IndiceAcervo;
  canario: string;
  signal?: AbortSignal;
  /** Texto acumulado da resposta, a cada pedaço. */
  onParcial?: (texto: string) => void;
  /** Para "continuar": o trecho já respondido, que o modelo deve prosseguir. */
  continuarDe?: string;
  /** Repassados ao cliente (testes usam valores curtos). */
  tempoLimiteMs?: number;
  inatividadeMs?: number;
}

export interface ResultadoRodada {
  texto: string;
  cortado: boolean;
  /** O modelo tentou reproduzir as instruções internas (canário). */
  vazamento: boolean;
  /** URLs do acervo enviadas como contexto (verificação de links). */
  urls: string[];
}

const PEDIDO_CONTINUACAO =
  'Sua resposta anterior foi interrompida pelo limite de tamanho. Continue exatamente do ponto em que parou, sem repetir nada do que já escreveu e sem comentários sobre a interrupção.';

/** Executa uma rodada; lança `ErroIA` em falhas do provedor e `AbortError` se cancelada. */
export async function executarRodada(p: PedidoRodada): Promise<ResultadoRodada> {
  const contexto = montarContexto({ pergunta: p.pergunta, indice: p.indice, ...p.dados });
  const sistema = montarSistema(contexto.texto, p.canario, new Date().toLocaleDateString('pt-BR'));
  const urls = [...contexto.urls];

  // Histórico enxuto: últimos N turnos. Anthropic/Gemini exigem começar pelo usuário.
  const mensagens = p.historico.slice(-LIMITES.turnosHistorico * 2);
  while (mensagens[0]?.role === 'assistant') mensagens.shift();
  mensagens.push({ role: 'user', content: p.suspeitaInjecao ? AVISO_INJECAO + p.pergunta : p.pergunta });
  if (p.continuarDe) {
    mensagens.push({ role: 'assistant', content: p.continuarDe }, { role: 'user', content: PEDIDO_CONTINUACAO });
  }

  const prefixo = p.continuarDe ?? '';
  const interno = new AbortController();
  const signal = p.signal ? AbortSignal.any([p.signal, interno.signal]) : interno.signal;
  let vazamento = false;

  try {
    const resposta = await conversar({
      conexao: p.conexao,
      modelo: p.modelo,
      sistema,
      mensagens,
      signal,
      maxTokens: LIMITES.maxTokensResposta,
      tempoLimiteMs: p.tempoLimiteMs,
      inatividadeMs: p.inatividadeMs,
      onTexto: (acumulado) => {
        // Guardrail de saída: interrompe assim que o canário aparece.
        if (acumulado.includes(p.canario)) {
          vazamento = true;
          interno.abort();
          return;
        }
        p.onParcial?.(prefixo + acumulado);
      },
    });
    if (resposta.texto.includes(p.canario)) vazamento = true;
    return vazamento
      ? { texto: RESPOSTA_VAZAMENTO, cortado: false, vazamento, urls }
      : { texto: prefixo + resposta.texto, cortado: resposta.cortado, vazamento, urls };
  } catch (erro) {
    // Abort provocado pelo canário vira resposta de recusa, não erro.
    if (vazamento && !p.signal?.aborted) return { texto: RESPOSTA_VAZAMENTO, cortado: false, vazamento, urls };
    throw erro;
  }
}
