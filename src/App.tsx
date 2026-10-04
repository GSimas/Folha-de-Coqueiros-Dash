import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FiltersDrawer from '@/components/FiltersDrawer';
import MetricsOverview from '@/components/MetricsOverview';
import WordCloud from '@/components/WordCloud';
import EventsPanel from '@/components/EventsPanel';
import NetworkGraph from '@/components/NetworkGraph';
import CausalDiagram from '@/components/CausalDiagram';
import ActorsTable from '@/components/ActorsTable';
import NewsTable from '@/components/NewsTable';
import ChatbotDrawer from '@/components/ChatbotDrawer';
import { GithubIcon } from '@/components/SocialIcons';
import FundoAnimado from '@/components/FundoAnimado';
import Inicio from '@/pages/Inicio';
import PaginaModulo from '@/pages/PaginaModulo';
import { useAtoresComSNA, useGrafoRede } from '@/hooks/useNetworkData';
import { carregarAcervo, paraISO, type Acervo } from '@/lib/data';
import { MODULOS, useRota } from '@/lib/rotas';
import { useIA } from '@/lib/ia/conexao';
import type { Filtros, MetricasGerais, TipoRede } from '@/types';

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

  const [rota] = useRota();
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [periodoCompleto, setPeriodoCompleto] = useState({ inicio: '', fim: '' });
  const [tipoRede, setTipoRede] = useState<TipoRede>('atores');
  const [topN, setTopN] = useState(30);
  const [chatAberto, setChatAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [focarConexao, setFocarConexao] = useState(false);
  const { acabouDeEntrar, consumirEntrada } = useIA();

  const abrirChat = useCallback(() => {
    setFocarConexao(false);
    setChatAberto(true);
  }, []);
  const abrirConexaoIA = useCallback(() => {
    setFocarConexao(true);
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
  const noticiasFiltradas = useMemo(() => {
    if (noticias.length === 0) return [];

    const inicio = filtros.dataInicio ? new Date(`${filtros.dataInicio}T00:00:00`) : null;
    const fim = filtros.dataFim ? new Date(`${filtros.dataFim}T23:59:59`) : null;
    const busca = filtros.busca.trim().toLowerCase();
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

      if (busca) {
        const alvo = `${noticia.titulo} ${noticia.conteudo}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }

      return true;
    });
  }, [noticias, filtros]);

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
  const atoresComSNA = useAtoresComSNA(atores);
  const grafo = useGrafoRede({ atores, noticias: noticiasFiltradas, tipo: tipoRede, topN });

  // --- Estados de carregamento / erro ---
  if (erroCarregamento) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="fundo" aria-hidden />
        <div className="card max-w-md p-8 text-center">
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
      <div className="flex min-h-screen flex-col items-center justify-center">
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
          <WordCloud
            noticias={noticiasFiltradas}
            onSelecionarTermo={(termo) => setFiltros((atual) => ({ ...atual, busca: termo }))}
          />
        );
      case 'eventos':
        return <EventsPanel noticias={noticiasFiltradas} />;
      case 'rede':
        return (
          <NetworkGraph
            grafo={grafo}
            tipo={tipoRede}
            onMudarTipo={setTipoRede}
            topN={topN}
            onMudarTopN={setTopN}
          />
        );
      case 'causal':
        return <CausalDiagram noticias={noticiasFiltradas} onConectarIA={abrirConexaoIA} />;
      case 'atores':
        return <ActorsTable atores={atoresComSNA} />;
      case 'acervo':
        return <NewsTable noticias={noticiasFiltradas} totalAcervo={noticias.length} />;
    }
  };

  return (
    <div className="relative min-h-screen">
      <div className="fundo" aria-hidden />
      <FundoAnimado />
      <Navbar rota={rota} onAbrirChat={abrirChat} />

      {/* `key` reinicia a animação de entrada a cada troca de página */}
      <main key={rota} className="animate-entrada-pagina">
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
            {conteudoModulo()}
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

      <ChatbotDrawer
        aberto={chatAberto}
        onFechar={fecharChat}
        focarConexao={focarConexao}
        acervo={noticias}
        recorte={noticiasFiltradas}
        filtros={filtros}
        periodoCompleto={periodoCompleto}
        metricas={metricas}
        atores={atoresComSNA}
      />
    </div>
  );
}
