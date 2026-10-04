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
import { AlertCircle, Brain, ChevronDown, Loader2, Minus, Plug, Plus, Workflow } from 'lucide-react';
import type { Noticia, RelacaoCausal, RespostaCausal } from '@/types';
import { COR_REDUCAO, COR_REFORCO } from '@/lib/constantes';
import { useCoresGrafico } from '@/lib/preferencias';
import { Revelar } from '@/lib/motion';
import { useIA } from '@/lib/ia/conexao';
import { extrairRelacoesCausais } from '@/lib/ia/causal';
import { PROVEDORES } from '@/lib/ia/provedores';

interface CausalDiagramProps {
  /** Notícias atualmente filtradas na UI — a base da extração. */
  noticias: Noticia[];
  /** Abre o painel de conexão de IA (no assistente). */
  onConectarIA: () => void;
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
        // Estilo inline aceita variáveis CSS: os nós acompanham o tema sem re-render.
        borderRadius: 3,
        border: `1px solid ${destaque ? 'rgb(var(--signal))' : 'rgb(var(--line))'}`,
        background: destaque ? 'rgb(var(--signal) / 0.12)' : 'rgb(var(--elevated))',
        color: 'rgb(var(--ink))',
        fontFamily: 'Manrope, sans-serif',
        fontSize: 11.5,
        fontWeight: destaque ? 700 : 500,
        lineHeight: 1.25,
        textAlign: 'center' as const,
        boxShadow: destaque ? '0 0 24px -6px rgb(var(--signal) / 0.6)' : 'none',
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
      labelBgStyle: { fill: 'rgb(var(--elevated))', fillOpacity: 0.95 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: cor, strokeWidth: 2 },
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

export default function CausalDiagram({ noticias, onConectarIA }: CausalDiagramProps) {
  const { conexao, modelo } = useIA();
  const [resposta, setResposta] = useState<RespostaCausal | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jsonAberto, setJsonAberto] = useState(false);
  const cores = useCoresGrafico();

  const gerar = useCallback(async () => {
    if (noticias.length === 0 || carregando) return;
    if (!conexao || !modelo) return onConectarIA();

    setCarregando(true);
    setErro(null);

    try {
      const dados = await extrairRelacoesCausais(conexao, modelo, noticias);
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
  }, [noticias, carregando, conexao, modelo, onConectarIA]);

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
    <Revelar como="section" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="rotulo">
            <span className="text-signal">A</span> · Diagrama de enlace causal (CLD)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Relações de causa e efeito extraídas das notícias filtradas por IA generativa.
          </p>
        </div>

        <button
          type="button"
          onClick={gerar}
          disabled={carregando || noticias.length === 0}
          className="botao-primario"
        >
          {!conexao ? (
            <>
              <Plug size={16} />
              Conectar IA
            </>
          ) : carregando ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Analisando {Math.min(noticias.length, 40)} notícias…
            </>
          ) : (
            <>
              <Brain size={16} />
              {resposta ? 'Gerar novamente' : 'Gerar mapa causal'}
            </>
          )}
        </button>
      </div>

      {/* Estado inicial */}
      {!resposta && !carregando && !erro && (
        <div className="flex animate-fade-in flex-col items-center justify-center px-6 py-24 text-center">
          <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-line">
            <span className="absolute inset-0 animate-ping rounded-full border border-signal/30 [animation-duration:2.4s]" />
            <Workflow size={24} className="text-signal" />
          </div>
          <p className="max-w-md text-base text-muted">
            A IA lê as notícias do recorte e identifica cadeias de{' '}
            <span className="titulo-serif text-lg">causa e efeito</span> no território.
          </p>
          <p className="rotulo mt-3 text-faint">
            {noticias.length.toLocaleString('pt-BR')} notícias no recorte · as mais substanciais
            primeiro
          </p>
          <p className="mt-4 max-w-sm text-xs text-faint">
            {conexao
              ? `Gerado por IA com ${modelo} (${PROVEDORES[conexao.provedor].nome}). Relações extraídas automaticamente podem conter erros — confira as evidências.`
              : 'Usa a mesma conexão do assistente: entre com OpenRouter (há modelos gratuitos) ou use sua própria chave.'}
          </p>
        </div>
      )}

