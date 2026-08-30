import { useMemo } from 'react';
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
import { CalendarDays, ExternalLink } from 'lucide-react';
import type { Noticia } from '@/types';
import { PALETA_GRAFICOS } from '@/lib/constantes';

interface EventsPanelProps {
  noticias: Noticia[];
}

export default function EventsPanel({ noticias }: EventsPanelProps) {
  const eventos = useMemo(() => noticias.filter((n) => n.ehEvento), [noticias]);

  const porTipo = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const evento of eventos) {
      const tipo = evento.tipoEvento ?? 'Não classificado';
      contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
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
    return (
      <section className="card">
        <h3 className="card-titulo">
          <CalendarDays size={16} className="text-brand-600" />
          Eventos no Período
        </h3>
        <p className="py-14 text-center text-sm text-slate-400">
          Nenhum evento identificado no recorte atual.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="card-titulo">
            <CalendarDays size={16} className="text-brand-600" />
            Tipos de Evento
          </h3>
          <div className="p-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-[260px] w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                        isAnimationActive={false}
                      data={porTipo}
                      dataKey="total"
                      nameKey="nome"
                      innerRadius="50%"
                      outerRadius="85%"
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {porTipo.map((entrada, indice) => (
                        <Cell
                          key={entrada.nome}
                          fill={PALETA_GRAFICOS[indice % PALETA_GRAFICOS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(valor, nome) => [`${valor} eventos`, String(nome)]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="max-h-[260px] w-full space-y-1 overflow-y-auto sm:w-1/2">
                {porTipo.map((entrada, indice) => (
                  <li key={entrada.nome} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PALETA_GRAFICOS[indice % PALETA_GRAFICOS.length] }}
                    />
                    <span className="flex-1 truncate text-slate-600" title={entrada.nome}>
                      {entrada.nome}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-800">
                      {entrada.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Pagos vs. Gratuitos
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2ecc71]" /> Gratuito
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e74c3c]" /> Pago
              </span>
            </div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={custoPorTipo}
                margin={{ top: 8, right: 8, left: -18, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={70}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar isAnimationActive={false} dataKey="Gratuito" fill="#2ecc71" radius={[3, 3, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="Pago" fill="#e74c3c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Agenda detalhada */}
      <div className="card overflow-hidden">
        <h3 className="card-titulo">
          Agenda ({eventos.length.toLocaleString('pt-BR')} eventos)
        </h3>
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-2.5">Evento</th>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Local</th>
                <th className="px-4 py-2.5">Horário</th>
                <th className="px-4 py-2.5">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eventos.map((evento) => (
                <tr key={evento.id} className="transition hover:bg-slate-50/70">
                  <td className="max-w-xs px-4 py-2.5">
                    <a
                      href={evento.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-start gap-1 font-medium text-slate-800 hover:text-brand-700"
                    >
                      <span className="line-clamp-2">{evento.titulo}</span>
                      <ExternalLink size={11} className="mt-1 shrink-0 text-slate-400" />
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                    {evento.dataEvento ?? evento.data}
                    {evento.dataFimEvento && evento.dataFimEvento !== evento.dataEvento && (
                      <span className="text-slate-400"> → {evento.dataFimEvento}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {evento.tipoEvento ?? '—'}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-slate-600">
                    {evento.localEvento ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">
                    {evento.horarioEvento ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {evento.ehPago ? (
                      <span className="chip bg-rose-50 text-rose-700">
                        {evento.valorEvento ?? 'Pago'}
                      </span>
                    ) : (
                      <span className="chip bg-emerald-50 text-emerald-700">Gratuito</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
