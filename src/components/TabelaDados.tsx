import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type RowData,
  type SortingFn,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { usePresenca } from '@/lib/motion';

/**
 * Tabela de dados com ordenação e filtro por coluna, usada em todo o app.
 *
 * Cada coluna declara seu tipo em `meta.tipo`, que define o filtro oferecido:
 *  - `texto`     — contém o termo (sem diferenciar acentos/maiúsculas);
 *  - `numero`    — faixa mínimo/máximo;
 *  - `data`      — período de/até (o valor da coluna deve ser `Date`);
 *  - `categoria` — seleção múltipla com contagens (o valor pode ser um array,
 *                  ex.: palavras-chave — basta um item coincidir).
 * O valor do `accessor` é o dado bruto (usado para ordenar e filtrar); a
 * apresentação fica no `cell`.
 */

export type TipoColuna = 'texto' | 'numero' | 'data' | 'categoria';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    tipo?: TipoColuna;
    alinhar?: 'direita' | 'centro';
    /** Classe extra das células (largura, quebra de linha…). */
    classe?: string;
  }
}

const normalizar = (valor: unknown) =>
  String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const comoLista = (valor: unknown): string[] =>
  valor == null || valor === '' ? [] : Array.isArray(valor) ? valor.map(String) : [String(valor)];

// --- Filtros por tipo --------------------------------------------------------

const filtroTexto: FilterFn<unknown> = (linha, id, termo: string) =>
  normalizar(linha.getValue(id)).includes(normalizar(termo));

type Faixa = [number | undefined, number | undefined];
const filtroNumero: FilterFn<unknown> = (linha, id, [min, max]: Faixa) => {
  const valor = linha.getValue<number | undefined>(id);
  if (valor == null || Number.isNaN(valor)) return false;
  return (min == null || valor >= min) && (max == null || valor <= max);
};

type Periodo = [string | undefined, string | undefined];
const filtroData: FilterFn<unknown> = (linha, id, [inicio, fim]: Periodo) => {
  const valor = linha.getValue<Date | undefined>(id);
  if (!valor) return false;
  const t = valor.getTime();
  return (
    (!inicio || t >= new Date(`${inicio}T00:00:00`).getTime()) &&
    (!fim || t <= new Date(`${fim}T23:59:59`).getTime())
  );
};

const filtroCategoria: FilterFn<unknown> = (linha, id, selecionadas: string[]) => {
  const valores = comoLista(linha.getValue(id));
  return valores.some((v) => selecionadas.includes(v));
};

// Remove o filtro quando o valor fica "vazio" (campo apagado, nada marcado).
filtroTexto.autoRemove = (v) => !v;
filtroNumero.autoRemove = (v: Faixa) => !v || (v[0] == null && v[1] == null);
filtroData.autoRemove = (v: Periodo) => !v || (!v[0] && !v[1]);
filtroCategoria.autoRemove = (v: string[]) => !v?.length;

const FILTROS: Record<TipoColuna, FilterFn<unknown>> = {
  texto: filtroTexto,
  numero: filtroNumero,
  data: filtroData,
  categoria: filtroCategoria,
};

const ordenarTexto: SortingFn<unknown> = (a, b, id) =>
  comoLista(a.getValue(id)).join(', ').localeCompare(comoLista(b.getValue(id)).join(', '), 'pt-BR', {
    sensitivity: 'base',
    numeric: true,
  });

// --- Popover de filtro (portal: escapa do overflow da tabela) ---------------

