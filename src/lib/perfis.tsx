import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';

/**
 * Perfis de atores e temas: qualquer componente abre um perfil pelo contexto,
 * sem repassar callbacks por várias camadas. O App fornece o valor.
 */

export type Perfil =
  | { tipo: 'ator'; id: number }
  | { tipo: 'tema'; termo: string }
  | { tipo: 'categoria'; nome: string }
  | { tipo: 'tipoEvento'; nome: string };

export interface ContextoPerfis {
  abrirAtor: (id: number) => void;
  abrirTema: (termo: string) => void;
  abrirCategoria: (nome: string) => void;
  abrirTipoEvento: (nome: string) => void;
  /** Abre o acervo filtrado pelo termo (período completo). */
  pesquisar: (termo: string) => void;
  /** Abre o acervo filtrado pela categoria (período completo). */
  verCategoria: (nome: string) => void;
  /** ID do ator com esse nome (sem acento/caixa), se existir. */
  idDoAtor: (nome: string) => number | undefined;
}

const Contexto = createContext<ContextoPerfis | null>(null);
export const ProvedorPerfis = Contexto.Provider;

export function usePerfis(): ContextoPerfis {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('usePerfis precisa estar dentro de <ProvedorPerfis>.');
  return valor;
}

const CLASSE_LINK =
  'rounded-sm text-left underline decoration-line decoration-dotted underline-offset-4 transition hover:text-signal hover:decoration-signal';

/** Nome de ator clicável; vira texto simples quando não há ator com esse nome. */
export function LinkAtor({ nome, className = '', children }: { nome: string; className?: string; children?: ReactNode }) {
  const { abrirAtor, idDoAtor } = usePerfis();
  const id = idDoAtor(nome);
  if (id === undefined) return <span className={className}>{children ?? nome}</span>;
  return (
    <button type="button" onClick={() => abrirAtor(id)} title={`Perfil de ${nome}`} className={`${CLASSE_LINK} ${className}`}>
      {children ?? nome}
    </button>
  );
}

/** Tema (palavra-chave ou termo) clicável. */
export function LinkTema({ termo, className = '', children }: { termo: string; className?: string; children?: ReactNode }) {
  const { abrirTema } = usePerfis();
  return (
    <button type="button" onClick={() => abrirTema(termo)} title={`Perfil do tema “${termo}”`} className={className}>
      {children ?? termo}
    </button>
  );
}

/** Categoria de notícia clicável. */
export function LinkCategoria({
  nome,
  className = '',
  style,
  children,
}: {
  nome: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { abrirCategoria } = usePerfis();
  return (
    <button type="button" onClick={() => abrirCategoria(nome)} title={`Perfil da categoria “${nome}”`} className={className} style={style}>
      {children ?? nome}
    </button>
  );
}

/** Tipo de evento clicável. */
export function LinkTipoEvento({ nome, className = '', children }: { nome: string; className?: string; children?: ReactNode }) {
  const { abrirTipoEvento } = usePerfis();
  return (
    <button type="button" onClick={() => abrirTipoEvento(nome)} title={`Perfil do tipo de evento “${nome}”`} className={className}>
      {children ?? nome}
    </button>
  );
}

export { CLASSE_LINK };
