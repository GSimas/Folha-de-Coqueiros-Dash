import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresenca } from '@/lib/motion';

/** Painel flutuante ancorado a um botão. Portal: escapa do overflow de tabelas e cards. */
export default function Popover({
  ancora,
  aberto,
  onFechar,
  children,
  className = 'w-72 p-3',
  rotulo,
}: {
  ancora: HTMLElement | null;
  aberto: boolean;
  onFechar: () => void;
  children: ReactNode;
  /** Largura e espaçamento do painel. */
  className?: string;
  /** Nome acessível do painel. */
  rotulo: string;
}) {
  const { montado, visivel } = usePresenca(aberto, 180);
  const painelRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });

  const posicionar = useCallback(() => {
    if (!ancora) return;
    const caixa = ancora.getBoundingClientRect();
    const largura = painelRef.current?.offsetWidth ?? 280;
    const left = Math.min(Math.max(8, caixa.left), window.innerWidth - largura - 8);
    setPosicao({ top: caixa.bottom + 6, left });
  }, [ancora]);

  useLayoutEffect(() => {
    if (montado) posicionar();
  }, [montado, posicionar]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (evento: PointerEvent) => {
      const alvo = evento.target as Node;
      if (!painelRef.current?.contains(alvo) && !ancora?.contains(alvo)) onFechar();
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    const aoRolar = () => requestAnimationFrame(posicionar);
    document.addEventListener('pointerdown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      document.removeEventListener('pointerdown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [aberto, ancora, onFechar, posicionar]);

  if (!montado) return null;
  return createPortal(
    <div
      ref={painelRef}
      role="dialog"
      aria-label={rotulo}
      style={{ top: posicao.top, left: posicao.left }}
      className={`fixed z-[70] ${className} origin-top-left border border-line bg-elevated text-left normal-case tracking-normal shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]
                  transition duration-200 ease-suave ${visivel ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.97] opacity-0'}`}
    >
      {children}
    </div>,
    document.body,
  );
}
