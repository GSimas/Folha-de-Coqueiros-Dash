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
import type { MetricasGerais, Noticia } from '@/types';
import { corDaCategoria } from '@/lib/constantes';
import { eixoGrafico, tooltipGrafico, useCoresGrafico } from '@/lib/preferencias';
import { Revelar, useContagem } from '@/lib/motion';

interface MetricsOverviewProps {
  noticias: Noticia[];
  metricas: MetricasGerais;
}

/** Converte a chave `AAAA-MM` em rótulo legível (`ago/26`). */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotularMes(mesAno: string): string {
  const [ano, mes] = mesAno.split('-');
  const indice = Number(mes) - 1;
  if (!MESES[indice]) return mesAno;
  return `${MESES[indice]}/${ano.slice(2)}`;
}

function Kpi({
  indice,
  rotulo,
  valor,
  detalhe,
  className = '',
}: {
  indice: string;
  rotulo: string;
  valor: number;
  detalhe?: string;
  className?: string;
}) {
  const exibido = useContagem(valor, 900);
  return (
    <div className={`bg-surface px-5 py-6 ${className}`}>
      <p className="rotulo">
        <span className="text-faint">{indice} ·</span> {rotulo}
      </p>
      <p className="mt-3 text-4xl font-semibold tabular-nums tracking-[-0.03em] text-ink">
        {exibido.toLocaleString('pt-BR')}
      </p>
      <p className="mt-1 h-4 text-xs text-muted">{detalhe}</p>
    </div>
  );
}

export default function MetricsOverview({ noticias, metricas }: MetricsOverviewProps) {
  const [visaoVolume, setVisaoVolume] = useState<'geral' | 'categoria'>('geral');
  const cores = useCoresGrafico();

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

  const tooltip = tooltipGrafico(cores);
  const eixo = eixoGrafico(cores);

  return (
    <section className="space-y-6">
      {/* --- 1. Os números --- */}
      <Revelar>
        <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 xl:grid-cols-5">
          <Kpi indice="01" rotulo="Notícias" valor={metricas.totalNoticias} />
          <Kpi
            indice="02"
            rotulo="Palavras / matéria"
            valor={metricas.mediaPalavras}
            detalhe="média"
          />
          <Kpi
            indice="03"
            rotulo="Categorizadas"
            valor={metricas.categorizadas}
            detalhe={`de ${metricas.totalNoticias.toLocaleString('pt-BR')} pela IA`}
          />
          <Kpi indice="04" rotulo="Eventos" valor={metricas.totalEventos} />
          <Kpi
            indice="05"
            rotulo="Eventos pagos"
            // 5 células em grades de 2 ou 3 colunas: a última ocupa o espaço restante.
            className="col-span-2 xl:col-span-1"
            valor={metricas.eventosPagos}
            detalhe={
              metricas.totalEventos > 0
                ? `${Math.round((metricas.eventosPagos / metricas.totalEventos) * 100)}% dos eventos`
                : undefined
            }
          />
        </div>
      </Revelar>

      {/* --- 2. Do que se fala --- */}
      <Revelar className="card">
        <h3 className="card-titulo">
          <span className="text-signal">A</span> · Categorias no recorte
        </h3>
        <div className="p-5">
          {dadosCategorias.length > 0 ? (
            <div className="grid items-center gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={dadosCategorias}
                      dataKey="total"
                      nameKey="nome"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={1.5}
                      stroke={cores.surface}
                      strokeWidth={2}
                    >
                      {dadosCategorias.map((entrada, indice) => (
                        <Cell key={entrada.nome} fill={corDaCategoria(entrada.nome, indice)} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...tooltip}
                      formatter={(valor, nome) => [`${valor} notícias`, String(nome)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legenda como barras proporcionais */}
              <ul className="space-y-2.5">
                {dadosCategorias.map((entrada, indice) => {
                  const fracao = entrada.total / totalCategorizado;
                  const cor = corDaCategoria(entrada.nome, indice);
                  return (
                    <li key={entrada.nome} className="group">
                      <div className="flex items-baseline gap-2 text-[0.8125rem]">
                        <span
                          className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                          style={{ backgroundColor: cor }}
                        />
                        <span className="flex-1 truncate text-muted transition group-hover:text-ink" title={entrada.nome}>
                          {entrada.nome}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-ink">{entrada.total}</span>
                        <span className="w-10 text-right font-mono text-xs tabular-nums text-faint">
                          {Math.round(fracao * 100)}%
                        </span>
                      </div>
                      <div className="ml-4 mt-1 h-px bg-line">
                        <div
                          className="h-px transition-all duration-700 ease-suave"
                          style={{ width: `${fracao * 100}%`, backgroundColor: cor }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="vazio">Nenhuma notícia categorizada no recorte.</p>
          )}
        </div>
      </Revelar>

      {/* --- 3. Ao longo do tempo --- */}
      <Revelar className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-2.5">
          <h3 className="rotulo">
            <span className="text-signal">B</span> · Volume mensal
          </h3>
          <div className="segmentado">
            {(
              [
                ['geral', 'Geral'],
                ['categoria', 'Por categoria'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={visaoVolume === valor}
                onClick={() => setVisaoVolume(valor)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {dadosTemporais.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={dadosTemporais} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={cores.line} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  {...eixo}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis {...eixo} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltip} />
                {visaoVolume === 'geral' ? (
                  <Bar
                    isAnimationActive={false}
                    dataKey="total"
                    name="Notícias"
                    fill={cores.signal}
                    fillOpacity={0.85}
                    radius={[2, 2, 0, 0]}
                  />
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
            <p className="vazio">Sem dados temporais no recorte.</p>
          )}
        </div>
      </Revelar>
    </section>
  );
}
