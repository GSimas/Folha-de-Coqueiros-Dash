import { useEffect, useRef } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { Filtros } from '@/types';
import { corDaCategoria } from '@/lib/constantes';
import { usePresenca } from '@/lib/motion';

interface FiltersDrawerProps {
  filtros: Filtros;
  onMudarFiltros: (filtros: Filtros) => void;
  onLimpar: () => void;
  /** Categorias presentes no acervo, com a contagem total de cada uma. */
  categorias: Array<{ nome: string; total: number }>;
  /** Nº de notícias que passam pelos filtros atuais. */
  totalFiltrado: number;
  totalGeral: number;
  aberto: boolean;
  onFechar: () => void;
}

export default function FiltersDrawer({
  filtros,
  onMudarFiltros,
  onLimpar,
  categorias,
  totalFiltrado,
  totalGeral,
  aberto,
  onFechar,
}: FiltersDrawerProps) {
  const fundo = usePresenca(aberto, 300);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const timer = setTimeout(() => fecharRef.current?.focus(), 80);
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto, onFechar]);

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
      {fundo.montado && (
        <div
          className={`fixed inset-0 z-40 bg-canvas/60 backdrop-blur-sm transition-opacity duration-300 ${
            fundo.visivel ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onFechar}
          aria-hidden
        />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filtros do recorte"
        inert={!aberto}
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col border-r border-line bg-elevated
                    shadow-[24px_0_60px_-24px_rgb(0_0_0/0.5)] transition-transform duration-500 ease-suave
                    ${aberto ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="rotulo">Recorte</p>
            <h2 className="text-lg font-semibold text-ink">
              Filtrar <span className="titulo-serif">notícias</span>
            </h2>
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onFechar}
            className="botao-icone"
            aria-label="Fechar filtros"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto p-5">
          {/* Resumo do recorte ativo */}
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink">
              {totalFiltrado.toLocaleString('pt-BR')}
              <span className="ml-2 text-sm font-normal text-muted">
                de {totalGeral.toLocaleString('pt-BR')}
              </span>
            </p>
            <div className="mt-3 h-px bg-line">
              <div
                className="h-px bg-signal shadow-[0_0_10px_rgb(var(--signal))] transition-all duration-700 ease-suave"
                style={{ width: `${percentual}%` }}
              />
            </div>
            <p className="rotulo mt-2">{percentual}% do acervo</p>
          </div>

          <div>
            <label className="etiqueta" htmlFor="filtro-busca">
              Busca livre
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

          <div>
            <span className="etiqueta">Período</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Início</span>
                <input
                  type="date"
                  className="campo"
                  value={filtros.dataInicio}
                  max={filtros.dataFim || undefined}
                  onChange={(e) => atualizar('dataInicio', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Fim</span>
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

          <button
            type="button"
            role="switch"
            aria-checked={filtros.apenasEventos}
            onClick={() => atualizar('apenasEventos', !filtros.apenasEventos)}
            className="flex w-full items-center justify-between rounded-sm border border-line px-3 py-2.5 text-left transition hover:border-signal/40"
          >
            <span className="text-sm font-medium text-ink">Somente eventos</span>
            <span
              className={`relative h-5 w-9 rounded-full border transition ${
                filtros.apenasEventos ? 'border-signal bg-signal/25' : 'border-line bg-slate-100'
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-300 ${
                  filtros.apenasEventos ? 'left-[1.1rem] bg-signal' : 'left-0.5 bg-faint'
                }`}
              />
            </span>
          </button>

          <div>
            <span className="etiqueta">
              Categorias
              {filtros.categorias.length > 0 && (
                <span className="ml-2 text-signal">· {filtros.categorias.length}</span>
              )}
            </span>
            <div className="space-y-0.5">
              {categorias.map((categoria, indice) => {
                const ativa = filtros.categorias.includes(categoria.nome);
                return (
                  <button
                    key={categoria.nome}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => alternarCategoria(categoria.nome)}
                    className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[0.8125rem] transition ${
                      ativa ? 'bg-signal/10 font-semibold text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full transition ${ativa ? 'scale-125' : ''}`}
                      style={{
                        backgroundColor: corDaCategoria(categoria.nome, indice),
                        opacity: ativa ? 1 : 0.5,
                      }}
                    />
                    <span className="flex-1 truncate">{categoria.nome}</span>
                    <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums text-faint">
                      {categoria.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flex gap-2 border-t border-line p-4">
          <button type="button" onClick={onLimpar} className="botao-secundario flex-1">
            <RotateCcw size={14} />
            Limpar
          </button>
          <button type="button" onClick={onFechar} className="botao-primario flex-1">
            Ver {totalFiltrado.toLocaleString('pt-BR')} notícias
          </button>
        </footer>
      </aside>
    </>
  );
}
