import { Router, Request, Response } from 'express';
import { spawnGeminiCli } from '../lib/gemini-cli.js';
import { scaffoldWorkspace, getWorkspacePath, appendChatMessage } from '../lib/workspace-manager.js';
import { createSession, getSession, addSseClient, broadcastEvent, deleteSession } from '../lib/session-store.js';

export const researchRouter = Router();

function setupSse(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

// --- Existing Research Routes ---

researchRouter.post('/start', async (req: Request, res: Response) => {
  const { experimentId, hypothesis, experimentTitle, chatSummary, model } = req.body;
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  console.log(`[Research] Starting workflow for experiment: ${experimentId}`);

  if (!experimentId || !hypothesis) {
    res.status(400).json({ error: 'experimentId and hypothesis are required' });
    return;
  }

  if (!apiKey) {
    console.error('[Research] Error: GEMINI_API_KEY is missing');
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
    return;
  }

  // Cleanup existing
  const existing = getSession(experimentId as string);
  if (existing?.status === 'running') {
    existing.runner?.abort();
    deleteSession(experimentId as string);
  }

  await scaffoldWorkspace(experimentId as string, {
    experimentTitle: experimentTitle || 'Untitled',
    hypothesis,
    chatSummary: chatSummary || '',
  });

  const wsPath = getWorkspacePath(experimentId as string);
  setupSse(res);
  const session = createSession(experimentId as string, null as any);
  addSseClient(experimentId as string, res);

  broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: '🚀 Starting Gemini CLI with your hypothesis...' });

  try {
    // Directly start the CLI Coding Agent with the hypothesis
    const prompt = `You are an expert AI Research Scientist.
    
## EXPERIMENT GOAL
Hypothesis: ${hypothesis}
Context: ${chatSummary}

Proceed with coding the experiment per GEMINI.md instructions.`;

    const runner = spawnGeminiCli({
      prompt,
      cwd: wsPath,
      model: model || 'gemini-3-pro-preview',
      yolo: true,
    });

    session.runner = runner;
    session.status = 'running';

    runner.on('event', (event) => {
      if (event.type === 'init' && event.session_id) session.cliSessionId = event.session_id;
      broadcastEvent(experimentId as string, event);
    });

    runner.on('log', (line) => broadcastEvent(experimentId as string, { type: 'message', role: 'assistant', content: line }));
    runner.on('close', ({ code }) => {
      session.status = code === 0 ? 'completed' : 'failed';
      session.runner = null;
      broadcastEvent(experimentId as string, { type: 'done', exitCode: code, status: session.status } as any);
    });

  } catch (err: any) {
    console.error('[Research] Fatal Workflow Error:', err);
    broadcastEvent(experimentId, { type: 'error', message: `Workflow failed: ${err.message}` });
  }
});

researchRouter.get('/:id/events', (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'No session found' });
    return;
  }

  setupSse(res);

  for (const event of session.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (session.status === 'running') {
    addSseClient(req.params.id as string, res);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'done', status: session.status })}\n\n`);
    res.end();
  }
});

researchRouter.post('/:id/chat', async (req: Request, res: Response) => {
  const { message, cliSessionId: clientSessionId } = req.body;
  const experimentId = req.params.id as string;
  let session = getSession(experimentId);

  const resumeId = session?.cliSessionId || clientSessionId || undefined;

  if (!session) {
    session = createSession(experimentId, null as any);
    if (resumeId) session.cliSessionId = resumeId;
  }

  const wsPath = getWorkspacePath(experimentId);

  if (session.status === 'running' && session.runner) {
    session.runner.abort();
    for (const client of session.sseClients) {
      client.end();
    }
    session.sseClients.clear();
  }

  await appendChatMessage(experimentId, 'user', message);

  const cliOptions: any = {
    prompt: message,
    cwd: wsPath,
    yolo: true,
  };
  if (resumeId) {
    cliOptions.resumeSessionId = resumeId;
  }

  const runner = spawnGeminiCli(cliOptions);

  session.runner = runner;
  session.status = 'running';

  setupSse(res);
  addSseClient(experimentId, res);

  runner.on('event', (event) => {
    if (event.type === 'init' && event.session_id) {
      session!.cliSessionId = event.session_id;
    }
    broadcastEvent(experimentId, event);
  });

  runner.on('log', (line: string) => {
    broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: line });
  });

  runner.on('close', ({ code }: { code: number | null }) => {
    session!.status = code === 0 ? 'completed' : 'failed';
    session!.runner = null;
    broadcastEvent(experimentId, { type: 'done', exitCode: code, status: session!.status } as any);
    for (const client of session!.sseClients) {
      client.end();
    }
    session!.sseClients.clear();
  });

  runner.on('spawn-error', (err: Error) => {
    session!.status = 'failed';
    broadcastEvent(experimentId, { type: 'error', message: err.message });
    res.end();
  });

  req.on('close', () => {
    session!.sseClients.delete(res);
  });
});

researchRouter.post('/:id/abort', (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session || session.status !== 'running') {
    res.status(404).json({ error: 'No running session found' });
    return;
  }

  session.runner?.abort();
  session.status = 'aborted';
  session.runner = null;
  broadcastEvent(req.params.id as string, { type: 'error', message: 'Research aborted by user' });

  for (const client of session.sseClients) {
    client.end();
  }
  session.sseClients.clear();

  res.json({ ok: true });
});

researchRouter.get('/:id/status', (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session) {
    res.json({ status: 'idle', cliSessionId: null, startedAt: null, eventCount: 0 });
    return;
  }

  res.json({
    status: session.status,
    cliSessionId: session.cliSessionId,
    startedAt: session.startedAt,
    eventCount: session.events.length,
  });
});