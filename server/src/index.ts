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
    'Install it with: npm install -g @google/gemini-cli\n'
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
// In Docker, this is at /app/dist
const frontendPath = path.resolve(__dirname, '../../dist');
app.use(express.static(frontendPath));

// Express 5 stable catch-all for SPA routing
app.get('/:any*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// IMPORTANT: Listen on 0.0.0.0 and use the PORT env var provided by Cloud Run
const PORT = process.env.PORT || '8080';

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[frontier-server] SUCCESS: Listening on 0.0.0.0:${PORT}`);
});