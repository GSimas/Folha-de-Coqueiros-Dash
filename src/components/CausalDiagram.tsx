import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  AlertCircle,
  Brain,
  ChevronDown,
  Code2,
  Loader2,
  Minus,
  Plus,
  Workflow,
} from 'lucide-react';
import type { Noticia, RelacaoCausal, RespostaCausal } from '@/types';
import { COR_REDUCAO, COR_REFORCO } from '@/lib/constantes';

interface CausalDiagramProps {
  /** Notícias atualmente filtradas na UI — a base da extração. */
  noticias: Noticia[];
}

const LARGURA_NO = 190;
const ALTURA_NO = 56;

/** Posiciona o grafo direcionado com dagre (layout hierárquico da esquerda p/ direita). */
function aplicarLayout(nos: Node[], arestas: Edge[]): Node[] {
  const grafo = new dagre.graphlib.Graph();
  grafo.setDefaultEdgeLabel(() => ({}));
  grafo.setGraph({ rankdir: 'LR', nodesep: 45, ranksep: 130, marginx: 30, marginy: 30 });

  for (const no of nos) {
    grafo.setNode(no.id, { width: LARGURA_NO, height: ALTURA_NO });
  }
  for (const aresta of arestas) {
    grafo.setEdge(aresta.source, aresta.target);
  }

  dagre.layout(grafo);

  return nos.map((no) => {
    const posicionado = grafo.node(no.id);
    return {
      ...no,
      // dagre devolve o CENTRO do nó; o React Flow espera o canto superior esquerdo.
      position: {
        x: posicionado.x - LARGURA_NO / 2,
        y: posicionado.y - ALTURA_NO / 2,
      },
    };
  });
}

/** Converte as relações extraídas em nós e arestas prontos para o React Flow. */
function construirGrafo(relacoes: RelacaoCausal[]): { nos: Node[]; arestas: Edge[] } {
  // Grau total de cada variável — usado para destacar os "hubs" do sistema.
  const grau = new Map<string, number>();
  for (const relacao of relacoes) {
    grau.set(relacao.causa, (grau.get(relacao.causa) ?? 0) + 1);
    grau.set(relacao.efeito, (grau.get(relacao.efeito) ?? 0) + 1);
  }

  const grauMaximo = Math.max(1, ...grau.values());

  const nos: Node[] = [...grau.keys()].map((variavel) => {
    const intensidade = (grau.get(variavel) ?? 1) / grauMaximo;
    const destaque = intensidade > 0.6;

    return {
      id: variavel,
      data: { label: variavel },
      position: { x: 0, y: 0 },
      style: {
        width: LARGURA_NO,
        height: ALTURA_NO,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        borderRadius: 10,
        border: `${destaque ? 2 : 1}px solid ${destaque ? '#1a5276' : '#cbd5e1'}`,
        background: destaque ? '#eef5fb' : '#ffffff',
        color: '#1e293b',
        fontSize: 11.5,
        fontWeight: destaque ? 700 : 500,
        lineHeight: 1.25,
        textAlign: 'center' as const,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
      },
    };
  });

  const arestas: Edge[] = relacoes.map((relacao, indice) => {
    const reforco = relacao.polaridade === 'increase';
    const cor = reforco ? COR_REFORCO : COR_REDUCAO;

    return {
      id: `causal-${indice}`,
      source: relacao.causa,
      target: relacao.efeito,
      type: 'smoothstep',
      animated: false,
      label: reforco ? '+' : '−',
      labelStyle: { fill: cor, fontWeight: 800, fontSize: 15 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: cor, strokeWidth: 2.8 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: cor,
        width: 18,
        height: 18,
      },
    };
  });

  return { nos, arestas };
}

