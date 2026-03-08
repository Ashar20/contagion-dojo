/**
 * Contagion — Dojo Hackathon
 * Starknet wallet + WebSocket gameplay. No Dojo SDK required for game state.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StarknetProvider from './starknet';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StarknetProvider>
      <App />
    </StarknetProvider>
  </StrictMode>
);
