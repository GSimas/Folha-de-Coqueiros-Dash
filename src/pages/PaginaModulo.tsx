import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, SlidersHorizontal, X } from 'lucide-react';
import type { Filtros } from '@/types';
import { MODULOS, hrefDe, type Modulo } from '@/lib/rotas';

interface PaginaModuloProps {
  modulo: Modulo;
  filtros: Filtros;
  onMudarFiltros: (filtros: Filtros) => void;
  onAbrirFiltros: () => void;
  /** Período completo do acervo, para saber se o recorte temporal foi alterado. */
  periodoCompleto: { inicio: string; fim: string };
  totalFiltrado: number;
  totalGeral: number;
  children: ReactNode;
}

const dataCurta = (iso: string) => iso.split('-').reverse().join('/');

export default function PaginaModulo({
  modulo,
  filtros,
  onMudarFiltros,
  onAbrirFiltros,
  periodoCompleto,
  totalFiltrado,
  totalGeral,
  children,
}: PaginaModuloProps) {
  const posicao = MODULOS.findIndex((m) => m.rota === modulo.rota);
  const proximo = MODULOS[posicao + 1];

  // Filtros ativos viram chips removíveis na barra de recorte.
  const ativos: Array<{ chave: string; rotulo: string; remover: () => void }> = [];
  if (filtros.busca.trim()) {
    ativos.push({
      chave: 'busca',
      rotulo: `“${filtros.busca.trim()}”`,
      remover: () => onMudarFiltros({ ...filtros, busca: '' }),
    });
  }
  if (
    filtros.dataInicio !== periodoCompleto.inicio ||
    filtros.dataFim !== periodoCompleto.fim
  ) {
    ativos.push({
      chave: 'periodo',
      rotulo: `${dataCurta(filtros.dataInicio)} – ${dataCurta(filtros.dataFim)}`,
      remover: () =>
        onMudarFiltros({
          ...filtros,
          dataInicio: periodoCompleto.inicio,
          dataFim: periodoCompleto.fim,
        }),
    });
  }
  if (filtros.apenasEventos) {
    ativos.push({
      chave: 'eventos',
      rotulo: 'Somente eventos',
      remover: () => onMudarFiltros({ ...filtros, apenasEventos: false }),
    });
  }
  for (const categoria of filtros.categorias) {
    ativos.push({
      chave: `cat-${categoria}`,
      rotulo: categoria,
      remover: () =>
        onMudarFiltros({
          ...filtros,
          categorias: filtros.categorias.filter((c) => c !== categoria),
        }),
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
      <header className="pb-8 pt-10 sm:pt-14">
        <a
          href={hrefDe('inicio')}
          className="rotulo group inline-flex items-center gap-2 rounded-sm py-1 transition hover:text-ink"
        >
          <ArrowLeft size={12} className="transition-transform group-hover:-translate-x-0.5" />
          Início
          <span className="text-faint">/</span>
          <span className="text-signal">
            {modulo.indice} · {modulo.rotulo}
          </span>
        </a>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-6xl">
          {modulo.titulo} <span className="titulo-serif tracking-normal">{modulo.destaque}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted">{modulo.descricao}</p>
      </header>

      {modulo.usaFiltros && (
        <div className="mb-8 flex flex-wrap items-center gap-3 border-y border-line py-3">
          <span className="rotulo">
            Recorte ·{' '}
            <span className="text-ink">{totalFiltrado.toLocaleString('pt-BR')}</span> de{' '}
            {totalGeral.toLocaleString('pt-BR')}
          </span>

          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {ativos.map((filtro) => (
              <button
                key={filtro.chave}
                type="button"
                onClick={filtro.remover}
                className="group inline-flex max-w-[16rem] animate-fade-in items-center gap-1.5 rounded-sm border border-signal/30 bg-signal/10 px-2 py-0.5 text-xs text-signal transition hover:border-signal/60"
                title="Remover filtro"
              >
                <span className="truncate">{filtro.rotulo}</span>
                <X size={11} className="shrink-0 opacity-60 transition group-hover:opacity-100" />
              </button>
            ))}
          </div>

          <button type="button" onClick={onAbrirFiltros} className="botao-secundario py-1.5">
            <SlidersHorizontal size={14} />
            Filtros
            {ativos.length > 0 && (
              <span className="rounded-sm bg-signal px-1.5 font-mono text-[0.625rem] text-signal-ink">
                {ativos.length}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="space-y-6">{children}</div>

      <a
        href={hrefDe(proximo ? proximo.rota : 'inicio')}
        className="card group mt-16 flex items-center justify-between gap-6 p-6 sm:p-8"
      >
        <span>
          <span className="rotulo">{proximo ? `Próximo · ${proximo.indice}` : 'Fim do percurso'}</span>
          <span className="mt-2 block text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {proximo ? (
              <>
                {proximo.titulo} <span className="titulo-serif">{proximo.destaque}</span>
              </>
            ) : (
              <>
                Voltar ao <span className="titulo-serif">início.</span>
              </>
            )}
          </span>
        </span>
        <ArrowRight
          size={28}
          className="shrink-0 text-signal transition-transform duration-500 ease-suave group-hover:translate-x-1.5"
        />
      </a>
    </div>
  );
}
