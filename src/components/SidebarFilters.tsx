import {
  CalendarRange,
  Filter,
  PanelLeftClose,
  RotateCcw,
  Search,
  Tag,
  X,
} from 'lucide-react';
import type { Filtros } from '@/types';
import { corDaCategoria } from '@/lib/constantes';

interface SidebarFiltersProps {
  filtros: Filtros;
  onMudarFiltros: (filtros: Filtros) => void;
  onLimpar: () => void;
  /** Categorias presentes no acervo, com a contagem total de cada uma. */
  categorias: Array<{ nome: string; total: number }>;
  /** Nº de notícias que passam pelos filtros atuais. */
  totalFiltrado: number;
  totalGeral: number;
  /** Controle de visibilidade no layout mobile. */
  aberto: boolean;
  onFechar: () => void;
  /** Estado recolhido no desktop (independente da gaveta mobile). */
  recolhida: boolean;
  onRecolher: () => void;
}

export default function SidebarFilters({
  filtros,
  onMudarFiltros,
  onLimpar,
  categorias,
  totalFiltrado,
  totalGeral,
  aberto,
  onFechar,
  recolhida,
  onRecolher,
}: SidebarFiltersProps) {
  const atualizar = <K extends keyof Filtros>(chave: K, valor: Filtros[K]) => {
    onMudarFiltros({ ...filtros, [chave]: valor });
  };

  const alternarCategoria = (nome: string) => {
    const selecionadas = filtros.categorias.includes(nome)
      ? filtros.categorias.filter((c) => c !== nome)
      : [...filtros.categorias, nome];
    atualizar('categorias', selecionadas);
  };

  const percentual = totalGeral > 0 ? Math.round((totalFiltrado / totalGeral) * 100) : 0;

  return (
    <>
      {/* Backdrop apenas no mobile */}
      {aberto && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onFechar}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white
                    transition-transform duration-300
                    lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100vh-4rem)] lg:translate-x-0
                    ${aberto ? 'translate-x-0' : '-translate-x-full'}
                    ${recolhida ? 'lg:hidden' : ''}`}
        aria-hidden={recolhida}
      >
        {/* Largura fixa: mantém o conteúdo estável independentemente do container */}
        <div className="w-80">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              <Filter size={16} className="text-brand-600" />
              Filtros
            </h2>
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
              aria-label="Fechar filtros"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={onRecolher}
              className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-700 lg:inline-flex"
              aria-label="Recolher painel de filtros"
              title="Recolher filtros"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <div className="space-y-6 p-5">
          {/* Resumo do recorte ativo */}
          <div className="rounded-lg bg-brand-50 p-4">
            <p className="text-2xl font-bold text-brand-800">
              {totalFiltrado.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-brand-700">
              de {totalGeral.toLocaleString('pt-BR')} notícias ({percentual}% do acervo)
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${percentual}%` }}
              />
            </div>
          </div>

          {/* Busca textual */}
          <div>
            <label className="etiqueta" htmlFor="filtro-busca">
              <span className="inline-flex items-center gap-1.5">
                <Search size={12} /> Busca livre
              </span>
            </label>
            <input
              id="filtro-busca"
              type="search"
              className="campo"
              placeholder="Título ou conteúdo…"
              value={filtros.busca}
              onChange={(e) => atualizar('busca', e.target.value)}
            />
          </div>

          {/* Período */}
          <div>
            <span className="etiqueta">
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange size={12} /> Período
              </span>
            </span>
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Início</span>
                <input
                  type="date"
                  className="campo"
                  value={filtros.dataInicio}
                  max={filtros.dataFim || undefined}
                  onChange={(e) => atualizar('dataInicio', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Fim</span>
                <input
                  type="date"
                  className="campo"
                  value={filtros.dataFim}
                  min={filtros.dataInicio || undefined}
                  onChange={(e) => atualizar('dataFim', e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Apenas eventos */}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
            <span className="text-sm font-medium text-slate-700">Somente eventos</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              checked={filtros.apenasEventos}
              onChange={(e) => atualizar('apenasEventos', e.target.checked)}
            />
          </label>

          {/* Categorias */}
          <div>
            <span className="etiqueta">
              <span className="inline-flex items-center gap-1.5">
                <Tag size={12} /> Categorias
                {filtros.categorias.length > 0 && (
                  <span className="ml-1 rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-700">
                    {filtros.categorias.length}
                  </span>
                )}
              </span>
            </span>
            <div className="space-y-1">
              {categorias.map((categoria, indice) => {
                const ativa = filtros.categorias.includes(categoria.nome);
                return (
                  <button
                    key={categoria.nome}
                    type="button"
                    onClick={() => alternarCategoria(categoria.nome)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition
                                ${ativa ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: corDaCategoria(categoria.nome, indice),
                        opacity: ativa ? 1 : 0.45,
                      }}
                    />
                    <span className="flex-1 truncate">{categoria.nome}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">{categoria.total}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" onClick={onLimpar} className="botao-secundario w-full">
            <RotateCcw size={14} />
            Limpar filtros
          </button>

          {/* Créditos */}
          <div className="border-t border-slate-100 pt-4 text-center">
            <p className="text-xs text-slate-500">
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
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Inteligência de dados territoriais aplicada ao jornalismo local.
            </p>
          </div>
          </div>
        </div>
      </aside>
    </>
  );
}
