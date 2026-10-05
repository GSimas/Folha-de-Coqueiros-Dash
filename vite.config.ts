import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    // A avaliação ao vivo chama modelos reais: respostas podem levar minutos.
    testTimeout: 20_000,
  },
  server: {
    // Porta fixa e estrita: evita que o Vite migre em silêncio para outra porta.
    // PORT vem do preview do Claude Code quando a 5174 já está ocupada.
    port: Number(process.env.PORT) || 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Só o núcleo do React vai num chunk próprio (cache estável entre deploys).
        // As bibliotecas pesadas (vis-network, Recharts, React Flow, Markdown)
        // ficam com o chunk lazy do módulo que as usa — agrupá-las à mão fazia
        // dependências compartilhadas puxarem esses chunks para a carga inicial.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Só o núcleo do React: um `includes('react')` puxaria react-markdown,
          // @tanstack/react-table etc. para o chunk inicial.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
