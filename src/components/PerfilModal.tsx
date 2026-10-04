import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, ArrowUpRight, CalendarDays, Search, X } from 'lucide-react';
import type { AtorComSNA, Noticia } from '@/types';
import { COR_POR_TIPO, corDaCategoria, corDoTipoEvento } from '@/lib/constantes';
import { eixoGrafico, tooltipGrafico, useCoresGrafico } from '@/lib/preferencias';
import { useFocoPreso, usePresenca } from '@/lib/motion';
import {
  montarPerfil,
  montarPerfilCategoria,
  montarPerfilTema,
  montarPerfilTipoEvento,
  type PerfilAtor,
  type PerfilConjunto,
} from '@/lib/perfil';
import { LinkAtor, usePerfis, type Perfil } from '@/lib/perfis';
import TabelaDados from './TabelaDados';
import { BaixarGrafico } from './MenuBaixar';
import { COLUNAS_NOTICIAS } from './NewsTable';

interface PerfilModalProps {
  /** Perfis abertos em sequência; o último é o exibido. Vazia fecha a janela. */
  pilha: Perfil[];
  atores: AtorComSNA[];
  noticias: Noticia[];
  onVoltar: () => void;
  onFechar: () => void;
}

const MAX_LISTA = 12;
const fmt = (n: number) => n.toLocaleString('pt-BR');

// ---------------------------------------------------------------------------
// Partes comuns
// ---------------------------------------------------------------------------

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="bg-surface px-4 py-4">
      <p className="rotulo">{rotulo}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-[-0.03em] text-ink sm:text-2xl">{valor}</p>
      <p className="mt-0.5 h-4 truncate text-xs text-muted">{detalhe}</p>
    </div>
  );
}

