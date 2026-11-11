export interface LlmInlinePart {
  mimeType: string;
  dataBase64: string;
  label?: string;
}

export interface LlmTelemetryContext {
  tenantId?: string | null;
  userId?: string | null;
  usuarioNome?: string | null;
  empresaNome?: string | null;
  licitacaoId?: string | null;
  feature?: string;
}

export interface LlmJsonCallInput {
  systemPrompt: string;
  userPrompt: string;
  inlineParts?: LlmInlinePart[];
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  telemetryContext?: LlmTelemetryContext;
}

export interface LlmJsonCallResult<T = unknown> {
  data: T;
  provider: "LLM_GEMINI" | "LLM_OPENAI";
  model: string;
  promptTokens?: number;
  outputTokens?: number;
  duracaoMs?: number;
}

export interface LlmTelemetryEvent {
  provider: "LLM_GEMINI" | "LLM_OPENAI";
  model: string;
  promptTokens: number;
  outputTokens: number;
  duracaoMs: number;
  feature: string;
  status?: "SUCESSO" | "ERRO";
  erro?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  usuarioNome?: string | null;
  empresaNome?: string | null;
  licitacaoId?: string | null;
}

type LlmTelemetryHook = (event: LlmTelemetryEvent) => void | Promise<void>;

/**
 * Hook padrão: registra todo consumo real de IA na telemetria do Portal ADM (`AiUsageLog`),
 * de forma não-bloqueante e sem criar dependência circular (import dinâmico).
 */
const defaultLlmTelemetryHook: LlmTelemetryHook = async (event) => {
  const { registrarConsumoIaSuperAdmin } = await import("./superadmin.service");
  const { getAuditActorContext } = await import("@/server/audit");
  const actor = getAuditActorContext();
  await registrarConsumoIaSuperAdmin({
    tenantId: event.tenantId ?? actor?.tenantId ?? null,
    userId: event.userId ?? actor?.usuarioId ?? null,
    usuarioNome: event.usuarioNome ?? actor?.usuarioNome ?? null,
    empresaNome: event.empresaNome ?? null,
    licitacaoId: event.licitacaoId ?? null,
    feature: event.feature,
    provider: event.provider,
    model: event.model,
    promptTokens: event.promptTokens,
    outputTokens: event.outputTokens,
    duracaoMs: event.duracaoMs,
    status: event.status ?? "SUCESSO",
    erro: event.erro ?? null,
  });
};

let globalLlmTelemetryHook: LlmTelemetryHook | null = defaultLlmTelemetryHook;

export function registerLlmTelemetryHook(hook: LlmTelemetryHook): void {
  globalLlmTelemetryHook = hook;
}

function emitirTelemetriaLlm(event: LlmTelemetryEvent): void {
  if (!globalLlmTelemetryHook) return;
  try {
    Promise.resolve(globalLlmTelemetryHook(event)).catch(() => undefined);
  } catch {
    // telemetria nunca bloqueia chamadas de IA
  }
}

function limparMarkdownJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

export function parseJsonFromLlmText<T = unknown>(rawText: string): T | null {
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
  const candidates =
    envModel && !/gemini-3\.[15]/i.test(envModel) ? [envModel, ...defaults] : defaults;
  return Array.from(new Set(candidates.filter(Boolean)));
}

type GeminiRequestPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

type OpenAiUserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAiApiResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

