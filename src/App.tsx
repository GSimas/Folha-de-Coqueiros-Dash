import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FiltersDrawer from '@/components/FiltersDrawer';
import LimiteErro from '@/components/LimiteErro';
import { carregarChat, carregarPerfil } from '@/lib/precarregar';
import { ProvedorPerfis, type ContextoPerfis, type Perfil } from '@/lib/perfis';
import { GithubIcon } from '@/components/SocialIcons';
import FundoAnimado from '@/components/FundoAnimado';
import Inicio from '@/pages/Inicio';
import PaginaModulo from '@/pages/PaginaModulo';
import { useAtoresComSNA, useGrafoRede } from '@/hooks/useNetworkData';
import { carregarAcervo, paraISO, type Acervo } from '@/lib/data';
import { MODULOS, useRota } from '@/lib/rotas';
import { casaComBusca, palavrasDaConsulta, semAcento } from '@/lib/busca';
import { useIA } from '@/lib/ia/conexao';
import type { AtorComSNA, Filtros, MetricasGerais, TipoRede } from '@/types';

// Cada módulo, o perfil e o assistente viram chunks próprios: a página inicial
// não baixa nem executa vis-network, Recharts, React Flow, TanStack Table nem Markdown.
const MetricsOverview = lazy(() => import('@/components/MetricsOverview'));
const WordCloud = lazy(() => import('@/components/WordCloud'));
const EventsPanel = lazy(() => import('@/components/EventsPanel'));
const NetworkGraph = lazy(() => import('@/components/NetworkGraph'));
const CausalDiagram = lazy(() => import('@/components/CausalDiagram'));
const ActorsTable = lazy(() => import('@/components/ActorsTable'));
const NewsTable = lazy(() => import('@/components/NewsTable'));
const ChatbotDrawer = lazy(carregarChat);
const PerfilModal = lazy(carregarPerfil);

/** Enquanto o chunk do módulo chega: reserva altura para não empurrar o rodapé. */
function CarregandoModulo() {
  return (
    <div className="card flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status">
      <div className="relative h-px w-48 overflow-hidden bg-line">
        <div className="absolute inset-y-0 w-1/3 animate-barra-carregando bg-signal" />
      </div>
      <p className="text-sm text-muted">Carregando o módulo…</p>
    </div>
  );
}

const SEM_METRICAS: AtorComSNA[] = [];

const FILTROS_INICIAIS: Filtros = {
  dataInicio: '',
  dataFim: '',
  categorias: [],
  apenasEventos: false,
  busca: '',
};

