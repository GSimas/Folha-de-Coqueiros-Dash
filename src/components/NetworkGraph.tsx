import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network, type Edge, type Node, type Options } from 'vis-network';
import { Camera, Crosshair, Loader2, Network as NetworkIcon, Search } from 'lucide-react';
import type { GrafoSNA, TipoRede } from '@/types';
import { COR_POR_TIPO } from '@/lib/constantes';

/** Nó do vis estendido com o tipo do ator, usado pelo filtro da legenda. */
interface NoVis extends Node {
  tipoAtor: string;
}

interface NetworkGraphProps {
  grafo: GrafoSNA | null;
  tipo: TipoRede;
  onMudarTipo: (tipo: TipoRede) => void;
  topN: number;
  onMudarTopN: (topN: number) => void;
}

const LEGENDA = [
  { tipo: 'Pessoa', rotulo: 'Pessoas' },
  { tipo: 'Organização', rotulo: 'Organizações' },
  { tipo: 'Local', rotulo: 'Locais' },
  { tipo: 'Empresa', rotulo: 'Empresas' },
] as const;

/** Opacidade aplicada aos nós não-vizinhos durante o hover. */
const OPACIDADE_APAGADA = 0.12;

const OPCOES_VIS: Options = {
  autoResize: true,
  height: '100%',
  width: '100%',
  nodes: {
    shape: 'dot',
    borderWidth: 2,
    color: { border: '#ffffff' },
    font: { face: 'Inter, sans-serif', color: '#1e293b', strokeWidth: 4, strokeColor: '#ffffff' },
    scaling: { min: 10, max: 60 },
  },
  edges: {
    color: { color: '#cbd5e1', highlight: '#64748b', hover: '#94a3b8', opacity: 0.75 },
    smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
    scaling: { min: 0.5, max: 6 },
  },
  physics: {
    enabled: true,
    solver: 'barnesHut',
    barnesHut: {
      gravitationalConstant: -4000,
      centralGravity: 0.1,
      springLength: 400,
      springConstant: 0.04,
      damping: 0.2,
      avoidOverlap: 0.1,
    },
    stabilization: { enabled: true, iterations: 200, updateInterval: 25, fit: true },
  },
  interaction: {
    hover: true,
    tooltipDelay: 120,
    navigationButtons: false,
    keyboard: false,
    multiselect: false,
  },
};

