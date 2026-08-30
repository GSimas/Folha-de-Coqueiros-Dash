import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
} from 'lucide-react';
import type { AtorComSNA } from '@/types';
import { COR_POR_TIPO } from '@/lib/constantes';

interface ActorsTableProps {
  atores: AtorComSNA[];
}

const coluna = createColumnHelper<AtorComSNA>();

/** Célula numérica com barra de proporção — facilita comparar centralidades. */
function CelulaMetrica({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const proporcao = maximo > 0 ? (valor / maximo) * 100 : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 sm:block">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${proporcao}%`, backgroundColor: cor }}
        />
      </div>
      <span className="w-14 text-right tabular-nums">{valor.toLocaleString('pt-BR')}</span>
    </div>
  );
}

export default function ActorsTable({ atores }: ActorsTableProps) {
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<SortingState>([
    { id: 'grauAbsoluto', desc: true },
  ]);

  // Máximos usados para normalizar as barras de proporção
  const maximos = useMemo(
    () => ({
      citacoes: Math.max(1, ...atores.map((a) => a.citacoes)),
      grau: Math.max(1, ...atores.map((a) => a.grauAbsoluto)),
      betweenness: Math.max(0.0001, ...atores.map((a) => a.betweenness)),
      closeness: Math.max(0.0001, ...atores.map((a) => a.closeness)),
    }),
    [atores],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Ator',
        cell: (info) => {
          const ator = info.row.original;
          return (
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: COR_POR_TIPO[ator.tipo] }}
              />
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{ator.nome}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{ator.descricao}</p>
              </div>
            </div>
          );
        },
      }),
      coluna.accessor('tipo', {
        header: 'Tipo',
        cell: (info) => {
          const tipo = info.getValue();
          return (
            <span
              className="chip"
              style={{
                backgroundColor: `${COR_POR_TIPO[tipo]}1a`,
                color: COR_POR_TIPO[tipo],
              }}
            >
              {tipo}
            </span>
          );
        },
      }),
      coluna.accessor('citacoes', {
        header: 'Citações',
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.citacoes} cor="#64748b" />
        ),
      }),
      coluna.accessor('grauAbsoluto', {
        header: 'Grau',
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.grau} cor="#1a5276" />
        ),
      }),
      coluna.accessor('betweenness', {
        header: 'Betweenness',
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.betweenness} cor="#8e44ad" />
        ),
      }),
      coluna.accessor('closeness', {
        header: 'Closeness',
        cell: (info) => (
          <CelulaMetrica valor={info.getValue()} maximo={maximos.closeness} cor="#16a085" />
        ),
      }),
    ],
    [maximos],
  );

  const tabela = useReactTable({
    data: atores,
    columns: colunas,
    state: { sorting: ordenacao, globalFilter: busca },
    onSortingChange: setOrdenacao,
    onGlobalFilterChange: setBusca,
    // Busca conjunta em nome + descrição, como no `st.text_input` original
    globalFilterFn: (linha, _coluna, filtro) => {
      const alvo = `${linha.original.nome} ${linha.original.descricao}`.toLowerCase();
      return alvo.includes(String(filtro).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const totalFiltrado = tabela.getFilteredRowModel().rows.length;

  return (
    <section id="atores" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <Users size={16} className="text-brand-600" />
          Banco de Atores e Métricas de Rede (SNA)
        </h3>

        <div className="relative w-full sm:w-72">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou descrição…"
            className="campo pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50">
            {tabela.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id}>
                {grupo.headers.map((cabecalho, indice) => {
                  const ordenavel = cabecalho.column.getCanSort();
                  const direcao = cabecalho.column.getIsSorted();
                  return (
                    <th
                      key={cabecalho.id}
                      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${
                        indice === 0 ? 'text-left' : indice === 1 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {ordenavel ? (
                        <button
                          type="button"
                          onClick={cabecalho.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1 transition hover:text-brand-700 ${
                            indice > 1 ? 'flex-row-reverse' : ''
                          }`}
                        >
                          {flexRender(
                            cabecalho.column.columnDef.header,
                            cabecalho.getContext(),
                          )}
                          {direcao === 'asc' ? (
                            <ArrowUp size={12} className="text-brand-600" />
                          ) : direcao === 'desc' ? (
                            <ArrowDown size={12} className="text-brand-600" />
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-300" />
                          )}
                        </button>
                      ) : (
                        flexRender(cabecalho.column.columnDef.header, cabecalho.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-slate-100">
            {tabela.getRowModel().rows.map((linha) => (
              <tr key={linha.id} className="transition hover:bg-slate-50/70">
                {linha.getVisibleCells().map((celula, indice) => (
                  <td
                    key={celula.id}
                    className={`px-4 py-3 align-top ${indice > 1 ? 'text-right' : 'text-left'}`}
                  >
                    {flexRender(celula.column.columnDef.cell, celula.getContext())}
                  </td>
                ))}
              </tr>
            ))}

            {totalFiltrado === 0 && (
              <tr>
                <td colSpan={colunas.length} className="px-4 py-16 text-center text-sm text-slate-400">
                  Nenhum ator encontrado para “{busca}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalFiltrado > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span>
            Mostrando{' '}
            <strong className="text-slate-800">
              {tabela.getState().pagination.pageIndex * tabela.getState().pagination.pageSize + 1}
              –
              {Math.min(
                (tabela.getState().pagination.pageIndex + 1) *
                  tabela.getState().pagination.pageSize,
                totalFiltrado,
              )}
            </strong>{' '}
            de <strong className="text-slate-800">{totalFiltrado}</strong> atores
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => tabela.previousPage()}
              disabled={!tabela.getCanPreviousPage()}
              className="botao-secundario px-2 py-1"
              aria-label="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tabular-nums">
              {tabela.getState().pagination.pageIndex + 1} / {tabela.getPageCount()}
            </span>
            <button
              type="button"
              onClick={() => tabela.nextPage()}
              disabled={!tabela.getCanNextPage()}
              className="botao-secundario px-2 py-1"
              aria-label="Próxima página"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
