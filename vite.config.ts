import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // Encaminha as chamadas /api/* para o runtime local do Netlify (`netlify dev`, porta 8888).
    // Em produção o redirect declarado no netlify.toml assume esse papel.
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
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
