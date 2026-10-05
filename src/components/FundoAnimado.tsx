import { useEffect, useRef } from 'react';
import { usePreferencias } from '@/lib/preferencias';

/**
 * Fundo animado presente em todas as páginas: a orla de Coqueiros em traço
 * fino. Coqueiros balançam nos cantos, a baía ondula até o horizonte com a
 * Ilha e a Ponte Hercílio Luz ao fundo, gaivotas cruzam o céu. Mover o cursor
 * sopra vento nas folhas.
 *
 * Canvas único, fixo atrás do conteúdo. Pausa com a aba oculta e desenha um
 * quadro estático quando "Reduzir movimento" está ativo.
 */

interface Folha {
  angulo: number;
  comprimento: number;
  fase: number;
}

interface Coqueiro {
  x: number;
  altura: number;
  inclinacao: number;
  fase: number;
  folhas: Folha[];
}

interface Gaivota {
  x: number;
  y: number;
  tamanho: number;
  velocidade: number;
  fase: number;
}

interface Estrela {
  x: number;
  y: number;
  r: number;
  fase: number;
}

/** Direções das folhas na copa (radianos, tela: negativo = para cima). */
const ANGULOS_FOLHAS = [-2.95, -2.6, -2.2, -1.8, -1.35, -0.95, -0.55, -0.2, 0.25, 2.9];

/** `rgb(r, g, b)` → `rgba(r, g, b, a)`. */
const comAlfa = (rgb: string, alfa: number) =>
  rgb.replace('rgb(', 'rgba(').replace(')', `, ${Math.max(0, alfa).toFixed(3)})`);

/** Aleatório com semente: o cenário não se embaralha a cada redimensionamento. */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Ponto e tangente de uma curva quadrática em `u`. */
function quadratica(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, u: number) {
  const v = 1 - u;
  return {
    x: v * v * x0 + 2 * v * u * cx + u * u * x1,
    y: v * v * y0 + 2 * v * u * cy + u * u * y1,
    tx: 2 * v * (cx - x0) + 2 * u * (x1 - cx),
    ty: 2 * v * (cy - y0) + 2 * u * (y1 - cy),
  };
}

