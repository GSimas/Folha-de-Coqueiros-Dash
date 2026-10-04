import { useEffect, useRef } from 'react';
import { usePreferencias } from '@/lib/preferencias';

/**
 * Fundo animado presente em todas as páginas: uma rede de pontos que deriva
 * devagar e se conecta por proximidade — eco visual da análise de redes do
 * painel. O cursor atrai levemente os nós próximos e acende as ligações.
 *
 * Canvas único, fixo atrás do conteúdo. Pausa com a aba oculta e desenha um
 * quadro estático quando "Reduzir movimento" está ativo.
 */

interface No {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  fase: number;
}

const DISTANCIA_LIGACAO = 150;
const RAIO_CURSOR = 200;

/** `rgb(r, g, b)` → `rgba(r, g, b, a)`. */
const comAlfa = (rgb: string, alfa: number) =>
  rgb.replace('rgb(', 'rgba(').replace(')', `, ${alfa.toFixed(3)})`);

export default function FundoAnimado() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { cores, preferencias } = usePreferencias();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const estatico = preferencias.reduzirMovimento;
    // Linhas mais discretas no claro e no alto contraste (o fundo não pode competir com o texto).
    const intensidade = (cores.escuro ? 1 : 0.65) * (preferencias.altoContraste ? 0.5 : 1);

    let largura = 0;
    let altura = 0;
    let nos: No[] = [];
    const cursor = { x: -9999, y: -9999, ativo: false };

    const criarNos = () => {
      const quantidade = Math.round(Math.min(95, Math.max(32, (largura * altura) / 21000)));
      nos = Array.from({ length: quantidade }, () => {
        const angulo = Math.random() * Math.PI * 2;
        const velocidade = 0.05 + Math.random() * 0.14;
        return {
          x: Math.random() * largura,
          y: Math.random() * altura,
          vx: Math.cos(angulo) * velocidade,
          vy: Math.sin(angulo) * velocidade,
          r: 0.7 + Math.random() * 1.3,
          fase: Math.random() * Math.PI * 2,
        };
      });
    };

    const redimensionar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = window.innerWidth;
      altura = window.innerHeight;
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(altura * dpr);
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${altura}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      criarNos();
    };

    const desenhar = (tempo: number) => {
      ctx.clearRect(0, 0, largura, altura);

      for (const no of nos) {
        if (!estatico) {
          // Atração suave em direção ao cursor
          if (cursor.ativo) {
            const dx = cursor.x - no.x;
            const dy = cursor.y - no.y;
            const d = Math.hypot(dx, dy);
            if (d < RAIO_CURSOR && d > 1) {
              no.vx += (dx / d) * 0.004;
              no.vy += (dy / d) * 0.004;
            }
          }
          // Amortece para a velocidade não crescer sem limite
          const v = Math.hypot(no.vx, no.vy);
          if (v > 0.3) {
            no.vx *= 0.97;
            no.vy *= 0.97;
          }
          no.x += no.vx;
          no.y += no.vy;
          // Atravessa as bordas (sem ricochete visível)
          if (no.x < -20) no.x = largura + 20;
          if (no.x > largura + 20) no.x = -20;
          if (no.y < -20) no.y = altura + 20;
          if (no.y > altura + 20) no.y = -20;
        }
      }

      // Ligações por proximidade
      ctx.lineWidth = 1;
      for (let i = 0; i < nos.length; i++) {
        const a = nos[i];
        for (let j = i + 1; j < nos.length; j++) {
          const b = nos[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.abs(dx) > DISTANCIA_LIGACAO || Math.abs(dy) > DISTANCIA_LIGACAO) continue;
          const d = Math.hypot(dx, dy);
          if (d > DISTANCIA_LIGACAO) continue;
          ctx.strokeStyle = comAlfa(cores.signal, (1 - d / DISTANCIA_LIGACAO) * 0.16 * intensidade);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Ligações ao cursor, mais vivas
      if (cursor.ativo) {
        for (const no of nos) {
          const d = Math.hypot(cursor.x - no.x, cursor.y - no.y);
          if (d > RAIO_CURSOR) continue;
          ctx.strokeStyle = comAlfa(cores.signal, (1 - d / RAIO_CURSOR) * 0.32 * intensidade);
          ctx.beginPath();
          ctx.moveTo(cursor.x, cursor.y);
          ctx.lineTo(no.x, no.y);
          ctx.stroke();
        }
      }

      // Nós com pulsação lenta de brilho
      for (const no of nos) {
        const pulso = estatico ? 0.6 : 0.45 + 0.55 * Math.sin(tempo / 1400 + no.fase) ** 2;
        ctx.fillStyle = comAlfa(cores.signal, (0.25 + pulso * 0.5) * intensidade);
        ctx.beginPath();
        ctx.arc(no.x, no.y, no.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let quadro = 0;
    const laco = (tempo: number) => {
      desenhar(tempo);
      quadro = requestAnimationFrame(laco);
    };

    const aoMover = (evento: PointerEvent) => {
      cursor.x = evento.clientX;
      cursor.y = evento.clientY;
      cursor.ativo = evento.pointerType === 'mouse';
    };
    const aoSair = () => {
      cursor.ativo = false;
    };
    const aoMudarVisibilidade = () => {
      cancelAnimationFrame(quadro);
      if (!document.hidden && !estatico) quadro = requestAnimationFrame(laco);
    };
    const aoRedimensionar = () => {
      redimensionar();
      if (estatico) desenhar(0);
    };

    redimensionar();
    if (estatico) {
      desenhar(0);
    } else {
      quadro = requestAnimationFrame(laco);
      window.addEventListener('pointermove', aoMover, { passive: true });
      document.addEventListener('pointerleave', aoSair);
      document.addEventListener('visibilitychange', aoMudarVisibilidade);
    }
    window.addEventListener('resize', aoRedimensionar);

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('pointermove', aoMover);
      document.removeEventListener('pointerleave', aoSair);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('resize', aoRedimensionar);
    };
  }, [cores.signal, cores.escuro, preferencias.reduzirMovimento, preferencias.altoContraste]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 animate-fade-in [animation-duration:1.6s]"
    />
  );
}
