import 'dotenv/config';
import { createApp } from './app';
import { aiMode, MODEL } from './ai/client';
import { flushSync } from './store';

const app = createApp();
const PORT = Number(process.env.PORT ?? 3101);

const server = app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (${aiMode() === 'ai' ? `AI mode, ${MODEL}` : 'Template mode'})`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    flushSync();
    server.close(() => process.exit(0));
    // Open SSE streams never end on their own; drop them so shutdown is immediate.
    server.closeAllConnections();
  });
}
