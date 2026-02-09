import { Router, Request, Response } from 'express';
import { listWorkspaceFiles, readWorkspaceFile, readFindings, getWorkspacePath } from '../lib/workspace-manager.js';
import fs from 'fs/promises';
import path from 'path';

export const workspaceRouter = Router();

// GET /api/workspace/:id/tree — file tree
workspaceRouter.get('/:id/tree', async (req: Request, res: Response) => {
  try {
    const tree = await listWorkspaceFiles(req.params.id);
    res.json({ tree });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/:id/file?path=<relative> — read file or serve image
workspaceRouter.get('/:id/file', async (req: Request, res: Response) => {
  const relativePath = req.query.path as string;
  if (!relativePath) {
    res.status(400).json({ error: 'path query parameter required' });
    return;
  }

  try {
    const file = await readWorkspaceFile(req.params.id, relativePath);

    if (file.mimeType.startsWith('image/')) {
      // Serve raw image binary
      const wsPath = getWorkspacePath(req.params.id);
      const filePath = path.resolve(wsPath, relativePath);
      if (!filePath.startsWith(wsPath)) {
        res.status(403).json({ error: 'Path traversal detected' });
        return;
      }
      const data = await fs.readFile(filePath);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Cache-Control', 'no-cache');
      res.send(data);
      return;
    }

    res.json({
      content: file.content,
      mimeType: file.mimeType,
      path: relativePath,
      size: file.size,
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// GET /api/workspace/:id/findings — read findings.md
workspaceRouter.get('/:id/findings', async (req: Request, res: Response) => {
  const findings = await readFindings(req.params.id);
  if (!findings) {
    res.status(404).json({ error: 'findings.md not found' });
    return;
  }
  res.json(findings);
});