export default function App() {
  const [acervo, setAcervo] = useState<Acervo | null>(null);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const [rota, navegar] = useRota();
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [periodoCompleto, setPeriodoCompleto] = useState({ inicio: '', fim: '' });
  const [tipoRede, setTipoRede] = useState<TipoRede>('atores');
  const [topN, setTopN] = useState(30);
  const [chatAberto, setChatAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [focarConexao, setFocarConexao] = useState(false);
  // Perfis abertos em sequência (ator → tema → ator…), para o botão Voltar.
  const [pilhaPerfis, setPilhaPerfis] = useState<Perfil[]>([]);
  // Baixado na primeira abertura; depois fica montado para animar a saída.
  const [perfilMontado, setPerfilMontado] = useState(false);
  if (pilhaPerfis.length > 0 && !perfilMontado) setPerfilMontado(true);
  const fecharPerfil = useCallback(() => setPilhaPerfis([]), []);
  const voltarPerfil = useCallback(() => setPilhaPerfis((pilha) => pilha.slice(0, -1)), []);
  const abrirPerfil = useCallback(
    (perfil: Perfil) =>
      setPilhaPerfis((pilha) => {
        const topo = pilha[pilha.length - 1];
        const igual = topo && JSON.stringify(topo) === JSON.stringify(perfil);
        return igual ? pilha : [...pilha, perfil].slice(-20);
      }),
    [],
  );
  const { acabouDeEntrar, consumirEntrada } = useIA();

  // O assistente só é baixado na primeira abertura e depois fica montado
  // (a conversa sobrevive ao fechar e reabrir).
  const [chatMontado, setChatMontado] = useState(false);
  const abrirChat = useCallback(() => {
    setFocarConexao(false);
    setChatMontado(true);
    setChatAberto(true);
  }, []);
  const abrirConexaoIA = useCallback(() => {
    setFocarConexao(true);
    setChatMontado(true);
    setChatAberto(true);
  }, []);
  const fecharChat = useCallback(() => setChatAberto(false), []);

  // Ao voltar do login do OpenRouter, reabre o assistente para mostrar o resultado.
  useEffect(() => {
    if (!acabouDeEntrar) return;
    consumirEntrada();
    abrirConexaoIA();
  }, [acabouDeEntrar, consumirEntrada, abrirConexaoIA]);
  const fecharFiltros = useCallback(() => setFiltrosAbertos(false), []);

  // Busca global do cabeçalho: abre o acervo com o período completo e só o filtro escolhido.
  const abrirAcervoCom = useCallback(
    (filtro: Partial<Filtros>) => {
      setFiltros({ ...FILTROS_INICIAIS, dataInicio: periodoCompleto.inicio, dataFim: periodoCompleto.fim, ...filtro });
      navegar('acervo');
    },
    [periodoCompleto, navegar],
  );
  const pesquisar = useCallback(
    (busca: string) => {
      setPilhaPerfis([]);
      abrirAcervoCom({ busca });
    },
    [abrirAcervoCom],
  );
  const verCategoria = useCallback(
    (categoria: string) => {
      setPilhaPerfis([]);
      abrirAcervoCom({ categorias: [categoria] });
    },
    [abrirAcervoCom],
  );

  // --- Carregamento inicial dos datasets ---
  useEffect(() => {
    let cancelado = false;

    carregarAcervo()
      .then((dados) => {
        if (cancelado) return;
        setAcervo(dados);

        // Inicializa o período com o intervalo completo do acervo
        const datas = dados.noticias
          .map((n) => n.dataConvertida)
          .filter((d): d is Date => d !== null);

        if (datas.length > 0) {
          const inicio = paraISO(new Date(Math.min(...datas.map((d) => d.getTime()))));
          const fim = paraISO(new Date(Math.max(...datas.map((d) => d.getTime()))));
          setPeriodoCompleto({ inicio, fim });
          setFiltros((atual) => ({ ...atual, dataInicio: inicio, dataFim: fim }));
        }
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        setErroCarregamento(
          erro instanceof Error ? erro.message : 'Falha desconhecida ao carregar os dados.',
        );
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const noticias = acervo?.noticias ?? [];
  const atores = acervo?.atores ?? [];

  // --- Aplicação dos filtros ---
  // Adiado: digitar na busca dos filtros atualiza o campo na hora; o recorte
  // (e gráficos/rede que dependem dele) recalcula sem travar a digitação.
  const filtrosEfetivos = useDeferredValue(filtros);
  const noticiasFiltradas = useMemo(() => {
    const filtros = filtrosEfetivos;
    if (noticias.length === 0) return [];

    const inicio = filtros.dataInicio ? new Date(`${filtros.dataInicio}T00:00:00`) : null;
    const fim = filtros.dataFim ? new Date(`${filtros.dataFim}T23:59:59`) : null;
    const palavrasBusca = palavrasDaConsulta(filtros.busca);
    const categorias = new Set(filtros.categorias);

    return noticias.filter((noticia) => {
      if (filtros.apenasEventos && !noticia.ehEvento) return false;

      if (categorias.size > 0 && !categorias.has(noticia.categorias)) return false;

      // Notícias sem data válida são mantidas apenas quando não há recorte temporal.
      if (inicio || fim) {
        if (!noticia.dataConvertida) return false;
        if (inicio && noticia.dataConvertida < inicio) return false;
        if (fim && noticia.dataConvertida > fim) return false;
      }

      if (palavrasBusca.length > 0 && !casaComBusca(noticia, palavrasBusca)) return false;

      return true;
    });
  }, [noticias, filtrosEfetivos]);

  // --- Métricas do recorte ativo ---
  const metricas: MetricasGerais = useMemo(() => {
    const total = noticiasFiltradas.length;
    const somaPalavras = noticiasFiltradas.reduce((soma, n) => soma + n.tamanhoTexto, 0);
    return {
      totalNoticias: total,
      mediaPalavras: total > 0 ? Math.round(somaPalavras / total) : 0,
      categorizadas: noticiasFiltradas.filter((n) => n.categorizada).length,
      totalEventos: noticiasFiltradas.filter((n) => n.ehEvento).length,
      eventosPagos: noticiasFiltradas.filter((n) => n.ehEvento && n.ehPago).length,
    };
  }, [noticiasFiltradas]);

  // Categorias disponíveis, com contagem sobre o acervo completo
  const categoriasDisponiveis = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const noticia of noticias) {
      if (!noticia.categorizada) continue;
      contagem.set(noticia.categorias, (contagem.get(noticia.categorias) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [noticias]);

  // --- SNA ---
  // Calculado num Web Worker; `null` enquanto calcula (só a tabela de atores espera).
  const atoresSNA = useAtoresComSNA(atores);
  const atoresComSNA = atoresSNA ?? SEM_METRICAS;
  const grafo = useGrafoRede({ atores, noticias: noticiasFiltradas, tipo: tipoRede, topN });
  const idsPorNome = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of atores) if (!mapa.has(semAcento(a.nome))) mapa.set(semAcento(a.nome), a.id);
    return mapa;
  }, [atores]);
  const perfis = useMemo<ContextoPerfis>(
    () => ({
      abrirAtor: (id) => abrirPerfil({ tipo: 'ator', id }),
      abrirTema: (termo) => abrirPerfil({ tipo: 'tema', termo }),
      abrirCategoria: (nome) => abrirPerfil({ tipo: 'categoria', nome }),
      abrirTipoEvento: (nome) => abrirPerfil({ tipo: 'tipoEvento', nome }),
      pesquisar,
      verCategoria,
      idDoAtor: (nome) => idsPorNome.get(semAcento(nome.trim())),
    }),
    [abrirPerfil, pesquisar, verCategoria, idsPorNome],
  );

  // --- Estados de carregamento / erro ---
  if (erroCarregamento) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="fundo" aria-hidden />
        <div className="card max-w-md p-8 text-center" role="alert">
          <AlertTriangle size={28} className="mx-auto mb-4 text-rose-500" />
          <h1 className="mb-2 text-lg font-semibold text-ink">Não foi possível carregar o acervo</h1>
          <p className="text-sm text-muted">{erroCarregamento}</p>
          <p className="mt-3 text-xs text-faint">
            Verifique se <code className="bg-slate-100 px-1">public/data/noticias.json</code> e{' '}
            <code className="bg-slate-100 px-1">atores.json</code> existem. Rode{' '}
            <code className="bg-slate-100 px-1">npm run sync:data</code> para regerá-los a partir
            da raiz do projeto.
          </p>
        </div>
      </div>
    );
  }

  if (!acervo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center" role="status" aria-live="polite">
        <div className="fundo" aria-hidden />
        <p className="rotulo mb-4">Folha de Coqueiros</p>
        <div className="relative h-px w-48 overflow-hidden bg-line">
          <div className="absolute inset-y-0 w-1/3 animate-barra-carregando bg-signal shadow-[0_0_12px_rgb(var(--signal))]" />
        </div>
        <p className="mt-4 text-sm text-muted">
          Carregando o <span className="titulo-serif text-base">acervo</span>…
        </p>
      </div>
    );
  }

  const modulo = MODULOS.find((m) => m.rota === rota);
  const semResultados = noticiasFiltradas.length === 0;

  const conteudoModulo = () => {
    if (!modulo) return null;
    if (modulo.usaFiltros && semResultados) {
      return (
        <div className="card p-16 text-center">
          <p className="text-base font-medium text-ink">
            Nenhuma notícia corresponde ao <span className="titulo-serif">recorte.</span>
          </p>
          <p className="mt-2 text-sm text-muted">Amplie o período ou remova filtros.</p>
          <button
            type="button"
            onClick={() => setFiltrosAbertos(true)}
            className="botao-secundario mt-6"
          >
            Ajustar filtros
          </button>
        </div>
      );
    }
    switch (modulo.rota) {
      case 'panorama':
        return <MetricsOverview noticias={noticiasFiltradas} metricas={metricas} />;
      case 'temas':
        return (
          <div className="space-y-6">
            <LimiteErro area="a nuvem de termos">
              <WordCloud noticias={noticiasFiltradas} />
            </LimiteErro>
            <LimiteErro area="o painel de eventos">
              <EventsPanel noticias={noticiasFiltradas} />
            </LimiteErro>
          </div>
        );
      case 'rede':
        return (
          <div className="space-y-6">
            <LimiteErro area="o grafo de coocorrência" chave={grafo}>
              <NetworkGraph
                grafo={grafo}
                tipo={tipoRede}
                onMudarTipo={setTipoRede}
                topN={topN}
                onMudarTopN={setTopN}
              />
            </LimiteErro>
            <LimiteErro area="a tabela de atores">
              <ActorsTable atores={atoresSNA} />
            </LimiteErro>
          </div>
        );
      case 'causal':
        return <CausalDiagram noticias={noticiasFiltradas} onConectarIA={abrirConexaoIA} />;
      case 'acervo':
        return <NewsTable noticias={noticiasFiltradas} totalAcervo={noticias.length} />;
    }
  };

  return (
    <ProvedorPerfis value={perfis}>
    <div className="relative min-h-screen">
      <div className="fundo" aria-hidden />
      <FundoAnimado />
      {/* Pular para o conteúdo (WCAG 2.4.1): só aparece com foco de teclado. Botão,
          não âncora: `#conteudo` mudaria a rota do roteamento por hash. */}
      <button
        type="button"
        onClick={() => document.getElementById('conteudo')?.focus()}
        className="botao-primario fixed left-4 top-3 z-[60] -translate-y-16 focus-visible:translate-y-0"
      >
        Pular para o conteúdo
      </button>
      <Navbar
        rota={rota}
        onAbrirChat={abrirChat}
        noticias={noticias}
        atores={atores}
      />

      {/* `key` reinicia a animação de entrada a cada troca de página */}
      <main key={rota} id="conteudo" tabIndex={-1} className="animate-entrada-pagina focus:outline-none">
        {modulo ? (
          <PaginaModulo
            modulo={modulo}
            filtros={filtros}
            onMudarFiltros={setFiltros}
            onAbrirFiltros={() => setFiltrosAbertos(true)}
            periodoCompleto={periodoCompleto}
            totalFiltrado={noticiasFiltradas.length}
            totalGeral={noticias.length}
          >
            <LimiteErro area={`o módulo ${modulo.rotulo}`} chave={rota}>
              <Suspense fallback={<CarregandoModulo />}>{conteudoModulo()}</Suspense>
            </LimiteErro>
          </PaginaModulo>
        ) : (
          <Inicio
            noticias={noticias}
            atores={atores}
            periodo={periodoCompleto}
            onAbrirChat={abrirChat}
          />
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <p className="rotulo">
            Folha de Coqueiros · dados processados com NLP e modelos generativos
          </p>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span>
              Desenvolvido por{' '}
              <a
                href="https://gustavosimas.com"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-ink underline decoration-line underline-offset-4 transition hover:text-signal hover:decoration-signal"
              >
                Gustavo Simas
              </a>
            </span>
            <a
              href="https://folhadecoqueiros.com.br"
              target="_blank"
              rel="noreferrer noopener"
              className="rotulo rounded-sm px-1 py-1 transition hover:text-signal"
            >
              Site ↗
            </a>
            <a
              href="https://github.com/GSimas"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub"
              className="botao-icone"
            >
              <GithubIcon size={16} />
            </a>
          </div>
        </div>
      </footer>

      <FiltersDrawer
        filtros={filtros}
        onMudarFiltros={setFiltros}
        onLimpar={() =>
          setFiltros({
            ...FILTROS_INICIAIS,
            dataInicio: periodoCompleto.inicio,
            dataFim: periodoCompleto.fim,
          })
        }
        categorias={categoriasDisponiveis}
        totalFiltrado={noticiasFiltradas.length}
        totalGeral={noticias.length}
        aberto={filtrosAbertos}
        onFechar={fecharFiltros}
      />

      {perfilMontado && (
        <LimiteErro area="o perfil" chave={pilhaPerfis}>
          <Suspense fallback={null}>
            <PerfilModal
              pilha={pilhaPerfis}
              atores={atoresComSNA}
              noticias={noticias}
              onVoltar={voltarPerfil}
              onFechar={fecharPerfil}
            />
          </Suspense>
        </LimiteErro>
      )}

      {chatMontado && (
        <LimiteErro area="o assistente">
          <Suspense fallback={null}>
            <ChatbotDrawer
              aberto={chatAberto}
              onFechar={fecharChat}
              focarConexao={focarConexao}
              acervo={noticias}
              recorte={noticiasFiltradas}
              filtros={filtrosEfetivos}
              periodoCompleto={periodoCompleto}
              metricas={metricas}
              atores={atoresComSNA}
            />
          </Suspense>
        </LimiteErro>
      )}
    </div>
    </ProvedorPerfis>
  );
}
