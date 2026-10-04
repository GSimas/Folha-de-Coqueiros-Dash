/**
 * Cliente de chat com streaming para os três formatos de API suportados
 * (OpenAI-compatível, Anthropic e Gemini), direto do navegador.
 *
 * Robustez:
 *  - novas tentativas com backoff antes do primeiro byte (429/5xx/rede);
 *  - tempo limite total e tempo limite de INATIVIDADE (stream "travado");
 *  - detecção de resposta cortada por limite de tokens (`cortado`), para a
 *    interface oferecer "continuar";
 *  - erros traduzidos para mensagens acionáveis, sem nunca ecoar a chave.
 */
import { PROVEDORES, cabecalhosAuth, type Conexao, type FormatoAPI } from './provedores';

export interface MensagemIA {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpcoesChat {
  conexao: Conexao;
  modelo: string;
  sistema: string;
  mensagens: MensagemIA[];
  signal?: AbortSignal;
  temperatura?: number;
  maxTokens?: number;
  /** Recebe o texto acumulado a cada pedaço do stream. */
  onTexto?: (acumulado: string) => void;
  /** Tempo máximo da requisição inteira. */
  tempoLimiteMs?: number;
  /** Tempo máximo sem receber nenhum byte (inclui os keep-alives do provedor). */
  inatividadeMs?: number;
}

export interface RespostaIA {
  texto: string;
  /** `true` quando o provedor interrompeu a resposta pelo limite de tokens. */
  cortado: boolean;
}

const TEMPO_LIMITE_MS = 180_000;
const INATIVIDADE_MS = 60_000;
const MAX_TENTATIVAS = 3;

export class ErroIA extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ErroIA';
  }
}

const espera = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Abortado', 'AbortError'));
    const aoAbortar = () => {
      clearTimeout(timer);
      reject(new DOMException('Abortado', 'AbortError'));
    };
    // Remove o ouvinte ao terminar a espera: o sinal vive a requisição inteira.
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aoAbortar);
      resolve();
    }, ms);
    signal?.addEventListener('abort', aoAbortar, { once: true });
  });

/** Remove a chave de qualquer texto vindo do provedor e limita o tamanho. */
function higienizar(texto: string, chave: string): string {
  let limpo = texto;
  if (chave) limpo = limpo.split(chave).join('••••');
  limpo = limpo.replace(/\b(sk|key|AIza)[-_A-Za-z0-9]{12,}/g, '••••');
  return limpo.length > 240 ? `${limpo.slice(0, 240)}…` : limpo;
}

function mensagemPorStatus(status: number, nomeProvedor: string, detalhe: string): string {
  const sufixo = detalhe ? ` (${detalhe})` : '';
  if (status === 401 || status === 403) {
    return `O ${nomeProvedor} recusou a chave ou o acesso a este modelo. Reconecte ou escolha outro modelo.${sufixo}`;
  }
  if (status === 402) {
    return `Sem créditos no ${nomeProvedor} para este modelo. Escolha um modelo gratuito ou adicione créditos.${sufixo}`;
  }
  if (status === 404) return `Modelo não encontrado no ${nomeProvedor}. Escolha outro na lista.${sufixo}`;
  if (status === 413) return 'A pergunta com o contexto ficou grande demais para este modelo. Tente outro modelo.';
  if (status === 429) {
    return `Limite de uso atingido no ${nomeProvedor}. Modelos gratuitos têm cotas por minuto e por dia — aguarde um pouco ou troque de modelo.${sufixo}`;
  }
  if (status >= 500) return `O ${nomeProvedor} está instável no momento. Tente novamente em instantes.${sufixo}`;
  return `O ${nomeProvedor} rejeitou a requisição (HTTP ${status}).${sufixo}`;
}

async function extrairDetalheErro(resposta: Response): Promise<string> {
  const texto = await resposta.text().catch(() => '');
  try {
    const json = JSON.parse(texto) as { error?: { message?: string } | string; message?: string };
    if (typeof json.error === 'string') return json.error;
    return json.error?.message ?? json.message ?? '';
  } catch {
    return texto.slice(0, 200);
  }
}

