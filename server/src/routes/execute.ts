import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { getWorkspacePath } from '../lib/workspace-manager.js';
import path from 'path';

export const executeRouter = Router();

const ALLOWED_COMMANDS = ['python', 'python3', 'pip', 'pip3', 'jupyter', 'ls', 'cat', 'head', 'tail'];
const MAX_TIMEOUT = 5 * 60 * 1000;

executeRouter.post('/:id/execute', (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command) {
    res.status(400).json({ error: 'command is required' });
    return;
  }

  const cmdParts = command.trim().split(/\s+/);
  const executable = cmdParts[0];
  if (!ALLOWED_COMMANDS.includes(executable)) {
    res.status(403).json({ error: `Command '${executable}' not allowed.` });
    return;
  }

  const wsPath = getWorkspacePath(req.params.id as string);

  for (const arg of cmdParts.slice(1)) {
    if (arg.startsWith('-')) continue;
    const resolved = path.resolve(wsPath, arg);
    if (!resolved.startsWith(wsPath)) {
      res.status(403).json({ error: 'Path traversal detected' });
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const proc = spawn(executable, cmdParts.slice(1), {
    cwd: wsPath,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const timeout = setTimeout(() => {
    proc.kill('SIGTERM');
    res.write(`data: ${JSON.stringify({ stream: 'stderr', line: 'Timeout exceeded' })}\n\n`);
    res.write(`data: ${JSON.stringify({ stream: 'exit', code: -1 })}\n\n`);
    res.end();
  }, MAX_TIMEOUT);

  proc.stdout!.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line) res.write(`data: ${JSON.stringify({ stream: 'stdout', line })}\n\n`);
    }
  });

  proc.stderr!.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line) res.write(`data: ${JSON.stringify({ stream: 'stderr', line })}\n\n`);
    }
  });

  proc.on('close', (code) => {
    clearTimeout(timeout);
    res.write(`data: ${JSON.stringify({ stream: 'exit', code })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    clearTimeout(timeout);
    proc.kill('SIGTERM');
  });
});