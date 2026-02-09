import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import { researchRouter } from './routes/research.js';
import { workspaceRouter } from './routes/workspace.js';
import { executeRouter } from './routes/execute.js';
import path from 'path';
import { fileURLToPath } from 'url';

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

// API Routes
app.use('/api/research', researchRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/execute', executeRouter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the Vite build directory
// assumed to be in the root 'dist' folder relative to the server workspace
app.use(express.static(path.join(__dirname, '../../dist')));

// Fix for Express 5 catch-all routing using a named parameter
app.get('/:splat*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

// IMPORTANT: Listen on 0.0.0.0 and use the PORT env var for Cloud Run compatibility
const PORT = process.env.PORT || 3001;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[frontier-server] listening on 0.0.0.0:${PORT}`);
});