/** Monta URL, cabeçalhos e corpo da requisição no formato de cada provedor. */
function montarRequisicao(opcoes: OpcoesChat, semTemperatura: boolean) {
  const { conexao, modelo, sistema, mensagens, temperatura = 0.2, maxTokens = 4096 } = opcoes;
  const provedor = PROVEDORES[conexao.provedor];
  const headers = { 'Content-Type': 'application/json', ...cabecalhosAuth(conexao) };

  if (provedor.formato === 'anthropic') {
    return {
      url: `${provedor.baseUrl}/messages`,
      headers,
      body: {
        model: modelo,
        system: sistema,
        messages: mensagens,
        max_tokens: maxTokens,
        ...(semTemperatura ? {} : { temperature: temperatura }),
        stream: true,
      },
    };
  }

  if (provedor.formato === 'gemini') {
    return {
      url: `${provedor.baseUrl}/models/${encodeURIComponent(modelo)}:streamGenerateContent?alt=sse`,
      headers,
      body: {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensagens.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(semTemperatura ? {} : { temperature: temperatura }),
        },
      },
    };
  }

  return {
    url: `${provedor.baseUrl}/chat/completions`,
    headers,
    body: {
      model: modelo,
      messages: [{ role: 'system', content: sistema }, ...mensagens],
      stream: true,
      // A OpenAI trocou `max_tokens` por `max_completion_tokens` nos modelos recentes.
      ...(conexao.provedor === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(semTemperatura ? {} : { temperature: temperatura }),
    },
  };
}

interface Pedaco {
  texto: string;
  /** Motivo de término normalizado, quando o evento o informa. */
  fim?: 'limite' | 'filtro' | 'normal';
}