async function chamarGeminiJson<T>(
  input: LlmJsonCallInput,
  apiKey: string,
  timeoutMs: number,
): Promise<LlmJsonCallResult<T> | null> {
  const models = buildGeminiModelPool();
  const parts: GeminiRequestPart[] = [
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

  const feature = input.telemetryContext?.feature || "RAIO_X_EDITAL";

  for (const model of models) {
    const startMs = Date.now();
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

      if (!res.ok) {
        emitirTelemetriaLlm({
          provider: "LLM_GEMINI",
          model,
          promptTokens: 0,
          outputTokens: 0,
          duracaoMs: Date.now() - startMs,
          feature,
          status: "ERRO",
          erro: `HTTP ${res.status}`,
          tenantId: input.telemetryContext?.tenantId,
          userId: input.telemetryContext?.userId,
          usuarioNome: input.telemetryContext?.usuarioNome,
          empresaNome: input.telemetryContext?.empresaNome,
          licitacaoId: input.telemetryContext?.licitacaoId,
        });
        continue;
      }

      const json = (await res.json()) as GeminiApiResponse;
      const candidateParts = json.candidates?.[0]?.content?.parts;
      const text = Array.isArray(candidateParts)
        ? candidateParts.map((p) => p.text || "").join("\n").trim()
        : undefined;

      if (!text) {
        emitirTelemetriaLlm({
          provider: "LLM_GEMINI",
          model,
          promptTokens: Number(json.usageMetadata?.promptTokenCount) || 0,
          outputTokens: 0,
          duracaoMs: Date.now() - startMs,
          feature,
          status: "ERRO",
          erro: "Resposta vazia do modelo Gemini",
          tenantId: input.telemetryContext?.tenantId,
          userId: input.telemetryContext?.userId,
          usuarioNome: input.telemetryContext?.usuarioNome,
          empresaNome: input.telemetryContext?.empresaNome,
          licitacaoId: input.telemetryContext?.licitacaoId,
        });
        continue;
      }

      const promptTokens =
        Number(json.usageMetadata?.promptTokenCount) ||
        Math.ceil((input.systemPrompt.length + input.userPrompt.length) / 4);
      const outputTokens =
        Number(json.usageMetadata?.candidatesTokenCount) || Math.ceil(text.length / 4);
      const duracaoMs = Date.now() - startMs;

      const parsed = parseJsonFromLlmText<T>(text);
      if (parsed !== null) {
        emitirTelemetriaLlm({
          provider: "LLM_GEMINI",
          model,
          promptTokens,
          outputTokens,
          duracaoMs,
          feature,
          status: "SUCESSO",
          tenantId: input.telemetryContext?.tenantId,
          userId: input.telemetryContext?.userId,
          usuarioNome: input.telemetryContext?.usuarioNome,
          empresaNome: input.telemetryContext?.empresaNome,
          licitacaoId: input.telemetryContext?.licitacaoId,
        });
        return {
          data: parsed,
          provider: "LLM_GEMINI",
          model,
          promptTokens,
          outputTokens,
          duracaoMs,
        };
      }

      emitirTelemetriaLlm({
        provider: "LLM_GEMINI",
        model,
        promptTokens,
        outputTokens,
        duracaoMs,
        feature,
        status: "ERRO",
        erro: "JSON inválido retornado pelo modelo Gemini",
        tenantId: input.telemetryContext?.tenantId,
        userId: input.telemetryContext?.userId,
        usuarioNome: input.telemetryContext?.usuarioNome,
        empresaNome: input.telemetryContext?.empresaNome,
        licitacaoId: input.telemetryContext?.licitacaoId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro na requisição Gemini";
      emitirTelemetriaLlm({
        provider: "LLM_GEMINI",
        model,
        promptTokens: 0,
        outputTokens: 0,
        duracaoMs: Date.now() - startMs,
        feature,
        status: "ERRO",
        erro: msg,
        tenantId: input.telemetryContext?.tenantId,
        userId: input.telemetryContext?.userId,
        usuarioNome: input.telemetryContext?.usuarioNome,
        empresaNome: input.telemetryContext?.empresaNome,
        licitacaoId: input.telemetryContext?.licitacaoId,
      });
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
  const userContent: OpenAiUserContentPart[] = [
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

  const feature = input.telemetryContext?.feature || "RAIO_X_EDITAL";
  const startMs = Date.now();
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

    if (!res.ok) {
      emitirTelemetriaLlm({
        provider: "LLM_OPENAI",
        model,
        promptTokens: 0,
        outputTokens: 0,
        duracaoMs: Date.now() - startMs,
        feature,
        status: "ERRO",
        erro: `HTTP ${res.status}`,
        tenantId: input.telemetryContext?.tenantId,
        userId: input.telemetryContext?.userId,
        usuarioNome: input.telemetryContext?.usuarioNome,
        empresaNome: input.telemetryContext?.empresaNome,
        licitacaoId: input.telemetryContext?.licitacaoId,
      });
      return null;
    }

    const json = (await res.json()) as OpenAiApiResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      emitirTelemetriaLlm({
        provider: "LLM_OPENAI",
        model,
        promptTokens: Number(json.usage?.prompt_tokens) || 0,
        outputTokens: 0,
        duracaoMs: Date.now() - startMs,
        feature,
        status: "ERRO",
        erro: "Resposta vazia do modelo OpenAI",
        tenantId: input.telemetryContext?.tenantId,
        userId: input.telemetryContext?.userId,
        usuarioNome: input.telemetryContext?.usuarioNome,
        empresaNome: input.telemetryContext?.empresaNome,
        licitacaoId: input.telemetryContext?.licitacaoId,
      });
      return null;
    }

    const promptTokens =
      Number(json.usage?.prompt_tokens) ||
      Math.ceil((input.systemPrompt.length + input.userPrompt.length) / 4);
    const outputTokens =
      Number(json.usage?.completion_tokens) || Math.ceil(content.length / 4);
    const duracaoMs = Date.now() - startMs;

    const parsed = parseJsonFromLlmText<T>(content);
    if (parsed !== null) {
      emitirTelemetriaLlm({
        provider: "LLM_OPENAI",
        model,
        promptTokens,
        outputTokens,
        duracaoMs,
        feature,
        status: "SUCESSO",
        tenantId: input.telemetryContext?.tenantId,
        userId: input.telemetryContext?.userId,
        usuarioNome: input.telemetryContext?.usuarioNome,
        empresaNome: input.telemetryContext?.empresaNome,
        licitacaoId: input.telemetryContext?.licitacaoId,
      });
      return {
        data: parsed,
        provider: "LLM_OPENAI",
        model,
        promptTokens,
        outputTokens,
        duracaoMs,
      };
    }

    emitirTelemetriaLlm({
      provider: "LLM_OPENAI",
      model,
      promptTokens,
      outputTokens,
      duracaoMs,
      feature,
      status: "ERRO",
      erro: "JSON inválido retornado pelo modelo OpenAI",
      tenantId: input.telemetryContext?.tenantId,
      userId: input.telemetryContext?.userId,
      usuarioNome: input.telemetryContext?.usuarioNome,
      empresaNome: input.telemetryContext?.empresaNome,
      licitacaoId: input.telemetryContext?.licitacaoId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro na requisição OpenAI";
    emitirTelemetriaLlm({
      provider: "LLM_OPENAI",
      model,
      promptTokens: 0,
      outputTokens: 0,
      duracaoMs: Date.now() - startMs,
      feature,
      status: "ERRO",
      erro: msg,
      tenantId: input.telemetryContext?.tenantId,
      userId: input.telemetryContext?.userId,
      usuarioNome: input.telemetryContext?.usuarioNome,
      empresaNome: input.telemetryContext?.empresaNome,
      licitacaoId: input.telemetryContext?.licitacaoId,
    });
    return null;
  }

  return null;
}

/**
 * Cliente unificado de IA (Gemini multimodal prioritário quando há PDFs/imagens ou GEMINI_API_KEY,
 * com fallback automático para OpenAI quando configurado).
 */
export async function chamarLlmJsonMultimodal<T = unknown>(
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
