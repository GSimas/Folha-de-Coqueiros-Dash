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

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal acessível: com ele aberto, Tab/Shift+Tab circulam só pelos
 * seus controles; ao fechar, o foco volta ao elemento que o abriu.
 * Foco fora do diálogo (ex.: popover em portal) não é interceptado.
 */
export function useFocoPreso(ref: RefObject<HTMLElement | null>, ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focaveisDe = (dialogo: HTMLElement) =>
      [...dialogo.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(
        (el) => el.getClientRects().length > 0 && !el.closest('[inert]'),
      );
    // Se o próprio diálogo não levou o foco para dentro (cada um escolhe o seu
    // campo inicial), leva para o primeiro controle depois da animação de entrada.
    const timer = setTimeout(() => {
      const dialogo = ref.current;
      if (dialogo && !dialogo.contains(document.activeElement)) focaveisDe(dialogo)[0]?.focus();
    }, 400);
    const aoTeclar = (evento: KeyboardEvent) => {
      const dialogo = ref.current;
      if (evento.key !== 'Tab' || !dialogo || !dialogo.contains(document.activeElement)) return;
      const focaveis = focaveisDe(dialogo);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', aoTeclar);
      if (anterior?.isConnected) anterior.focus({ preventScroll: true });
    };
  }, [ativo, ref]);
}
