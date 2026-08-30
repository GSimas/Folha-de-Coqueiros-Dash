/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta editorial da Folha de Coqueiros
        brand: {
          50: '#eef5fb',
          100: '#d5e6f4',
          200: '#a9cde8',
          300: '#7db4dd',
          400: '#4a90c4',
          500: '#2b6f9f',
          600: '#1f5a83',
          700: '#1a5276',
          800: '#143f5a',
          900: '#0e2c3f',
        },
        // Cores canônicas por tipo de ator (paridade com o Pyvis original)
        ator: {
          pessoa: '#3498db',
          organizacao: '#e74c3c',
          local: '#2ecc71',
          empresa: '#f1c40f',
          outro: '#95a5a6',
        },
        causal: {
          reforco: '#27ae60',
          reducao: '#c0392b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in': 'slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
