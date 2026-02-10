import { initialize, connectToDevTools } from 'react-devtools-core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

initialize();
connectToDevTools({ port: 8097 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
