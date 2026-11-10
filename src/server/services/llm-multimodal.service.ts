export interface LlmInlinePart {
  mimeType: string;
  dataBase64: string;
  label?: string;
}

export interface LlmJsonCallInput {
  systemPrompt: string;
  userPrompt: string;
  inlineParts?: LlmInlinePart[];
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmJsonCallResult<T = any> {
  data: T;
  provider: "LLM_GEMINI" | "LLM_OPENAI";
  model: string;
}

function limparMarkdownJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

export function parseJsonFromLlmText<T = any>(rawText: string): T | null {
  if (!rawText || typeof rawText !== "string") return null;
  const cleaned = limparMarkdownJson(rawText);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        // segue para tentativa com array
      }
    }
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildGeminiModelPool(): string[] {
  const envModel = (process.env.GEMINI_MODEL || "").trim();
  const defaults = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ];
  const candidates = envModel && !/gemini-3\.[15]/i.test(envModel)
    ? [envModel, ...defaults]
    : defaults;
  return Array.from(new Set(candidates.filter(Boolean)));
}

async function chamarGeminiJson<T>(
  input: LlmJsonCallInput,
  apiKey: string,
  timeoutMs: number,
): Promise<LlmJsonCallResult<T> | null> {
  const models = buildGeminiModelPool();
  const parts: Array<Record<string, any>> = [
    {
      text: `${input.systemPrompt}\n\n${input.userPrompt}`,
    },
  ];

  for (const part of input.inlineParts || []) {
    if (!part.dataBase64 || !part.mimeType) continue;
    if (part.label) {
      parts.push({ text: `[Anexo Visual/PDF para leitura integral: ${part.label}]` });
    }
    parts.push({
      inlineData: {
        mimeType: part.mimeType,
        data: part.dataBase64,
      },
    });
  }

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: input.temperature ?? 0.15,
              responseMimeType: "application/json",
              maxOutputTokens: input.maxOutputTokens ?? 16384,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (!res.ok) continue;

      const json: any = await res.json();
      const candidateParts = json?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(candidateParts)
        ? candidateParts.map((p: any) => p?.text || "").join("\n").trim()
        : json?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) continue;
      const parsed = parseJsonFromLlmText<T>(text);
      if (parsed !== null) {
        return { data: parsed, provider: "LLM_GEMINI", model };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function chamarOpenAiJson<T>(
  input: LlmJsonCallInput,
  apiKey: string,
  timeoutMs: number,
): Promise<LlmJsonCallResult<T> | null> {
  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const userContent: Array<Record<string, any>> = [
    { type: "text", text: input.userPrompt },
  ];

  for (const part of input.inlineParts || []) {
    if (part.mimeType.startsWith("image/") && part.dataBase64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${part.mimeType};base64,${part.dataBase64}`,
        },
      });
    }
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          {
            role: "user",
            content: userContent.length > 1 ? userContent : input.userPrompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;

    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = parseJsonFromLlmText<T>(content);
    if (parsed !== null) {
      return { data: parsed, provider: "LLM_OPENAI", model };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Cliente unificado de IA (Gemini multimodal prioritário quando há PDFs/imagens ou GEMINI_API_KEY,
 * com fallback automático para OpenAI quando configurado).
 */
export async function chamarLlmJsonMultimodal<T = any>(
  input: LlmJsonCallInput,
): Promise<LlmJsonCallResult<T> | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!geminiKey && !openaiKey) {
    return null;
  }

  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  const timeoutMs = input.timeoutMs ?? (isTest ? 4000 : 120000);
  const temPdfBinario = (input.inlineParts || []).some((p) =>
    p.mimeType.includes("pdf"),
  );

  // Se houver PDFs binários para OCR/visão ou se só Gemini estiver disponível, tenta Gemini primeiro
  if (geminiKey && (temPdfBinario || !openaiKey || process.env.LLM_PRIMARY !== "openai")) {
    const resGemini = await chamarGeminiJson<T>(input, geminiKey, timeoutMs);
    if (resGemini) return resGemini;
  }

  if (openaiKey) {
    const resOpenAi = await chamarOpenAiJson<T>(input, openaiKey, timeoutMs);
    if (resOpenAi) return resOpenAi;
  }

  if (geminiKey && openaiKey && process.env.LLM_PRIMARY === "openai") {
    const resGemini = await chamarGeminiJson<T>(input, geminiKey, timeoutMs);
    if (resGemini) return resGemini;
  }

  return null;
}

