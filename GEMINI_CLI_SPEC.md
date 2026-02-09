# Gemini CLI Integration Spec — Frontier AI Research Scientist

## Overview

This document specifies how to integrate [Gemini CLI](https://github.com/google-gemini/gemini-cli) into the Frontier app to transform it from a chat-based UI into an autonomous research scientist capable of executing experiments, analyzing data, and producing publication-ready reports.

Gemini CLI is Google's open-source terminal AI agent. It can read/write files, execute shell commands, search the web, and be extended with custom tools via MCP servers. Critically, it supports a **headless mode** (`-p` flag) with structured JSON output, making it callable as a subprocess from our app's backend.

---

## 1. Installation & Authentication

### Install

```bash
npm install -g @google/gemini-cli
```

Requires Node.js >= 20.

### Authentication (pick one)

| Method | Setup | Rate Limits |
|--------|-------|-------------|
| Google Login (free) | Run `gemini`, select "Login with Google" | 60 req/min, 1,000 req/day |
| API Key | Set `GEMINI_API_KEY` env var | Per-key quota |
| Vertex AI (enterprise) | Set `GOOGLE_API_KEY` + `GOOGLE_GENAI_USE_VERTEXAI=true` | Project quota |

For our use case, the **API key method** is simplest — same key already in `.env.local`.

---

## 2. Core Capabilities We Use

### 2.1 Headless Mode (Programmatic Execution)

The key integration point. Gemini CLI can be invoked non-interactively:

```bash
# Basic: single prompt, text response
gemini -p "Analyze the dataset in data/results.csv"

# Structured JSON output (parseable by our app)
gemini -p "Run the experiment" --output-format json

# Streaming JSON events (real-time progress)
gemini -p "Run the experiment" --output-format stream-json

# Auto-approve all file writes and shell commands
gemini -p "Write and execute the analysis script" --yolo

# Specify model
gemini -p "query" -m gemini-3-pro-preview
```

**JSON output format:**
```json
{
  "response": "The experiment completed successfully...",
  "stats": {
    "models": { "gemini-3-pro-preview": { "requests": 4, "inputTokens": 12000, "outputTokens": 3200 } },
    "tools": { "run_shell_command": { "calls": 3, "successes": 3 } },
    "files": { "linesAdded": 145, "linesRemoved": 12 }
  }
}
```

**Streaming JSON events** (for real-time UI updates):
```
{"type":"init","sessionId":"abc","model":"gemini-2.5-pro"}
{"type":"tool_use","tool":"run_shell_command","params":{"command":"python experiment.py"}}
{"type":"tool_result","tool":"run_shell_command","status":"success","output":"..."}
{"type":"message","role":"assistant","content":"The results show..."}
{"type":"result","stats":{...}}
```

### 2.2 Built-in Tools

These are available out of the box — no configuration needed:

| Tool | What it does for us |
|------|-------------------|
| `read_file` | Read datasets, papers, code files, images, PDFs |
| `write_file` | Create experiment scripts, reports, figures |
| `edit_file` | Modify existing code/configs iteratively |
| `run_shell_command` | Execute Python scripts, install packages, run analyses |
| `web_fetch` | Retrieve papers, datasets, API responses |
| `google_web_search` | Search for related work, methods, datasets |
| `save_memory` | Persist findings across research sessions |

### 2.3 Sandboxing

For executing untrusted experiment code safely:

```bash
# Enable sandbox
gemini -p "Run experiment" --sandbox

# Or via environment variable
GEMINI_SANDBOX=docker gemini -p "Run experiment"
```

**Options:**
- `sandbox-exec` (macOS) — lightweight, uses seatbelt profiles
- `docker` / `podman` — full container isolation, cross-platform

For research execution, **Docker sandboxing** is recommended. Custom Dockerfiles can be placed at `.gemini/sandbox.Dockerfile` to pre-install scientific Python packages (numpy, pandas, scipy, matplotlib, etc.).

---

## 3. Project Configuration

### 3.1 GEMINI.md (Research Context File)

Place a `GEMINI.md` at the project root. This is automatically loaded with every prompt and defines the agent's persona and constraints:

```markdown
# Frontier AI Research Scientist

You are an autonomous research scientist. Your workflow is:

1. **Literature Review**: Use `google_web_search` and `web_fetch` to find
   relevant papers, methods, and datasets. Always cite sources.
2. **Hypothesis Formation**: Formulate a testable hypothesis based on the
   literature and the user's research direction.
3. **Experiment Design**: Write executable Python scripts to test the hypothesis.
   Place scripts in `experiments/`.
4. **Execution**: Run experiments via `run_shell_command`. Capture all outputs.
5. **Analysis**: Analyze results statistically. Generate plots saved to `figures/`.
6. **Report**: Write a structured report in `reports/` with:
   - Abstract, Introduction, Methods, Results, Discussion, References
   - Embed figures using relative paths
   - Use LaTeX notation for equations

## Constraints
- Always create a virtual environment before installing packages
- Save all intermediate data to `data/`
- Never delete existing experiment results
- Commit meaningful checkpoints with descriptive messages

## Project Structure
- `experiments/` — executable experiment scripts
- `data/` — raw and processed datasets
- `figures/` — generated plots and visualizations
- `reports/` — final research reports (Markdown)
- `literature/` — saved paper summaries and notes
```

### 3.2 Settings (`.gemini/settings.json`)

```json
{
  "model": {
    "name": "gemini-3-pro-preview",
    "maxTurns": 50
  },
  "tools": {
    "sandbox": "docker",
    "allowed": [
      "read_file",
      "write_file",
      "edit_file",
      "google_web_search",
      "web_fetch",
      "run_shell_command(python *)",
      "run_shell_command(pip *)",
      "run_shell_command(git *)",
      "run_shell_command(ls *)",
      "run_shell_command(cat *)",
      "run_shell_command(mkdir *)"
    ],
    "shell": {
      "inactivityTimeout": 600
    }
  },
  "context": {
    "fileName": ["GEMINI.md"]
  }
}
```

The `allowed` list auto-approves common research operations so the agent doesn't stall waiting for confirmation in headless mode.

### 3.3 Sandbox Dockerfile (`.gemini/sandbox.Dockerfile`)

Pre-install the scientific Python stack:

```dockerfile
FROM python:3.12-slim

RUN pip install --no-cache-dir \
    numpy pandas scipy matplotlib seaborn \
    scikit-learn statsmodels jupyter \
    biopython rdkit-pypi networkx \
    requests arxiv semantic-scholar
```

---

## 4. Integration Architecture

### Current Architecture
```
Browser → React UI → Gemini Chat API (in-browser)
```

### Target Architecture
```
Browser → React UI → Express Backend → Gemini CLI (subprocess)
                                          ├── reads/writes files
                                          ├── runs experiments (Python)
                                          ├── searches literature
                                          └── generates reports
```

We need a **thin backend server** because:
- Gemini CLI runs as a local process (can't run in-browser)
- It needs filesystem access for experiment execution
- It needs shell access for running Python, git, etc.

### 4.1 Backend Server (New)

A minimal Express server that spawns Gemini CLI as a subprocess:

```
services/
  gemini.ts          ← existing (keep for refinement chat)
  server.ts          ← NEW: Express backend
  gemini-cli.ts      ← NEW: Gemini CLI subprocess wrapper
```

**`services/gemini-cli.ts`** — Core wrapper:

```typescript
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

interface GeminiCliOptions {
  prompt: string;
  model?: string;
  sandbox?: boolean;
  yolo?: boolean;
  cwd?: string;
}

interface StreamEvent {
  type: 'init' | 'message' | 'tool_use' | 'tool_result' | 'error' | 'result';
  [key: string]: any;
}

export function runGeminiCli(options: GeminiCliOptions): EventEmitter {
  const emitter = new EventEmitter();

  const args = ['-p', options.prompt, '--output-format', 'stream-json'];
  if (options.model) args.push('-m', options.model);
  if (options.sandbox) args.push('--sandbox');
  if (options.yolo) args.push('--yolo');

  const proc = spawn('gemini', args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env }
  });

  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        try {
          const event: StreamEvent = JSON.parse(line);
          emitter.emit('event', event);
          emitter.emit(event.type, event);
        } catch {}
      }
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    emitter.emit('log', chunk.toString());
  });

  proc.on('close', (code) => {
    emitter.emit('done', code);
  });

  emitter.on('abort', () => {
    proc.kill('SIGTERM');
  });

  return emitter;
}
```

**`services/server.ts`** — Express server with SSE streaming:

```typescript
import express from 'express';
import { runGeminiCli } from './gemini-cli';

const app = express();
app.use(express.json());

// Stream research execution to the frontend via SSE
app.post('/api/research', (req, res) => {
  const { prompt, experimentId } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const runner = runGeminiCli({
    prompt,
    model: 'gemini-3-pro',
    sandbox: true,
    yolo: true,
    cwd: `./workspace/${experimentId}`
  });

  runner.on('event', (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  runner.on('done', (code) => {
    res.write(`data: ${JSON.stringify({ type: 'done', exitCode: code })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    runner.emit('abort');
  });
});

