import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { initClarity } from './services/clarity.ts';
import App from './App.tsx';
import { ApiKeyProvider } from './context/ApiKeyContext.tsx';
import './index.css';

// Initialize Microsoft Clarity
initClarity();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiKeyProvider>
      <App />
      <Analytics />
      <SpeedInsights />
    </ApiKeyProvider>
  </StrictMode>,
);
