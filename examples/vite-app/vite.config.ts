import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reactDevtools } from 'agent-react-devtools/vite';

const devtoolsPort = process.env.AGENT_DEVTOOLS_PORT
  ? parseInt(process.env.AGENT_DEVTOOLS_PORT, 10)
  : undefined;

export default defineConfig({
  plugins: [
    reactDevtools(devtoolsPort ? { port: devtoolsPort } : undefined),
    react(),
  ],
});
