import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reactDevtools } from 'agent-react-devtools/vite';

export default defineConfig({
  plugins: [
    reactDevtools(),
    react(),
  ],
});
