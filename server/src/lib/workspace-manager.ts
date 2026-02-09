import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../workspace');

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
  modifiedAt?: number;
}

export interface WorkspaceContext {
  experimentTitle: string;
  hypothesis: string;
  chatSummary: string;
}

const SKIP_DIRS = new Set(['.gemini', '__pycache__', '.venv', 'node_modules', '.git', '.ipynb_checkpoints']);

export function getWorkspacePath(experimentId: string): string {
  // Prevent path traversal
  const sanitized = experimentId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(WORKSPACE_ROOT, sanitized);
}

export async function ensureWorkspace(experimentId: string): Promise<string> {
  const wsPath = getWorkspacePath(experimentId);
  await fs.mkdir(wsPath, { recursive: true });
  return wsPath;
}

export async function scaffoldWorkspace(experimentId: string, context: WorkspaceContext): Promise<void> {
  const wsPath = await ensureWorkspace(experimentId);

  // Create subdirectories
  const dirs = ['experiments', 'data', 'figures', 'reports', 'literature', 'notebooks'];
  await Promise.all(dirs.map(d => fs.mkdir(path.join(wsPath, d), { recursive: true })));

  // Create .gemini/settings.json
  const geminiDir = path.join(wsPath, '.gemini');
  await fs.mkdir(geminiDir, { recursive: true });
  await fs.writeFile(path.join(geminiDir, 'settings.json'), JSON.stringify({
    model: { name: 'gemini-2.5-pro', maxTurns: 50 },
    tools: {
      allowed: [
        'read_file', 'write_file', 'edit_file',
        'google_web_search', 'web_fetch',
        'run_shell_command(python *)',
        'run_shell_command(pip *)',
        'run_shell_command(git *)',
        'run_shell_command(ls *)',
        'run_shell_command(mkdir *)',
        'run_shell_command(cat *)',
      ],
      shell: { inactivityTimeout: 600 }
    }
  }, null, 2));

  // Write GEMINI.md from template
  const templatePath = path.join(__dirname, '../templates/GEMINI.md.template');
  let template = await fs.readFile(templatePath, 'utf-8');
  template = template
    .replace(/\{\{experimentTitle\}\}/g, context.experimentTitle)
    .replace(/\{\{hypothesis\}\}/g, context.hypothesis)
    .replace(/\{\{chatSummary\}\}/g, context.chatSummary);
  await fs.writeFile(path.join(wsPath, 'GEMINI.md'), template);

  const stat = await fs.stat(path.join(wsPath, 'GEMINI.md'));
  console.log(`[workspace] GEMINI.md written for ${experimentId} (${stat.size} bytes)`);
}

export async function listWorkspaceFiles(experimentId: string): Promise<FileTreeNode[]> {
  const wsPath = getWorkspacePath(experimentId);

  try {
    await fs.access(wsPath);
  } catch {
    return [];
  }

  return walkDir(wsPath, wsPath);
}

async function walkDir(dirPath: string, rootPath: string): Promise<FileTreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      const children = await walkDir(fullPath, rootPath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children,
      });
    } else {
      const stat = await fs.stat(fullPath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      });
    }
  }

  // Sort: directories first, then alphabetical
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function readWorkspaceFile(experimentId: string, relativePath: string): Promise<{ content: string; mimeType: string; size: number }> {
  const wsPath = getWorkspacePath(experimentId);
  const filePath = path.resolve(wsPath, relativePath);

  // Prevent path traversal
  if (!filePath.startsWith(wsPath)) {
    throw new Error('Path traversal detected');
  }

  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = getMimeType(ext);

  if (mimeType.startsWith('image/')) {
    const data = await fs.readFile(filePath);
    return { content: data.toString('base64'), mimeType, size: stat.size };
  }

  const content = await fs.readFile(filePath, 'utf-8');
  return { content, mimeType, size: stat.size };
}

export async function readFindings(experimentId: string): Promise<{ content: string; lastModified: number } | null> {
  const wsPath = getWorkspacePath(experimentId);
  const findingsPath = path.join(wsPath, 'findings.md');

  try {
    const stat = await fs.stat(findingsPath);
    const content = await fs.readFile(findingsPath, 'utf-8');
    return { content, lastModified: stat.mtimeMs };
  } catch {
    return null;
  }
}

export async function appendChatMessage(experimentId: string, role: 'user' | 'assistant', message: string): Promise<void> {
  const wsPath = getWorkspacePath(experimentId);
  const geminiMdPath = path.join(wsPath, 'GEMINI.md');

  try {
    const timestamp = new Date().toISOString();
    const label = role === 'user' ? 'Human' : 'Assistant';
    const entry = `\n**${label}** (${timestamp}):\n${message}\n`;

    await fs.appendFile(geminiMdPath, entry);

    const stat = await fs.stat(geminiMdPath);
    console.log(`[workspace] Appended chat message to GEMINI.md (${stat.size} bytes total)`);
  } catch (err) {
    console.error(`[workspace] Failed to append chat message:`, err);
  }
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.md': 'text/markdown',
    '.py': 'text/x-python',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.ipynb': 'application/x-ipynb+json',
    '.sh': 'text/x-shellscript',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
  };
  return map[ext] || 'text/plain';
}
