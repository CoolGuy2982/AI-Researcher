import type { Response } from 'express';
import type { CliRunner, CliStreamEvent } from './gemini-cli.js';

export interface ResearchSession {
  experimentId: string;
  cliSessionId: string | null;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  startedAt: number;
  runner: CliRunner | null;
  events: CliStreamEvent[];
  sseClients: Set<Response>;
}

const sessions = new Map<string, ResearchSession>();

export function getSession(experimentId: string): ResearchSession | undefined {
  return sessions.get(experimentId);
}

export function createSession(experimentId: string, runner: CliRunner): ResearchSession {
  const session: ResearchSession = {
    experimentId,
    cliSessionId: null,
    status: 'running',
    startedAt: Date.now(),
    runner,
    events: [],
    sseClients: new Set(),
  };
  sessions.set(experimentId, session);
  return session;
}

export function deleteSession(experimentId: string): void {
  const session = sessions.get(experimentId);
  if (session?.runner) {
    session.runner.abort();
  }
  sessions.delete(experimentId);
}

export function addSseClient(experimentId: string, res: Response): void {
  const session = sessions.get(experimentId);
  if (session) {
    session.sseClients.add(res);
    res.on('close', () => {
      session.sseClients.delete(res);
    });
  }
}

export function removeSseClient(experimentId: string, res: Response): void {
  const session = sessions.get(experimentId);
  if (session) {
    session.sseClients.delete(res);
  }
}

export function broadcastEvent(experimentId: string, event: CliStreamEvent): void {
  const session = sessions.get(experimentId);
  if (!session) return;

  session.events.push(event);

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of session.sseClients) {
    client.write(data);
  }
}
