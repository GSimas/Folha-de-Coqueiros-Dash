/** Apoio aos testes: acervo real normalizado e um simulador de provedor SSE. */
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import type { AtorRaw, MetricasGerais, NoticiaRaw } from '@/types';
import { normalizarAtor, normalizarNoticia, paraISO } from '@/lib/data';
import { calcularAtoresComSNA } from '@/hooks/useNetworkData';
import type { DadosAssistente } from '@/lib/ia/conversa';

const ler = <T>(arquivo: string) => JSON.parse(readFileSync(`public/data/${arquivo}`, 'utf8')) as T;

export const noticias = ler<NoticiaRaw[]>('noticias.json').map(normalizarNoticia);
export const atores = calcularAtoresComSNA(ler<AtorRaw[]>('atores.json').map(normalizarAtor));

const datas = noticias.map((n) => n.dataConvertida?.getTime()).filter((t): t is number => !!t);
export const periodoCompleto = {
  inicio: paraISO(new Date(Math.min(...datas))),
  fim: paraISO(new Date(Math.max(...datas))),
};

export function metricasDe(lista = noticias): MetricasGerais {
  return {
    totalNoticias: lista.length,
    mediaPalavras: Math.round(lista.reduce((s, n) => s + n.tamanhoTexto, 0) / (lista.length || 1)),
    categorizadas: lista.filter((n) => n.categorizada).length,
    totalEventos: lista.filter((n) => n.ehEvento).length,
    eventosPagos: lista.filter((n) => n.ehEvento && n.ehPago).length,
  };
}

export function dadosCompletos(recorte = noticias): DadosAssistente {
  return {
    acervo: noticias,
    recorte,
    filtros: { dataInicio: periodoCompleto.inicio, dataFim: periodoCompleto.fim, categorias: [], apenasEventos: false, busca: '' },
    periodoCompleto,
    metricas: metricasDe(recorte),
    atores,
  };
}

// --- Simulador de provedor ------------------------------------------------

/** Corpo SSE a partir de pedaços crus (permite cortar eventos e caracteres UTF-8 ao meio). */
export function corpoSSE(pedacos: Array<string | Uint8Array>, atrasoMs = 0): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  return new ReadableStream({
    async start(controle) {
      for (const p of pedacos) {
        if (atrasoMs) await new Promise((r) => setTimeout(r, atrasoMs));
        controle.enqueue(typeof p === 'string' ? codificador.encode(p) : p);
      }
      controle.close();
    },
  });
}

/** Eventos no formato OpenAI-compatível para um texto, opcionalmente com `finish_reason`. */
export function eventosOpenAI(texto: string, fim: string | null = 'stop', tamanho = 7): string[] {
  const partes = texto.match(new RegExp(`[\\s\\S]{1,${tamanho}}`, 'g')) ?? [];
  return [
    ...partes.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p }, finish_reason: null }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: fim }] })}\n\n`,
    'data: [DONE]\n\n',
  ];
}

export interface ChamadaRegistrada {
  url: string;
  headers: Record<string, string>;
  corpo: Record<string, unknown>;
}

/** Substitui `fetch` por uma sequência de respostas; devolve as chamadas recebidas. */
export function simularFetch(respostas: Array<(chamada: ChamadaRegistrada) => Response | Promise<Response>>) {
  const chamadas: ChamadaRegistrada[] = [];
  let i = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit & { signal?: AbortSignal }) => {
    const chamada = {
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      corpo: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    };
    chamadas.push(chamada);
    if (init.signal?.aborted) throw new DOMException('Abortado', 'AbortError');
    const fabrica = respostas[Math.min(i++, respostas.length - 1)];
    return fabrica(chamada);
  });
  return chamadas;
}

export const sse = (pedacos: Array<string | Uint8Array>, atrasoMs = 0) =>
  new Response(corpoSSE(pedacos, atrasoMs), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

export const erroHTTP = (status: number, mensagem: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: mensagem } }), { status, headers });