function PopoverFiltro({
  ancora,
  aberto,
  onFechar,
  children,
}: {
  ancora: HTMLElement | null;
  aberto: boolean;
  onFechar: () => void;
  children: ReactNode;
}) {
  const { montado, visivel } = usePresenca(aberto, 180);
  const painelRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });

  const posicionar = useCallback(() => {
    if (!ancora) return;
    const caixa = ancora.getBoundingClientRect();
    const largura = painelRef.current?.offsetWidth ?? 280;
    const left = Math.min(Math.max(8, caixa.left), window.innerWidth - largura - 8);
    setPosicao({ top: caixa.bottom + 6, left });
  }, [ancora]);

  useLayoutEffect(() => {
    if (montado) posicionar();
  }, [montado, posicionar]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (evento: PointerEvent) => {
      const alvo = evento.target as Node;
      if (!painelRef.current?.contains(alvo) && !ancora?.contains(alvo)) onFechar();
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    const aoRolar = () => requestAnimationFrame(posicionar);
    document.addEventListener('pointerdown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      document.removeEventListener('pointerdown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [aberto, ancora, onFechar, posicionar]);

  if (!montado) return null;
  return createPortal(
    <div
      ref={painelRef}
      role="dialog"
      style={{ top: posicao.top, left: posicao.left }}
      className={`fixed z-[70] w-72 origin-top-left border border-line bg-elevated p-3 text-left normal-case tracking-normal shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]
                  transition duration-200 ease-suave ${visivel ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.97] opacity-0'}`}
    >
      {children}
    </div>,
    document.body,
  );
}

function CampoNumero({ valor, placeholder, onMudar }: { valor?: number; placeholder: string; onMudar: (v?: number) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className="campo py-1.5 text-xs"
      value={valor ?? ''}
      placeholder={placeholder}
      onChange={(e) => onMudar(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

function ConteudoFiltro<T>({ coluna, linhasBase }: { coluna: Column<T, unknown>; linhasBase: T[] }) {
  const tipo = coluna.columnDef.meta?.tipo ?? 'texto';
  const valor = coluna.getFilterValue();
  const [buscaOpcao, setBuscaOpcao] = useState('');

  // Opções de categoria com contagem sobre todas as linhas (arrays são "achatados").
  const opcoes = useMemo(() => {
    if (tipo !== 'categoria') return [];
    const contagem = new Map<string, number>();
    const acessar = coluna.accessorFn;
    if (!acessar) return [];
    linhasBase.forEach((item, i) => {
      for (const v of comoLista(acessar(item, i))) contagem.set(v, (contagem.get(v) ?? 0) + 1);
    });
    return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  }, [tipo, coluna.accessorFn, linhasBase]);

  if (tipo === 'texto') {
    return (
      <input
        autoFocus
        className="campo py-1.5 text-xs"
        placeholder="Contém…"
        value={(valor as string) ?? ''}
        onChange={(e) => coluna.setFilterValue(e.target.value)}
      />
    );
  }

  if (tipo === 'numero') {
    const [min, max] = (valor as Faixa) ?? [];
    const [limiteMin, limiteMax] = coluna.getFacetedMinMaxValues() ?? [];
    return (
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="etiqueta">Mínimo</span>
          <CampoNumero valor={min} placeholder={limiteMin != null ? String(limiteMin) : ''} onMudar={(v) => coluna.setFilterValue([v, max])} />
        </label>
        <label>
          <span className="etiqueta">Máximo</span>
          <CampoNumero valor={max} placeholder={limiteMax != null ? String(limiteMax) : ''} onMudar={(v) => coluna.setFilterValue([min, v])} />
        </label>
      </div>
    );
  }

  if (tipo === 'data') {
    const [inicio, fim] = (valor as Periodo) ?? [];
    return (
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="etiqueta">De</span>
          <input type="date" className="campo py-1.5 text-xs" value={inicio ?? ''} max={fim} onChange={(e) => coluna.setFilterValue([e.target.value || undefined, fim])} />
        </label>
        <label>
          <span className="etiqueta">Até</span>
          <input type="date" className="campo py-1.5 text-xs" value={fim ?? ''} min={inicio} onChange={(e) => coluna.setFilterValue([inicio, e.target.value || undefined])} />
        </label>
      </div>
    );
  }

  const selecionadas = (valor as string[]) ?? [];
  const termo = normalizar(buscaOpcao);
  const visiveis = termo ? opcoes.filter(([o]) => normalizar(o).includes(termo)) : opcoes;
  const alternar = (opcao: string) =>
    coluna.setFilterValue(
      selecionadas.includes(opcao) ? selecionadas.filter((s) => s !== opcao) : [...selecionadas, opcao],
    );

  return (
    <div>
      {opcoes.length > 8 && (
        <div className="relative mb-2">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            className="campo py-1.5 pl-8 text-xs"
            placeholder={`Buscar em ${opcoes.length} opções…`}
            value={buscaOpcao}
            onChange={(e) => setBuscaOpcao(e.target.value)}
          />
        </div>
      )}
      <ul className="max-h-60 space-y-px overflow-y-auto">
        {visiveis.map(([opcao, total]) => (
          <li key={opcao}>
            <label data-brilho="" className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-muted transition hover:bg-signal/5 hover:text-ink">
              <input
                type="checkbox"
                checked={selecionadas.includes(opcao)}
                onChange={() => alternar(opcao)}
                className="accent-[rgb(var(--signal))]"
              />
              <span className="min-w-0 flex-1 truncate" title={opcao}>
                {opcao}
              </span>
              <span className="font-mono text-[0.625rem] text-faint">{total}</span>
            </label>
          </li>
        ))}
        {visiveis.length === 0 && <li className="px-1.5 py-3 text-center text-xs text-faint">Nenhuma opção.</li>}
      </ul>
    </div>
  );
}

function CabecalhoColuna<T>({ coluna, linhasBase, rotulo }: { coluna: Column<T, unknown>; linhasBase: T[]; rotulo: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const fechar = useCallback(() => setAberto(false), []);
  const direcao = coluna.getIsSorted();
  const filtrada = coluna.getIsFiltered();
  const alinhar = coluna.columnDef.meta?.alinhar;

  return (
    <div className={`flex items-center gap-1 ${alinhar === 'direita' ? 'justify-end' : alinhar === 'centro' ? 'justify-center' : ''}`}>
      {coluna.getCanSort() ? (
        <button
          type="button"
          onClick={coluna.getToggleSortingHandler()}
          className={`inline-flex items-center gap-1 rounded-sm py-0.5 uppercase transition hover:text-ink ${direcao ? 'text-ink' : ''}`}
          title="Ordenar"
          aria-label={`Ordenar por ${typeof rotulo === 'string' ? rotulo : coluna.id}`}
        >
          {rotulo}
          {direcao === 'asc' ? (
            <ArrowUp size={12} className="text-signal" />
          ) : direcao === 'desc' ? (
            <ArrowDown size={12} className="text-signal" />
          ) : (
            <ArrowUpDown size={12} className="opacity-40" />
          )}
        </button>
      ) : (
        rotulo
      )}

      {coluna.getCanFilter() && (
        <>
          <button
            ref={botaoRef}
            type="button"
            onClick={() => setAberto((v) => !v)}
            className={`relative rounded-sm p-1 transition hover:bg-signal/10 hover:text-ink ${filtrada || aberto ? 'text-signal' : 'opacity-50 hover:opacity-100'}`}
            title="Filtrar coluna"
            aria-label={`Filtrar ${typeof rotulo === 'string' ? rotulo : coluna.id}`}
            aria-expanded={aberto}
          >
            <Filter size={11} className={filtrada ? 'fill-current' : ''} />
          </button>
          <PopoverFiltro ancora={botaoRef.current} aberto={aberto} onFechar={fechar}>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="rotulo">Filtrar · {rotulo}</span>
              {filtrada && (
                <button type="button" onClick={() => coluna.setFilterValue(undefined)} className="rounded-sm text-xs text-signal">
                  Limpar
                </button>
              )}
            </div>
            <ConteudoFiltro coluna={coluna} linhasBase={linhasBase} />
          </PopoverFiltro>
        </>
      )}
    </div>
  );
}

// --- Tabela -----------------------------------------------------------------

interface TabelaDadosProps<T> {
  dados: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colunas: ColumnDef<T, any>[];
  /** Rótulo plural dos itens ("atores", "notícias"). */
  rotuloItens: string;
  ordenacaoInicial?: SortingState;
  /** Itens por página; `null` desliga a paginação. */
  porPagina?: number | null;
  /** Busca livre sobre o texto devolvido por esta função. */
  buscaGlobal?: { placeholder: string; texto: (item: T) => string };
  /** Título à esquerda da barra de ferramentas. */
  titulo?: ReactNode;
  /** Largura mínima da tabela (força rolagem horizontal em telas estreitas). */
  larguraMinima?: string;
  /** Limita a altura e fixa o cabeçalho (ex.: `max-h-[28rem]`). */
  alturaMaxima?: string;
  /** Versão compacta, para tabelas dentro do chat. */
  compacta?: boolean;
}

export default function TabelaDados<T>({
  dados,
  colunas,
  rotuloItens,
  ordenacaoInicial = [],
  porPagina = 20,
  buscaGlobal,
  titulo,
  larguraMinima = '',
  alturaMaxima = '',
  compacta = false,
}: TabelaDadosProps<T>) {
  const [ordenacao, setOrdenacao] = useState<SortingState>(ordenacaoInicial);
  const [filtros, setFiltros] = useState<ColumnFiltersState>([]);
  const [busca, setBusca] = useState('');

  // Filtro e ordenação padrão de cada coluna derivam do tipo declarado.
  const colunasTipadas = useMemo(
    () =>
      colunas.map((c) => {
        const tipo = c.meta?.tipo ?? 'texto';
        return {
          filterFn: FILTROS[tipo] as FilterFn<T>,
          sortingFn: (tipo === 'numero' ? 'basic' : tipo === 'data' ? 'datetime' : ordenarTexto) as SortingFn<T> | 'basic' | 'datetime',
          sortUndefined: 'last' as const,
          sortDescFirst: tipo === 'numero' || tipo === 'data',
          ...c,
        };
      }),
    [colunas],
  );

  const tabela = useReactTable({
    data: dados,
    columns: colunasTipadas,
    state: { sorting: ordenacao, columnFilters: filtros, globalFilter: busca },
    onSortingChange: setOrdenacao,
    onColumnFiltersChange: setFiltros,
    onGlobalFilterChange: setBusca,
    globalFilterFn: (linha, _id, termo: string) =>
      buscaGlobal ? normalizar(buscaGlobal.texto(linha.original)).includes(normalizar(termo)) : true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    ...(porPagina ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: porPagina ? { pagination: { pageSize: porPagina, pageIndex: 0 } } : {},
    autoResetPageIndex: true,
  });

  const totalFiltrado = tabela.getFilteredRowModel().rows.length;
  const filtrosAtivos = filtros.length + (busca ? 1 : 0);
  const { pageIndex, pageSize } = tabela.getState().pagination;
  const celula = compacta ? 'px-3 py-1.5' : 'px-4 py-3';
  const alinhamento = (a?: string) => (a === 'direita' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left');

  return (
    <div>
      {/* Na versão compacta (chat), a barra só aparece quando há filtro ativo. */}
      {(titulo || buscaGlobal || !compacta || filtrosAtivos > 0) && (
        <div className={`flex flex-wrap items-center gap-3 border-b border-line ${compacta ? 'px-3 py-2' : 'px-5 py-3'}`}>
          {titulo && <div className="mr-auto">{titulo}</div>}
          {buscaGlobal && (
            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={buscaGlobal.placeholder}
                className="campo py-1.5 pl-9"
              />
            </div>
          )}
          <span className={`rotulo ${titulo ? '' : 'mr-auto'}`}>
            <span className="text-ink">{totalFiltrado.toLocaleString('pt-BR')}</span>
            {totalFiltrado !== dados.length && <> de {dados.length.toLocaleString('pt-BR')}</>} {rotuloItens}
          </span>
          {filtrosAtivos > 0 && (
            <button
              type="button"
              onClick={() => {
                setFiltros([]);
                setBusca('');
              }}
              className="inline-flex animate-fade-in items-center gap-1 rounded-sm border border-signal/30 bg-signal/10 px-2 py-0.5 text-xs text-signal transition hover:border-signal/60"
            >
              <X size={11} /> Limpar {filtrosAtivos} {filtrosAtivos === 1 ? 'filtro' : 'filtros'}
            </button>
          )}
        </div>
      )}

      <div className={`overflow-auto ${alturaMaxima}`}>
        <table className={`w-full text-sm ${larguraMinima}`}>
          <thead className="sticky top-0 z-10 bg-elevated">
            {tabela.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id}>
                {grupo.headers.map((cabecalho) => (
                  <th
                    key={cabecalho.id}
                    className={`rotulo whitespace-nowrap font-normal ${celula} ${alinhamento(cabecalho.column.columnDef.meta?.alinhar)}`}
                  >
                    {cabecalho.isPlaceholder ? null : (
                      <CabecalhoColuna
                        coluna={cabecalho.column as Column<T, unknown>}
                        linhasBase={dados}
                        rotulo={flexRender(cabecalho.column.columnDef.header, cabecalho.getContext())}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-line">
            {tabela.getRowModel().rows.map((linha) => (
              <tr key={linha.id} className="transition hover:bg-signal/5">
                {linha.getVisibleCells().map((c) => (
                  <td
                    key={c.id}
                    className={`align-top ${celula} ${alinhamento(c.column.columnDef.meta?.alinhar)} ${c.column.columnDef.meta?.classe ?? ''}`}
                  >
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {totalFiltrado === 0 && (
              <tr>
                <td colSpan={colunas.length} className="px-4 py-12 text-center text-sm text-faint">
                  Nenhum resultado para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {porPagina && totalFiltrado > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
          <span>
            Mostrando{' '}
            <strong className="text-ink">
              {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, totalFiltrado)}
            </strong>{' '}
            de <strong className="text-ink">{totalFiltrado.toLocaleString('pt-BR')}</strong>
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
            <span className="font-mono tabular-nums">
              {pageIndex + 1} / {tabela.getPageCount()}
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
    </div>
  );
}
