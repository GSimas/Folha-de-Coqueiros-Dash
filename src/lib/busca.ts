import type { Ator, Noticia } from '@/types';

/**
 * Busca global do cabeçalho: notícias, atores, palavras-chave e categorias de
 * todo o acervo (ignora o recorte), sem acento e sem diferenciar maiúsculas.
 */

/** Minúsculas sem acento. Preserva o comprimento de textos em NFC, então os índices servem no original. */
export const semAcento = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

interface NoticiaIndexada {
  noticia: Noticia;
  titulo: string;
  chaves: string;
  extras: string;
  corpo: string;
}

export interface IndiceBusca {
  noticias: NoticiaIndexada[];
  atores: Array<{ ator: Ator; nome: string }>;
  termos: Array<{ termo: string; chave: string; total: number }>;
  categorias: Array<{ nome: string; chave: string; total: number }>;
}

export interface ResultadoBusca {
  noticias: Array<{ noticia: Noticia; trecho: string }>;
  atores: Ator[];
  termos: Array<{ termo: string; total: number }>;
  categorias: Array<{ nome: string; total: number }>;
  /** Notícias que o filtro "busca" do recorte vai mostrar para a mesma consulta. */
  totalNoticias: number;
}

export function criarIndiceBusca(noticias: Noticia[], atores: Ator[]): IndiceBusca {
  const termos = new Map<string, { termo: string; total: number }>();
  const categorias = new Map<string, number>();
  for (const n of noticias) {
    for (const termo of n.palavrasChaves) {
      const chave = semAcento(termo);
      const atual = termos.get(chave);
      if (atual) atual.total += 1;
      else termos.set(chave, { termo, total: 1 });
    }
    if (n.categorizada) categorias.set(n.categorias, (categorias.get(n.categorias) ?? 0) + 1);
  }
  return {
    noticias: noticias.map((noticia) => ({
      noticia,
      titulo: semAcento(noticia.titulo),
      chaves: semAcento(noticia.palavrasChaves.join(' · ')),
      extras: semAcento(`${noticia.categorias} ${noticia.localEvento ?? ''} ${noticia.tipoEvento ?? ''}`),
      corpo: semAcento(noticia.conteudo),
    })),
    atores: atores.map((ator) => ({ ator, nome: semAcento(ator.nome) })),
    termos: [...termos.entries()].map(([chave, t]) => ({ ...t, chave })),
    categorias: [...categorias.entries()].map(([nome, total]) => ({ nome, chave: semAcento(nome), total })),
  };
}

/** Palavras da consulta (≥ 2 letras), normalizadas. */
export const palavrasDaConsulta = (consulta: string) =>
  semAcento(consulta).split(/\s+/).filter((p) => p.length >= 2);

/** Filtro "busca" do recorte: todas as palavras no título, palavras-chave ou conteúdo. */
export function casaComBusca(noticia: Noticia, palavras: string[]): boolean {
  const alvo = semAcento(`${noticia.titulo} ${noticia.palavrasChaves.join(' · ')} ${noticia.conteudo}`);
  return palavras.every((p) => alvo.includes(p));
}

/** Trecho do conteúdo em torno da primeira ocorrência. */
function trechoDe(original: string, normalizado: string, palavras: string[]): string {
  const posicao = Math.min(...palavras.map((p) => normalizado.indexOf(p)).filter((i) => i >= 0));
  if (!Number.isFinite(posicao)) return original.slice(0, 140).trim();
  const inicio = Math.max(0, original.lastIndexOf(' ', Math.max(0, posicao - 60)) + 1);
  const fim = Math.min(original.length, posicao + 110);
  return `${inicio > 0 ? '…' : ''}${original.slice(inicio, fim).replace(/\s+/g, ' ').trim()}${fim < original.length ? '…' : ''}`;
}

export function buscarNoAcervo(indice: IndiceBusca, consulta: string, limite = 6): ResultadoBusca | null {
  const palavras = palavrasDaConsulta(consulta);
  const frase = semAcento(consulta.trim());
  if (palavras.length === 0) return null;
  const todas = (alvo: string) => palavras.every((p) => alvo.includes(p));

  // Pontuação simples: título > palavras-chave > categoria/local > conteúdo.
  const noticias = indice.noticias
    .map((item) => {
      const { titulo, chaves, extras, corpo } = item;
      if (!todas(`${titulo} ${chaves} ${extras} ${corpo}`)) return null;
      const pontos =
        (titulo.includes(frase) ? 10 : todas(titulo) ? 6 : 0) +
        (chaves.includes(frase) ? 5 : todas(chaves) ? 3 : 0) +
        (todas(extras) ? 2 : 0) +
        (corpo.includes(frase) ? 1 : 0);
      return { item, pontos };
    })
    .filter((r): r is { item: NoticiaIndexada; pontos: number } => r !== null)
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        (b.item.noticia.dataConvertida?.getTime() ?? 0) - (a.item.noticia.dataConvertida?.getTime() ?? 0),
    );

  const porInicio = <T,>(lista: T[], chave: (x: T) => string, peso: (x: T) => number) =>
    lista
      .filter((x) => todas(chave(x)))
      .sort((a, b) => Number(chave(b).startsWith(frase)) - Number(chave(a).startsWith(frase)) || peso(b) - peso(a))
      .slice(0, limite);

  return {
    noticias: noticias.slice(0, limite).map(({ item }) => ({
      noticia: item.noticia,
      trecho: trechoDe(item.noticia.conteudo, item.corpo, palavras),
    })),
    atores: porInicio(indice.atores, (a) => a.nome, (a) => a.ator.noticias.length).map((a) => a.ator),
    termos: porInicio(indice.termos, (t) => t.chave, (t) => t.total).map(({ termo, total }) => ({ termo, total })),
    categorias: porInicio(indice.categorias, (c) => c.chave, (c) => c.total).map(({ nome, total }) => ({ nome, total })),
    totalNoticias: indice.noticias.filter((n) => todas(`${n.titulo} ${n.chaves} ${n.corpo}`)).length,
  };
}

/** Divide um texto em partes, marcando as que casam com a consulta (para `<mark>`). */
export function realcar(texto: string, palavras: string[]): Array<{ texto: string; marcado: boolean }> {
  const normalizado = semAcento(texto);
  const marcas = new Array<boolean>(texto.length).fill(false);
  for (const p of palavras) {
    for (let i = normalizado.indexOf(p); i >= 0; i = normalizado.indexOf(p, i + p.length)) {
      marcas.fill(true, i, i + p.length);
    }
  }
  const partes: Array<{ texto: string; marcado: boolean }> = [];
  for (let i = 0; i < texto.length; i++) {
    const ultima = partes[partes.length - 1];
    if (ultima && ultima.marcado === marcas[i]) ultima.texto += texto[i];
    else partes.push({ texto: texto[i], marcado: marcas[i] });
  }
  return partes;
}
