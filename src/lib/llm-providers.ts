import { GoogleGenAI, type Part } from "@google/genai";
import { debugStreamStart, debugStreamWrite, debugStreamEnd } from "./debug";

// Simple provider functions that just handle the generation call
// Cache logic remains in AIClient

export interface StreamingOptions {
  debugFilename?: string;
}

export interface UsageMetadata {
  promptTokenCount: number;
  cachedContentTokenCount: number;
  candidatesTokenCount: number;
}

export interface GenerationResult {
  text: string;
  usageMetadata?: UsageMetadata;
}

// Helper to handle streaming with optional debug
async function processStream<T>(
  stream: AsyncIterable<T>,
  getText: (chunk: T) => string,
  options?: StreamingOptions
): Promise<string> {
  // Start debug stream if requested
  if (options?.debugFilename) {
    debugStreamStart(options.debugFilename);
  }
  
  let result = "";
  try {
    for await (const chunk of stream) {
      const chunkText = getText(chunk);
      result += chunkText;
      
      // Stream to debug file if active
      if (options?.debugFilename && chunkText) {
        debugStreamWrite(options.debugFilename, chunkText);
      }
    }
  } finally {
    // Close debug stream
    if (options?.debugFilename) {
      debugStreamEnd(options.debugFilename);
    }
  }
  
  return result;
}

export async function generateWithGeminiPro(prompt: string, options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const config = { responseMimeType: "text/plain" };
  const contents = [{
    role: "user" as const,
    parts: [{ text: prompt }]
  }];
  
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-pro",
    config,
    contents,
  });
  
  return processStream(response, chunk => chunk.text || '', options);
}

export async function generateWithGeminiFlash(prompt: string, options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const config = { 
    responseMimeType: "text/plain",
    thinkingConfig: {
      thinkingBudget: 14000,
    }
  };
  const contents = [{
    role: "user" as const,
    parts: [{ text: prompt }]
  }];
  
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    config,
    contents,
  });
  
  return processStream(response, chunk => chunk.text || '', options);
}

export async function generateWithGeminiFlashLite(prompt: string, options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const config = { 
    responseMimeType: "text/plain",
    // thinkingConfig: {
    //   thinkingBudget: 14000,
    // }
  };
  const contents = [{
    role: "user" as const,
    parts: [{ text: prompt }]
  }];
  
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash-lite",
    config,
    contents,
  });
  
  return processStream(response, chunk => chunk.text || '', options);
}

export async function generateWithGemini3Flash(prompt: string, options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const config = { 
    responseMimeType: "text/plain",
  };
  const contents = [{
    role: "user" as const,
    parts: [{ text: prompt }]
  }];
  
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        config,
        contents,
      });
      return await processStream(response, chunk => chunk.text || '', options);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if ((msg.includes('429') || msg.includes('503')) && attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(5000 * Math.pow(2, attempt), 60000);
        console.log(`   \ud83d\udd04 Gemini ${msg.includes('429') ? '429' : '503'}, retrying in ${(backoff/1000).toFixed(0)}s (attempt ${attempt+1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded for gemini-3-flash');
}

// Non-streaming variant that returns usage metadata for cache monitoring
export async function generateWithGemini3FlashWithMetadata(prompt: string, options?: StreamingOptions): Promise<GenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });

  const config = {
    responseMimeType: "text/plain" as const,
  };
  const contents = [{
    role: "user" as const,
    parts: [{ text: prompt }]
  }];

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config,
        contents,
      });

      const text = response.text || '';

      // Save to debug file if requested
      if (options?.debugFilename) {
        debugStreamStart(options.debugFilename);
        debugStreamWrite(options.debugFilename, text);
        debugStreamEnd(options.debugFilename);
      }

      const usageMetadata = response.usageMetadata ? {
        promptTokenCount: response.usageMetadata.promptTokenCount || 0,
        cachedContentTokenCount: (response.usageMetadata as any).cachedContentTokenCount || 0,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
      } : undefined;

      return { text, usageMetadata };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if ((msg.includes('429') || msg.includes('503')) && attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(5000 * Math.pow(2, attempt), 60000);
        console.log(`   🔄 Gemini ${msg.includes('429') ? '429' : '503'}, retrying in ${(backoff/1000).toFixed(0)}s (attempt ${attempt+1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded for gemini-3-flash-with-metadata');
}

function claudeHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    ...(extra || {}),
  };
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  if (workspaceId) {
    headers["anthropic-workspace-id"] = workspaceId;
  }
  return headers;
}

function throwClaudeError(status: number, error: string): never {
  if (error.includes("anthropic-workspace-id is required")) {
    throw new Error(
      "Claude identity-linked API key requires ANTHROPIC_WORKSPACE_ID. Add it to .env from Claude Console → Settings → Workspaces (id starts with wrkspc_)."
    );
  }
  throw new Error(`Claude API error: ${status} - ${error}`);
}

export async function generateWithClaude(prompt: string, options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: claudeHeaders(apiKey),
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 32000,
      temperature: 0,
      messages: [{
        role: "user",
        content: prompt
      }]
    })
  });
  
  if (!response.ok) {
    throwClaudeError(response.status, await response.text());
  }
  
  const data = await response.json() as { content: Array<{ text: string }> };
  const result = data.content[0].text;
  
  // Save to debug file if requested (Claude doesn't stream)
  if (options?.debugFilename) {
    debugStreamStart(options.debugFilename);
    debugStreamWrite(options.debugFilename, result);
    debugStreamEnd(options.debugFilename);
  }
  
  return result;
}

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const CLAUDE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function geminiPartsToClaudeContent(parts: Part[]): ClaudeContentBlock[] {
  const content: ClaudeContentBlock[] = [];

  for (const part of parts) {
    if (part.text) {
      content.push({ type: "text", text: part.text });
      continue;
    }

    const mime = (part.inlineData?.mimeType || "").toLowerCase();
    const data = part.inlineData?.data;
    if (!data) continue;

    if (mime === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      });
      continue;
    }

    if (CLAUDE_IMAGE_TYPES.has(mime) || mime.startsWith("image/")) {
      const mediaType = CLAUDE_IMAGE_TYPES.has(mime) ? mime : "image/png";
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      });
      continue;
    }

    console.warn(` ⚠️ Skipping unsupported Claude attachment type: ${mime || "unknown"}`);
  }

  if (content.length === 0) {
    throw new Error("No Claude-compatible content parts (need text, PDF, or image)");
  }

  return content;
}

