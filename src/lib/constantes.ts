/** Constantes visuais e taxonomias compartilhadas entre os componentes. */
import type { TipoAtor } from '@/types';

/** Cores canônicas por tipo de ator — paridade com a versão Pyvis. */
export const COR_POR_TIPO: Record<TipoAtor | 'Desconhecido' | 'Termo', string> = {
  Pessoa: '#3498db',
  'Organização': '#e74c3c',
  Local: '#2ecc71',
  Empresa: '#f1c40f',
  Desconhecido: '#95a5a6',
  Termo: '#1a5276',
};

export const COR_REFORCO = '#27ae60';
export const COR_REDUCAO = '#c0392b';

/** Paleta sequencial usada nos gráficos de categoria. */
export const PALETA_GRAFICOS = [
  '#1a5276',
  '#2e86c1',
  '#48c9b0',
  '#f5b041',
  '#e74c3c',
  '#8e44ad',
  '#16a085',
  '#d35400',
  '#5d6d7e',
  '#c0392b',
  '#27ae60',
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
export function corDaCategoria(categoria: string, indice: number): string {
  const posicao = CATEGORIAS_VALIDAS.indexOf(categoria);
  return PALETA_GRAFICOS[(posicao >= 0 ? posicao : indice) % PALETA_GRAFICOS.length];
}

/** Formata números grandes de forma compacta (1.2 mil). */
export const formatarNumero = (valor: number): string =>
  new Intl.NumberFormat('pt-BR').format(valor);
