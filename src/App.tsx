import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarFilters from '@/components/SidebarFilters';
import MetricsOverview from '@/components/MetricsOverview';
import WordCloud from '@/components/WordCloud';
import EventsPanel from '@/components/EventsPanel';
import NetworkGraph from '@/components/NetworkGraph';
import CausalDiagram from '@/components/CausalDiagram';
import ActorsTable from '@/components/ActorsTable';
import NewsTable from '@/components/NewsTable';
import ChatbotDrawer from '@/components/ChatbotDrawer';
import { useAtoresComSNA, useGrafoRede } from '@/hooks/useNetworkData';
import { carregarAcervo, paraISO, type Acervo } from '@/lib/data';
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

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [tipoRede, setTipoRede] = useState<TipoRede>('atores');
  const [topN, setTopN] = useState(30);
  const [chatAberto, setChatAberto] = useState(false);
  // Gaveta de filtros no mobile; recolhimento da barra lateral no desktop.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);

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
          const minimo = new Date(Math.min(...datas.map((d) => d.getTime())));
          const maximo = new Date(Math.max(...datas.map((d) => d.getTime())));
          setFiltros((atual) => ({
            ...atual,
            dataInicio: paraISO(minimo),
            dataFim: paraISO(maximo),
          }));
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 w-fit rounded-full bg-rose-50 p-3">
            <AlertTriangle size={28} className="text-rose-600" />
          </div>
          <h1 className="mb-2 text-lg font-bold text-slate-900">Não foi possível carregar o acervo</h1>
          <p className="text-sm text-slate-600">{erroCarregamento}</p>
          <p className="mt-3 text-xs text-slate-400">
            Verifique se <code className="rounded bg-slate-100 px-1">public/data/noticias.json</code>{' '}
            e <code className="rounded bg-slate-100 px-1">atores.json</code> existem. Rode{' '}
            <code className="rounded bg-slate-100 px-1">npm run sync:data</code> para regerá-los a
            partir da raiz do projeto.
          </p>
        </div>
      </div>
    );
  }

  if (!acervo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
        <Loader2 size={36} className="mb-4 animate-spin text-brand-600" />
        <p className="text-sm font-medium text-slate-700">Carregando o acervo da Folha…</p>
        <p className="mt-1 text-xs text-slate-400">Notícias, atores e métricas de rede</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar
        onAbrirChat={() => setChatAberto(true)}
        onAlternarFiltros={() => setFiltrosAbertos((v) => !v)}
        onAlternarRecolhida={() => setSidebarRecolhida((v) => !v)}
        sidebarRecolhida={sidebarRecolhida}
      />

      <div className="mx-auto flex max-w-[1600px]">
        <SidebarFilters
          filtros={filtros}
          onMudarFiltros={setFiltros}
          onLimpar={() =>
            setFiltros({
              ...FILTROS_INICIAIS,
              dataInicio: filtros.dataInicio,
              dataFim: filtros.dataFim,
            })
          }
          categorias={categoriasDisponiveis}
          totalFiltrado={noticiasFiltradas.length}
          totalGeral={noticias.length}
          aberto={filtrosAbertos}
          onFechar={() => setFiltrosAbertos(false)}
          recolhida={sidebarRecolhida}
          onRecolher={() => setSidebarRecolhida(true)}
        />

        <main className="min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Dashboard Analítico e IA
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Inteligência de dados territoriais do bairro de Coqueiros — redes de atores,
              causalidades e assistente editorial.
            </p>
          </div>

          {noticiasFiltradas.length === 0 ? (
            <div className="card p-16 text-center">
              <p className="text-sm font-medium text-slate-700">
                Nenhuma notícia corresponde aos filtros selecionados.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Amplie o período ou remova categorias na barra lateral.
              </p>
            </div>
          ) : (
            <>
              <MetricsOverview noticias={noticiasFiltradas} metricas={metricas} />

              <WordCloud
                noticias={noticiasFiltradas}
                onSelecionarTermo={(termo) => setFiltros((atual) => ({ ...atual, busca: termo }))}
              />

              <EventsPanel noticias={noticiasFiltradas} />

              <NetworkGraph
                grafo={grafo}
                tipo={tipoRede}
                onMudarTipo={setTipoRede}
                topN={topN}
                onMudarTopN={setTopN}
              />

              <CausalDiagram noticias={noticiasFiltradas} />

              <ActorsTable atores={atoresComSNA} />

              <NewsTable noticias={noticiasFiltradas} totalAcervo={noticias.length} />
            </>
          )}

          <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
            <p>
              Folha de Coqueiros · Dashboard Analítico —{' '}
              <span className="text-slate-500">
                dados processados com NLP e modelos generativos
              </span>
            </p>
            <p className="mt-1">
              Desenvolvido por{' '}
              <a
                href="https://gustavosimas.com"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 transition hover:text-brand-800 hover:decoration-brand-500"
              >
                Gustavo Simas
              </a>
            </p>
          </footer>
        </main>
      </div>

      <ChatbotDrawer
        aberto={chatAberto}
        onFechar={() => setChatAberto(false)}
        noticias={noticiasFiltradas}
        atores={atoresComSNA}
        metricas={metricas}
      />
    </div>
  );
}