export default function FundoAnimado() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { cores, preferencias } = usePreferencias();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const estatico = preferencias.reduzirMovimento;
    // Traço mais discreto no claro e no alto contraste (o fundo não pode competir com o texto).
    const intensidade = (cores.escuro ? 1 : 0.7) * (preferencias.altoContraste ? 0.5 : 1);
    const traco = (alfa: number) => comAlfa(cores.signal, alfa * intensidade);

    let largura = 0;
    let altura = 0;
    let escala = 1;
    let horizonte = 0;
    let coqueiros: Coqueiro[] = [];
    let gaivotas: Gaivota[] = [];
    let estrelas: Estrela[] = [];
    let ilha: { x: number; y: number }[] = [];
    let ponte = { x: 0, vao: 0 };
    let astro = { x: 0, y: 0, r: 0 };
    // Vento soprado pelo cursor: -1 (para a esquerda) a 1 (para a direita).
    let vento = 0;
    let ultimoX: number | null = null;

    const montar = () => {
      const r = aleatorio(7);
      const estreito = largura < 700;
      escala = Math.min(Math.max(Math.min(largura / 1400, altura / 900), 0.55), 1.25);
      horizonte = altura * (estreito ? 0.84 : 0.8);

      const posicoes = estreito
        ? [
            { x: -0.03, h: 0.4, inc: 0.2 },
            { x: 1.03, h: 0.34, inc: -0.22 },
          ]
        : [
            { x: 0.03, h: 0.56, inc: 0.12 },
            { x: 0.11, h: 0.38, inc: 0.24 },
            { x: 0.97, h: 0.5, inc: -0.14 },
            { x: 0.895, h: 0.33, inc: -0.26 },
          ];
      coqueiros = posicoes.map((p) => ({
        x: p.x * largura,
        altura: p.h * altura,
        inclinacao: p.inc,
        fase: r() * Math.PI * 2,
        folhas: ANGULOS_FOLHAS.map((a) => ({
          angulo: a + (r() - 0.5) * 0.14,
          comprimento: 0.85 + r() * 0.3,
          fase: r() * Math.PI * 2,
        })),
      }));

      // A ponte liga o continente (esquerda) à Ilha (direita), ao fundo.
      ponte = { x: largura * (estreito ? 0.5 : 0.52), vao: Math.min(largura * (estreito ? 0.28 : 0.18), 260) };
      const inicioIlha = ponte.x + ponte.vao * 0.8;
      ilha = [];
      for (let x = inicioIlha; x <= largura + 12; x += 6) {
        const p = x / largura;
        const subida = Math.min(1, (x - inicioIlha) / (largura * 0.08));
        const morroDaCruz = Math.exp(-(((x - largura * 0.8) / (largura * 0.07)) ** 2));
        const relevo = 0.55 + 0.25 * Math.sin(p * 9 + 1.3) + 0.2 * Math.sin(p * 23);
        ilha.push({ x, y: horizonte - altura * subida * (0.03 * relevo + 0.035 * morroDaCruz) });
      }

      astro = { x: largura * (estreito ? 0.78 : 0.7), y: altura * 0.24, r: 26 * escala };

      gaivotas = Array.from({ length: estreito ? 3 : 5 }, () => ({
        x: r() * largura,
        y: altura * (0.22 + r() * 0.35),
        tamanho: (7 + r() * 6) * escala,
        velocidade: 0.008 + r() * 0.012,
        fase: r() * Math.PI * 2,
      }));

      estrelas = Array.from({ length: Math.round(Math.min(70, (largura * horizonte) / 18000)) }, () => ({
        x: r() * largura,
        y: r() * horizonte * 0.85,
        r: 0.5 + r() * 0.9,
        fase: r() * Math.PI * 2,
      }));
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
      montar();
    };

    const desenharCeu = (t: number) => {
      if (cores.escuro) {
        for (const e of estrelas) {
          const brilho = estatico ? 0.5 : 0.3 + 0.7 * Math.sin(t / 1800 + e.fase) ** 2;
          ctx.fillStyle = traco(0.18 + brilho * 0.35);
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Lua no escuro, sol no claro: o mesmo disco.
      const halo = ctx.createRadialGradient(astro.x, astro.y, astro.r * 0.6, astro.x, astro.y, astro.r * 4);
      halo.addColorStop(0, traco(0.1));
      halo.addColorStop(1, traco(0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(astro.x, astro.y, astro.r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = traco(0.06);
      ctx.strokeStyle = traco(0.3);
      ctx.beginPath();
      ctx.arc(astro.x, astro.y, astro.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    const desenharIlhaEPonte = () => {
      // Ilha de Santa Catarina no horizonte
      ctx.beginPath();
      ctx.moveTo(ilha[0].x, horizonte);
      for (const p of ilha) ctx.lineTo(p.x, p.y);
      ctx.lineTo(largura + 12, horizonte);
      ctx.fillStyle = traco(0.04);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ilha[0].x, horizonte);
      for (const p of ilha) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = traco(0.2);
      ctx.stroke();

      // Ponte Hercílio Luz: a corrente desce até o tabuleiro no meio do vão.
      const { x: cx, vao: L } = ponte;
      const tabuleiro = horizonte - L * 0.06;
      const topo = tabuleiro - L * 0.32;
      const meio = L / 2;
      ctx.beginPath();
      // Tabuleiro e viga
      ctx.moveTo(cx - L * 1.05, tabuleiro);
      ctx.lineTo(cx + L * 1.05, tabuleiro);
      ctx.moveTo(cx - L * 1.05, tabuleiro + L * 0.015);
      ctx.lineTo(cx + L * 1.05, tabuleiro + L * 0.015);
      // Torres
      for (const lado of [-1, 1]) {
        const xt = cx + lado * meio;
        const base = L * 0.016;
        const alto = L * 0.008;
        ctx.moveTo(xt - base, horizonte);
        ctx.lineTo(xt - alto, topo);
        ctx.lineTo(xt + alto, topo);
        ctx.lineTo(xt + base, horizonte);
        ctx.moveTo(xt - alto, topo + L * 0.04);
        ctx.lineTo(xt + base, tabuleiro);
        ctx.moveTo(xt + alto, topo + L * 0.04);
        ctx.lineTo(xt - base, tabuleiro);
      }
      // Corrente do vão central e pendurais
      const correnteY = (x: number) => tabuleiro - L * 0.012 - (tabuleiro - L * 0.012 - topo) * ((x - cx) / meio) ** 2;
      ctx.moveTo(cx - meio, topo);
      for (let i = 1; i <= 32; i++) {
        const x = cx - meio + (L * i) / 32;
        ctx.lineTo(x, correnteY(x));
      }
      for (let i = 1; i < 20; i++) {
        const x = cx - meio + (L * i) / 20;
        ctx.moveTo(x, correnteY(x));
        ctx.lineTo(x, tabuleiro);
      }
      // Vãos laterais até as ancoragens
      for (const lado of [-1, 1]) {
        const xt = cx + lado * meio;
        const ancoragem = cx + lado * L * 0.92;
        const y = (p: number) => tabuleiro - (tabuleiro - topo) * (1 - p) ** 2;
        ctx.moveTo(xt, topo);
        for (let i = 1; i <= 12; i++) ctx.lineTo(xt + ((ancoragem - xt) * i) / 12, y(i / 12));
        for (let i = 1; i < 6; i++) {
          const p = i / 6;
          ctx.moveTo(xt + (ancoragem - xt) * p, y(p));
          ctx.lineTo(xt + (ancoragem - xt) * p, tabuleiro);
        }
        // Pilares dos acessos
        for (let k = 0.62; k <= 1.06; k += 0.11) {
          ctx.moveTo(cx + lado * L * k, tabuleiro + L * 0.015);
          ctx.lineTo(cx + lado * L * k, horizonte);
        }
      }
      ctx.strokeStyle = traco(0.24);
      ctx.stroke();
    };

    const desenharBaia = (t: number) => {
      ctx.strokeStyle = traco(0.22);
      ctx.beginPath();
      ctx.moveTo(0, horizonte);
      ctx.lineTo(largura, horizonte);
      ctx.stroke();

      const linhas = 7;
      for (let i = 0; i < linhas; i++) {
        const prof = (i + 0.7) / linhas;
        const y0 = horizonte + (altura - horizonte) * prof ** 1.5;
        const amp = escala * (0.8 + i * 0.75);
        const comp = 70 + i * 45;
        const vel = estatico ? 0 : 0.00035 * (1 + i * 0.35);
        ctx.strokeStyle = traco(0.08 + 0.1 * prof);
        ctx.beginPath();
        for (let x = 0; x <= largura + 12; x += 12) {
          const y = y0 + Math.sin(x / comp + t * vel + i * 1.7) * amp + Math.sin(x / (comp * 0.37) - t * vel * 1.6) * amp * 0.35;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Reflexo do astro na água
      ctx.strokeStyle = traco(0.26);
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const y = horizonte + 5 + j * j * 1.6 * escala + j * 3;
        const meia = (16 - j * 1.2 + (estatico ? 0 : Math.sin(t / 500 + j * 1.9) * 5)) * escala;
        const deriva = estatico ? 0 : Math.sin(t / 900 + j * 1.3) * 4;
        ctx.moveTo(astro.x - meia + deriva, y);
        ctx.lineTo(astro.x + meia + deriva, y);
      }
      ctx.stroke();
    };

    const desenharGaivotas = (t: number) => {
      ctx.strokeStyle = traco(0.32);
      ctx.beginPath();
      for (const g of gaivotas) {
        const x = (((g.x + t * g.velocidade) % (largura + 80)) + largura + 80) % (largura + 80) - 40;
        const y = g.y + (estatico ? 0 : Math.sin(t / 3000 + g.fase) * 10);
        const bater = estatico ? 0.3 : Math.sin(t / 180 + g.fase);
        const s = g.tamanho;
        ctx.moveTo(x - s, y - s * 0.35 * bater);
        ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.5, x, y);
        ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.5, x + s, y - s * 0.35 * bater);
      }
      ctx.stroke();
    };

    const desenharCoqueiro = (c: Coqueiro, t: number) => {
      const balanco = estatico ? 0 : Math.sin(t / 2100 + c.fase) * 0.6 + Math.sin(t / 900 + c.fase * 2) * 0.2;
      const curva = c.inclinacao + balanco * 0.015 + vento * 0.05;
      const base = altura + 6;
      const x0 = c.x;
      const x1 = c.x + curva * c.altura;
      const y1 = base - c.altura;
      const cx = c.x + curva * c.altura * 0.1;
      const cy = base - c.altura * 0.5;
      const espessura = c.altura / 450;

      // Tronco: duas bordas, preenchido com a cor do fundo para esconder a água atrás.
      const esquerda: { x: number; y: number }[] = [];
      const direita: { x: number; y: number }[] = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const p = quadratica(x0, base, cx, cy, x1, y1, u);
        const n = Math.hypot(p.tx, p.ty) || 1;
        const w = espessura * (6 - 2.8 * u);
        esquerda.push({ x: p.x - (p.ty / n) * w, y: p.y + (p.tx / n) * w });
        direita.push({ x: p.x + (p.ty / n) * w, y: p.y - (p.tx / n) * w });
      }
      ctx.beginPath();
      esquerda.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      for (let i = direita.length - 1; i >= 0; i--) ctx.lineTo(direita[i].x, direita[i].y);
      ctx.closePath();
      ctx.fillStyle = cores.canvas;
      ctx.fill();
      ctx.fillStyle = traco(0.05);
      ctx.fill();

      ctx.beginPath();
      esquerda.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      direita.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      // Anéis do tronco
      for (let i = 1; i < 24; i++) {
        ctx.moveTo(esquerda[i].x, esquerda[i].y);
        ctx.lineTo(direita[i].x, direita[i].y + espessura * 1.5);
      }

      // Copa: cada folha é uma nervura arqueada com folíolos pendendo pela gravidade.
      for (const f of c.folhas) {
        const L = c.altura * 0.34 * f.comprimento;
        const oscila = estatico ? 0 : Math.sin(t / 900 + f.fase) * 0.06 + Math.sin(t / 340 + f.fase * 1.7) * 0.015;
        const a = f.angulo + oscila;
        const cos = Math.cos(a);
        const sen = Math.sin(a);
        const fx = x1 + L * 0.55 * cos + vento * L * 0.15;
        const fy = y1 + L * 0.55 * sen;
        const ex = x1 + L * 0.95 * cos + vento * L * 0.32;
        const ey = y1 + L * (sen * 0.55 + 0.3) + (estatico ? 0 : Math.sin(t / 900 + f.fase) * L * 0.03);

        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(fx, fy, ex, ey);
        for (let k = 1; k <= 14; k++) {
          const u = 0.08 + (0.9 * k) / 14;
          const p = quadratica(x1, y1, fx, fy, ex, ey, u);
          const n = Math.hypot(p.tx, p.ty) || 1;
          const tx = p.tx / n;
          const ty = p.ty / n;
          const tam = L * 0.2 * Math.sin(Math.PI * Math.min(u * 1.05, 1)) ** 0.8;
          for (const lado of [-1, 1]) {
            let dx = -ty * lado + tx * 0.55 + vento * 0.5;
            let dy = tx * lado + ty * 0.55 + 0.9;
            const m = Math.hypot(dx, dy) || 1;
            dx /= m;
            dy /= m;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + dx * tam, p.y + dy * tam);
          }
        }
      }
      ctx.strokeStyle = traco(0.26);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Cocos
      ctx.beginPath();
      for (const [dx, dy] of [[-1, 1.4], [1.2, 1.1], [0.1, 2.3]]) {
        const r = 3.2 * espessura;
        ctx.moveTo(x1 + dx * 4 * espessura + r, y1 + dy * 4 * espessura);
        ctx.arc(x1 + dx * 4 * espessura, y1 + dy * 4 * espessura, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = cores.canvas;
      ctx.fill();
      ctx.stroke();
    };

    const desenhar = (t: number) => {
      ctx.clearRect(0, 0, largura, altura);
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      vento *= 0.97;
      desenharCeu(t);
      desenharIlhaEPonte();
      desenharBaia(t);
      desenharGaivotas(t);
      for (const c of coqueiros) desenharCoqueiro(c, t);
    };

    let quadro = 0;
    const laco = (tempo: number) => {
      desenhar(tempo);
      quadro = requestAnimationFrame(laco);
    };

    const aoMover = (evento: PointerEvent) => {
      if (evento.pointerType !== 'mouse') return;
      if (ultimoX !== null) vento = Math.max(-1, Math.min(1, vento + (evento.clientX - ultimoX) * 0.0025));
      ultimoX = evento.clientX;
    };
    const aoSair = () => {
      ultimoX = null;
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
  }, [cores.signal, cores.canvas, cores.escuro, preferencias.reduzirMovimento, preferencias.altoContraste]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 animate-fade-in [animation-duration:1.6s]"
    />
  );
}
