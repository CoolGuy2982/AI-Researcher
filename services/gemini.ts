import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const getClient = () => {
  // Check for runtime injected key (Cloud Run) or build-time key (Local)
  const apiKey = (window as any).ENV?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL: GEMINI_API_KEY is missing. Please set it in Cloud Run.");
  }
  
  return new GoogleGenAI({ apiKey });
};

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
    description: 'Updates the visual knowledge lattice with nodes (concepts, papers, formulas) and their relationships.',
    properties: {
      nodes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: 'Unique slug or short ID.' },
            label: { type: Type.STRING, description: 'Display name.' },
            type: { type: Type.STRING, enum: ['concept', 'paper', 'formula', 'frontier'] },
            url: { type: Type.STRING, description: 'Source URL' },
            description: { type: Type.STRING, description: 'Context.' }
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
    description: 'Trigger this ONLY when the refinement process has yielded a specific, novel hypothesis.',
    properties: {
      final_hypothesis: { type: Type.STRING, description: 'The formal scientific hypothesis.' },
      justification: { type: Type.STRING, description: 'Why this vector is novel.' }
    },
    required: ['final_hypothesis', 'justification']
  }
};

export const createRefinementChat = () => {
  const ai = getClient();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: `You are an elite AI Research Scientist. Refine hunches into novel frontier research vectors.
      Use 'update_knowledge_graph' frequently. Call 'initiate_deep_research' when a hypothesis is clear.`,
      tools: [{ functionDeclarations: [updateGraphDeclaration, initiateResearchDeclaration] }]
    }
  });

  const originalSendMessage = chat.sendMessage.bind(chat);
  chat.sendMessage = (args: any) => withRetry(() => originalSendMessage(args));

  return chat;
};

/**
 * Performs deep research synthesis using the Gemini Deep Research Agent (Interactions API).
 */
export async function performDeepResearchStream(context: string, hypothesis: string): Promise<AsyncIterable<any>> {
  const ai = getClient();
  const prompt = `Perform an exhaustive research synthesis for the following hypothesis: "${hypothesis}". 
  Context from previous discussion: ${context}. 
    
  You must:
  1. Search broadly across scientific literature.
  2. Produce a detailed final report with Abstract, Methodology, and Citations.`;

  return await withRetry<AsyncIterable<any>>(() => 
    (ai as any).interactions.create({
      agent: 'deep-research-pro-preview-12-2025',
      input: prompt,
      background: true,
      stream: true,
      agent_config: {
        type: 'deep-research',
        thinking_summaries: 'auto'
      }
    })
  );
}