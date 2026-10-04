import { useMemo, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createColumnHelper } from '@tanstack/react-table';
import { paraData } from '@/lib/data';
import TabelaDados, { type TipoColuna } from './TabelaDados';

/**
 * Markdown das respostas do assistente — GFM completo (tabelas, listas de
 * tarefas, tachado, autolinks, código, citações) via react-markdown.
 *
 * Segurança: HTML cru é descartado (`skipHtml`), só esquemas de navegação
 * seguros viram link, imagens não são carregadas (evita rastreamento por
 * pixel) e, com `urlsVerificadas`, links que não estavam entre as fontes
 * enviadas ao modelo aparecem como "link não verificado" em vez de clicáveis.
 *
 * Tabelas viram `TabelaDados` (ordenação e filtro por coluna), com o tipo de
 * cada coluna inferido do conteúdo.
 */

/** Só permitimos esquemas de navegação; bloqueia `javascript:` e afins. */
function urlSegura(url: string): string {
  const limpa = defaultUrlTransform(url.trim());
  return /^(https?:|mailto:|#)/i.test(limpa) ? limpa : '';
}

function Link({ href, urlsVerificadas, children }: { href: string; urlsVerificadas?: Set<string>; children: ReactNode }) {
  if (!href) return <span>{children}</span>;
  const verificado = !urlsVerificadas || href.startsWith('#') || urlsVerificadas.has(href);
  if (!verificado) {
    return (
      <span title="Este link não estava entre as fontes do acervo enviadas ao modelo — pode ser uma alucinação.">
        {children}{' '}
        <span className="rounded-sm bg-amber-500/15 px-1 font-mono text-[0.625rem] uppercase tracking-wider text-amber-600 dark:text-amber-300">
          link não verificado
        </span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

// --- Tabelas: da árvore HAST para dados tipados -----------------------------

interface NoHast {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: NoHast[];
}

const textoDe = (no: NoHast): string =>
  no.type === 'text' ? (no.value ?? '') : (no.children ?? []).map(textoDe).join('');

/** Renderiza o conteúdo inline de uma célula (negrito, itálico, código, links…). */
function renderizarInline(nos: NoHast[] = [], urls?: Set<string>, chave = 'n'): ReactNode[] {
  return nos.map((no, i) => {
    const k = `${chave}-${i}`;
    if (no.type === 'text') return no.value;
    const filhos = renderizarInline(no.children, urls, k);
    switch (no.tagName) {
      case 'strong':
        return <strong key={k}>{filhos}</strong>;
      case 'em':
        return <em key={k}>{filhos}</em>;
      case 'del':
        return <del key={k}>{filhos}</del>;
      case 'code':
        return <code key={k}>{filhos}</code>;
      case 'br':
        return <br key={k} />;
      case 'a':
        return (
          <Link key={k} href={urlSegura(String(no.properties?.href ?? ''))} urlsVerificadas={urls}>
            {filhos}
          </Link>
        );
      case 'img':
        return (
          <span key={k} className="text-faint">
            [imagem]
          </span>
        );
      default:
        return <span key={k}>{filhos}</span>;
    }
  });
}

const VAZIOS = new Set(['', '—', '-', '–', 'n/d', 'n/a', 'nd']);

/** "1.234,5" · "−27%" · "+15%" · "R$ 25" · "3.5" → número; senão `undefined`. */
function paraNumero(texto: string): number | undefined {
  const limpo = texto.replace(/R\$|%|\s| /g, '').replace(/[−–]/g, '-').replace(/^\+/, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpo)) return Number(limpo.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(,\d+)?$/.test(limpo)) return Number(limpo.replace(',', '.'));
  if (/^-?\d+\.\d+$/.test(limpo)) return Number(limpo);
  return undefined;
}

function inferirTipo(textos: string[]): TipoColuna {
  const preenchidos = textos.map((t) => t.trim()).filter((t) => !VAZIOS.has(t.toLowerCase()));
  if (preenchidos.length === 0) return 'texto';
  if (preenchidos.every((t) => paraNumero(t) !== undefined)) return 'numero';
  if (preenchidos.every((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t) && paraData(t))) return 'data';
  const unicos = new Set(preenchidos).size;
  return unicos <= 12 && (unicos < preenchidos.length || unicos <= 6) ? 'categoria' : 'texto';
}

interface Celula {
  texto: string;
  nos: NoHast[];
}

function TabelaMarkdown({ no, urlsVerificadas }: { no?: NoHast; urlsVerificadas?: Set<string> }) {
  const { cabecalhos, linhas } = useMemo(() => {
    const trs: NoHast[] = [];
    const coletar = (n: NoHast) => {
      if (n.tagName === 'tr') trs.push(n);
      else n.children?.forEach(coletar);
    };
    if (no) coletar(no);
    const celulasDe = (tr: NoHast) =>
      (tr.children ?? []).filter((c) => c.tagName === 'th' || c.tagName === 'td');
    const [primeira, ...resto] = trs;
    return {
      cabecalhos: primeira
        ? celulasDe(primeira).map((c) => ({ titulo: textoDe(c).trim(), alinhar: c.properties?.align as string | undefined }))
        : [],
      linhas: resto.map((tr) => celulasDe(tr).map((c): Celula => ({ texto: textoDe(c).trim(), nos: c.children ?? [] }))),
    };
  }, [no]);

  const colunas = useMemo(() => {
    const coluna = createColumnHelper<Celula[]>();
    return cabecalhos.map((cab, i) => {
      const tipo = inferirTipo(linhas.map((l) => l[i]?.texto ?? ''));
      return coluna.accessor(
        (linha) => {
          const texto = linha[i]?.texto ?? '';
          if (tipo === 'numero') return paraNumero(texto);
          if (tipo === 'data') return paraData(texto) ?? undefined;
          return VAZIOS.has(texto.toLowerCase()) && tipo === 'categoria' ? undefined : texto;
        },
        {
          id: `c${i}`,
          header: cab.titulo || `Coluna ${i + 1}`,
          meta: {
            tipo,
            alinhar: cab.alinhar === 'right' || tipo === 'numero' ? 'direita' : cab.alinhar === 'center' ? 'centro' : undefined,
          },
          cell: (info) => renderizarInline(info.row.original[i]?.nos, urlsVerificadas),
        },
      );
    });
  }, [cabecalhos, linhas, urlsVerificadas]);

  return (
    <div className="overflow-hidden rounded-sm border border-line">
      <TabelaDados dados={linhas} colunas={colunas} rotuloItens="linhas" nomeArquivo="tabela-do-assistente" porPagina={null} compacta />
    </div>
  );
}

function criarComponentes(urlsVerificadas?: Set<string>): Components {
  return {
    a: ({ href, children }) => (
      <Link href={href ?? ''} urlsVerificadas={urlsVerificadas}>
        {children}
      </Link>
    ),
    // Imagens externas não são carregadas: viram uma referência textual.
    img: ({ alt }) => <span className="text-faint">[imagem{alt ? `: ${alt}` : ''}]</span>,
    table: ({ node }) => <TabelaMarkdown no={node as NoHast | undefined} urlsVerificadas={urlsVerificadas} />,
  };
}

export default function Markdown({
  texto,
  urlsVerificadas,
}: {
  texto: string;
  urlsVerificadas?: Set<string>;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={urlSegura}
        components={criarComponentes(urlsVerificadas)}
      >
        {texto}
      </ReactMarkdown>
    </div>
  );
}
