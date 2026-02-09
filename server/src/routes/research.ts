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

  broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: '🔍 Contacting Gemini Deep Research Agent...' });

  let deepResearchReport = '';
  let interactionId = '';
  let isComplete = false;

  try {
    // 1. Initial Request to Start Research
    console.log('[Research] Sending POST to Interactions API...');
    const googleUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
    
    const response = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        input: `Conduct exhaustive research for this hypothesis: "${hypothesis}". Context: ${chatSummary}`,
        agent: 'deep-research-pro-preview-12-2025',
        background: true,
        stream: true,
        agent_config: { type: 'deep-research', thinking_summaries: 'auto' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API Init Failed: ${response.status} - ${errorText}`);
    }

    // 2. Process Initial Stream to get Interaction ID
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.replace('data: ', '').trim();
          if (!dataStr || dataStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(dataStr);
            if (data.event_type === 'interaction.start') {
              interactionId = data.interaction.id;
              console.log(`[Research] Interaction ID received: ${interactionId}`);
            }
            if (data.event_type === 'content.delta' && data.delta.type === 'thought_summary') {
              broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: `[Thinking] ${data.delta.content.text}` });
            }
            if (data.event_type === 'interaction.complete') {
              isComplete = true;
            }
          } catch (e) { /* ignore chunking noise */ }
        }
      }
    }

    // 3. Polling Loop: Wait for the actual report if not finished
    console.log('[Research] Entering polling loop for status...');
    let attempts = 0;
    while (!isComplete && interactionId && attempts < 60) { // Max 10 mins
      attempts++;
      const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${interactionId}`, {
        headers: { 'x-goog-api-key': apiKey }
      });
      const statusData = await pollRes.json();
      
      console.log(`[Research] Poll ${attempts}: Status = ${statusData.status}`);

      if (statusData.status === 'completed') {
        deepResearchReport = statusData.outputs?.[statusData.outputs.length - 1]?.text || '';
        isComplete = true;
        break;
      } else if (statusData.status === 'failed') {
        throw new Error(`Deep Research failed: ${JSON.stringify(statusData.error)}`);
      }
      
      // Wait 10 seconds before polling again
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    if (!deepResearchReport) {
      console.warn('[Research] Warning: Research finished but report is empty.');
    }

    broadcastEvent(experimentId, { type: 'message', role: 'assistant', content: '✅ Research synthesized. Starting Coding Agent...' });

    // 4. Start the CLI Coding Agent
    const prompt = `You are an expert AI Research Scientist.
    
## DEEP RESEARCH REPORT
${deepResearchReport || 'No specific internet research available. Use internal knowledge.'}

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