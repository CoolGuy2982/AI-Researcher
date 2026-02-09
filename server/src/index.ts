import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { researchRouter } from './routes/research.js';
import { executeRouter } from './routes/execute.js';
import { workspaceRouter } from './routes/workspace.js';

// --- CRASH HANDLERS (Must be at top) ---
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
  // Keep process alive for a split second to ensure logs are flushed
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
// ----------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Cloud Run injects PORT, but we fallback to 8080
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/research', researchRouter);
app.use('/api/execute', executeRouter);
app.use('/api/workspace', workspaceRouter);

// Serve static files from the React app dist folder
// Assuming structure: /app/server/dist/index.js -> /app/dist
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Health check endpoint (Critical for Cloud Run)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Server
try {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}