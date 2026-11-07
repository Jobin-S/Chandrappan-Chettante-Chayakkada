import { defineConfig, type Plugin } from 'vite';
import { handleSignal } from './api/signal';

/**
 * Serves the same /api/signal handler during `npm run dev`, so multiplayer
 * works locally without Vercel (rooms live in memory).
 */
function devSignal(): Plugin {
  return {
    name: 'chayakkada-dev-signal',
    configureServer(server) {
      server.middlewares.use('/api/signal', (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', async () => {
          const request = new Request('http://localhost/api/signal', {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const response = await handleSignal(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await response.text());
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [devSignal()],
  build: { chunkSizeWarningLimit: 900 },
});
