/** Constantes visuais e taxonomias compartilhadas entre os componentes. */
import type { TipoAtor } from '@/types';

/**
 * Cores por tipo de ator. Mantêm as famílias do Pyvis original (azul, vermelho,
 * verde, amarelo), suavizadas para conviver com a paleta azul nos dois temas.
 */
export const COR_POR_TIPO: Record<TipoAtor | 'Desconhecido' | 'Termo', string> = {
  Pessoa: '#5b9be0',
  'Organização': '#e07a6b',
  Local: '#5fbf8f',
  Empresa: '#dfb85a',
  Desconhecido: '#94a3b8',
  Termo: '#6f9fd8',
};

export const COR_REFORCO = '#4fae7f';
export const COR_REDUCAO = '#d96a5f';

/** Paleta categórica: azuis e cianos à frente, acentos quentes para distinguir. */
export const PALETA_GRAFICOS = [
  '#4f8fd6',
  '#6fc3d9',
  '#8a9df0',
  '#57b7a0',
  '#e0b25c',
  '#d9806b',
  '#b48ad8',
  '#7fa36b',
  '#9aa8b8',
  '#d97a9a',
  '#3f6fa8',
];

export const CATEGORIAS_VALIDAS = [
  'Comunidade e Sociedade',
  'Infraestrutura e Mobilidade',
  'Educação',
  'Economia e Negócios',
  'Cultura, Eventos e Gastronomia',
  'Meio Ambiente',
  'Saúde e Bem-estar',
  'Segurança',
  'Política e Gestão Pública',
  'Obituário',
  'Esportes',
];

export const TIPOS_EVENTO_VALIDOS = [
  'Reuniões e Gestão Comunitária',
  'Feiras e Mercados',
  'Saúde e Meio Ambiente',
  'Artes, Cultura e Entretenimento',
  'Outros / Institucional',
  'Festas e Celebrações',
  'Esportes e Lazer',
  'Educação, Palestras e Oficinas',
];

/** Devolve uma cor estável para uma categoria arbitrária. */
/** Cor estável por tipo de evento (a mesma no painel e no perfil). */
export function corDoTipoEvento(tipo: string, indice = 0): string {
  const posicao = TIPOS_EVENTO_VALIDOS.indexOf(tipo);
  return PALETA_GRAFICOS[(posicao >= 0 ? posicao : indice) % PALETA_GRAFICOS.length];
}

export function corDaCategoria(categoria: string, indice: number): string {
  const posicao = CATEGORIAS_VALIDAS.indexOf(categoria);
  return PALETA_GRAFICOS[(posicao >= 0 ? posicao : indice) % PALETA_GRAFICOS.length];
}

/** Formata números grandes de forma compacta (1.2 mil). */
export const formatarNumero = (valor: number): string =>
  new Intl.NumberFormat('pt-BR').format(valor);