/** Extrai texto incremental e motivo de término de um evento SSE já decodificado. */
export function interpretarEvento(formato: FormatoAPI, evento: Record<string, unknown>): Pedaco {
  if (formato === 'anthropic') {
    if (evento.type === 'error') {
      throw new ErroIA(String((evento.error as { message?: string })?.message ?? 'Erro no stream.'));
    }
    const delta = evento.delta as { type?: string; text?: string; stop_reason?: string } | undefined;
    if (evento.type === 'message_delta' && delta?.stop_reason) {
      return { texto: '', fim: delta.stop_reason === 'max_tokens' ? 'limite' : 'normal' };
    }
    return { texto: evento.type === 'content_block_delta' && delta?.type === 'text_delta' ? (delta.text ?? '') : '' };
  }

  if (formato === 'gemini') {
    const bloqueio = (evento.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
    if (bloqueio) throw new ErroIA(`O provedor bloqueou a pergunta por política de segurança (${bloqueio}).`);
    const candidato = (
      evento.candidates as Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    )?.[0];
    const texto = (candidato?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    const motivo = candidato?.finishReason;
    const fim = !motivo ? undefined : motivo === 'MAX_TOKENS' ? 'limite' : /SAFETY|BLOCK|PROHIBITED/.test(motivo) ? 'filtro' : 'normal';
    return { texto, fim };
  }

  // OpenAI-compatível (inclui o formato de erro em pleno stream do OpenRouter)
  if (evento.error) {
    const erro = evento.error as { message?: string; code?: number };
    throw new ErroIA(erro.message ?? 'Erro no stream.', erro.code);
  }
  const escolha = (evento.choices as Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>)?.[0];
  const motivo = escolha?.finish_reason;
  return {
    texto: escolha?.delta?.content ?? '',
    fim: !motivo ? undefined : motivo === 'length' ? 'limite' : motivo === 'content_filter' ? 'filtro' : 'normal',
  };
}

/** Lê um corpo SSE linha a linha, entregando cada payload `data:` em JSON. */
async function lerSSE(
  corpo: ReadableStream<Uint8Array>,
  sinal: AbortSignal,
  aoReceberBytes: () => void,
  aoEvento: (dado: Record<string, unknown>) => void,
) {
  const leitor = corpo.getReader();
  // Cancela a leitura em curso ao abortar: sem isto, um stream que para de
  // enviar sem fechar deixaria `read()` pendurado para sempre em ambientes
  // que não amarram o corpo da resposta ao sinal do fetch.
  const cancelar = () => void leitor.cancel().catch(() => {});
  sinal.addEventListener('abort', cancelar);
  const decodificador = new TextDecoder();
  let pendente = '';

  const processar = (linha: string) => {
    // Comentários SSE (`: OPENROUTER PROCESSING`) e linhas `event:` são ignorados.
    if (!linha.startsWith('data:')) return;
    const dado = linha.slice(5).trim();
    if (!dado || dado === '[DONE]') return;
    try {
      aoEvento(JSON.parse(dado) as Record<string, unknown>);
    } catch (erro) {
      if (erro instanceof ErroIA) throw erro;
      // JSON malformado de um provedor: ignora o evento.
    }
  };

  try {
    while (true) {
      const { value, done } = await leitor.read();
      if (sinal.aborted) throw sinal.reason ?? new DOMException('Abortado', 'AbortError');
      if (done) break;
      aoReceberBytes();
      pendente += decodificador.decode(value, { stream: true });
      const linhas = pendente.split(/\r?\n/);
      pendente = linhas.pop() ?? '';
      linhas.forEach(processar);
    }
    // Último evento sem quebra de linha final.
    pendente += decodificador.decode();
    if (pendente) processar(pendente);
  } finally {
    sinal.removeEventListener('abort', cancelar);
    leitor.releaseLock();
  }
}

/** Envia a conversa e devolve o texto completo, chamando `onTexto` a cada pedaço. */
export async function conversar(opcoes: OpcoesChat): Promise<RespostaIA> {
  const { conexao, signal, onTexto, tempoLimiteMs = TEMPO_LIMITE_MS, inatividadeMs = INATIVIDADE_MS } = opcoes;
  const provedor = PROVEDORES[conexao.provedor];

  // Três fontes de cancelamento: usuário, tempo total e inatividade.
  const inatividade = new AbortController();
  const tempoTotal = AbortSignal.timeout(tempoLimiteMs);
  const sinal = AbortSignal.any([inatividade.signal, tempoTotal, ...(signal ? [signal] : [])]);
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const reiniciarRelogio = () => {
    clearTimeout(relogio);
    relogio = setTimeout(() => inatividade.abort(), inatividadeMs);
  };

  const traduzirAbort = (erro: unknown): never => {
    if (signal?.aborted) throw erro; // cancelado pelo usuário: propaga como está
    if (inatividade.signal.aborted) {
      throw new ErroIA(
        `O ${provedor.nome} parou de responder (nenhum dado por ${Math.round(inatividadeMs / 1000)} s). Tente novamente ou troque de modelo.`,
      );
    }
    throw new ErroIA('O provedor demorou demais para responder. Tente novamente ou troque de modelo.');
  };

  try {
    let semTemperatura = false;
    let resposta: Response | null = null;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      const { url, headers, body } = montarRequisicao(opcoes, semTemperatura);
      reiniciarRelogio();
      try {
        resposta = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: sinal });
      } catch (erro) {
        if (sinal.aborted) traduzirAbort(erro);
        if (tentativa === MAX_TENTATIVAS) {
          throw new ErroIA(`Não foi possível alcançar o ${provedor.nome}. Verifique sua conexão.`);
        }
        await espera(1000 * tentativa, sinal).catch(traduzirAbort);
        continue;
      }

      if (resposta.ok) break;

      const detalhe = higienizar(await extrairDetalheErro(resposta), conexao.chave);

      // Alguns modelos (raciocínio) só aceitam a temperatura padrão.
      if (resposta.status === 400 && /temperature/i.test(detalhe) && !semTemperatura) {
        semTemperatura = true;
        tentativa--;
        continue;
      }

      const transitorio = resposta.status === 429 || resposta.status >= 500;
      if (!transitorio || tentativa === MAX_TENTATIVAS) {
        throw new ErroIA(mensagemPorStatus(resposta.status, provedor.nome, detalhe), resposta.status);
      }
      const retryAfter = Number(resposta.headers.get('retry-after'));
      const atraso = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 8) * 1000 : 1500 * tentativa;
      await espera(atraso, sinal).catch(traduzirAbort);
    }

    if (!resposta?.body) throw new ErroIA('O provedor não retornou conteúdo.');

    let acumulado = '';
    let fim: Pedaco['fim'];
    try {
      await lerSSE(resposta.body, sinal, reiniciarRelogio, (evento) => {
        const pedaco = interpretarEvento(provedor.formato, evento);
        if (pedaco.fim) fim = pedaco.fim;
        if (pedaco.texto) {
          acumulado += pedaco.texto;
          onTexto?.(acumulado);
        }
      });
    } catch (erro) {
      if (sinal.aborted) traduzirAbort(erro);
      if (erro instanceof ErroIA) throw new ErroIA(higienizar(erro.message, conexao.chave), erro.status);
      throw new ErroIA('A conexão com o provedor caiu durante a resposta.');
    }

    if (fim === 'filtro' && !acumulado.trim()) {
      throw new ErroIA('O provedor bloqueou a resposta por política de conteúdo. Reformule a pergunta.');
    }
    return { texto: acumulado, cortado: fim === 'limite' };
  } finally {
    clearTimeout(relogio);
  }
}
