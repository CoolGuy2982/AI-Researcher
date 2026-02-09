import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { researchRouter } from './routes/research.js';
import { executeRouter } from './routes/execute.js';
import { workspaceRouter } from './routes/workspace.js';

// --- CRITICAL CRASH HANDLERS ---
// These ensure we see the error in Cloud Run logs before the container dies
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
// Use the PORT Cloud Run provides, or default to 8080
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/research', researchRouter);
app.use('/api/execute', executeRouter);
app.use('/api/workspace', workspaceRouter);

// Serve static files from the React app dist folder
// Docker Structure: /app/server/dist/index.js -> /app/dist
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Health check endpoint (Required by Cloud Run)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Handle React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Server with Error Handling
try {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}