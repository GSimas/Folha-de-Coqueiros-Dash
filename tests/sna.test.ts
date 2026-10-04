import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AtorRaw } from '@/types';
import { normalizarAtor } from '@/lib/data';
import { arestasPorCoocorrencia, betweennessCentrality, closenessCentrality, criarGrafo } from '@/lib/sna';
import * as referencia from './sna-referencia';

const atores = (JSON.parse(readFileSync('public/data/atores.json', 'utf8')) as AtorRaw[]).map(normalizarAtor);
const arestas = arestasPorCoocorrencia(atores.map((a) => ({ nome: a.nome, documentos: a.noticias })), 1);
const grafo = criarGrafo(atores.map((a) => a.nome), arestas);

describe('SNA otimizado (arrays tipados)', () => {
  it('betweenness idêntico à implementação original no acervo real', () => {
    expect(betweennessCentrality(grafo)).toEqual(referencia.betweennessCentrality(grafo));
  });

  it('closeness idêntico à implementação original no acervo real', () => {
    expect(closenessCentrality(grafo)).toEqual(referencia.closenessCentrality(grafo));
  });

  it('casos de borda: grafo vazio, 2 nós e componente desconexo', () => {
    for (const g of [
      criarGrafo([], []),
      criarGrafo(['a', 'b'], [{ origem: 'a', destino: 'b', peso: 1 }]),
      criarGrafo(['a', 'b', 'c', 'd', 'e'], [
        { origem: 'a', destino: 'b', peso: 1 },
        { origem: 'b', destino: 'c', peso: 1 },
        { origem: 'd', destino: 'e', peso: 1 },
      ]),
    ]) {
      expect(betweennessCentrality(g)).toEqual(referencia.betweennessCentrality(g));
      expect(closenessCentrality(g)).toEqual(referencia.closenessCentrality(g));
    }
  });
});
