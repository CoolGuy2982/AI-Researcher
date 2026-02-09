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

/**
 * Proxy for Gemini Deep Research (Interactions API)
 * This bypasses CORS by making the request from the server.
 */
researchRouter.post('/deep-research', async (req: Request, res: Response) => {
  const { input, agent, agent_config } = req.body;
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  try {
    const googleUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
    
    const response = await fetch(googleUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        input,
        agent,
        background: true,
        stream: true,
        agent_config
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).send(errText);
      return;
    }

    // Setup SSE headers for the client
    setupSse(res);

    // Pipe the stream from Google directly to our response
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream from Google API');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (error: any) {
    console.error('Deep Research Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Existing Research Routes ---

researchRouter.post('/start', async (req: Request, res: Response) => {
  const { experimentId, hypothesis, experimentTitle, chatSummary, model } = req.body;
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (!experimentId || !hypothesis) {
    res.status(400).json({ error: 'experimentId and hypothesis are required' });
    return;
  }

  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  // Clean up existing sessions
  const existing = getSession(experimentId as string);
  if (existing?.status === 'running') {
    existing.runner?.abort();
    deleteSession(experimentId as string);
  }

  // Scaffold workspace first
  await scaffoldWorkspace(experimentId as string, {
    experimentTitle: experimentTitle || 'Untitled',
    hypothesis,
    chatSummary: chatSummary || '',
  });

  const wsPath = getWorkspacePath(experimentId as string);

  // 1. Setup SSE for the client immediately
  setupSse(res);
  const session = createSession(experimentId as string, null as any); 
  addSseClient(experimentId as string, res);

  broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: '✨ Initiating Deep Research agent...' });

  let deepResearchReport = '';

  try {
    // 2. Call Google Deep Research (Interactions API)
    const googleUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
    const drResponse = await fetch(googleUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        input: `Conduct deep research to support the following hypothesis for a physics/AI experiment: "${hypothesis}". Context: ${chatSummary}`,
        agent: 'deep-research-pro-preview-12-2025',
        background: true,
        stream: true,
        agent_config: {
          type: 'deep-research',
          thinking_summaries: 'auto'
        }
      })
    });

    if (!drResponse.ok) {
      throw new Error(`Deep Research API failed: ${drResponse.statusText}`);
    }

    // 3. Process the Deep Research Stream
    const reader = drResponse.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            
            // Handle streaming reasoning/thoughts
            if (data.event_type === 'content.delta') {
              if (data.delta.type === 'thought_summary') {
                broadcastEvent(experimentId, { 
                  type: 'message', 
                  role: 'assistant', 
                  content: `[Thinking] ${data.delta.content.text}` 
                });
              } else if (data.delta.type === 'text') {
                deepResearchReport += data.delta.text;
              }
            }
          } catch (e) { /* Ignore partial JSON */ }
        }
      }
    }

    broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: '✅ Deep Research complete. Transitioning to experiment execution...' });

    // 4. Start the Coding Agent (spawnGeminiCli) with the gathered report
    const prompt = `You are beginning a research experiment.

## Background Context (from refinement discussion)
${chatSummary || 'No additional context provided.'}

## Deep Research Insights
${deepResearchReport || 'No deep research report was generated.'}

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
      model: model || 'gemini-3-pro-preview',
      yolo: true,
    });

    session.runner = runner;
    session.status = 'running';

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
      broadcastEvent(experimentId as string, { type: 'done', exitCode: code, status: session.status } as any);

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

  } catch (err: any) {
    console.error('Research Workflow Error:', err);
    broadcastEvent(experimentId, { type: 'error', message: `Workflow failed: ${err.message}` });
    res.end();
  }

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