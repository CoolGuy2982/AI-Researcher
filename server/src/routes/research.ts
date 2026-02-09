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

// POST /api/research/start — start research, returns SSE stream
researchRouter.post('/start', async (req: Request, res: Response) => {
  const { experimentId, hypothesis, experimentTitle, chatSummary, model } = req.body;

  if (!experimentId || !hypothesis) {
    res.status(400).json({ error: 'experimentId and hypothesis are required' });
    return;
  }

  // Kill any existing session for this experiment
  const existing = getSession(experimentId);
  if (existing?.status === 'running') {
    existing.runner?.abort();
    deleteSession(experimentId);
  }

  // Scaffold workspace
  await scaffoldWorkspace(experimentId, {
    experimentTitle: experimentTitle || 'Untitled',
    hypothesis,
    chatSummary: chatSummary || '',
  });

  const wsPath = getWorkspacePath(experimentId);

  // Build the research prompt
  const prompt = `You are beginning a research experiment.

## Background Context (from refinement discussion)
${chatSummary || 'No additional context provided.'}

## Hypothesis
${hypothesis}

## Title
${experimentTitle || 'Untitled'}

Execute the full research workflow as described in GEMINI.md:
1. Search for relevant literature and save summaries to literature/
2. Design and write experiment scripts in experiments/
3. Execute the experiments and capture outputs
4. Analyze results and generate figures in figures/
5. Write your findings to findings.md

Begin now. Be thorough, cite sources, and produce actionable results.`;

  const runner = spawnGeminiCli({
    prompt,
    cwd: wsPath,
    model: model || 'gemini-2.5-pro',
    yolo: true,
  });

  const session = createSession(experimentId, runner);

  // Set up SSE
  setupSse(res);
  addSseClient(experimentId, res);

  runner.on('event', (event) => {
    // Capture session ID from init event
    if (event.type === 'init' && event.session_id) {
      session.cliSessionId = event.session_id;
    }
    broadcastEvent(experimentId, event);
  });

  runner.on('log', (line) => {
    console.log(`[gemini-cli:stdout] ${line}`);
    broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: line });
  });

  runner.on('stderr', (text) => {
    console.error(`[gemini-cli:stderr] ${text}`);
    broadcastEvent(experimentId, { type: 'error', message: text });
  });

  runner.on('close', ({ code }: { code: number | null }) => {
    console.log(`[gemini-cli] process exited with code ${code}`);

    session.status = code === 0 ? 'completed' : 'failed';
    session.runner = null;
    const doneEvent = { type: 'done' as const, exitCode: code, status: session.status };
    broadcastEvent(experimentId, doneEvent as any);

    // Close all SSE connections
    for (const client of session.sseClients) {
      client.end();
    }
    session.sseClients.clear();
  });

  runner.on('spawn-error', (err: Error) => {
    session.status = 'failed';
    broadcastEvent(experimentId, { type: 'error', message: err.message });
    res.end();
  });

  // Handle client disconnect
  req.on('close', () => {
    session.sseClients.delete(res);
  });
});

// GET /api/research/:id/events — reconnect to running session
researchRouter.get('/:id/events', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'No session found' });
    return;
  }

  setupSse(res);

  // Replay buffered events
  for (const event of session.events) {
    sendSseEvent(res, event);
  }

  if (session.status === 'running') {
    addSseClient(req.params.id, res);
  } else {
    // Session already done, send final status and close
    sendSseEvent(res, { type: 'done', status: session.status });
    res.end();
  }
});

// POST /api/research/:id/chat — send follow-up message (or resume after restart)
researchRouter.post('/:id/chat', async (req: Request, res: Response) => {
  const { message, cliSessionId: clientSessionId } = req.body;
  const experimentId = req.params.id;
  let session = getSession(experimentId);

  // Try to find a session ID to resume
  const resumeId = session?.cliSessionId || clientSessionId || undefined;

  if (!session) {
    // Create session stub (fresh or after server restart)
    session = createSession(experimentId, null as any);
    if (resumeId) session.cliSessionId = resumeId;
  }

  const wsPath = getWorkspacePath(experimentId);

  // Abort any currently running process so the interjection takes over
  if (session.status === 'running' && session.runner) {
    console.log(`[research] Aborting running session for ${experimentId} before follow-up`);
    session.runner.abort();
    // Close existing SSE connections so old consumeEventStream finishes
    for (const client of session.sseClients) {
      client.end();
    }
    session.sseClients.clear();
  }

  // Append the user's message to GEMINI.md for context persistence
  await appendChatMessage(experimentId, 'user', message);

  // Build CLI options — resume if we have a session ID, otherwise start fresh
  // (GEMINI.md in the workspace has full context either way)
  const cliOptions: any = {
    prompt: message,
    cwd: wsPath,
    yolo: true,
  };
  if (resumeId) {
    cliOptions.resumeSessionId = resumeId;
    console.log(`[research] Resuming session ${resumeId} for ${experimentId}`);
  } else {
    console.log(`[research] No cliSessionId available — starting fresh CLI session for ${experimentId}`);
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
    console.log(`[gemini-cli:chat:stdout] ${line}`);
    broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: line });
  });

  runner.on('stderr', (text: string) => {
    console.error(`[gemini-cli:chat:stderr] ${text}`);
  });

  runner.on('close', ({ code }: { code: number | null }) => {
    session!.status = code === 0 ? 'completed' : 'failed';
    session!.runner = null;
    broadcastEvent(experimentId, { type: 'done' as const, exitCode: code, status: session!.status } as any);
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

// POST /api/research/:id/abort — abort running research
researchRouter.post('/:id/abort', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session || session.status !== 'running') {
    res.status(404).json({ error: 'No running session found' });
    return;
  }

  session.runner?.abort();
  session.status = 'aborted';
  session.runner = null;
  broadcastEvent(req.params.id, { type: 'error', message: 'Research aborted by user' });

  for (const client of session.sseClients) {
    client.end();
  }
  session.sseClients.clear();

  res.json({ ok: true });
});

// GET /api/research/:id/status — get session state
researchRouter.get('/:id/status', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
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