function Cartao({
  letra,
  titulo,
  dica,
  acao,
  children,
}: {
  letra: string;
  titulo: string;
  dica?: string;
  /** Controle à direita do título (ex.: baixar imagem). */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h3 className="card-titulo">
        <span className="text-signal">{letra}</span> · {titulo}
        {dica && <span className="ml-auto hidden normal-case tracking-normal text-faint sm:inline">{dica}</span>}
        {acao && <span className={`-my-2 ${dica ? '' : 'ml-auto'}`}>{acao}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Cartão A (série mensal) com download da imagem do gráfico. */
function CartaoSerie({ titulo, nome, serie, cor }: { titulo: string; nome: string; serie: PerfilAtor['serie']; cor: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Cartao
      letra="A"
      titulo={titulo}
      dica="notícias por mês"
      acao={<BaixarGrafico alvo={ref} nome={`${nome}-${titulo}`} titulo={`${nome} — ${titulo}`} />}
    >
      <div ref={ref}>
        <GraficoSerie serie={serie} cor={cor} />
      </div>
    </Cartao>
  );
}

function GraficoSerie({ serie, cor }: { serie: PerfilAtor['serie']; cor: string }) {
  const cores = useCoresGrafico();
  const eixo = eixoGrafico(cores, 10);
  return (
    <div className="h-[200px] p-4">
      {serie.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke={cores.line} strokeDasharray="2 4" />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...eixo} allowDecimals={false} />
            <Tooltip {...tooltipGrafico(cores)} formatter={(v) => [`${v} notícia(s)`, 'Notícias']} />
            <Bar dataKey="total" fill={cor} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="vazio">Sem notícias datadas.</p>
      )}
    </div>
  );
}

/** Lista de contagens com barras proporcionais; cada linha abre um perfil. */
function ListaBarras({
  itens,
  corDe,
  aoAbrir,
  vazio,
}: {
  itens: Array<{ nome: string; total: number }>;
  corDe: (nome: string, indice: number) => string;
  aoAbrir: (nome: string) => void;
  vazio: string;
}) {
  const total = itens.reduce((s, c) => s + c.total, 0) || 1;
  return (
    <ul className="space-y-1 p-3">
      {itens.length === 0 && <li className="p-2 text-sm text-muted">{vazio}</li>}
      {itens.map((c, i) => {
        const cor = corDe(c.nome, i);
        return (
          <li key={c.nome}>
            <button type="button" onClick={() => aoAbrir(c.nome)} className="group w-full rounded-sm px-2 py-1.5 text-left">
              <span className="flex items-baseline gap-2 text-[0.8125rem]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
                <span className="flex-1 truncate text-muted transition group-hover:text-signal">{c.nome}</span>
                <span className="font-mono text-xs tabular-nums text-ink">{c.total}</span>
              </span>
              <span className="ml-4 mt-1 block h-px bg-line">
                <span className="block h-px" style={{ width: `${(c.total / total) * 100}%`, backgroundColor: cor }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ListaCategorias({ categorias }: { categorias: PerfilAtor['categorias'] }) {
  const { abrirCategoria } = usePerfis();
  return <ListaBarras itens={categorias} corDe={corDaCategoria} aoAbrir={abrirCategoria} vazio="Sem notícias categorizadas." />;
}

function ListaTipos({ tipos }: { tipos: PerfilConjunto['tiposEvento'] }) {
  const { abrirTipoEvento } = usePerfis();
  return <ListaBarras itens={tipos} corDe={corDoTipoEvento} aoAbrir={abrirTipoEvento} vazio="Nenhum evento classificado." />;
}

function ListaLocais({ locais }: { locais: PerfilConjunto['locais'] }) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto p-3 text-[0.8125rem]">
      {locais.length === 0 && <li className="p-2 text-sm text-muted">Nenhum local informado.</li>}
      {locais.map((l) => (
        <li key={l.nome} className="flex items-baseline gap-2 px-2 py-1">
          <LinkAtor nome={l.nome} className="flex-1 truncate text-muted" />
          <span className="font-mono text-xs tabular-nums text-ink">{l.total}</span>
        </li>
      ))}
    </ul>
  );
}

function ListaAtores({ itens, vazio }: { itens: PerfilAtor['conexoes']; vazio: string }) {
  const { abrirAtor } = usePerfis();
  const maximo = itens[0]?.emComum ?? 1;
  return (
    <ul className="p-2">
      {itens.length === 0 && <li className="p-3 text-sm text-muted">{vazio}</li>}
      {itens.slice(0, MAX_LISTA).map(({ ator, emComum }) => (
        <li key={ator.id}>
          <button
            type="button"
            onClick={() => abrirAtor(ator.id)}
            className="group flex w-full items-center gap-3 rounded-sm px-3 py-1.5 text-left text-[0.8125rem]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COR_POR_TIPO[ator.tipo] }} />
            <span className="flex-1 truncate text-ink transition group-hover:text-signal">{ator.nome}</span>
            <span className="hidden h-px w-16 bg-line sm:block">
              <span className="block h-px bg-signal" style={{ width: `${(emComum / maximo) * 100}%` }} />
            </span>
            <span className="w-6 text-right font-mono text-xs tabular-nums text-muted">{emComum}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NuvemTemas({ termos }: { termos: PerfilAtor['palavras'] }) {
  const { abrirTema } = usePerfis();
  return (
    <div className="flex flex-wrap gap-1.5 p-5">
      {termos.length === 0 && <p className="text-sm text-muted">Sem palavras-chave.</p>}
      {termos.map(({ termo, total }) => (
        <button
          key={termo}
          type="button"
          onClick={() => abrirTema(termo)}
          title={`Perfil do tema “${termo}”`}
          className="chip border border-line text-muted transition hover:border-signal/50 hover:text-signal"
        >
          {termo} <span className="font-mono text-faint">{total}</span>
        </button>
      ))}
    </div>
  );
}

function ListaEventos({ eventos }: { eventos: Noticia[] }) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
      {eventos.length === 0 && <li className="p-3 text-sm text-muted">Nenhum evento associado.</li>}
      {eventos.map((n) => (
        <li key={n.id}>
          <a
            href={n.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-start gap-2.5 rounded-sm px-3 py-2 text-[0.8125rem]"
          >
            <CalendarDays size={14} className="mt-0.5 shrink-0 text-signal" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-ink transition group-hover:text-signal">{n.titulo}</span>
              <span className="font-mono text-[0.6875rem] text-faint">
                {n.dataEvento || n.data}
                {n.localEvento ? ` · ${n.localEvento}` : ''}
              </span>
            </span>
            <ArrowUpRight size={12} className="mt-1 shrink-0 text-faint" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function TabelaNoticias({ noticias, titulo, arquivo }: { noticias: Noticia[]; titulo: string; arquivo: string }) {
  return (
    <section className="card overflow-hidden">
      <TabelaDados
        dados={noticias}
        colunas={COLUNAS_NOTICIAS}
        rotuloItens="notícias"
        nomeArquivo={arquivo}
        ordenacaoInicial={[{ id: 'data', desc: true }]}
        porPagina={10}
        larguraMinima="min-w-[860px]"
        titulo={
          <h3 className="rotulo">
            <span className="text-signal">F</span> · {titulo}
          </h3>
        }
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Conteúdos
// ---------------------------------------------------------------------------

function ConteudoAtor({ ator, perfil, totalAtores }: { ator: AtorComSNA; perfil: PerfilAtor; totalAtores: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 lg:grid-cols-6">
        <Numero rotulo="Notícias" valor={fmt(perfil.noticias.length)} detalhe={`${perfil.posicaoCitacoes}º mais citado`} />
        <Numero rotulo="Conexões" valor={fmt(ator.grauAbsoluto)} detalhe={`${perfil.posicaoGrau}º em grau de ${fmt(totalAtores)}`} />
        <Numero rotulo="Betweenness" valor={ator.betweenness.toLocaleString('pt-BR')} detalhe="papel de ponte" />
        <Numero rotulo="Closeness" valor={ator.closeness.toLocaleString('pt-BR')} detalhe="proximidade" />
        <Numero rotulo="Primeira vez" valor={perfil.primeira?.data.slice(3) || '—'} detalhe={perfil.primeira?.data} />
        <Numero rotulo="Última vez" valor={perfil.ultima?.data.slice(3) || '—'} detalhe={perfil.ultima?.data} />
      </div>
      <CartaoSerie titulo="Citações ao longo do tempo" nome={ator.nome} serie={perfil.serie} cor={COR_POR_TIPO[ator.tipo]} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Cartao letra="B" titulo="Em que assuntos aparece">
          <ListaCategorias categorias={perfil.categorias} />
        </Cartao>
        <Cartao letra="C" titulo="Aparece junto com" dica={`${fmt(perfil.conexoes.length)} atores · clique para abrir`}>
          <ListaAtores itens={perfil.conexoes} vazio="Nenhum outro ator nas mesmas notícias." />
        </Cartao>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Cartao letra="D" titulo="Temas associados" dica="clique para abrir">
          <NuvemTemas termos={perfil.palavras} />
        </Cartao>
        <Cartao letra="E" titulo="Eventos" dica={String(perfil.eventos.length)}>
          <ListaEventos eventos={perfil.eventos} />
        </Cartao>
      </div>
      <TabelaNoticias noticias={perfil.noticias} titulo="Todas as notícias em que aparece" arquivo={`noticias-${ator.nome}`} />
    </>
  );
}

interface ConfigConjunto {
  /** Nome exibido do tema/categoria/tipo (arquivos exportados). */
  nome: string;
  /** Números próprios do tipo de perfil, entre "Notícias" e "Primeira vez". */
  numeros: Array<{ rotulo: string; valor: string; detalhe?: string }>;
  tituloSerie: string;
  /** Cartão B: categorias das notícias ou tipos de evento. */
  quebra: 'categorias' | 'tipos';
  /** Cartão E: eventos ou locais dos eventos. */
  final: 'eventos' | 'locais';
  tituloNoticias: string;
}

function ConteudoConjunto({ perfil, cor, config }: { perfil: PerfilConjunto; cor: string; config: ConfigConjunto }) {
  const pct = (perfil.fracaoAcervo * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <>
      <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 lg:grid-cols-6">
        <Numero rotulo="Notícias" valor={fmt(perfil.noticias.length)} detalhe={`${pct}% do acervo`} />
        {config.numeros.map((n) => (
          <Numero key={n.rotulo} {...n} />
        ))}
        <Numero rotulo="Primeira vez" valor={perfil.primeira?.data.slice(3) || '—'} detalhe={perfil.primeira?.data} />
        <Numero rotulo="Última vez" valor={perfil.ultima?.data.slice(3) || '—'} detalhe={perfil.ultima?.data} />
      </div>
      <CartaoSerie titulo={config.tituloSerie} nome={config.nome} serie={perfil.serie} cor={cor} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {config.quebra === 'categorias' ? (
          <Cartao letra="B" titulo="Em que categorias aparece" dica="clique para abrir">
            <ListaCategorias categorias={perfil.categorias} />
          </Cartao>
        ) : (
          <Cartao letra="B" titulo="Tipos de evento" dica="clique para abrir">
            <ListaTipos tipos={perfil.tiposEvento} />
          </Cartao>
        )}
        <Cartao letra="C" titulo="Atores envolvidos" dica={`${fmt(perfil.atores.length)} atores · clique para abrir`}>
          <ListaAtores itens={perfil.atores} vazio="Nenhum ator nessas notícias." />
        </Cartao>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Cartao letra="D" titulo="Temas frequentes" dica="clique para abrir">
          <NuvemTemas termos={perfil.temas} />
        </Cartao>
        {config.final === 'eventos' ? (
          <Cartao letra="E" titulo="Eventos" dica={String(perfil.eventos.length)}>
            <ListaEventos eventos={perfil.eventos} />
          </Cartao>
        ) : (
          <Cartao letra="E" titulo="Onde acontecem" dica="locais mais frequentes">
            <ListaLocais locais={perfil.locais} />
          </Cartao>
        )}
      </div>
      <TabelaNoticias noticias={perfil.noticias} titulo={config.tituloNoticias} arquivo={`noticias-${config.nome}`} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------

export default function PerfilModal({ pilha, atores, noticias, onVoltar, onFechar }: PerfilModalProps) {
  const atual = pilha[pilha.length - 1] ?? null;
  // Mantém o último perfil durante a animação de saída.
  const [exibido, setExibido] = useState(atual);
  if (atual && atual !== exibido) setExibido(atual);
  const { montado, visivel } = usePresenca(atual !== null, 300);
  const { pesquisar, verCategoria } = usePerfis();
  const cores = useCoresGrafico();
  const fecharRef = useRef<HTMLButtonElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  useFocoPreso(dialogoRef, atual !== null);

  const porId = useMemo(() => new Map(noticias.map((n) => [n.id, n])), [noticias]);
  const conteudo = useMemo(() => {
    if (exibido?.tipo === 'ator') {
      const ator = atores.find((a) => a.id === exibido.id);
      return ator ? { tipo: 'ator' as const, ator, perfil: montarPerfil(ator, porId, atores) } : null;
    }
    if (exibido?.tipo === 'tema') return { tipo: 'tema' as const, perfil: montarPerfilTema(exibido.termo, noticias, atores) };
    if (exibido?.tipo === 'categoria')
      return { tipo: 'categoria' as const, nome: exibido.nome, perfil: montarPerfilCategoria(exibido.nome, noticias, atores) };
    if (exibido?.tipo === 'tipoEvento')
      return { tipo: 'tipoEvento' as const, nome: exibido.nome, perfil: montarPerfilTipoEvento(exibido.nome, noticias, atores) };
    return null;
  }, [exibido, atores, noticias, porId]);

  useEffect(() => {
    if (!atual) return;
    rolagemRef.current?.scrollTo({ top: 0 });
    const timer = setTimeout(() => fecharRef.current?.focus(), 60);
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      // No `document`, antes do `window` onde o assistente escuta: com ele aberto
      // por baixo, Esc fecha só o perfil (popovers internos, também no document, seguem ouvindo).
      evento.stopPropagation();
      onFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [atual, onFechar]);

  if (!montado || !conteudo) return null;

  // Cabeçalho, ação "Ver no acervo" e corpo de cada tipo de perfil.
  let cabecalho: { rotulo: string; tipo: string; nome: string; descricao: string; cor: string };
  let verNoAcervo: (() => void) | null;
  let corpo: React.ReactNode;
  if (conteudo.tipo === 'ator') {
    const { ator, perfil } = conteudo;
    cabecalho = { rotulo: 'Perfil de ator', tipo: ator.tipo, nome: ator.nome, descricao: ator.descricao, cor: COR_POR_TIPO[ator.tipo] };
    verNoAcervo = () => pesquisar(ator.nome);
    corpo = <ConteudoAtor ator={ator} perfil={perfil} totalAtores={atores.length} />;
  } else if (conteudo.tipo === 'tema') {
    const { perfil } = conteudo;
    cabecalho = {
      rotulo: 'Perfil de tema',
      tipo: perfil.comoPalavraChave > 0 ? 'Palavra-chave' : 'Termo do texto',
      nome: perfil.nome,
      descricao: '',
      cor: cores.signal,
    };
    verNoAcervo = () => pesquisar(perfil.nome);
    corpo = (
      <ConteudoConjunto
        perfil={perfil}
        cor={cores.signal}
        config={{
          numeros: [
            { rotulo: 'Palavra-chave', valor: fmt(perfil.comoPalavraChave), detalhe: 'atribuída pela IA' },
            { rotulo: 'Atores', valor: fmt(perfil.atores.length), detalhe: 'envolvidos' },
            { rotulo: 'Eventos', valor: fmt(perfil.eventos.length), detalhe: 'relacionados' },
          ],
          nome: perfil.nome,
          tituloSerie: 'O tema ao longo do tempo',
          quebra: 'categorias',
          final: 'eventos',
          tituloNoticias: 'Todas as notícias do tema',
        }}
      />
    );
  } else if (conteudo.tipo === 'categoria') {
    const { nome, perfil } = conteudo;
    const cor = corDaCategoria(nome, 0);
    cabecalho = { rotulo: 'Perfil de categoria', tipo: 'Categoria de notícia', nome, descricao: '', cor };
    verNoAcervo = () => verCategoria(nome);
    corpo = (
      <ConteudoConjunto
        perfil={perfil}
        cor={cor}
        config={{
          numeros: [
            { rotulo: 'Eventos', valor: fmt(perfil.eventos.length), detalhe: `${perfil.tiposEvento.length} tipos` },
            { rotulo: 'Atores', valor: fmt(perfil.atores.length), detalhe: 'envolvidos' },
            { rotulo: 'Locais', valor: fmt(perfil.locais.length), detalhe: 'de eventos' },
          ],
          nome,
          tituloSerie: 'A categoria ao longo do tempo',
          quebra: 'tipos',
          final: 'eventos',
          tituloNoticias: 'Todas as notícias da categoria',
        }}
      />
    );
  } else {
    const { nome, perfil } = conteudo;
    const cor = corDoTipoEvento(nome);
    const gratuitos = perfil.eventos.filter((n) => !n.ehPago).length;
    cabecalho = { rotulo: 'Perfil de tipo de evento', tipo: 'Tipo de evento', nome, descricao: '', cor };
    verNoAcervo = null; // o recorte não filtra por tipo de evento; a tabela F já lista todos
    corpo = (
      <ConteudoConjunto
        perfil={perfil}
        cor={cor}
        config={{
          numeros: [
            {
              rotulo: 'Gratuitos',
              valor: fmt(gratuitos),
              detalhe: perfil.eventos.length ? `${Math.round((gratuitos / perfil.eventos.length) * 100)}% dos eventos` : undefined,
            },
            { rotulo: 'Atores', valor: fmt(perfil.atores.length), detalhe: 'envolvidos' },
            { rotulo: 'Locais', valor: fmt(perfil.locais.length), detalhe: 'diferentes' },
          ],
          nome,
          tituloSerie: 'Eventos ao longo do tempo',
          quebra: 'categorias',
          final: 'locais',
          tituloNoticias: 'Todos os eventos deste tipo',
        }}
      />
    );
  }

  return (
    // Acima do assistente (z-50): perfis também abrem a partir das respostas dele.
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-8">
      <div
        className={`absolute inset-0 bg-canvas/70 backdrop-blur-sm transition-opacity duration-300 ${
          visivel ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onFechar}
        aria-hidden
      />
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="perfil-nome"
        className={`relative flex max-h-full w-full max-w-5xl flex-col border border-line bg-elevated shadow-[0_32px_80px_-24px_rgb(0_0_0/0.6)]
                    transition duration-300 ease-suave
                    ${visivel ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.98] opacity-0'}`}
      >
        <div className="flex items-start gap-4 border-b border-line px-5 py-5 sm:px-7">
          {pilha.length > 1 ? (
            <button type="button" onClick={onVoltar} className="botao-icone -ml-2 shrink-0" aria-label="Voltar ao perfil anterior">
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span
              className="mt-2 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: cabecalho.cor, boxShadow: `0 0 16px ${cabecalho.cor}` }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="rotulo">
              {cabecalho.rotulo} · <span style={{ color: cabecalho.cor }}>{cabecalho.tipo}</span>
            </p>
            <h2 id="perfil-nome" className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
              {conteudo.tipo === 'ator' ? cabecalho.nome : <span className="titulo-serif">{cabecalho.nome}</span>}
            </h2>
            {cabecalho.descricao && <p className="mt-2 max-w-3xl text-sm text-muted">{cabecalho.descricao}</p>}
          </div>
          {verNoAcervo && (
            <button type="button" onClick={verNoAcervo} className="botao-secundario hidden shrink-0 sm:inline-flex">
              <Search size={14} /> Ver no acervo
            </button>
          )}
          <button ref={fecharRef} type="button" onClick={onFechar} className="botao-icone shrink-0" aria-label="Fechar perfil">
            <X size={18} />
          </button>
        </div>

        <div ref={rolagemRef} className="space-y-6 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-7">
          {corpo}
        </div>
      </div>
    </div>
  );
}
