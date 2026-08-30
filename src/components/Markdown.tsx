import { Fragment, type ReactNode } from 'react';

/**
 * Renderizador Markdown mínimo e seguro.
 *
 * Cobre exatamente o que o prompt do assistente pede (negrito, itálico, código
 * inline, links `[texto](url)`, listas e parágrafos) construindo elementos React
 * — sem `dangerouslySetInnerHTML`, portanto imune a HTML injetado pelo modelo.
 */

/** Só permitimos esquemas de navegação; bloqueia `javascript:` e afins. */
function urlSegura(url: string): string | null {
  const limpa = url.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(limpa)) return limpa;
  return null;
}

const PADRAO_INLINE =
  /(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*]+)\*)/g;

function renderizarInline(texto: string, chaveBase: string): ReactNode[] {
  const nos: ReactNode[] = [];
  let ultimoIndice = 0;
  let contador = 0;

  for (const encontro of texto.matchAll(PADRAO_INLINE)) {
    const indice = encontro.index ?? 0;
    if (indice > ultimoIndice) {
      nos.push(texto.slice(ultimoIndice, indice));
    }

    const chave = `${chaveBase}-i${contador++}`;
    const [, , rotuloLink, urlLink, , negrito, , codigo, , italico] = encontro;

    if (rotuloLink && urlLink) {
      const href = urlSegura(urlLink);
      nos.push(
        href ? (
          <a
            key={chave}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
          >
            {rotuloLink}
          </a>
        ) : (
          <span key={chave}>{rotuloLink}</span>
        ),
      );
    } else if (negrito) {
      nos.push(
        <strong key={chave} className="font-semibold text-slate-900">
          {negrito}
        </strong>,
      );
    } else if (codigo) {
      nos.push(
        <code key={chave} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-800">
          {codigo}
        </code>,
      );
    } else if (italico) {
      nos.push(<em key={chave}>{italico}</em>);
    }

    ultimoIndice = indice + encontro[0].length;
  }

  if (ultimoIndice < texto.length) {
    nos.push(texto.slice(ultimoIndice));
  }
  return nos;
}

export default function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split('\n');
  const blocos: ReactNode[] = [];

  let itensLista: string[] = [];

  const descarregarLista = (chave: string) => {
    if (itensLista.length === 0) return;
    blocos.push(
      <ul key={`ul-${chave}`} className="my-1.5 list-disc space-y-1 pl-5">
        {itensLista.map((item, indice) => (
          <li key={indice}>{renderizarInline(item, `${chave}-${indice}`)}</li>
        ))}
      </ul>,
    );
    itensLista = [];
  };

  linhas.forEach((linha, indice) => {
    const conteudo = linha.trim();

    // Item de lista (-, * ou "1.")
    const itemLista = conteudo.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (itemLista) {
      itensLista.push(itemLista[1]);
      return;
    }

    descarregarLista(String(indice));

    if (!conteudo) return;

    // Títulos markdown (#, ##, ###)
    const titulo = conteudo.match(/^(#{1,3})\s+(.*)$/);
    if (titulo) {
      blocos.push(
        <p key={indice} className="mt-2 font-semibold text-slate-900">
          {renderizarInline(titulo[2], String(indice))}
        </p>,
      );
      return;
    }

    blocos.push(
      <p key={indice} className="my-1">
        {renderizarInline(conteudo, String(indice))}
      </p>,
    );
  });

  descarregarLista('fim');

  return <Fragment>{blocos}</Fragment>;
}
