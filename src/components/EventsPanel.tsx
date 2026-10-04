import { useMemo, useRef } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import type { Noticia } from '@/types';
import { COR_REDUCAO, COR_REFORCO, corDoTipoEvento } from '@/lib/constantes';
import { eixoGrafico, tooltipGrafico, useCoresGrafico } from '@/lib/preferencias';
import { Revelar } from '@/lib/motion';
import { paraData } from '@/lib/data';
import { LinkAtor, LinkTipoEvento, usePerfis } from '@/lib/perfis';
import TabelaDados from './TabelaDados';
import { BaixarGrafico } from './MenuBaixar';

interface EventsPanelProps {
  noticias: Noticia[];
}

const COR_GRATUITO = COR_REFORCO;
const COR_PAGO = COR_REDUCAO;

const coluna = createColumnHelper<Noticia>();

/** Colunas da agenda — tipos definem o filtro de cada uma (ver TabelaDados). */
const COLUNAS_AGENDA = [
  coluna.accessor('titulo', {
    header: 'Evento',
    meta: { tipo: 'texto', classe: 'max-w-xs' },
    cell: (info) => (
      <a
        href={info.row.original.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group inline-flex items-start gap-1 rounded-sm font-medium text-ink transition hover:text-signal"
      >
        <span className="line-clamp-2">{info.getValue()}</span>
        <ArrowUpRight size={12} className="mt-1 shrink-0 text-faint transition group-hover:text-signal" />
      </a>
    ),
  }),
  // Data do evento quando informada; senão, a data de publicação da notícia.
  coluna.accessor((e) => paraData(e.dataEvento) ?? e.dataConvertida ?? undefined, {
    id: 'data',
    header: 'Data',
    meta: { tipo: 'data', classe: 'whitespace-nowrap' },
    cell: (info) => {
      const e = info.row.original;
      return (
        <span className="font-mono text-xs text-muted">
          {e.dataEvento ?? e.data}
          {e.dataFimEvento && e.dataFimEvento !== e.dataEvento && (
            <span className="text-faint"> → {e.dataFimEvento}</span>
          )}
        </span>
      );
    },
  }),
  coluna.accessor((e) => e.tipoEvento ?? 'Não classificado', {
    id: 'tipo',
    header: 'Tipo',
    meta: { tipo: 'categoria' },
    cell: (info) =>
      info.row.original.tipoEvento ? (
        <LinkTipoEvento
          nome={info.row.original.tipoEvento}
          className="text-left text-xs text-muted transition hover:text-signal"
        />
      ) : (
        <span className="text-xs text-faint">Não classificado</span>
      ),
  }),
  coluna.accessor((e) => e.localEvento ?? 'Não informado', {
    id: 'local',
    header: 'Local',
    meta: { tipo: 'categoria', classe: 'max-w-[200px]' },
    cell: (info) => {
      const local = info.row.original.localEvento;
      // Local que também é ator do banco abre o perfil.
      return local ? (
        <LinkAtor nome={local} className="line-clamp-2 text-xs text-muted" />
      ) : (
        <span className="text-xs text-faint">—</span>
      );
    },
  }),
  coluna.accessor((e) => e.horarioEvento ?? '', {
    id: 'horario',
    header: 'Horário',
    meta: { tipo: 'texto', classe: 'whitespace-nowrap' },
    cell: (info) => <span className="font-mono text-xs text-muted">{info.getValue() || '—'}</span>,
  }),
  coluna.accessor((e) => (e.ehPago ? 'Pago' : 'Gratuito'), {
    id: 'custo',
    header: 'Custo',
    meta: { tipo: 'categoria' },
    cell: (info) => {
      const e = info.row.original;
      const cor = e.ehPago ? COR_PAGO : COR_GRATUITO;
      return (
        <span className="chip" style={{ color: cor, backgroundColor: `${cor}1f` }}>
          {e.ehPago ? (e.valorEvento ?? 'Pago') : 'Gratuito'}
        </span>
      );
    },
  }),
];

export default function EventsPanel({ noticias }: EventsPanelProps) {
  const cores = useCoresGrafico();
  const { abrirTipoEvento } = usePerfis();
  const tiposRef = useRef<HTMLDivElement>(null);
  const custoRef = useRef<HTMLDivElement>(null);
  const eventos = useMemo(() => noticias.filter((n) => n.ehEvento), [noticias]);

  const porTipo = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const evento of eventos) {
      const tipo = evento.tipoEvento ?? 'Não classificado';
      contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
    }
    return [...contagem.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  }, [eventos]);

  const custoPorTipo = useMemo(() => {
    const mapa = new Map<string, { nome: string; Pago: number; Gratuito: number }>();
    for (const evento of eventos) {
      const tipo = evento.tipoEvento ?? 'Não classificado';
      const linha = mapa.get(tipo) ?? { nome: tipo, Pago: 0, Gratuito: 0 };
      if (evento.ehPago) linha.Pago += 1;
      else linha.Gratuito += 1;
      mapa.set(tipo, linha);
    }
    return [...mapa.values()].sort((a, b) => b.Pago + b.Gratuito - (a.Pago + a.Gratuito));
  }, [eventos]);

  if (eventos.length === 0) {
    return <p className="card vazio">Nenhum evento identificado no recorte atual.</p>;
  }

  const tooltip = tooltipGrafico(cores);
  const eixo = eixoGrafico(cores, 10);
  const pagos = eventos.filter((e) => e.ehPago).length;

  return (
    <section className="space-y-6">
      {/* --- 1. Resumo --- */}
      <Revelar>
        <div className="grid grid-cols-3 gap-px border border-line bg-line">
          {[
            ['01', 'Eventos', eventos.length],
            ['02', 'Gratuitos', eventos.length - pagos],
            ['03', 'Pagos', pagos],
          ].map(([indice, rotulo, valor]) => (
            <div key={indice} className="bg-surface px-5 py-6">
              <p className="rotulo">
                <span className="text-faint">{indice} ·</span> {rotulo}
              </p>
              <p className="mt-3 text-4xl font-semibold tabular-nums tracking-[-0.03em] text-ink">
                {Number(valor).toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      </Revelar>

      {/* --- 2. Tipos e gratuidade --- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Revelar className="card">
          <h2 className="card-titulo">
            <span className="text-signal">B</span> · Tipos de evento
            <span className="-my-2 ml-auto">
              <BaixarGrafico
                alvo={tiposRef}
                nome="tipos-de-evento"
                titulo="Tipos de evento"
                legenda={porTipo.map((t, i) => ({ nome: t.nome, cor: corDoTipoEvento(t.nome, i), valor: t.total }))}
              />
            </span>
          </h2>
          <div className="grid items-center gap-4 p-5 sm:grid-cols-2">
            <div ref={tiposRef} className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={porTipo}
                    dataKey="total"
                    nameKey="nome"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={1.5}
                    stroke={cores.surface}
                    strokeWidth={2}
                    className="cursor-pointer"
                    onClick={(_, i) => abrirTipoEvento(porTipo[i].nome)}
                  >
                    {porTipo.map((entrada, indice) => (
                      <Cell key={entrada.nome} fill={corDoTipoEvento(entrada.nome, indice)} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltip} formatter={(valor, nome) => [`${valor} eventos`, String(nome)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="space-y-1.5">
              {porTipo.map((entrada, indice) => (
                <li key={entrada.nome} className="flex items-center gap-2 text-[0.8125rem]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: corDoTipoEvento(entrada.nome, indice) }}
                  />
                  <LinkTipoEvento
                    nome={entrada.nome}
                    className="flex-1 truncate text-left text-muted transition hover:text-signal"
                  />
                  <span className="font-mono text-xs tabular-nums text-ink">{entrada.total}</span>
                </li>
              ))}
            </ul>
          </div>
        </Revelar>

        <Revelar className="card" atraso={100}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <h2 className="rotulo">
              <span className="text-signal">C</span> · Pagos vs. gratuitos
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: COR_GRATUITO }} /> Gratuito
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: COR_PAGO }} /> Pago
              </span>
              <BaixarGrafico
                alvo={custoRef}
                nome="eventos-pagos-vs-gratuitos"
                titulo="Eventos pagos vs. gratuitos por tipo"
                legenda={[
                  { nome: 'Gratuito', cor: COR_GRATUITO },
                  { nome: 'Pago', cor: COR_PAGO },
                ]}
              />
            </div>
          </div>
          <div className="p-5">
            <div ref={custoRef}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={custoPorTipo} margin={{ top: 8, right: 8, left: -18, bottom: 60 }}>
                  <CartesianGrid stroke={cores.line} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="nome" {...eixo} angle={-35} textAnchor="end" interval={0} height={70} />
                  <YAxis {...eixo} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltip} />
                  <Bar isAnimationActive={false} dataKey="Gratuito" fill={COR_GRATUITO} radius={[2, 2, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="Pago" fill={COR_PAGO} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Revelar>
      </div>

      {/* --- 3. Agenda detalhada --- */}
      <Revelar className="card overflow-hidden">
        <TabelaDados
          dados={eventos}
          colunas={COLUNAS_AGENDA}
          rotuloItens="eventos"
          nomeArquivo="agenda-de-eventos"
          ordenacaoInicial={[{ id: 'data', desc: true }]}
          porPagina={null}
          larguraMinima="min-w-[860px]"
          alturaMaxima="max-h-[28rem]"
          titulo={
            <h2 className="rotulo">
              <span className="text-signal">D</span> · Agenda
            </h2>
          }
        />
      </Revelar>
    </section>
  );
}
