import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface CliStreamEvent {
  type: 'init' | 'message' | 'tool_use' | 'tool_result' | 'error' | 'result';
  timestamp?: string;
  session_id?: string;
  model?: string;
  role?: 'user' | 'assistant';
  content?: string;
  delta?: boolean;
  tool_name?: string;
  tool_id?: string;
  parameters?: Record<string, any>;
  status?: string;
  output?: string;
  stats?: Record<string, any>;
  [key: string]: any;
}

export interface CliRunOptions {
  prompt: string;
  cwd: string;
  model?: string;
  yolo?: boolean;
  sandbox?: boolean;
  resumeSessionId?: string;
}

export interface CliRunner extends EventEmitter {
  abort(): void;
  readonly process: ChildProcess;
}

export function spawnGeminiCli(options: CliRunOptions): CliRunner {
  const args: string[] = [];

  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId);
  }

  args.push('-p', options.prompt);
  args.push('--output-format', 'stream-json');

  if (options.model) args.push('-m', options.model);
  if (options.yolo) args.push('--yolo');
  if (options.sandbox) args.push('--sandbox');

  console.log(`[gemini-cli] spawning: gemini ${args.join(' ')}`);
  console.log(`[gemini-cli] cwd: ${options.cwd}`);
  console.log(`[gemini-cli] prompt length: ${options.prompt.length} chars`);
  console.log(`[gemini-cli] prompt preview: ${options.prompt.slice(0, 200)}...`);

  const proc = spawn('gemini', args, {
    cwd: options.cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const emitter = new EventEmitter() as CliRunner;
  Object.defineProperty(emitter, 'process', { value: proc, writable: false });

  emitter.abort = () => {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 3000);
  };

  let buffer = '';
  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event: CliStreamEvent = JSON.parse(line);
        emitter.emit('event', event);
        emitter.emit(event.type, event);
      } catch {
        // Non-JSON output (e.g. spinner text)
        emitter.emit('log', line);
      }
    }
  });

  proc.stderr!.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    // Filter out noisy spinner/progress lines
    if (text.trim()) {
      emitter.emit('stderr', text);
    }
  });

  proc.on('close', (code, signal) => {
    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const event: CliStreamEvent = JSON.parse(buffer);
        emitter.emit('event', event);
      } catch { /* ignore */ }
    }
    emitter.emit('close', { code, signal });
  });

  proc.on('error', (err) => {
    emitter.emit('spawn-error', err);
  });

  return emitter;
}
