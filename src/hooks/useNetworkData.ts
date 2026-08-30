/**
 * Hooks de construção de grafo e cálculo de métricas SNA.
 *
 * Regra de negócio herdada da versão Streamlit:
 *  - A TABELA de atores usa métricas do grafo GLOBAL (todos os atores), para que
 *    os números não mudem conforme o recorte visual.
 *  - O GRAFO exibido usa métricas do SUBGRAFO (top N), refletindo a topologia
 *    daquele recorte específico.
 */
import { useMemo } from 'react';
import type {
  Ator,
  AtorComSNA,
  GrafoSNA,
  Noticia,
  NoGrafo,
  TipoRede,
} from '@/types';
import {
  arestasPorCoocorrencia,
  calcularMetricasSNA,
  criarGrafo,
} from '@/lib/sna';

const ARREDONDAMENTO = 4;

function arredondar(valor: number): number {
  return Number(valor.toFixed(ARREDONDAMENTO));
}

/**
 * Métricas SNA de TODOS os atores, calculadas sobre o grafo global de
 * coocorrência (dois atores se conectam quando citados na mesma notícia).
 */
export function useAtoresComSNA(atores: Ator[]): AtorComSNA[] {
  return useMemo(() => {
    if (atores.length === 0) return [];

    const nos = atores.map((a) => a.nome);
    const arestas = arestasPorCoocorrencia(
      atores.map((a) => ({ nome: a.nome, documentos: a.noticias })),
      1,
    );

    const grafo = criarGrafo(nos, arestas);
    const metricas = calcularMetricasSNA(grafo);

    return atores.map((ator) => ({
      ...ator,
      citacoes: ator.noticias.length,
      grauAbsoluto: metricas.grau[ator.nome] ?? 0,
      centralidadeGrau: arredondar(metricas.centralidadeGrau[ator.nome] ?? 0),
      betweenness: arredondar(metricas.betweenness[ator.nome] ?? 0),
      closeness: arredondar(metricas.closeness[ator.nome] ?? 0),
    }));
  }, [atores]);
}

interface OpcoesGrafo {
  atores: Ator[];
  /** Notícias já filtradas pelo período/categoria selecionados. */
  noticias: Noticia[];
  tipo: TipoRede;
  /** Quantidade de nós exibidos (Top N por citações/frequência). */
  topN: number;
}

/**
 * Grafo exibido na visualização — atores ou palavras-chave, conforme `tipo`.
 * Retorna `null` quando não há dados suficientes para desenhar algo útil.
 */
export function useGrafoRede({ atores, noticias, tipo, topN }: OpcoesGrafo): GrafoSNA | null {
  return useMemo(() => {
    if (tipo === 'atores') {
      return construirGrafoAtores(atores, noticias, topN);
    }
    return construirGrafoPalavrasChave(noticias, topN);
  }, [atores, noticias, tipo, topN]);
}

function construirGrafoAtores(
  atores: Ator[],
  noticias: Noticia[],
  topN: number,
): GrafoSNA | null {
  if (atores.length === 0) return null;

  // Restringe as citações às notícias em foco, para que o recorte temporal
  // realmente afete a rede exibida.
  const idsVisiveis = new Set(noticias.map((n) => n.id));
  const atoresNoRecorte = atores
    .map((ator) => ({
      ...ator,
      noticiasVisiveis: ator.noticias.filter((id) => idsVisiveis.has(id)),
    }))
    .filter((ator) => ator.noticiasVisiveis.length > 0);

  if (atoresNoRecorte.length === 0) return null;

  const topAtores = [...atoresNoRecorte]
    .sort((a, b) => b.noticiasVisiveis.length - a.noticiasVisiveis.length)
    .slice(0, topN);

  const nomes = topAtores.map((a) => a.nome);
  const arestas = arestasPorCoocorrencia(
    topAtores.map((a) => ({ nome: a.nome, documentos: a.noticiasVisiveis })),
    1,
  );

  const grafo = criarGrafo(nomes, arestas);
  const metricas = calcularMetricasSNA(grafo);

  const nos: NoGrafo[] = topAtores.map((ator) => ({
    id: ator.nome,
    label: ator.nome,
    valor: ator.noticiasVisiveis.length,
    tipo: ator.tipo,
    descricao: ator.descricao,
    grau: metricas.grau[ator.nome] ?? 0,
    betweenness: arredondar(metricas.betweenness[ator.nome] ?? 0),
    closeness: arredondar(metricas.closeness[ator.nome] ?? 0),
  }));

  return { nos, arestas };
}

function construirGrafoPalavrasChave(noticias: Noticia[], topN: number): GrafoSNA | null {
  // Normaliza para Title Case, como fazia `construir_grafo_cooccorrencia`.
  const paraTitulo = (termo: string) =>
    termo
      .split(' ')
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');

  const frequencia = new Map<string, number>();
  /** Documentos (índices de notícia) em que cada termo aparece. */
  const documentosPorTermo = new Map<string, number[]>();

  noticias.forEach((noticia) => {
    if (noticia.palavrasChaves.length === 0) return;
    const termosUnicos = new Set(noticia.palavrasChaves.map(paraTitulo));
    for (const termo of termosUnicos) {
      if (!termo) continue;
      frequencia.set(termo, (frequencia.get(termo) ?? 0) + 1);
      const docs = documentosPorTermo.get(termo);
      if (docs) docs.push(noticia.id);
      else documentosPorTermo.set(termo, [noticia.id]);
    }
  });

  if (frequencia.size === 0) return null;

  const topTermos = [...frequencia.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([termo]) => termo);

  // `min_peso = 2` no original: só liga termos que coocorrem em 2+ notícias,
  // evitando um hairball de ligações acidentais.
  const arestas = arestasPorCoocorrencia(
    topTermos.map((termo) => ({ nome: termo, documentos: documentosPorTermo.get(termo) ?? [] })),
    2,
  );

  const grafo = criarGrafo(topTermos, arestas);
  const metricas = calcularMetricasSNA(grafo);

  const nos: NoGrafo[] = topTermos.map((termo) => ({
    id: termo,
    label: termo,
    valor: frequencia.get(termo) ?? 0,
    tipo: 'Termo',
    grau: metricas.grau[termo] ?? 0,
    betweenness: arredondar(metricas.betweenness[termo] ?? 0),
    closeness: arredondar(metricas.closeness[termo] ?? 0),
  }));

  return { nos, arestas };
}
