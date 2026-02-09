import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { performDeepResearchStream as backendDeepResearch } from "./research-api";

const getClient = () => {
  const apiKey = (window as any).ENV?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error("CRITICAL: GEMINI_API_KEY is missing.");
  }
  return new GoogleGenAI({ apiKey });
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err.status || (err as any).code;
      if (status === 429 || status === 500) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
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
    properties: {
      nodes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['concept', 'paper', 'formula', 'frontier'] },
            url: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ['id', 'label', 'type']
        }
      },
      edges: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            source: { type: Type.STRING },
            target: { type: Type.STRING },
            label: { type: Type.STRING }
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
    properties: {
      final_hypothesis: { type: Type.STRING },
      justification: { type: Type.STRING }
    },
    required: ['final_hypothesis', 'justification']
  }
};

export const createRefinementChat = () => {
  const ai = getClient();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: `You are an elite AI Research Scientist. Refine hunches into novel frontier research vectors. Use 'update_knowledge_graph' frequently. Call 'initiate_deep_research' when a hypothesis is clear.`,
      tools: [{ functionDeclarations: [updateGraphDeclaration, initiateResearchDeclaration] }]
    }
  });

  const originalSendMessage = chat.sendMessage.bind(chat);
  chat.sendMessage = (args: any) => withRetry(() => originalSendMessage(args));
  return chat;
};

/**
 * Performs deep research synthesis using the backend proxy to avoid CORS issues.
 */
export async function performDeepResearchStream(context: string, hypothesis: string): Promise<AsyncIterable<any>> {
  const stream = await backendDeepResearch(context, hypothesis);
  
  // Wrap ReadableStream to be an AsyncIterable for the frontend logic
  return {
    async *[Symbol.asyncIterator]() {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }
  };
}