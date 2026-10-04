import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

/**
 * Mantém um elemento montado durante a animação de saída.
 * `montado` controla a renderização; `visivel` liga as classes de estado
 * final — só fica `true` um quadro depois de montar, para a transição de
 * entrada partir do estado inicial.
 */
export function usePresenca(aberto: boolean, duracaoMs = 280) {
  const [montado, setMontado] = useState(aberto);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (aberto) {
      setMontado(true);
      let quadro = requestAnimationFrame(() => {
        quadro = requestAnimationFrame(() => setVisivel(true));
      });
      return () => cancelAnimationFrame(quadro);
    }
    setVisivel(false);
    const timer = setTimeout(() => setMontado(false), duracaoMs);
    return () => clearTimeout(timer);
  }, [aberto, duracaoMs]);

  return { montado, visivel };
}

const movimentoReduzido = () => document.documentElement.dataset.movimento === 'reduzido';

/**
 * Anima um número do valor exibido até `alvo` com desaceleração — de 0 na
 * montagem, do valor anterior quando o alvo muda (ex.: ao filtrar).
 * Salta direto com movimento reduzido.
 */
export function useContagem(alvo: number, duracaoMs = 1100): number {
  const [valor, setValor] = useState(0);
  const atualRef = useRef(0);

  useEffect(() => {
    if (movimentoReduzido()) {
      atualRef.current = alvo;
      setValor(alvo);
      return;
    }
    const origem = atualRef.current;
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      const proximo = Math.round(origem + (alvo - origem) * (1 - Math.pow(1 - t, 4)));
      atualRef.current = proximo;
      setValor(proximo);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracaoMs]);

  return valor;
}

/** Fecha um popover ao clicar fora dele ou ao pressionar Esc. */
export function useDispensar(
  ref: RefObject<HTMLElement | null>,
  aberto: boolean,
  onFechar: () => void,
) {
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (evento: PointerEvent) => {
      if (!ref.current?.contains(evento.target as Node)) onFechar();
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    document.addEventListener('pointerdown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('pointerdown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [ref, aberto, onFechar]);
}

/** Revela o conteúdo ao entrar na viewport (uma vez), com atraso opcional para cascata. */
export function Revelar({
  children,
  atraso = 0,
  className = '',
  como: Tag = 'div',
}: {
  children: ReactNode;
  atraso?: number;
  className?: string;
  como?: 'div' | 'section' | 'li';
}) {
  const ref = useRef<HTMLElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          observador.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-revelar=""
      data-visivel={visivel}
      className={className}
      style={{ '--atraso': `${atraso}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/**
 * Liga a iluminação de hover: grava a posição do cursor em --mx/--my em cada
 * elemento iluminável sob o ponteiro (inclusive os ancestrais, para um botão
 * dentro de um card acender os dois). O seletor espelha o de index.css.
 */
const ILUMINAVEIS = 'button, a, summary, .card, .campo, [data-brilho]';

export function ligarIluminacao() {
  const aoMover = (evento: PointerEvent) => {
    let alvo = (evento.target as Element | null)?.closest?.(ILUMINAVEIS) as HTMLElement | null;
    while (alvo) {
      const caixa = alvo.getBoundingClientRect();
      alvo.style.setProperty('--mx', `${evento.clientX - caixa.left}px`);
      alvo.style.setProperty('--my', `${evento.clientY - caixa.top}px`);
      alvo = alvo.parentElement?.closest(ILUMINAVEIS) as HTMLElement | null;
    }
  };
  document.addEventListener('pointermove', aoMover, { passive: true });
}
