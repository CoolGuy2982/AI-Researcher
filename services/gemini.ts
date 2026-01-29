
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";

const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Robust retry wrapper with exponential backoff.
 * Handles 429 (Rate Limit) and 500 (Internal Server Error).
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err.status || (err as any).code;
      const message = err.message || "";
      
      // Retry on 429 (Rate Limit) or 500 (Internal Server Error)
      if (status === 429 || status === 500 || message.includes("429") || message.includes("500")) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`API error (${status}). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export const updateGraphDeclaration: FunctionDeclaration = {
  name: 'update_knowledge_graph',
  parameters: {
    type: Type.OBJECT,
    description: 'Updates the visual knowledge lattice with nodes (concepts, papers, formulas) and their relationships. REQUIRED: Always include valid URLs for "paper" nodes and high-quality references for "concept" nodes when available.',
    properties: {
      nodes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: 'Unique slug or short ID.' },
            label: { type: Type.STRING, description: 'Display name.' },
            type: { type: Type.STRING, enum: ['concept', 'paper', 'formula', 'frontier'] },
            url: { type: Type.STRING, description: 'Source URL from scientific repositories (arXiv, Nature, PubMed, etc.)' },
            description: { type: Type.STRING, description: 'Brief context or summary of the node.' }
          },
          required: ['id', 'label', 'type']
        }
      },
      edges: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            source: { type: Type.STRING, description: 'ID of source node.' },
            target: { type: Type.STRING, description: 'ID of target node.' },
            label: { type: Type.STRING, description: 'Nature of connection.' }
          },
          required: ['source', 'target']
        }
      }
    }
  }
};

export const initiateResearchDeclaration: FunctionDeclaration = {
  name: 'initiate_deep_research',
  parameters: {
    type: Type.OBJECT,
    description: 'Trigger this ONLY when the refinement process has yielded a specific, novel, and mathematically grounded hypothesis at the knowledge frontier.',
    properties: {
      final_hypothesis: { type: Type.STRING, description: 'The formal scientific hypothesis.' },
      justification: { type: Type.STRING, description: 'Why this research vector is essential and novel.' }
    },
    required: ['final_hypothesis', 'justification']
  }
};

export const createRefinementChat = () => {
  const ai = getClient();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: `You are an elite AI Research Scientist. Your goal is to probe the user's initial hunches and refine them into a specific, novel, frontier research vector.

RULES:
1. INTELLECTUAL DEPTH: Do not be generic. If they mention biology, ask about enzymatic fold stability or active site geometry ($\Delta G^{\ddagger}$). If they mention LLMs, ask about context compression entropy or attention sparsity.
2. GRAPH: Use 'update_knowledge_graph' frequently. You MUST prioritize adding "paper" nodes with URLs from actual scientific repositories. Every time you identify a key citation, add it to the graph.
3. PROBING: Actively pull the user's "unique insight" or "inkling" out of them. Ask for the "frontier hunch".
4. AUTONOMY: When a novel hypothesis is clear, call 'initiate_deep_research'.

FORMATTING:
- Use KaTeX ($...$ or $$...$$).
- After every tool call, always provide a verbal explanation to the user.`,
      tools: [{ functionDeclarations: [updateGraphDeclaration, initiateResearchDeclaration] }]
    }
  });

  // Wrap sendMessage with retry logic
  const originalSendMessage = chat.sendMessage.bind(chat);
  chat.sendMessage = (args: any) => withRetry(() => originalSendMessage(args));

  return chat;
};

/**
 * Performs deep research synthesis using Google Search grounding.
 * Refactored to align with @google/genai guidelines for model selection and tool usage.
 */
export async function performDeepResearchStream(context: string, hypothesis: string): Promise<AsyncIterable<GenerateContentResponse>> {
  const ai = getClient();
  const prompt = `Perform an exhaustive research synthesis for the following hypothesis: "${hypothesis}". Context: ${context}. 
    
    You must:
    1. Search broadly across scientific literature using Google Search.
    2. Identify core papers and list their URLs explicitly.
    3. Construct a high-precision theoretical framework.
    4. Produce a detailed final report with Abstract, Methodology, and Citations.`;

  return await withRetry<AsyncIterable<GenerateContentResponse>>(() => 
    ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    })
  );
}
