import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network, type Edge, type Node, type Options } from 'vis-network';
import { Camera, Crosshair, Search } from 'lucide-react';
import type { GrafoSNA, TipoRede } from '@/types';
import { COR_POR_TIPO } from '@/lib/constantes';
import { useCoresGrafico, type CoresGrafico } from '@/lib/preferencias';
import { usePerfis } from '@/lib/perfis';
import { BaixarGrafico } from './MenuBaixar';

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

/** Opções do vis-network no tema atual (o canvas não enxerga variáveis CSS). */
const opcoesVis = (c: CoresGrafico): Options => ({
  autoResize: true,
  height: '100%',
  width: '100%',
  nodes: {
    shape: 'dot',
    borderWidth: 2,
    color: { border: c.surface },
    font: { face: 'Manrope, sans-serif', color: c.ink, strokeWidth: 4, strokeColor: c.surface },
    scaling: { min: 10, max: 60 },
  },
  edges: {
    color: { color: c.faint, highlight: c.signal, hover: c.muted, opacity: 0.55 },
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
});

export default function NetworkGraph({ grafo, tipo, onMudarTipo, topN, onMudarTopN }: NetworkGraphProps) {
  const { abrirAtor, abrirTema, idDoAtor } = usePerfis();
  const cores = useCoresGrafico();
  const containerRef = useRef<HTMLDivElement>(null);
  const redeRef = useRef<Network | null>(null);
  const nosRef = useRef<DataSet<NoVis> | null>(null);
  // Clique no nó abre o perfil (ator ou tema). Ref: trocar o callback não recria a rede.
  const aoSelecionar = useRef<(id: string) => void>(() => {});
  aoSelecionar.current = (id) => {
    if (tipo === 'palavras-chave') return abrirTema(id);
    const idAtor = idDoAtor(id);
    if (idAtor !== undefined) abrirAtor(idAtor);
  };

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
          border: cores.surface,
          highlight: {
            background: COR_POR_TIPO[no.tipo] ?? COR_POR_TIPO.Desconhecido,
            border: cores.signal,
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
  }, [grafo, cores]);

  const resumoGrafo = useMemo(() => {
    if (!grafo || grafo.nos.length === 0) return '';
    const maisConectados = [...grafo.nos]
      .sort((x, y) => y.grau - x.grau)
      .slice(0, 5)
      .map((no) => `${no.label} (${no.grau} conexões)`)
      .join(', ');
    const oQue = tipo === 'atores' ? 'atores' : 'palavras-chave';
    return (
      `Grafo de coocorrência com ${grafo.nos.length} ${oQue} e ${grafo.arestas.length} conexões. ` +
      `Mais conectados: ${maisConectados}.` +
      (tipo === 'atores' ? ' A tabela de atores abaixo traz todos os dados em formato navegável.' : '')
    );
  }, [grafo, tipo]);

  // --- Ciclo de vida da instância vis-network ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || nos.length === 0) return;

    setEstabilizando(true);
    setTiposOcultos(new Set());

    const conjuntoNos = new DataSet<NoVis>(nos);
    const conjuntoArestas = new DataSet<Edge>(arestas);
    nosRef.current = conjuntoNos;

    const rede = new Network(container, { nodes: conjuntoNos, edges: conjuntoArestas }, opcoesVis(cores));
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

    rede.on('click', (params: { nodes: string[] }) => {
      if (params.nodes.length > 0) aoSelecionar.current(String(params.nodes[0]));
    });

    rede.on('blurNode', () => {
      conjuntoNos.update(conjuntoNos.get().map((no) => ({ id: no.id, opacity: 1 })) as NoVis[]);
    });

    return () => {
      rede.destroy();
      redeRef.current = null;
      nosRef.current = null;
    };
  }, [nos, arestas, cores]);

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

  const semDados = !grafo || grafo.nos.length === 0;

  return (
    <section className="card overflow-hidden">
      {/* Cabeçalho com os controles de recorte */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-2.5">
        <h2 className="rotulo">
          <span className="text-signal">A</span> · Grafo de coocorrência
        </h2>

        <div className="flex flex-wrap items-center gap-5">
          <div className="segmentado">
            {(
              [
                ['atores', 'Atores'],
                ['palavras-chave', 'Palavras-chave'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={tipo === valor}
                onClick={() => onMudarTipo(valor as TipoRede)}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 text-xs text-muted">
            <span className="rotulo whitespace-nowrap">
              Nós <span className="text-ink">{topN}</span>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={topN}
              onChange={(e) => onMudarTopN(Number(e.target.value))}
              className="w-32 cursor-pointer accent-[rgb(var(--signal))]"
            />
          </label>
        </div>
      </div>

      {semDados ? (
        <p className="vazio py-24">Não há dados suficientes para renderizar este grafo no recorte atual.</p>
      ) : (
        <div className="relative h-[640px] w-full">
          {/* O canvas é invisível a leitores de tela: um resumo textual o substitui. */}
          <div ref={containerRef} className="h-full w-full" role="img" aria-label={resumoGrafo} />

          {/* Painel flutuante de controle */}
          <div className="absolute left-4 top-4 w-60 border border-line bg-elevated/90 p-4 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.5)] backdrop-blur-xl">
            <p className="rotulo mb-3 border-b border-line pb-2">Painel de controle</p>

            {tipo === 'atores' && (
              <div className="mb-3 space-y-0.5">
                {LEGENDA.map(({ tipo: tipoAtor, rotulo }) => {
                  const oculto = tiposOcultos.has(tipoAtor);
                  return (
                    <button
                      key={tipoAtor}
                      type="button"
                      aria-pressed={!oculto}
                      onClick={() => alternarTipo(tipoAtor)}
                      className={`flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-xs transition hover:bg-signal/5 ${
                        oculto ? 'text-faint line-through' : 'font-medium text-ink'
                      }`}
                      title={oculto ? `Exibir ${rotulo}` : `Ocultar ${rotulo}`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full transition"
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
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={busca}
                onChange={(e) => buscarNo(e.target.value)}
                placeholder="Buscar nó…"
                className="campo py-1.5 pl-8 text-xs"
              />
            </div>

            <button type="button" onClick={centralizar} className="botao-secundario mt-2 w-full py-1.5 text-xs">
              <Crosshair size={13} /> Centralizar
            </button>

            <BaixarGrafico
              alvo={containerRef}
              nome={`rede-coqueiros-${tipo}`}
              titulo={`Rede de coocorrência — ${tipo === 'atores' ? 'atores' : 'palavras-chave'} (top ${grafo?.nos.length ?? 0})`}
              legenda={
                tipo === 'atores'
                  ? LEGENDA.filter(({ tipo: t }) => !tiposOcultos.has(t)).map(({ tipo: t, rotulo }) => ({
                      nome: rotulo,
                      cor: COR_POR_TIPO[t],
                    }))
                  : undefined
              }
              className="botao-primario mt-1.5 w-full py-1.5 text-xs"
              conteudo={
                <>
                  <Camera size={13} aria-hidden /> Salvar imagem
                </>
              }
            />

            <p className="mt-3 text-[0.6875rem] leading-relaxed text-faint">
              Passe o cursor sobre um nó para isolar sua vizinhança; clique para abrir o perfil.
            </p>
          </div>

          {/* Overlay de estabilização da física */}
          {estabilizando && (
            <div className="absolute inset-0 flex animate-fade-in flex-col items-center justify-center bg-surface/70 backdrop-blur-sm">
              <div className="relative h-px w-40 overflow-hidden bg-line">
                <div className="absolute inset-y-0 w-1/3 animate-barra-carregando bg-signal shadow-[0_0_12px_rgb(var(--signal))]" />
              </div>
              <p className="rotulo mt-3">Estabilizando a rede…</p>
            </div>
          )}
        </div>
      )}

      {!semDados && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-5 py-2.5 text-xs text-muted">
          <span className="rotulo">
            <span className="text-ink">{grafo.nos.length}</span> nós
          </span>
          <span className="rotulo">
            <span className="text-ink">{grafo.arestas.length}</span> conexões
          </span>
          <span className="text-faint">Conexão = notícias em que os dois nós aparecem juntos.</span>
        </div>
      )}
    </section>
  );
}
