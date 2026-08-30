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
    // Porta fixa, combinada com `[dev] targetPort` do netlify.toml.
    // Não usar `process.env.PORT`: o `netlify dev` exporta nele a PRÓPRIA
    // porta (8888) para o comando do framework, o que faria o Vite subir em
    // cima do Netlify e o proxy /api apontar para si mesmo.
    // `strictPort` evita que o Vite migre em silêncio para outra porta — foi
    // assim que o `netlify dev` acabou servindo o app de outro projeto.
    port: 5174,
    strictPort: true,
    // Encaminha as chamadas /api/* para o runtime local do Netlify (`netlify dev`, porta 8888).
    // Em produção o redirect declarado no netlify.toml assume esse papel.
    // Espelha, em desenvolvimento, o redirect `/api/* -> /.netlify/functions/*`
    // declarado no netlify.toml. O alvo é o `netlify functions:serve` iniciado
    // pelo script `dev:api` (ver package.json).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9999',
        changeOrigin: true,
        rewrite: (caminho) => caminho.replace(/^\/api/, '/.netlify/functions'),
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
