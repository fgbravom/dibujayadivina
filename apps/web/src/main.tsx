import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initClient } from './state/client';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

// El cliente de sockets vive fuera de React: se abre una sola vez, antes de pintar.
initClient();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
