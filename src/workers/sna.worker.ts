/// <reference lib="webworker" />
/** Métricas SNA de todos os atores fora da thread principal (ver useAtoresComSNA). */
import { calcularAtoresComSNA } from '@/lib/sna';
import type { Ator } from '@/types';

self.onmessage = (evento: MessageEvent<Ator[]>) => {
  self.postMessage(calcularAtoresComSNA(evento.data));
};
