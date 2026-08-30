import { useState } from 'react';
import { ChevronLeft, ChevronRight, Database, ExternalLink } from 'lucide-react';
import type { Noticia } from '@/types';
import { corDaCategoria, CATEGORIAS_VALIDAS } from '@/lib/constantes';

interface NewsTableProps {
  noticias: Noticia[];
  totalAcervo: number;
}

const POR_PAGINA = 20;

export default function NewsTable({ noticias, totalAcervo }: NewsTableProps) {
  const [pagina, setPagina] = useState(0);

  const totalPaginas = Math.max(1, Math.ceil(noticias.length / POR_PAGINA));
  // Se os filtros encolherem a lista, evita ficar preso numa página inexistente.
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = noticias.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  return (
    <section id="acervo" className="card overflow-hidden">
      <h3 className="card-titulo">
        <Database size={16} className="text-brand-600" />
        Base de Dados Enriquecida
        <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-slate-400">
          {noticias.length.toLocaleString('pt-BR')} de {totalAcervo.toLocaleString('pt-BR')} notícias
        </span>
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Palavras-chave</th>
              <th className="px-4 py-3">Evento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visiveis.map((noticia) => (
              <tr key={noticia.id} className="transition hover:bg-slate-50/70">
                <td className="px-4 py-3 tabular-nums text-xs text-slate-400">{noticia.id}</td>
                <td className="max-w-md px-4 py-3">
                  <a
                    href={noticia.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-start gap-1 font-medium text-slate-800 hover:text-brand-700"
                  >
                    <span className="line-clamp-2">{noticia.titulo}</span>
                    <ExternalLink size={11} className="mt-1 shrink-0 text-slate-400" />
                  </a>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                  {noticia.data || '—'}
                </td>
                <td className="px-4 py-3">
                  {noticia.categorizada ? (
                    <span
                      className="chip"
                      style={{
                        backgroundColor: `${corDaCategoria(noticia.categorias, CATEGORIAS_VALIDAS.length)}1a`,
                        color: corDaCategoria(noticia.categorias, CATEGORIAS_VALIDAS.length),
                      }}
                    >
                      {noticia.categorias}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="max-w-[240px] px-4 py-3">
                  {noticia.palavrasChaves.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {noticia.palavrasChaves.slice(0, 3).map((palavra) => (
                        <span key={palavra} className="chip bg-slate-100 text-slate-600">
                          {palavra}
                        </span>
                      ))}
                      {noticia.palavrasChaves.length > 3 && (
                        <span className="chip text-slate-400">
                          +{noticia.palavrasChaves.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {noticia.ehEvento ? (
                    <span className="chip bg-amber-50 text-amber-700">
                      {noticia.ehPago ? 'Pago' : 'Gratuito'}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}

            {visiveis.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-400">
                  Nenhuma notícia corresponde aos filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {noticias.length > POR_PAGINA && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span>
            Página <strong className="text-slate-800">{paginaAtual + 1}</strong> de{' '}
            <strong className="text-slate-800">{totalPaginas}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina(Math.max(0, paginaAtual - 1))}
              disabled={paginaAtual === 0}
              className="botao-secundario px-2 py-1"
              aria-label="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPagina(Math.min(totalPaginas - 1, paginaAtual + 1))}
              disabled={paginaAtual >= totalPaginas - 1}
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
