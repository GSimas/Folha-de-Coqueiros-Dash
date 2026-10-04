import type { Ator, Noticia } from '@/types';
import { CATEGORIAS_VALIDAS, TIPOS_EVENTO_VALIDOS } from '@/lib/constantes';

/**
 * Elementos do painel citados nas respostas do assistente viram links para os
 * perfis. A detecção é determinística (dicionário do acervo), então funciona
 * com qualquer modelo — sem depender de ele formatar links especiais.
 */

export type TipoEntidade = 'ator' | 'tema' | 'categoria' | 'tipoEvento';

export interface DicionarioEntidades {
  padrao: RegExp | null;
  /** Nome em minúsculas → entidade (a forma canônica para abrir o perfil). */
  porChave: Map<string, { tipo: TipoEntidade; nome: string }>;
}

/** Prefixo dos links internos de perfil: `#perfil/<tipo>/<nome>`. */
export const PREFIXO_PERFIL = '#perfil/';

export const hrefDePerfil = (tipo: TipoEntidade, nome: string) => `${PREFIXO_PERFIL}${tipo}/${encodeURIComponent(nome)}`;

export function lerHrefDePerfil(href: string): { tipo: TipoEntidade; nome: string } | null {
  const m = /^#perfil\/(ator|tema|categoria|tipoEvento)\/(.+)$/.exec(href);
  if (!m) return null;
  try {
    return { tipo: m[1] as TipoEntidade, nome: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

const TAMANHO_MINIMO = 4;
/** Palavras-chave genéricas demais para virar link em qualquer resposta. */
const TEMAS_GENERICOS = new Set(
  'evento eventos projeto projetos notícia notícias bairro coqueiros florianópolis cidade moradores comunidade'.split(' '),
);
/** Palavra-chave precisa aparecer em ao menos N notícias para virar link (evita ruído). */
const FREQUENCIA_MINIMA_TEMA = 2;

export function criarDicionario(atores: Ator[], noticias: Noticia[]): DicionarioEntidades {
  const porChave: DicionarioEntidades['porChave'] = new Map();
  // Ordem = prioridade quando o mesmo nome é de mais de um tipo.
  const adicionar = (tipo: TipoEntidade, nome: string) => {
    const chave = nome.trim().toLowerCase();
    if (chave.length >= TAMANHO_MINIMO && !porChave.has(chave)) porChave.set(chave, { tipo, nome: nome.trim() });
  };
  for (const a of atores) adicionar('ator', a.nome);
  for (const c of CATEGORIAS_VALIDAS) adicionar('categoria', c);
  for (const t of TIPOS_EVENTO_VALIDOS) adicionar('tipoEvento', t);
  const frequencia = new Map<string, { nome: string; total: number }>();
  for (const n of noticias) {
    for (const p of n.palavrasChaves) {
      const atual = frequencia.get(p.toLowerCase());
      frequencia.set(p.toLowerCase(), { nome: atual?.nome ?? p, total: (atual?.total ?? 0) + 1 });
    }
  }
  for (const { nome, total } of frequencia.values()) {
    if (total >= FREQUENCIA_MINIMA_TEMA && !TEMAS_GENERICOS.has(nome.toLowerCase())) adicionar('tema', nome);
  }

  if (porChave.size === 0) return { padrao: null, porChave };
  // Mais longos primeiro: "Centro de Saúde de Coqueiros" vence "Centro de Saúde".
  const alternativas = [...porChave.keys()]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { padrao: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternativas.join('|')})(?![\\p{L}\\p{N}])`, 'giu'), porChave };
}

// --- Plugin remark: troca menções em nós de texto por links de perfil -------

interface NoMd {
  type: string;
  value?: string;
  url?: string;
  children?: NoMd[];
}

/** Nós cujo conteúdo não deve ganhar links (já são link, código ou HTML). */
const IGNORAR = new Set(['link', 'linkReference', 'inlineCode', 'code', 'html', 'definition']);

/**
 * Cada entidade vira link só na primeira menção da resposta — o suficiente para
 * navegar, sem transformar o texto num mar de sublinhados.
 */
export function remarkEntidades(dicionario: DicionarioEntidades) {
  return () => (arvore: NoMd) => {
    const { padrao, porChave } = dicionario;
    if (!padrao) return;
    const vistos = new Set<string>();

    const dividir = (texto: string): NoMd[] => {
      const partes: NoMd[] = [];
      let ultimo = 0;
      for (const m of texto.matchAll(padrao)) {
        const chave = m[0].toLowerCase();
        const entidade = porChave.get(chave);
        if (!entidade || vistos.has(chave)) continue;
        vistos.add(chave);
        if (m.index > ultimo) partes.push({ type: 'text', value: texto.slice(ultimo, m.index) });
        partes.push({ type: 'link', url: hrefDePerfil(entidade.tipo, entidade.nome), children: [{ type: 'text', value: m[0] }] });
        ultimo = m.index + m[0].length;
      }
      if (partes.length === 0) return [{ type: 'text', value: texto }];
      if (ultimo < texto.length) partes.push({ type: 'text', value: texto.slice(ultimo) });
      return partes;
    };

    const percorrer = (no: NoMd) => {
      if (!no.children || IGNORAR.has(no.type)) return;
      no.children = no.children.flatMap((filho) => {
        if (filho.type === 'text' && filho.value) return dividir(filho.value);
        percorrer(filho);
        return [filho];
      });
    };
    percorrer(arvore);
  };
}
