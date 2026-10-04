/** @type {import('tailwindcss').Config} */

/** Cor ligada a um token de `index.css` (canais RGB), preservando os modificadores de opacidade. */
const token = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;
const escala = (prefixo) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, token(`${prefixo}-${n}`)]),
  );

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-tema="escuro"]'],
  theme: {
    extend: {
      colors: {
        // Superfícies e texto semânticos — mudam com tema e contraste.
        canvas: token('canvas'),
        surface: token('surface'),
        elevated: token('elevated'),
        ink: token('ink'),
        muted: token('muted'),
        faint: token('faint'),
        line: token('line'),
        signal: token('signal'),
        'signal-ink': token('signal-ink'),
        // As escalas `slate` e `brand` também apontam para tokens: todo
        // componente que as usa acompanha o tema sem precisar de `dark:`.
        slate: escala('slate'),
        brand: escala('brand'),
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      // Estética Scientata: cantos quase retos, linhas finas.
      borderRadius: {
        sm: '2px',
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
        xl: '5px',
        '2xl': '6px',
      },
      // `--brilho` (index.css) entra nas transições padrão para a iluminação
      // de hover acender e apagar suavemente em qualquer elemento com `transition`.
      transitionProperty: {
        DEFAULT:
          'color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter, --brilho',
        colors:
          'color, background-color, border-color, text-decoration-color, fill, stroke, --brilho',
      },
      transitionDuration: {
        DEFAULT: '220ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
        suave: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'entrada-pagina': {
          from: { opacity: '0', transform: 'translateY(10px)', filter: 'blur(4px)' },
          to: { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        piscar: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'barra-carregando': {
          '0%': { left: '-40%' },
          '50%': { left: '55%' },
          '100%': { left: '110%' },
        },
        pulsar: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.35)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        'entrada-pagina': 'entrada-pagina 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards',
        piscar: 'piscar 0.9s step-end infinite',
        'barra-carregando': 'barra-carregando 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        pulsar: 'pulsar 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
