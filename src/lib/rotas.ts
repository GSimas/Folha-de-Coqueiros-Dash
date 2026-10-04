import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Cloud,
  Database,
  Network,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/** Roteamento por hash (`#/rede`): sem dependência e compatível com hospedagem estática. */

export type Rota = 'inicio' | 'panorama' | 'temas' | 'eventos' | 'rede' | 'causal' | 'atores' | 'acervo';

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
    destaque: 'comenta.',
    descricao: 'Os termos mais recorrentes nas matérias. Clique em um para filtrar o recorte.',
    Icone: Cloud,
    usaFiltros: true,
  },
  {
    rota: 'eventos',
    indice: '03',
    rotulo: 'Eventos',
    titulo: 'Agenda do',
    destaque: 'território.',
    descricao: 'Eventos identificados pela IA: tipos, gratuidade e a agenda completa.',
    Icone: CalendarDays,
    usaFiltros: true,
  },
  {
    rota: 'rede',
    indice: '04',
    rotulo: 'Rede',
    titulo: 'Rede de',
    destaque: 'relações.',
    descricao: 'Quem aparece junto com quem nas notícias — atores ou palavras-chave.',
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
  },
  {
    rota: 'atores',
    indice: '06',
    rotulo: 'Atores',
    titulo: 'Banco de',
    destaque: 'atores.',
    descricao: 'Pessoas, organizações, locais e empresas, com métricas de centralidade.',
    Icone: Users,
    usaFiltros: false,
  },
  {
    rota: 'acervo',
    indice: '07',
    rotulo: 'Acervo',
    titulo: 'Acervo',
    destaque: 'completo.',
    descricao: 'Todas as matérias enriquecidas, com categoria, palavras-chave e eventos.',
    Icone: Database,
    usaFiltros: true,
  },
];

function rotaDoHash(): Rota {
  const nome = window.location.hash.replace(/^#\/?/, '');
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