app.listen(3001, () => console.log('Research backend on :3001'));
```

### 4.2 Frontend Integration (Modified)

The frontend connects to the backend via SSE to receive real-time updates:

```typescript
// In ExperimentView.tsx — replaces executeDeepResearch()

async function executeResearch(hypothesis: string) {
  const res = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `Research this hypothesis: "${hypothesis}".
               Search literature, write experiment code, execute it,
               analyze results, and produce a full report.`,
      experimentId: experiment.id
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const events = text.split('\n\n').filter(Boolean);

    for (const eventStr of events) {
      const data = JSON.parse(eventStr.replace('data: ', ''));

      switch (data.type) {
        case 'tool_use':
          // Update UI: "Running python experiment.py..."
          updateProgress({ currentTool: data.tool, params: data.params });
          break;
        case 'tool_result':
          // Update UI: show tool output
          updateProgress({ lastResult: data.output });
          break;
        case 'message':
          // Append model reasoning to chat
          appendMessage(data.content);
          break;
        case 'result':
          // Final stats
          completeResearch(data.stats);
          break;
      }
    }
  }
}
```

---

## 5. Research Execution Flow

### Phase 1: Refinement (existing, keep as-is)
```
User "inkling" → Gemini Chat API → back-and-forth refinement → knowledge graph built
                                  → model calls initiate_deep_research()
