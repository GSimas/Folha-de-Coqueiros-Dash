import { useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowUpRight } from 'lucide-react';
import type { Noticia } from '@/types';
import { corDaCategoria, CATEGORIAS_VALIDAS } from '@/lib/constantes';
import { Revelar } from '@/lib/motion';
import TabelaDados from './TabelaDados';

interface NewsTableProps {
  noticias: Noticia[];
  totalAcervo: number;
}

const coluna = createColumnHelper<Noticia>();

const statusEvento = (n: Noticia) => (!n.ehEvento ? 'Não é evento' : n.ehPago ? 'Evento pago' : 'Evento gratuito');

export default function NewsTable({ noticias, totalAcervo }: NewsTableProps) {
  const colunas = useMemo(
    () => [
      coluna.accessor('id', {
        header: 'ID',
        meta: { tipo: 'numero' },
        cell: (info) => <span className="font-mono text-xs tabular-nums text-faint">{info.getValue()}</span>,
      }),
      coluna.accessor('titulo', {
        header: 'Título',
        meta: { tipo: 'texto', classe: 'max-w-md' },
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
      coluna.accessor((n) => n.dataConvertida ?? undefined, {
        id: 'data',
        header: 'Data',
        meta: { tipo: 'data', classe: 'whitespace-nowrap' },
        cell: (info) => <span className="font-mono text-xs text-muted">{info.row.original.data || '—'}</span>,
      }),
      coluna.accessor((n) => (n.categorizada ? n.categorias : 'Não categorizado'), {
        id: 'categoria',
        header: 'Categoria',
        meta: { tipo: 'categoria' },
        cell: (info) => {
          const n = info.row.original;
          if (!n.categorizada) return <span className="text-xs text-faint">—</span>;
          const cor = corDaCategoria(n.categorias, CATEGORIAS_VALIDAS.length);
          return (
            <span className="chip" style={{ backgroundColor: `${cor}1f`, color: cor }}>
              {n.categorias}
            </span>
          );
        },
      }),
      coluna.accessor('palavrasChaves', {
        header: 'Palavras-chave',
        meta: { tipo: 'categoria', classe: 'max-w-[240px]' },
        cell: (info) => {
          const palavras = info.getValue();
          if (palavras.length === 0) return <span className="text-xs text-faint">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {palavras.slice(0, 3).map((palavra) => (
                <span key={palavra} className="chip bg-signal/10 text-muted">
                  {palavra}
                </span>
              ))}
              {palavras.length > 3 && (
                <span className="chip text-faint" title={palavras.slice(3).join(', ')}>
                  +{palavras.length - 3}
                </span>
              )}
            </div>
          );
        },
      }),
      coluna.accessor(statusEvento, {
        id: 'evento',
        header: 'Evento',
        meta: { tipo: 'categoria' },
        cell: (info) => {
          const n = info.row.original;
          return n.ehEvento ? (
            <span className="chip bg-amber-500/10 text-amber-600 dark:text-amber-300">
              {n.ehPago ? 'Pago' : 'Gratuito'}
            </span>
          ) : (
            <span className="text-xs text-faint">—</span>
          );
        },
      }),
    ],
    [],
  );

  return (
    <Revelar como="section" className="card overflow-hidden">
      <TabelaDados
        dados={noticias}
        colunas={colunas}
        rotuloItens={
          noticias.length === totalAcervo ? 'notícias' : `notícias · recorte do acervo de ${totalAcervo.toLocaleString('pt-BR')}`
        }
        ordenacaoInicial={[{ id: 'data', desc: true }]}
        porPagina={20}
        larguraMinima="min-w-[900px]"
        titulo={
          <h3 className="rotulo">
            <span className="text-signal">A</span> · Base enriquecida
          </h3>
        }
      />
    </Revelar>
  );
}
