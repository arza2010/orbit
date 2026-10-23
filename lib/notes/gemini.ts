import "server-only";

// Gemini access for class notes. Two routes to the same models:
//  1. OpenRouter (OPENROUTER_API_KEY): Google models served by Google's own infrastructure.
//  2. Google's Gemini API directly (GEMINI_API_KEY, an "AIza..." key).
// OpenRouter wins when both are set.

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Only Google's own infrastructure may serve requests, never another vendor's hosting.
const OPENROUTER_PROVIDER = { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false };

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const redact = (s: string) => s.replace(/(key=|Bearer\s+)[^\s&"']+/gi, "$1…").replace(/sk-or-[\w-]+/g, "sk-or-…");

const openRouterKey = () => process.env.OPENROUTER_API_KEY?.trim() || "";
const googleKey = () => process.env.GEMINI_API_KEY?.trim() || "";
const hasOpenRouter = () => openRouterKey() !== "";

// Best first. If none exist, fall back to any Flash model that can generate text.
const PREFERRED = ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash"];
const NOT_TEXT = /lite|tts|live|image|audio|transcribe|embed|omni|veo|imagen|robotics|computer|batch|free/i;

async function http(url: string, init: RequestInit & { headers: Record<string, string> }) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string } | string } | null)?.error;
    const msg = typeof err === "string" ? err : (err?.message ?? text.slice(0, 200));
    const hint = res.status === 402 ? " (out of credits)" : "";
    throw new GeminiError(redact(`AI request failed (${res.status}): ${msg}${hint}`), res.status);
  }
  return body as Record<string, unknown>;
}

// ---------------------------------------------------------------- model choice

let modelPromise: Promise<string> | null = null;

/** The model to use: GEMINI_MODEL if set, otherwise the best one this key can actually call. */
export function pickModel(): Promise<string> {
  const forced = process.env.GEMINI_MODEL?.trim();
  if (forced) return Promise.resolve(hasOpenRouter() && !forced.includes("/") ? `google/${forced}` : forced);
  if (!modelPromise) {
    modelPromise = (hasOpenRouter() ? pickOpenRouterModel() : pickGoogleModel()).catch((err) => {
      modelPromise = null; // try again next time
      throw err;
    });
  }
  return modelPromise;
}

async function pickOpenRouterModel(): Promise<string> {
  const body = (await http(`${OPENROUTER_BASE}/models`, { headers: { Authorization: `Bearer ${openRouterKey()}` } })) as {
    data?: { id: string }[];
  };
  const ids = (body.data ?? []).map((m) => m.id).filter((id) => id.startsWith("google/gemini"));
  const preferred = PREFERRED.map((m) => `google/${m}`).find((id) => ids.includes(id));
  if (preferred) return preferred;
  const flash = ids.filter((id) => /flash/.test(id) && !NOT_TEXT.test(id)).sort().reverse()[0];
  if (flash) return flash;
  throw new GeminiError("No Google Gemini text model is available on OpenRouter right now");
}

async function pickGoogleModel(): Promise<string> {
  if (!googleKey()) throw new GeminiError("Set OPENROUTER_API_KEY (or GEMINI_API_KEY) in .env.local");
  const body = (await http(`${GOOGLE_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": googleKey() } })) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const usable = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  const preferred = PREFERRED.find((id) => usable.includes(id));
  if (preferred) return preferred;
  const flash = usable.filter((id) => /^gemini-.*flash/.test(id) && !NOT_TEXT.test(id)).sort().reverse()[0];
  if (flash) return flash;
  throw new GeminiError("No usable Gemini text model found for this API key");
}

// ---------------------------------------------------------------- transports

type Completion = { text: string };

const RETRY_DELAYS = [1500, 5000, 12000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof GeminiError && (err.status === 429 || (err.status ?? 0) >= 500);
      if (!retryable || attempt >= RETRY_DELAYS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
}

async function viaOpenRouter(
  model: string,
  system: string,
  user: string,
  opts: { json: boolean; temperature: number; maxOutputTokens: number },
): Promise<Completion> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: opts.temperature,
    max_tokens: opts.maxOutputTokens,
    provider: OPENROUTER_PROVIDER,
    reasoning: { effort: "low" }, // extraction work; keeps cost and latency down
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const out = (await http(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openRouterKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; error?: { message?: string } };

  const choice = out.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") throw new GeminiError("The model ran out of output space; the class may be too long");
  if (!text.trim()) throw new GeminiError(`The model returned no text (${choice?.finish_reason ?? out.error?.message ?? "unknown"})`);
  return { text };
}

type Part = { text?: string; thought?: boolean };

async function viaGoogle(
  model: string,
  system: string,
  user: string,
  opts: { json: boolean; temperature: number; maxOutputTokens: number; schema?: Record<string, unknown> },
): Promise<Completion> {
  const generationConfig: Record<string, unknown> = { temperature: opts.temperature, maxOutputTokens: opts.maxOutputTokens };
  if (opts.json) generationConfig.responseMimeType = "application/json";
  if (opts.json && opts.schema) generationConfig.responseSchema = opts.schema;

  const send = (cfg: Record<string, unknown>) =>
    http(`${GOOGLE_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": googleKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: cfg,
      }),
    });

  let out: Record<string, unknown>;
  try {
    out = await send(generationConfig);
  } catch (err) {
    // Some models reject a schema; JSON mode plus the shape described in the prompt still works.
    if (opts.schema && err instanceof GeminiError && err.status === 400 && /schema/i.test(err.message)) {
      const { responseSchema: _drop, ...rest } = generationConfig;
      void _drop;
      out = await send(rest);
    } else {
      throw err;
    }
  }

  const res = out as {
    candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (res.promptFeedback?.blockReason) throw new GeminiError(`The request was blocked (${res.promptFeedback.blockReason})`);
  const cand = res.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  if (cand?.finishReason === "MAX_TOKENS") throw new GeminiError("The model ran out of output space; the class may be too long");
  if (!text.trim()) throw new GeminiError(`The model returned no text (${cand?.finishReason ?? "unknown"})`);
  return { text };
}

const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

// ---------------------------------------------------------------- public API

export async function generateJson({
  system,
  user,
  schema,
  maxOutputTokens = 16_384,
}: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<{ data: unknown; model: string }> {
  const model = await pickModel();
  const opts = { json: true, temperature: 0.2, maxOutputTokens };

  const result = await withRetry(() =>
    hasOpenRouter()
      ? // OpenRouter gets the schema inside the prompt, since JSON mode is looser than a typed schema.
        viaOpenRouter(
          model,
          `${system}\n\nReturn ONLY a JSON object that matches this schema (types are written in uppercase):\n${JSON.stringify(schema)}`,
          user,
          opts,
        )
      : viaGoogle(model, system, user, { ...opts, schema }),
  );

  try {
    return { data: JSON.parse(stripFences(result.text)), model };
  } catch {
    throw new GeminiError("The model returned malformed JSON");
  }
}

export async function generateText({
  system,
  user,
  maxOutputTokens = 16_384,
}: {
  system: string;
  user: string;
  maxOutputTokens?: number;
}): Promise<{ text: string; model: string }> {
  const model = await pickModel();
  const opts = { json: false, temperature: 0.3, maxOutputTokens };
  const { text } = await withRetry(() => (hasOpenRouter() ? viaOpenRouter(model, system, user, opts) : viaGoogle(model, system, user, opts)));
  return { text: text.trim(), model };
}
