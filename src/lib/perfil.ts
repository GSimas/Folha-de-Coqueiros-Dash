import type { AtorComSNA, Noticia } from '@/types';
import { rotularMes } from '@/lib/data';
import { semAcento } from '@/lib/busca';

/** Partes comuns aos perfis de ator e de tema, calculadas sobre o acervo completo. */
interface PerfilBase {
  /** Da mais recente para a mais antiga. */
  noticias: Noticia[];
  /** Notícias por mês, do primeiro ao último mês (meses vazios incluídos). */
  serie: Array<{ mesAno: string; rotulo: string; total: number }>;
  categorias: Array<{ nome: string; total: number }>;
  eventos: Noticia[];
  primeira: Noticia | null;
  ultima: Noticia | null;
}

export interface PerfilAtor extends PerfilBase {
  palavras: Array<{ termo: string; total: number }>;
  /** Atores citados nas mesmas notícias, com o nº de notícias em comum. */
  conexoes: Array<{ ator: AtorComSNA; emComum: number }>;
  /** Posição (1 = maior) entre todos os atores. */
  posicaoCitacoes: number;
  posicaoGrau: number;
}

/** Perfil de um conjunto de notícias (tema, categoria ou tipo de evento). */
export interface PerfilConjunto extends PerfilBase {
  /** Palavras-chave das notícias do conjunto. */
  temas: Array<{ termo: string; total: number }>;
  atores: Array<{ ator: AtorComSNA; emComum: number }>;
  tiposEvento: Array<{ nome: string; total: number }>;
  /** Locais dos eventos do conjunto. */
  locais: Array<{ nome: string; total: number }>;
  /** Fração do acervo coberta pelo conjunto. */
  fracaoAcervo: number;
}

export interface PerfilTema extends PerfilConjunto {
  /** Forma de exibição mais comum do termo nas palavras-chave (ou o termo como veio). */
  nome: string;
  /** Notícias em que o termo é palavra-chave atribuída pela IA. */
  comoPalavraChave: number;
}

const tempo = (n: Noticia) => n.dataConvertida?.getTime() ?? 0;

