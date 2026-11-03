// `npm run reset-data` — restore the seed and clear the AI log without starting the server.
// Stop `npm run dev` first; a running server keeps its own copy in memory.
import { flushSync, resetToSeed } from './store';
import { clearAiLog } from './ai/log';

resetToSeed();
clearAiLog();
flushSync();
console.log('Demo data reset to seed.');
