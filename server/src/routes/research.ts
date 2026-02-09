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

function sendSseEvent(res: Response, data: any) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

researchRouter.post('/start', async (req: Request, res: Response) => {
  const { experimentId, hypothesis, experimentTitle, chatSummary, model } = req.body;

  if (!experimentId || !hypothesis) {
    res.status(400).json({ error: 'experimentId and hypothesis are required' });
    return;
  }

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

  const prompt = `You are beginning a research experiment.

## Background Context (from refinement discussion)
${chatSummary || 'No additional context provided.'}

## Hypothesis
${hypothesis}

## Title
${experimentTitle || 'Untitled'}

Execute the full research workflow as described in GEMINI.md.
1. Search literature and save summaries to literature/
2. Design and write experiment scripts in experiments/
3. Execute experiments and capture outputs
4. Analyze results and generate figures in figures/
5. Write findings to findings.md`;

  const runner = spawnGeminiCli({
    prompt,
    cwd: wsPath,
    model: model || 'gemini-2.5-pro',
    yolo: true,
  });

  const session = createSession(experimentId as string, runner);

  setupSse(res);
  addSseClient(experimentId as string, res);

  runner.on('event', (event) => {
    if (event.type === 'init' && event.session_id) {
      session.cliSessionId = event.session_id;
    }
    broadcastEvent(experimentId as string, event);
  });

  runner.on('log', (line) => {
    broadcastEvent(experimentId as string, { type: 'message', role: 'assistant', content: line });
  });

  runner.on('stderr', (text) => {
    broadcastEvent(experimentId as string, { type: 'error', message: text });
  });

  runner.on('close', ({ code }: { code: number | null }) => {
    session.status = code === 0 ? 'completed' : 'failed';
    session.runner = null;
    const doneEvent = { type: 'done', exitCode: code, status: session.status };
    broadcastEvent(experimentId as string, doneEvent as any);

    for (const client of session.sseClients) {
      client.end();
    }
    session.sseClients.clear();
  });

  runner.on('spawn-error', (err: Error) => {
    session.status = 'failed';
    broadcastEvent(experimentId as string, { type: 'error', message: err.message });
    res.end();
  });

  req.on('close', () => {
    session.sseClients.delete(res);
  });
});

researchRouter.get('/:id/events', (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'No session found' });
    return;
  }

  setupSse(res);

  for (const event of session.events) {
    sendSseEvent(res, event);
  }

  if (session.status === 'running') {
    addSseClient(req.params.id as string, res);
  } else {
    sendSseEvent(res, { type: 'done', status: session.status });
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