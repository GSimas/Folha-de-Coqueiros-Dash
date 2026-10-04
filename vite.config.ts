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
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Separa as bibliotecas pesadas de visualização do bundle principal,
        // para que a primeira pintura não espere por vis-network/recharts.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('vis-network') || id.includes('vis-data') || id.includes('vis-util')) {
            return 'network';
          }
          if (id.includes('@xyflow') || id.includes('dagre') || id.includes('graphlib')) {
            return 'flow';
          }
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'charts';
          }
          if (id.includes('react')) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