```

### Phase 2: Autonomous Research (new, via Gemini CLI)
```
hypothesis locked
  → Backend spawns: gemini -p "<research prompt>" --output-format stream-json --sandbox --yolo
  → CLI agent autonomously:
      1. google_web_search → finds relevant papers
      2. web_fetch → downloads paper abstracts/data
      3. write_file → creates experiments/hypothesis_test.py
      4. run_shell_command → pip install dependencies
      5. run_shell_command → python experiments/hypothesis_test.py
      6. read_file → reads output data
      7. write_file → creates figures/results.png (matplotlib)
      8. write_file → creates reports/synthesis.md
  → Each step streams as SSE events to the frontend
  → Frontend shows real-time: tool calls, outputs, progress
  → On completion: report rendered in the Synthesis Report card
```

### Phase 3: Iteration (new capability)
After a report is generated, the user can continue chatting to:
- Refine the hypothesis
- Re-run experiments with modified parameters
- Request additional analyses
- Ask the agent to extend the report

Each iteration spawns a new Gemini CLI session with the accumulated context.

---

## 6. Workspace Layout

Each experiment gets an isolated directory:

```
workspace/
  <experiment-id>/
    GEMINI.md              ← copied from template, includes experiment context
    .gemini/
      settings.json        ← sandbox + tool allowlist config
      sandbox.Dockerfile   ← scientific Python environment
    experiments/           ← generated experiment scripts
    data/                  ← raw and processed data
    figures/               ← plots and visualizations
    reports/               ← final research reports
    literature/            ← paper summaries and notes
```

---

## 7. Extension Points (MCP Servers)

For domain-specific research tools, add custom MCP servers in `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "arxiv": {
      "command": "python",
      "args": ["-m", "mcp_servers.arxiv_server"],
      "env": {}
    },
    "pubmed": {
      "command": "python",
      "args": ["-m", "mcp_servers.pubmed_server"],
      "env": { "NCBI_API_KEY": "$NCBI_API_KEY" }
    },
    "semantic_scholar": {
      "command": "python",
      "args": ["-m", "mcp_servers.s2_server"],
      "env": { "S2_API_KEY": "$S2_API_KEY" }
    }
  }
}
```

These would give the agent structured tools like `search_arxiv(query, max_results)`, `get_paper_citations(doi)`, `fetch_pubmed_abstract(pmid)` — much more reliable than raw web search for scientific literature.

---

## 8. Implementation Phases

### Phase 1: Backend scaffolding
- Add Express server (`services/server.ts`)
- Add Gemini CLI wrapper (`services/gemini-cli.ts`)
- Add workspace directory creation on experiment init
- Proxy the frontend dev server to the backend

### Phase 2: Wire up research execution
- Replace `performDeepResearchStream` with backend SSE call
- Update `ExperimentView` to consume streaming events
- Map `tool_use`/`tool_result` events to the existing progress UI
- Display the generated report from `reports/` directory

### Phase 3: File browsing & iteration
- Add a file browser panel to view generated experiments/data/figures
- Allow the user to send follow-up prompts that continue the CLI session
- Display generated figures inline in the report

### Phase 4: MCP servers for literature
- Build arXiv, PubMed, Semantic Scholar MCP servers
- Replace `google_web_search` with structured paper search for literature phases
- Feed real citations into the knowledge graph

---

## 9. Key Limitations

| Limitation | Mitigation |
|-----------|------------|
| No embedded SDK — CLI runs as subprocess only | Use headless mode + stream-json; sufficient for our needs |
| Free tier: 60 req/min, 1,000 req/day | Use API key with adequate quota, or Vertex AI for production |
| Sandbox adds latency (Docker cold start) | Keep containers warm; use macOS seatbelt for dev |
| CLI creates files on the server filesystem | Isolated workspace dirs per experiment; cleanup policy needed |
| No native Colab/Jupyter integration | CLI can run `jupyter nbconvert --execute` for notebook-based experiments |
