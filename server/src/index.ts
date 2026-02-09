import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import { researchRouter } from './routes/research.js';
import { workspaceRouter } from './routes/workspace.js';
import { executeRouter } from './routes/execute.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Verify gemini CLI is installed globally
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

// Increase timeout for long-running research tasks
app.use((req, res, next) => {
  res.setTimeout(600000, () => {
    console.log('Request has timed out.');
    res.status(408).send('Request has timed out.');
  });
  next();
});

app.use(cors());
app.use(express.json());

// 2. API Routes
app.use('/api/research', researchRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/execute', executeRouter);

// 3. Serve static files from the root dist folder (Vite build output)
// In the Dockerfile, vite build puts files in /app/dist
const frontendPath = path.resolve(__dirname, '../../dist');
app.use(express.static(frontendPath));

// 4. THE FIX: Catch-all routing for Express 5 with named parameter
app.get('/:any*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 5. Cloud Run compatibility
// Bind to 0.0.0.0 and use the PORT environment variable
const PORT = process.env.PORT || '8080';

const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[frontier-server] SUCCESS: Listening on 0.0.0.0:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});