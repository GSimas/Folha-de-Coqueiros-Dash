/**
 * Hooks de construção de grafo e cálculo de métricas SNA.
 *
 * Regra de negócio herdada da versão Streamlit:
 *  - A TABELA de atores usa métricas do grafo GLOBAL (todos os atores), para que
 *    os números não mudem conforme o recorte visual.
 *  - O GRAFO exibido usa métricas do SUBGRAFO (top N), refletindo a topologia
 *    daquele recorte específico.
 */
import { useEffect, useMemo, useState } from 'react';
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
  arredondar,
  calcularAtoresComSNA,
  calcularMetricasSNA,
  criarGrafo,
} from '@/lib/sna';

export { calcularAtoresComSNA };

const SEM_ATORES: AtorComSNA[] = [];

/**
 * Métricas SNA globais calculadas num Web Worker, fora da thread principal.
 * Devolve `null` enquanto calcula. Sem suporte a Worker (ou se ele falhar),
 * calcula aqui mesmo — mais lento, mas sem perder a funcionalidade.
 */
export function useAtoresComSNA(atores: Ator[]): AtorComSNA[] | null {
  const [resultado, setResultado] = useState<{ base: Ator[]; atores: AtorComSNA[] } | null>(null);

  useEffect(() => {
    if (atores.length === 0) return;
    const calcularAqui = () => setResultado({ base: atores, atores: calcularAtoresComSNA(atores) });
    if (typeof Worker === 'undefined') return calcularAqui();
    const worker = new Worker(new URL('../workers/sna.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (evento: MessageEvent<AtorComSNA[]>) => setResultado({ base: atores, atores: evento.data });
    worker.onerror = calcularAqui;
    worker.postMessage(atores);
    return () => worker.terminate(); // troca de dados ou desmontagem: sem worker órfão
  }, [atores]);

  if (atores.length === 0) return SEM_ATORES;
  return resultado?.base === atores ? resultado.atores : null;
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
