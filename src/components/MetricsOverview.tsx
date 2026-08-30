import { useMemo, useState } from 'react';
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
import {
  BadgeCheck,
  CalendarDays,
  FileText,
  Newspaper,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import type { MetricasGerais, Noticia } from '@/types';
import { corDaCategoria, formatarNumero } from '@/lib/constantes';

interface MetricsOverviewProps {
  noticias: Noticia[];
  metricas: MetricasGerais;
}

interface CartaoMetrica {
  rotulo: string;
  valor: string;
  detalhe?: string;
  Icone: LucideIcon;
  cor: string;
}

/** Converte a chave `AAAA-MM` em rótulo legível (`ago/26`). */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotularMes(mesAno: string): string {
  const [ano, mes] = mesAno.split('-');
  const indice = Number(mes) - 1;
  if (!MESES[indice]) return mesAno;
  return `${MESES[indice]}/${ano.slice(2)}`;
}

export default function MetricsOverview({ noticias, metricas }: MetricsOverviewProps) {
  const [visaoVolume, setVisaoVolume] = useState<'geral' | 'categoria'>('geral');

  const cartoes: CartaoMetrica[] = [
    {
      rotulo: 'Notícias no recorte',
      valor: formatarNumero(metricas.totalNoticias),
      Icone: Newspaper,
      cor: 'text-brand-600 bg-brand-50',
    },
    {
      rotulo: 'Média de palavras',
      valor: formatarNumero(metricas.mediaPalavras),
      detalhe: 'por matéria',
      Icone: FileText,
      cor: 'text-violet-600 bg-violet-50',
    },
    {
      rotulo: 'Categorizadas pela IA',
      valor: `${formatarNumero(metricas.categorizadas)}`,
      detalhe: `de ${formatarNumero(metricas.totalNoticias)}`,
      Icone: BadgeCheck,
      cor: 'text-emerald-600 bg-emerald-50',
    },
    {
      rotulo: 'Eventos identificados',
      valor: formatarNumero(metricas.totalEventos),
      Icone: CalendarDays,
      cor: 'text-amber-600 bg-amber-50',
    },
    {
      rotulo: 'Eventos pagos',
      valor: formatarNumero(metricas.eventosPagos),
      detalhe:
        metricas.totalEventos > 0
          ? `${Math.round((metricas.eventosPagos / metricas.totalEventos) * 100)}% dos eventos`
          : undefined,
      Icone: Ticket,
      cor: 'text-rose-600 bg-rose-50',
    },
  ];

  // Distribuição por categoria (apenas notícias efetivamente categorizadas)
  const dadosCategorias = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const noticia of noticias) {
      if (!noticia.categorizada) continue;
      contagem.set(noticia.categorias, (contagem.get(noticia.categorias) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [noticias]);

  const totalCategorizado = useMemo(
    () => dadosCategorias.reduce((soma, item) => soma + item.total, 0) || 1,
    [dadosCategorias],
  );

  // Volume mensal — agregado ou empilhado por categoria
  const { dadosTemporais, categoriasEmpilhadas } = useMemo(() => {
    const porMes = new Map<string, Record<string, number>>();
    const categoriasVistas = new Set<string>();

    for (const noticia of noticias) {
      if (!noticia.mesAno) continue;
      const linha = porMes.get(noticia.mesAno) ?? {};
      linha.total = (linha.total ?? 0) + 1;

      if (visaoVolume === 'categoria' && noticia.categorizada) {
        linha[noticia.categorias] = (linha[noticia.categorias] ?? 0) + 1;
        categoriasVistas.add(noticia.categorias);
      }
      porMes.set(noticia.mesAno, linha);
    }

    const dados = [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mesAno, valores]) => ({ mesAno, rotulo: rotularMes(mesAno), ...valores }));

    return {
      dadosTemporais: dados,
      categoriasEmpilhadas: [...categoriasVistas].sort(),
    };
  }, [noticias, visaoVolume]);

  return (
    <section id="visao-geral" className="space-y-6">
      {/* --- KPIs --- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cartoes.map(({ rotulo, valor, detalhe, Icone, cor }) => (
          <div key={rotulo} className="card p-4">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${cor}`}>
              <Icone size={18} />
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-600">{rotulo}</p>
            {detalhe && <p className="text-[11px] text-slate-400">{detalhe}</p>}
          </div>
        ))}
      </div>

      {/* --- Gráficos --- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="card-titulo">Categorias no período</h3>
          <div className="p-4">
            {dadosCategorias.length > 0 ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-[280px] w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={dadosCategorias}
                        dataKey="total"
                        nameKey="nome"
                        innerRadius="50%"
                        outerRadius="85%"
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {dadosCategorias.map((entrada, indice) => (
                          <Cell key={entrada.nome} fill={corDaCategoria(entrada.nome, indice)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(valor, nome) => [`${valor} notícias`, String(nome)]}
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <ul className="max-h-[280px] w-full space-y-1 overflow-y-auto sm:w-1/2">
                  {dadosCategorias.map((entrada, indice) => (
                    <li key={entrada.nome} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: corDaCategoria(entrada.nome, indice) }}
                      />
                      <span className="flex-1 truncate text-slate-600" title={entrada.nome}>
                        {entrada.nome}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-slate-800">
                        {entrada.total}
                      </span>
                      <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">
                        {Math.round((entrada.total / totalCategorizado) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-slate-400">
                Nenhuma notícia categorizada no período selecionado.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Volume temporal (mensal)
            </h3>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {(
                [
                  ['geral', 'Geral'],
                  ['categoria', 'Por categoria'],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setVisaoVolume(valor)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    visaoVolume === valor
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {dadosTemporais.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={dadosTemporais} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  {visaoVolume === 'geral' ? (
                    <Bar isAnimationActive={false} dataKey="total" name="Notícias" fill="#1a5276" radius={[4, 4, 0, 0]} />
                  ) : (
                    categoriasEmpilhadas.map((categoria, indice) => (
                      <Bar
                        isAnimationActive={false}
                        key={categoria}
                        dataKey={categoria}
                        name={categoria}
                        stackId="categorias"
                        fill={corDaCategoria(categoria, indice)}
                      />
                    ))
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-slate-400">
                Sem dados temporais no período selecionado.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