export async function generateMultimodalClaude(parts: Part[], options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const content = geminiPartsToClaudeContent(parts);
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: claudeHeaders(apiKey, { "anthropic-beta": "pdfs-2024-09-25" }),
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 8192,
          temperature: 0,
          messages: [{ role: "user", content }],
        }),
      });

      if (response.status === 429 && attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(5000 * Math.pow(2, attempt), 60000);
        console.log(` 🔄 Claude 429, retrying in ${(backoff / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (!response.ok) {
        throwClaudeError(response.status, await response.text());
      }

      const data = await response.json() as { content: Array<{ text?: string }> };
      const result = (data.content || []).map((block) => block.text || "").join("");

      if (options?.debugFilename) {
        debugStreamStart(options.debugFilename);
        debugStreamWrite(options.debugFilename, result);
        debugStreamEnd(options.debugFilename);
      }

      return result;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if ((msg.includes("429") || msg.includes("529") || msg.includes("overloaded")) && attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(5000 * Math.pow(2, attempt), 60000);
        console.log(` 🔄 Claude retry in ${(backoff / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Max retries exceeded for Claude multimodal");
}

// Multimodal generation (accepts Part[] with inline binary data)
export type MultimodalGenerationFunction = (parts: Part[], options?: StreamingOptions) => Promise<string>;

export async function generateMultimodalGemini3Flash(parts: Part[], options?: StreamingOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });

  const config = {
    responseMimeType: "text/plain" as const,
  };
  const contents = [{
    role: "user" as const,
    parts,
  }];

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        config,
        contents,
      });
      return await processStream(response, chunk => chunk.text || '', options);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if ((msg.includes('429') || msg.includes('503')) && attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(5000 * Math.pow(2, attempt), 60000);
        console.log(`   \uD83D\uDD04 Gemini ${msg.includes('429') ? '429' : '503'}, retrying in ${(backoff/1000).toFixed(0)}s (attempt ${attempt+1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded for gemini-3-flash multimodal');
}

// Map of model names to multimodal generation functions
export const MULTIMODAL_FUNCTIONS: Record<string, MultimodalGenerationFunction> = {
  "gemini-3-flash": generateMultimodalGemini3Flash,
  "claude": generateMultimodalClaude,
};

export function getMultimodalGenerationFunction(model: string): MultimodalGenerationFunction {
  const fn = MULTIMODAL_FUNCTIONS[model];
  if (!fn) {
    throw new Error(`No multimodal support for model: ${model}. Available: ${Object.keys(MULTIMODAL_FUNCTIONS).join(", ")}`);
  }
  return fn;
}

// Map of model names to generation functions
export const MODEL_FUNCTIONS = {
  "gemini-pro": generateWithGeminiPro,
  "gemini-flash": generateWithGeminiFlash,
  "gemini-flash-lite": generateWithGeminiFlashLite,
  "claude": generateWithClaude,
  "gemini-3-flash": generateWithGemini3Flash
} as const;

export type ModelName = keyof typeof MODEL_FUNCTIONS;

export type GenerationFunction = (prompt: string, options?: StreamingOptions) => Promise<string>;

// Get the appropriate generation function based on model selection
export function getGenerationFunction(model: string = "gemini-3-flash"): GenerationFunction {
  const fn = MODEL_FUNCTIONS[model as ModelName];
  if (!fn) {
    throw new Error(`Unknown model: ${model}. Available: ${Object.keys(MODEL_FUNCTIONS).join(", ")}`);
  }
  return fn;
}