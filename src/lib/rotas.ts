import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Cloud,
  Database,
  Network,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/** Roteamento por hash (`#/rede`): sem dependência e compatível com hospedagem estática. */

export type Rota = 'inicio' | 'panorama' | 'temas' | 'rede' | 'causal' | 'acervo';

export interface Modulo {
  rota: Exclude<Rota, 'inicio'>;
  indice: string;
  rotulo: string;
  /** Título da página: `titulo` + `destaque` (em serifa itálica). */
  titulo: string;
  destaque: string;
  descricao: string;
  Icone: LucideIcon;
  /** Se o conteúdo responde aos filtros do recorte. */
  usaFiltros: boolean;
  /** Fora da navegação; continua acessível pelo endereço direto. */
  oculto?: boolean;
}

export const MODULOS: Modulo[] = [
  {
    rota: 'panorama',
    indice: '01',
    rotulo: 'Panorama',
    titulo: 'Panorama',
    destaque: 'do acervo.',
    descricao: 'Quantas notícias, de que assuntos e como o volume evolui mês a mês.',
    Icone: BarChart3,
    usaFiltros: true,
  },
  {
    rota: 'temas',
    indice: '02',
    rotulo: 'Temas',
    titulo: 'O que o bairro',
    destaque: 'comenta e agenda.',
    descricao: 'Os termos mais recorrentes e a agenda de eventos identificada pela IA: tipos, gratuidade e datas.',
    Icone: Cloud,
    usaFiltros: true,
  },
  {
    rota: 'rede',
    indice: '03',
    rotulo: 'Rede',
    titulo: 'Rede de',
    destaque: 'relações.',
    descricao: 'Quem aparece junto com quem nas notícias e o banco de atores, com métricas de centralidade.',
    Icone: Network,
    usaFiltros: true,
  },
  {
    rota: 'causal',
    indice: '05',
    rotulo: 'Causal',
    titulo: 'Mapa',
    destaque: 'causal.',
    descricao: 'A IA lê o recorte e desenha cadeias de causa e efeito no bairro.',
    Icone: Workflow,
    usaFiltros: true,
    oculto: true,
  },
  {
    rota: 'acervo',
    indice: '04',
    rotulo: 'Acervo',
    titulo: 'Acervo',
    destaque: 'completo.',
    descricao: 'Todas as matérias enriquecidas, com categoria, palavras-chave e eventos.',
    Icone: Database,
    usaFiltros: true,
  },
];

/** Módulos exibidos na navegação, na página inicial e no "próximo módulo". */
export const MODULOS_VISIVEIS = MODULOS.filter((m) => !m.oculto);

function rotaDoHash(): Rota {
  let nome = window.location.hash.replace(/^#\/?/, '');
  // Links antigos de páginas que foram incorporadas a outras.
  if (nome === 'atores') nome = 'rede';
  if (nome === 'eventos') nome = 'temas';
  return MODULOS.some((m) => m.rota === nome) ? (nome as Rota) : 'inicio';
}

export function useRota(): [Rota, (rota: Rota) => void] {
  const [rota, setRota] = useState<Rota>(rotaDoHash);

  useEffect(() => {
    const aoMudar = () => {
      setRota(rotaDoHash());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const navegar = useCallback((destino: Rota) => {
    window.location.hash = destino === 'inicio' ? '/' : `/${destino}`;
  }, []);

  return [rota, navegar];
}

export const hrefDe = (rota: Rota) => (rota === 'inicio' ? '#/' : `#/${rota}`);