function contar<T>(itens: T[]): Array<[T, number]> {
  const contagem = new Map<T, number>();
  for (const item of itens) contagem.set(item, (contagem.get(item) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

/** Conta palavras-chave agrupando variantes de acento/caixa sob a forma mais comum. */
function contarTermos(termos: string[]): Array<{ termo: string; total: number }> {
  const grupos = new Map<string, Map<string, number>>();
  for (const termo of termos) {
    const formas = grupos.get(semAcento(termo)) ?? new Map<string, number>();
    formas.set(termo, (formas.get(termo) ?? 0) + 1);
    grupos.set(semAcento(termo), formas);
  }
  return [...grupos.values()]
    .map((formas) => {
      const [[termo]] = [...formas.entries()].sort((a, b) => b[1] - a[1]);
      return { termo, total: [...formas.values()].reduce((s, v) => s + v, 0) };
    })
    .sort((a, b) => b.total - a.total);
}

function mesesEntre(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = inicio.split('-').map(Number);
  const [anoFim, mesFim] = fim.split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    if (++mes > 12) [ano, mes] = [ano + 1, 1];
  }
  return meses;
}

function montarBase(lista: Noticia[]): PerfilBase {
  const noticias = [...lista].sort((a, b) => tempo(b) - tempo(a));
  const datadas = noticias.filter((n) => n.mesAno);
  const porMes = new Map(contar(datadas.map((n) => n.mesAno)));
  const serie =
    datadas.length === 0
      ? []
      : mesesEntre(datadas[datadas.length - 1].mesAno, datadas[0].mesAno).map((mesAno) => ({
          mesAno,
          rotulo: rotularMes(mesAno),
          total: porMes.get(mesAno) ?? 0,
        }));
  return {
    noticias,
    serie,
    categorias: contar(noticias.filter((n) => n.categorizada).map((n) => n.categorias)).map(([nome, total]) => ({
      nome,
      total,
    })),
    eventos: noticias.filter((n) => n.ehEvento),
    primeira: datadas[datadas.length - 1] ?? null,
    ultima: datadas[0] ?? null,
  };
}

/** Atores presentes em um conjunto de notícias, com quantas notícias têm em comum. */
function atoresEm(ids: Set<number>, atores: AtorComSNA[], excluir?: number) {
  return atores
    .filter((a) => a.id !== excluir)
    .map((ator) => ({ ator, emComum: ator.noticias.filter((id) => ids.has(id)).length }))
    .filter((c) => c.emComum > 0)
    .sort((a, b) => b.emComum - a.emComum || b.ator.citacoes - a.ator.citacoes);
}

function montarConjunto(lista: Noticia[], todas: Noticia[], atores: AtorComSNA[], semTema?: string): PerfilConjunto {
  const base = montarBase(lista);
  return {
    ...base,
    temas: contarTermos(lista.flatMap((n) => n.palavrasChaves))
      .filter((t) => semAcento(t.termo) !== semTema)
      .slice(0, 15),
    atores: atoresEm(new Set(lista.map((n) => n.id)), atores),
    tiposEvento: contar(base.eventos.map((n) => n.tipoEvento).filter((t): t is string => !!t)).map(([nome, total]) => ({
      nome,
      total,
    })),
    locais: contar(base.eventos.map((n) => n.localEvento?.trim()).filter((l): l is string => !!l))
      .slice(0, 12)
      .map(([nome, total]) => ({ nome, total })),
    fracaoAcervo: todas.length > 0 ? lista.length / todas.length : 0,
  };
}

export const montarPerfilCategoria = (nome: string, noticias: Noticia[], atores: AtorComSNA[]) =>
  montarConjunto(
    noticias.filter((n) => n.categorizada && n.categorias === nome),
    noticias,
    atores,
  );

export const montarPerfilTipoEvento = (nome: string, noticias: Noticia[], atores: AtorComSNA[]) =>
  montarConjunto(
    noticias.filter((n) => n.ehEvento && n.tipoEvento === nome),
    noticias,
    atores,
  );

export function montarPerfil(ator: AtorComSNA, porId: Map<number, Noticia>, atores: AtorComSNA[]): PerfilAtor {
  const base = montarBase(ator.noticias.map((id) => porId.get(id)).filter((n): n is Noticia => n !== undefined));
  const nome = semAcento(ator.nome);
  const posicao = (valor: (a: AtorComSNA) => number) => 1 + atores.filter((a) => valor(a) > valor(ator)).length;
  return {
    ...base,
    // Sem o próprio nome do ator entre os temas.
    palavras: contarTermos(base.noticias.flatMap((n) => n.palavrasChaves))
      .filter((p) => semAcento(p.termo) !== nome)
      .slice(0, 15),
    conexoes: atoresEm(new Set(ator.noticias), atores, ator.id),
    posicaoCitacoes: posicao((a) => a.citacoes),
    posicaoGrau: posicao((a) => a.grauAbsoluto),
  };
}

/**
 * Perfil de um tema: notícias em que o termo é palavra-chave OU aparece como
 * palavra inteira no título/texto — assim funcionam tanto as palavras-chave
 * quanto os termos da nuvem (que vêm do texto).
 */
export function montarPerfilTema(termo: string, noticias: Noticia[], atores: AtorComSNA[]): PerfilTema {
  const alvo = semAcento(termo.trim());
  const padrao = new RegExp(`(?<![\\p{L}\\p{N}])${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
  const ehChave = (n: Noticia) => n.palavrasChaves.some((p) => semAcento(p) === alvo);
  const lista = noticias.filter((n) => ehChave(n) || padrao.test(semAcento(`${n.titulo} ${n.conteudo}`)));
  const formas = contarTermos(lista.flatMap((n) => n.palavrasChaves).filter((p) => semAcento(p) === alvo));
  return {
    ...montarConjunto(lista, noticias, atores, alvo),
    nome: formas[0]?.termo ?? termo.trim(),
    comoPalavraChave: lista.filter(ehChave).length,
  };
}