export default function NetworkGraph({
  grafo,
  tipo,
  onMudarTipo,
  topN,
  onMudarTopN,
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const redeRef = useRef<Network | null>(null);
  const nosRef = useRef<DataSet<NoVis> | null>(null);

  const [estabilizando, setEstabilizando] = useState(true);
  const [busca, setBusca] = useState('');
  const [tiposOcultos, setTiposOcultos] = useState<Set<string>>(new Set());

  // --- Conversão do grafo de domínio para o formato do vis-network ---
  const { nos, arestas } = useMemo(() => {
    if (!grafo || grafo.nos.length === 0) {
      return { nos: [] as NoVis[], arestas: [] as Edge[] };
    }

    const valores = grafo.nos.map((n) => n.valor);
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    const amplitude = maximo - minimo + 1;

    const nosVis: NoVis[] = grafo.nos.map((no) => {
      const relativo = (no.valor - minimo) / amplitude;
      const tamanho = 15 + relativo * 40;

      const titulo =
        no.tipo === 'Termo'
          ? `${no.label}\nFrequência: ${no.valor} notícias\n${'─'.repeat(24)}\n📊 MÉTRICAS SNA\nGrau (conexões): ${no.grau}\nBetweenness (ponte): ${no.betweenness}\nCloseness (proximidade): ${no.closeness}`
          : `${no.label}\nTipo: ${no.tipo}\nCitações: ${no.valor}\n${no.descricao ? `\n${no.descricao}\n` : ''}${'─'.repeat(24)}\n📊 MÉTRICAS SNA\nGrau (conexões): ${no.grau}\nBetweenness (ponte): ${no.betweenness}\nCloseness (proximidade): ${no.closeness}`;

      return {
        id: no.id,
        label: no.label,
        title: titulo,
        value: no.valor,
        size: tamanho,
        tipoAtor: no.tipo,
        color: {
          background: COR_POR_TIPO[no.tipo] ?? COR_POR_TIPO.Desconhecido,
          border: '#ffffff',
          highlight: {
            background: COR_POR_TIPO[no.tipo] ?? COR_POR_TIPO.Desconhecido,
            border: '#0f172a',
          },
        },
        font: { size: Math.round(13 + relativo * 9) },
      };
    });

    const arestasVis: Edge[] = grafo.arestas.map((aresta, indice) => ({
      id: `e${indice}`,
      from: aresta.origem,
      to: aresta.destino,
      value: aresta.peso,
      title: `${aresta.origem} ↔ ${aresta.destino}\n${aresta.peso} notícia(s) em comum`,
    }));

    return { nos: nosVis, arestas: arestasVis };
  }, [grafo]);

  // --- Ciclo de vida da instância vis-network ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || nos.length === 0) return;

    setEstabilizando(true);
    setTiposOcultos(new Set());

    const conjuntoNos = new DataSet<NoVis>(nos);
    const conjuntoArestas = new DataSet<Edge>(arestas);
    nosRef.current = conjuntoNos;

    const rede = new Network(container, { nodes: conjuntoNos, edges: conjuntoArestas }, OPCOES_VIS);
    redeRef.current = rede;

    rede.once('stabilizationIterationsDone', () => {
      setEstabilizando(false);
      // Congela a física após estabilizar: o grafo para de "respirar" e o
      // usuário consegue clicar nos nós sem persegui-los.
      rede.setOptions({ physics: { enabled: false } });
      rede.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    });

    // Realce de vizinhança: apaga tudo que não é vizinho do nó sob o cursor.
    rede.on('hoverNode', (params: { node: string }) => {
      const vizinhos = new Set(rede.getConnectedNodes(params.node) as string[]);
      vizinhos.add(params.node);
      conjuntoNos.update(
        conjuntoNos.get().map((no) => ({
          id: no.id,
          opacity: vizinhos.has(String(no.id)) ? 1 : OPACIDADE_APAGADA,
        })) as NoVis[],
      );
    });

    rede.on('blurNode', () => {
      conjuntoNos.update(
        conjuntoNos.get().map((no) => ({ id: no.id, opacity: 1 })) as NoVis[],
      );
    });

    return () => {
      rede.destroy();
      redeRef.current = null;
      nosRef.current = null;
    };
  }, [nos, arestas]);

  // --- Ações do painel de controle ---
  const alternarTipo = useCallback((tipoAtor: string) => {
    const conjunto = nosRef.current;
    if (!conjunto) return;

    setTiposOcultos((anterior) => {
      const proximo = new Set(anterior);
      const ocultar = !proximo.has(tipoAtor);
      if (ocultar) proximo.add(tipoAtor);
      else proximo.delete(tipoAtor);

      conjunto.update(
        conjunto
          .get()
          .filter((no) => no.tipoAtor === tipoAtor)
          .map((no) => ({ id: no.id, hidden: ocultar })) as NoVis[],
      );

      return proximo;
    });
  }, []);

  const buscarNo = useCallback((valor: string) => {
    setBusca(valor);
    const rede = redeRef.current;
    const conjunto = nosRef.current;
    if (!rede || !conjunto || valor.trim().length < 2) return;

    const alvo = valor.trim().toLowerCase();
    const encontrado = conjunto.get().find((no) => String(no.label).toLowerCase().includes(alvo));

    if (encontrado?.id !== undefined) {
      rede.focus(encontrado.id, {
        scale: 1.5,
        animation: { duration: 800, easingFunction: 'easeInOutQuad' },
      });
      rede.selectNodes([encontrado.id]);
    }
  }, []);

  const centralizar = useCallback(() => {
    redeRef.current?.unselectAll();
    redeRef.current?.fit({ animation: { duration: 700, easingFunction: 'easeInOutQuad' } });
  }, []);

  /**
   * Exporta o canvas em PNG. O canvas do vis já é renderizado em resolução de
   * dispositivo (2x em telas retina), então basta preservar suas dimensões
   * nativas e pintar um fundo branco por baixo.
   */
  const baixarPNG = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const temporario = document.createElement('canvas');
    temporario.width = canvas.width;
    temporario.height = canvas.height;

    const contexto = temporario.getContext('2d');
    if (!contexto) return;

    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, temporario.width, temporario.height);
    contexto.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `rede-coqueiros-${tipo}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = temporario.toDataURL('image/png');
    link.click();
  }, [tipo]);

  const semDados = !grafo || grafo.nos.length === 0;

  return (
    <section id="rede" className="card overflow-hidden">
      {/* Cabeçalho com os controles de recorte */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <NetworkIcon size={16} className="text-brand-600" />
          Rede de Relacionamentos
        </h3>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(
              [
                ['atores', 'Atores'],
                ['palavras-chave', 'Palavras-chave'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => onMudarTipo(valor as TipoRede)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  tipo === valor
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="whitespace-nowrap font-medium">Nós: {topN}</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={topN}
              onChange={(e) => onMudarTopN(Number(e.target.value))}
              className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600"
            />
          </label>
        </div>
      </div>

      {semDados ? (
        <p className="py-24 text-center text-sm text-slate-400">
          Não há dados suficientes para renderizar este grafo no recorte atual.
        </p>
      ) : (
        <div className="relative h-[620px] w-full bg-white">
          <div ref={containerRef} className="h-full w-full" />

          {/* Painel flutuante de controle */}
          <div className="absolute left-4 top-4 w-60 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <p className="mb-3 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
              Painel de controle
            </p>

            {tipo === 'atores' && (
              <div className="mb-3 space-y-1">
                {LEGENDA.map(({ tipo: tipoAtor, rotulo }) => {
                  const oculto = tiposOcultos.has(tipoAtor);
                  return (
                    <button
                      key={tipoAtor}
                      type="button"
                      onClick={() => alternarTipo(tipoAtor)}
                      className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs transition hover:bg-slate-50 ${
                        oculto ? 'text-slate-400 line-through' : 'font-medium text-slate-700'
                      }`}
                      title={oculto ? `Exibir ${rotulo}` : `Ocultar ${rotulo}`}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{
                          backgroundColor: COR_POR_TIPO[tipoAtor],
                          opacity: oculto ? 0.3 : 1,
                        }}
                      />
                      {rotulo}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => buscarNo(e.target.value)}
                placeholder="Buscar nó…"
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              type="button"
              onClick={centralizar}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-700 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              <Crosshair size={13} /> Centralizar rede
            </button>

            <button
              type="button"
              onClick={baixarPNG}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800"
            >
              <Camera size={13} /> Salvar imagem
            </button>

            <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
              Passe o cursor sobre um nó para isolar sua vizinhança e ver as métricas de SNA.
            </p>
          </div>

          {/* Overlay de estabilização da física */}
          {estabilizando && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-3 shadow-lg">
                <Loader2 size={18} className="animate-spin text-brand-600" />
                <span className="text-sm font-medium text-slate-700">
                  Estabilizando a rede…
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {!semDados && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
          <span>
            <strong className="text-slate-700">{grafo.nos.length}</strong> nós
          </span>
          <span>
            <strong className="text-slate-700">{grafo.arestas.length}</strong> conexões
          </span>
          <span className="text-slate-400">
            Conexão = notícias em que os dois nós aparecem juntos.
          </span>
        </div>
      )}
    </section>
  );
}