export default function CausalDiagram({ noticias }: CausalDiagramProps) {
  const [resposta, setResposta] = useState<RespostaCausal | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jsonAberto, setJsonAberto] = useState(false);

  const gerar = useCallback(async () => {
    if (noticias.length === 0 || carregando) return;

    setCarregando(true);
    setErro(null);

    try {
      const requisicao = await fetch('/api/causal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noticias: noticias.map((n) => ({
            id: n.id,
            titulo: n.titulo,
            data: n.data,
            conteudo: n.conteudo,
          })),
        }),
      });

      const dados = (await requisicao.json().catch(() => null)) as
        | (RespostaCausal & { erro?: string })
        | null;

      if (!requisicao.ok || !dados || dados.erro) {
        throw new Error(dados?.erro ?? `Falha na extração (HTTP ${requisicao.status})`);
      }

      setResposta(dados);
      if (dados.relacoes.length === 0) {
        setErro('Nenhuma relação causal clara foi identificada neste recorte de notícias.');
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido ao gerar o mapa causal.');
      setResposta(null);
    } finally {
      setCarregando(false);
    }
  }, [noticias, carregando]);

  const { nos, arestas } = useMemo(() => {
    if (!resposta || resposta.relacoes.length === 0) {
      return { nos: [] as Node[], arestas: [] as Edge[] };
    }
    const grafo = construirGrafo(resposta.relacoes);
    return { nos: aplicarLayout(grafo.nos, grafo.arestas), arestas: grafo.arestas };
  }, [resposta]);

  const contagem = useMemo(() => {
    const relacoes = resposta?.relacoes ?? [];
    return {
      reforco: relacoes.filter((r) => r.polaridade === 'increase').length,
      reducao: relacoes.filter((r) => r.polaridade === 'decrease').length,
    };
  }, [resposta]);

  return (
    <section id="causal" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
            <Workflow size={16} className="text-brand-600" />
            Diagrama de Enlace Causal (CLD)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Extrai relações de causa e efeito das notícias filtradas usando IA generativa.
          </p>
        </div>

        <button
          type="button"
          onClick={gerar}
          disabled={carregando || noticias.length === 0}
          className="botao-primario"
        >
          {carregando ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Analisando {Math.min(noticias.length, 40)} notícias…
            </>
          ) : (
            <>
              <Brain size={16} />
              Gerar Mapa Causal
            </>
          )}
        </button>
      </div>

      {/* Estado inicial */}
      {!resposta && !carregando && !erro && (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 rounded-full bg-brand-50 p-4">
            <Workflow size={28} className="text-brand-600" />
          </div>
          <p className="max-w-md text-sm text-slate-600">
            Clique em <strong>Gerar Mapa Causal</strong> para que a IA leia as notícias do recorte
            atual e identifique cadeias de causa e efeito no território.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {noticias.length.toLocaleString('pt-BR')} notícias no filtro atual — as mais
            substanciais serão priorizadas.
          </p>
        </div>
      )}

      {/* Carregando */}
      {carregando && (
        <div className="flex flex-col items-center justify-center px-6 py-20">
          <Loader2 size={32} className="mb-4 animate-spin text-brand-600" />
          <p className="text-sm font-medium text-slate-700">Lendo as notícias e mapeando causalidades…</p>
          <p className="mt-1 text-xs text-slate-400">
            O processamento é feito em lotes e pode levar alguns segundos.
          </p>
          <div className="mt-6 w-full max-w-sm space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-slate-100"
                style={{ width: `${100 - i * 18}%`, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Erro / vazio */}
      {erro && !carregando && (
        <div className="mx-5 my-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-900">Não foi possível montar o diagrama</p>
            <p className="mt-0.5 text-xs text-amber-800">{erro}</p>
          </div>
        </div>
      )}

      {/* Diagrama */}
      {resposta && resposta.relacoes.length > 0 && !carregando && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <span
                className="inline-block h-0.5 w-6 rounded"
                style={{ backgroundColor: COR_REFORCO }}
              />
              <Plus size={11} strokeWidth={3} style={{ color: COR_REFORCO }} />
              Reforço ({contagem.reforco})
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <span
                className="inline-block h-0.5 w-6 rounded"
                style={{ backgroundColor: COR_REDUCAO }}
              />
              <Minus size={11} strokeWidth={3} style={{ color: COR_REDUCAO }} />
              Redução ({contagem.reducao})
            </span>
            <span className="text-slate-500">
              <strong className="text-slate-700">{nos.length}</strong> variáveis ·{' '}
              <strong className="text-slate-700">{resposta.noticiasAnalisadas}</strong> notícias
              analisadas · <span className="text-slate-400">{resposta.modelo}</span>
            </span>
          </div>

          <div className="h-[560px] w-full bg-slate-50">
            <ReactFlow
              nodes={nos}
              edges={arestas}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={2.5}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#cbd5e1" gap={18} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          {/* Transparência: evidências textuais extraídas */}
          <div className="border-t border-slate-100">
            <button
              type="button"
              onClick={() => setJsonAberto((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Code2 size={14} className="text-brand-600" />
                Evidências extraídas ({resposta.relacoes.length})
              </span>
              <ChevronDown
                size={16}
                className={`text-slate-400 transition-transform ${jsonAberto ? 'rotate-180' : ''}`}
              />
            </button>

            {jsonAberto && (
              <div className="animate-fade-in space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
                <ul className="space-y-2">
                  {resposta.relacoes.map((relacao, indice) => {
                    const cor =
                      relacao.polaridade === 'increase' ? COR_REFORCO : COR_REDUCAO;
                    return (
                      <li
                        key={`${relacao.causa}-${relacao.efeito}-${indice}`}
                        className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
                      >
                        <p className="font-medium text-slate-800">
                          {relacao.causa}{' '}
                          <span style={{ color: cor }} className="font-bold">
                            {relacao.polaridade === 'increase' ? '──▶ (+)' : '──▶ (−)'}
                          </span>{' '}
                          {relacao.efeito}
                        </p>
                        <p className="mt-1.5 border-l-2 border-slate-200 pl-2 italic text-slate-600">
                          “{relacao.evidencia}”
                        </p>
                        {relacao.noticiaTitulo && (
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            Fonte: #{relacao.noticiaId} — {relacao.noticiaTitulo}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <details className="rounded-lg border border-slate-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
                    Ver JSON bruto
                  </summary>
                  <pre className="max-h-80 overflow-auto border-t border-slate-100 p-3 text-[11px] leading-relaxed text-slate-700">
                    {JSON.stringify(resposta.relacoes, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
