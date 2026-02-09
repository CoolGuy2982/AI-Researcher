import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import { researchRouter } from './routes/research.js';
import { workspaceRouter } from './routes/workspace.js';
import { executeRouter } from './routes/execute.js';

// Verify gemini CLI is installed
try {
  execSync('which gemini', { stdio: 'ignore' });
} catch {
  console.error(
    '\n[frontier-server] ERROR: gemini CLI not found.\n' +
    'Install it with: npm install -g @google/gemini-cli\n' +
    'Then run: gemini (to authenticate)\n'
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/research', researchRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/execute', executeRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[frontier-server] listening on :${PORT}`);
});
