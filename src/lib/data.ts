/**
 * Carregamento e normalização dos datasets estáticos.
 *
 * O acervo bruto é heterogêneo (ver comentário em `types/index.ts`), então tudo
 * que entra na aplicação passa obrigatoriamente por `normalizarNoticia` /
 * `normalizarAtor`.
 */
import type {
  Ator,
  AtorRaw,
  Noticia,
  NoticiaRaw,
  TipoAtor,
} from '@/types';
import { TIPOS_ATOR } from '@/types';

/** Sentinelas que o pipeline Python usa para representar ausência de valor. */
const VALORES_NULOS = new Set(['', 'none', 'null', 'n/a', 'nan', 'nao informado']);

/** Converte `true` / `"True"` / `"1"` em booleano; qualquer outra coisa é `false`. */
export function paraBooleano(valor: unknown): boolean {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor !== 0;
  if (typeof valor === 'string') {
    const v = valor.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'sim';
  }
  return false;
}

/** Devolve a string limpa, ou `null` quando o valor é um dos sentinelas de ausência. */
export function paraTextoOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return VALORES_NULOS.has(texto.toLowerCase()) ? null : texto;
}

/** Converte uma data `DD/MM/AAAA` em `Date`; `null` se inválida. */
export function paraData(valor: unknown): Date | null {
  const texto = paraTextoOuNulo(valor);
  if (!texto) return null;

  const partes = texto.split('/');
  if (partes.length !== 3) return null;

  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const ano = Number(partes[2]);
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const data = new Date(ano, mes - 1, dia);
  // Rejeita rolagens como 31/02 → 03/03
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return data;
}

/** Formata um `Date` como `AAAA-MM-DD` (formato aceito por `<input type="date">`). */
export function paraISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Formata um `Date` como `DD/MM/AAAA`, padrão de exibição do projeto. */
export function paraBR(data: Date | null): string {
  if (!data) return '—';
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${dia}/${mes}/${data.getFullYear()}`;
}

const CATEGORIA_VAZIA = 'Não categorizado';

export function normalizarNoticia(raw: NoticiaRaw, indice: number): Noticia {
  const conteudo = paraTextoOuNulo(raw['Conteúdo']) ?? '';
  const dataConvertida = paraData(raw.Data);
  const categoriaBruta = paraTextoOuNulo(raw.Categorias);
  const categorias = categoriaBruta ?? CATEGORIA_VAZIA;

  const palavrasBrutas = paraTextoOuNulo(raw['Palavras-Chaves']);
  const palavrasChaves = palavrasBrutas
    ? palavrasBrutas
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    : [];

  const idBruto = Number(raw.ID);

  return {
    id: Number.isFinite(idBruto) ? idBruto : indice,
    titulo: paraTextoOuNulo(raw['Título']) ?? 'Sem título',
    data: paraTextoOuNulo(raw.Data) ?? '',
    dataConvertida,
    mesAno: dataConvertida
      ? `${dataConvertida.getFullYear()}-${String(dataConvertida.getMonth() + 1).padStart(2, '0')}`
      : '',
    url: paraTextoOuNulo(raw.URL) ?? '',
    conteudo,
    categorias,
    palavrasChaves,
    categorizada: categorias !== CATEGORIA_VAZIA,
    tamanhoTexto: conteudo ? conteudo.split(/\s+/).filter(Boolean).length : 0,
    ehEvento: paraBooleano(raw['É Evento']),
    tipoEvento: paraTextoOuNulo(raw['Tipo do Evento']),
    dataEvento: paraTextoOuNulo(raw['Data do Evento']),
    dataFimEvento: paraTextoOuNulo(raw['Data Fim Evento']),
    localEvento: paraTextoOuNulo(raw['Local do Evento']),
    horarioEvento: paraTextoOuNulo(raw['Horário do Evento']),
    ehPago: paraBooleano(raw['É Pago']),
    valorEvento: paraTextoOuNulo(raw['Valor do Evento']),
  };
}

function normalizarTipoAtor(valor: unknown): TipoAtor | 'Desconhecido' {
  const texto = paraTextoOuNulo(valor);
  if (!texto) return 'Desconhecido';
  const encontrado = TIPOS_ATOR.find((t) => t.toLowerCase() === texto.toLowerCase());
  return encontrado ?? 'Desconhecido';
}

export function normalizarAtor(raw: AtorRaw, indice: number): Ator {
  const idBruto = Number(raw.ID_Ator);
  const noticias = (raw.Noticias ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));

  return {
    id: Number.isFinite(idBruto) ? idBruto : indice,
    nome: paraTextoOuNulo(raw.Nome) ?? `Ator ${indice}`,
    tipo: normalizarTipoAtor(raw.Tipo),
    descricao: paraTextoOuNulo(raw.Descricao) ?? 'Sem descrição',
    noticias,
  };
}

async function buscarJSON<T>(url: string): Promise<T> {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar ${url} (HTTP ${resposta.status})`);
  }
  return (await resposta.json()) as T;
}

export interface Acervo {
  noticias: Noticia[];
  atores: Ator[];
}

/** Carrega e normaliza os dois datasets em paralelo. */
export async function carregarAcervo(): Promise<Acervo> {
  const [noticiasRaw, atoresRaw] = await Promise.all([
    buscarJSON<NoticiaRaw[]>(`${import.meta.env.BASE_URL}data/noticias.json`),
    buscarJSON<AtorRaw[]>(`${import.meta.env.BASE_URL}data/atores.json`),
  ]);

  return {
    noticias: noticiasRaw.map(normalizarNoticia),
    atores: atoresRaw.map(normalizarAtor),
  };
}

/** Stopwords usadas pela nuvem de palavras (espelha a lista do app Streamlit). */
export const STOPWORDS = new Set([
  'o', 'a', 'de', 'que', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma',
  'os', 'no', 'se', 'na', 'as', 'por', 'dos', 'mais', 'este', 'fazer', 'nesta',
  'também', 'sobre', 'como', 'ao', 'às', 'à', 'foi', 'ser', 'está', 'estão',
  'são', 'neste', 'ainda', 'mesmo', 'muito', 'todos', 'todas', 'entre', 'esta',
  'essa', 'esse', 'isso', 'aqui', 'tem', 'ter', 'vai', 'vão', 'ele', 'ela',
  'eles', 'elas', 'seu', 'sua', 'seus', 'suas', 'pela', 'pelo', 'pelas', 'pelos',
  'será', 'serão', 'já', 'lá', 'nos',
]);

/** Conta as palavras mais frequentes de um conjunto de textos, ignorando stopwords. */
export function contarPalavras(textos: string[], limite = 100): Array<[string, number]> {
  const contagem = new Map<string, number>();

  for (const texto of textos) {
    if (!texto) continue;
    const limpo = texto.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
    for (const palavra of limpo.split(/\s+/)) {
      if (palavra.length <= 3 || STOPWORDS.has(palavra)) continue;
      contagem.set(palavra, (contagem.get(palavra) ?? 0) + 1);
    }
  }

  return [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite);
}
