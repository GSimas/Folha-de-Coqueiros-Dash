import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Preferências de interface (tema, fonte, contraste, movimento).
 *
 * O estado vive nos atributos `data-*` de <html>, que o CSS consome. O script
 * inline de index.html os aplica antes da primeira pintura — e define os
 * padrões quando não há escolha salva —, então aqui apenas os lemos ao iniciar.
 */

export type Tema = 'claro' | 'escuro';
export type TamanhoFonte = 'p' | 'm' | 'g';

export interface Preferencias {
  tema: Tema;
  fonte: TamanhoFonte;
  altoContraste: boolean;
  reduzirMovimento: boolean;
}

const CHAVE = 'folha:preferencias';
const ESCALA_FONTE: Record<TamanhoFonte, number> = { p: 14 / 16, m: 1, g: 18 / 16 };

function lerDoDocumento(): Preferencias {
  const d = document.documentElement.dataset;
  return {
    tema: d.tema === 'claro' ? 'claro' : 'escuro',
    fonte: d.fonte === 'p' || d.fonte === 'g' ? d.fonte : 'm',
    altoContraste: d.contraste === 'alto',
    reduzirMovimento: d.movimento === 'reduzido',
  };
}

function aplicar(p: Preferencias) {
  const d = document.documentElement.dataset;
  d.tema = p.tema;
  d.fonte = p.fonte;
  d.contraste = p.altoContraste ? 'alto' : 'normal';
  d.movimento = p.reduzirMovimento ? 'reduzido' : 'normal';
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Armazenamento indisponível (aba privada): a escolha vale só para esta sessão.
  }
}

/**
 * Cores resolvidas dos tokens CSS, para bibliotecas que desenham em canvas/SVG
 * (vis-network, Recharts, React Flow) e não enxergam variáveis CSS.
 */
export interface CoresGrafico {
  escuro: boolean;
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  signal: string;
  /** Multiplicador do tamanho de fonte escolhido (1 = médio). */
  escala: number;
}

function lerCores(p: Preferencias): CoresGrafico {
  const estilo = getComputedStyle(document.documentElement);
  // Sintaxe com vírgulas: o parser de cor do vis-network não aceita `rgb(r g b)`.
  const cor = (nome: string) =>
    `rgb(${estilo.getPropertyValue(`--${nome}`).trim().split(/\s+/).join(', ')})`;
  return {
    escuro: p.tema === 'escuro',
    canvas: cor('canvas'),
    surface: cor('surface'),
    elevated: cor('elevated'),
    ink: cor('ink'),
    muted: cor('muted'),
    faint: cor('faint'),
    line: cor('line'),
    signal: cor('signal'),
    escala: ESCALA_FONTE[p.fonte],
  };
}

interface ContextoPreferencias {
  preferencias: Preferencias;
  atualizar: (parcial: Partial<Preferencias>) => void;
  cores: CoresGrafico;
}

const Contexto = createContext<ContextoPreferencias | null>(null);

export function PreferenciasProvider({ children }: { children: ReactNode }) {
  const [preferencias, setPreferencias] = useState(lerDoDocumento);

  const atualizar = useCallback((parcial: Partial<Preferencias>) => {
    setPreferencias((atual) => {
      const proximas = { ...atual, ...parcial };
      // Aplicado já aqui (e não num efeito) para que `cores`, recalculado no
      // mesmo render, leia os tokens do tema novo.
      aplicar(proximas);
      return proximas;
    });
  }, []);

  const cores = useMemo(() => lerCores(preferencias), [preferencias]);

  const valor = useMemo(
    () => ({ preferencias, atualizar, cores }),
    [preferencias, atualizar, cores],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePreferencias(): ContextoPreferencias {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('usePreferencias precisa de <PreferenciasProvider>');
  return contexto;
}

export const useCoresGrafico = () => usePreferencias().cores;

/** Props comuns do `<Tooltip>` do Recharts no tema atual. */
export const tooltipGrafico = (c: CoresGrafico) => ({
  contentStyle: {
    background: c.elevated,
    border: `1px solid ${c.line}`,
    borderRadius: 3,
    fontSize: 12 * c.escala,
    color: c.ink,
    boxShadow: '0 16px 40px -12px rgb(0 0 0 / 0.4)',
  },
  labelStyle: { color: c.ink, fontWeight: 600 },
  itemStyle: { color: c.muted },
  cursor: { fill: c.signal, fillOpacity: 0.08 },
});

/** Props comuns dos eixos do Recharts no tema atual. */
export const eixoGrafico = (c: CoresGrafico, tamanho = 11) => ({
  tick: { fontSize: tamanho * c.escala, fill: c.muted, fontFamily: 'DM Mono, monospace' },
  axisLine: { stroke: c.line },
  tickLine: false,
});
