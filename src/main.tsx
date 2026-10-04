import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PreferenciasProvider } from './lib/preferencias';
import { ligarIluminacao } from './lib/motion';
import { IAProvider } from './lib/ia/conexao';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root não encontrado no index.html');
}

ligarIluminacao();

createRoot(container).render(
  <StrictMode>
    <PreferenciasProvider>
      <IAProvider>
        <App />
      </IAProvider>
    </PreferenciasProvider>
  </StrictMode>,
);
