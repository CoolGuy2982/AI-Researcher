import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { researchRouter } from './routes/research.js';
import { executeRouter } from './routes/execute.js';
import { workspaceRouter } from './routes/workspace.js';

// --- CRITICAL CRASH HANDLERS ---
process.on('uncaughtException', (err) => {
  console.error('CRITICAL STARTUP ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL STARTUP ERROR (Unhandled Rejection):', promise, 'reason:', reason);
});
// -------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// --- ENV VAR INJECTION (Must be before static files) ---
// This allows the frontend to access Cloud Run environment variables at runtime
app.get('/env.js', (req, res) => {
  const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
  };
  res.set('Content-Type', 'application/javascript');
  res.send(`window.ENV = ${JSON.stringify(env)};`);
});
// -------------------------------------------------------

// Routes
app.use('/api/research', researchRouter);
app.use('/api/execute', executeRouter);
app.use('/api/workspace', workspaceRouter);

// Serve static files from the React app dist folder
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Handle React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

try {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}