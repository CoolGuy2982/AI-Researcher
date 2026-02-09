import { CliStreamEvent, FileTreeNode } from '../types';

export interface StartResearchParams {
  experimentId: string;
  hypothesis: string;
  experimentTitle: string;
  chatSummary: string;
  model?: string;
}

/**
 * Parse SSE stream from fetch response body into typed events.
 */
function parseSseStream<T = any>(body: ReadableStream<Uint8Array>): ReadableStream<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream<T>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(trimmed.slice(6)) as T;
            controller.enqueue(data);
          } catch { /* skip malformed */ }
        }
      }
    },
    cancel() {
      reader.cancel();
    }
  });
}

/**
 * Start Phase 2: Coding & Execution.
 */
export async function startResearch(params: StartResearchParams): Promise<ReadableStream<CliStreamEvent>> {
  const response = await fetch('/api/research/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Research start failed (${response.status}): ${text}`);
  }
  if (!response.body) throw new Error('No response body');

  return parseSseStream(response.body);
}

/**
 * Send a follow-up chat message to a research session.
 */
export async function sendResearchChat(experimentId: string, message: string, cliSessionId?: string): Promise<ReadableStream<CliStreamEvent>> {
  const response = await fetch(`/api/research/${experimentId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, cliSessionId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat failed (${response.status}): ${text}`);
  }
  if (!response.body) throw new Error('No response body');

  return parseSseStream(response.body);
}

/**
 * Abort a running research session.
 */
export async function abortResearch(experimentId: string): Promise<void> {
  await fetch(`/api/research/${experimentId}/abort`, { method: 'POST' });
}

/**
 * Get the workspace file tree.
 */
export async function getWorkspaceTree(experimentId: string): Promise<FileTreeNode[]> {
  const res = await fetch(`/api/workspace/${experimentId}/tree`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.tree;
}

/**
 * Read a workspace file's contents.
 */
export async function readWorkspaceFile(experimentId: string, filePath: string): Promise<{ content: string; mimeType: string }> {
  const res = await fetch(`/api/workspace/${experimentId}/file?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`File read failed: ${res.status}`);
  const mimeType = res.headers.get('content-type') || 'text/plain';
  if (mimeType.startsWith('image/')) {
    const blob = await res.blob();
    return { content: URL.createObjectURL(blob), mimeType };
  }
  const data = await res.json();
  return { content: data.content, mimeType: data.mimeType };
}

/**
 * Read findings.md from workspace.
 */
export async function getFindings(experimentId: string): Promise<string | null> {
  const res = await fetch(`/api/workspace/${experimentId}/findings`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return data.content;
}

/**
 * Execute a script and return SSE stream.
 */
export async function executeScript(experimentId: string, command: string): Promise<ReadableStream<{ stream: string; line: string; code?: number }>> {
  const response = await fetch(`/api/workspace/${experimentId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Execute failed (${response.status}): ${text}`);
  }
  if (!response.body) throw new Error('No response body');

  return parseSseStream(response.body);
}

/**
 * Get research session status.
 */
export async function getResearchStatus(experimentId: string): Promise<{ status: string; cliSessionId: string | null; eventCount: number }> {
  const res = await fetch(`/api/research/${experimentId}/status`);
  return res.json();
}