import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import researchRouter from './routes/research.js';
import executeRouter from './routes/execute.js';
import workspaceRouter from './routes/workspace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/research', researchRouter);
app.use('/api/execute', executeRouter);
app.use('/api/workspace', workspaceRouter);

// Serve static files from the React app dist folder
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});