      {/* Carregando */}
      {carregando && (
        <div className="flex animate-fade-in flex-col items-center justify-center px-6 py-24">
          <div className="relative h-px w-56 overflow-hidden bg-line">
            <div className="absolute inset-y-0 w-1/3 animate-barra-carregando bg-signal shadow-[0_0_12px_rgb(var(--signal))]" />
          </div>
          <p className="mt-5 text-sm font-medium text-ink">Lendo as notícias e mapeando causalidades…</p>
          <p className="mt-1 text-xs text-faint">
            O processamento é feito em lotes e pode levar alguns segundos.
          </p>
        </div>
      )}

      {/* Erro / vazio */}
      {erro && !carregando && (
        <div className="m-5 flex animate-fade-in items-start gap-3 border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-ink">Não foi possível montar o diagrama</p>
            <p className="mt-0.5 text-xs text-muted">{erro}</p>
          </div>
        </div>
      )}

      {/* Diagrama */}
      {resposta && resposta.relacoes.length > 0 && !carregando && (
        <div className="animate-fade-in">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <span className="inline-block h-px w-6" style={{ backgroundColor: COR_REFORCO }} />
              <Plus size={11} strokeWidth={3} style={{ color: COR_REFORCO }} />
              Reforço ({contagem.reforco})
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <span className="inline-block h-px w-6" style={{ backgroundColor: COR_REDUCAO }} />
              <Minus size={11} strokeWidth={3} style={{ color: COR_REDUCAO }} />
              Redução ({contagem.reducao})
            </span>
            <span className="rotulo">
              <span className="text-ink">{nos.length}</span> variáveis ·{' '}
              <span className="text-ink">{resposta.noticiasAnalisadas}</span> notícias ·{' '}
              <span className="text-faint">{resposta.modelo}</span>
            </span>
          </div>

          <div className="h-[580px] w-full">
            <ReactFlow
              nodes={nos}
              edges={arestas}
              colorMode={cores.escuro ? 'dark' : 'light'}
              style={{ background: 'transparent' }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={2.5}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background color={cores.line} gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          {/* Transparência: evidências textuais extraídas */}
          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => setJsonAberto((v) => !v)}
              aria-expanded={jsonAberto}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left"
            >
              <span className="rotulo">
                <span className="text-signal">B</span> · Evidências extraídas ({resposta.relacoes.length})
              </span>
              <ChevronDown
                size={16}
                className={`text-faint transition-transform duration-300 ${jsonAberto ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Acordeão: grid-rows 0fr → 1fr anima a altura sem medir o conteúdo */}
            <div
              className={`grid transition-[grid-template-rows] duration-500 ease-suave ${
                jsonAberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden" inert={!jsonAberto}>
                <div className="space-y-3 border-t border-line px-5 py-4">
                  <ul className="space-y-2">
                    {resposta.relacoes.map((relacao, indice) => {
                      const cor = relacao.polaridade === 'increase' ? COR_REFORCO : COR_REDUCAO;
                      return (
                        <li
                          key={`${relacao.causa}-${relacao.efeito}-${indice}`}
                          className="border border-line bg-canvas/50 p-3 text-xs"
                        >
                          <p className="font-medium text-ink">
                            {relacao.causa}{' '}
                            <span style={{ color: cor }} className="font-bold">
                              {relacao.polaridade === 'increase' ? '──▶ (+)' : '──▶ (−)'}
                            </span>{' '}
                            {relacao.efeito}
                          </p>
                          <p className="mt-1.5 border-l border-signal/40 pl-2 font-serif text-sm italic text-muted">
                            “{relacao.evidencia}”
                          </p>
                          {relacao.noticiaTitulo && (
                            <p className="mt-1.5 font-mono text-[0.6875rem] text-faint">
                              Fonte: #{relacao.noticiaId} — {relacao.noticiaTitulo}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <details className="group border border-line">
                    <summary className="rotulo cursor-pointer px-3 py-2">Ver JSON bruto</summary>
                    <pre className="max-h-80 overflow-auto border-t border-line p-3 font-mono text-[0.6875rem] leading-relaxed text-muted">
                      {JSON.stringify(resposta.relacoes, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Revelar>
  );
}
