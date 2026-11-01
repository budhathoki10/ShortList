import "server-only";
import { z } from "zod";

/**
 * Two jobs for the model: reading (turning a CV or job post into structured data, cheap and
 * fast) and writing (tailoring, cover letters, interview feedback, where quality matters).
 * Both go through OpenRouter's OpenAI-compatible chat API, so any model it hosts will do.
 */
const DEFAULT_MODEL = "openrouter/free";

/** A comma-separated list in the env var, tried in order: "openai/gpt-4o-mini, anthropic/claude-haiku". */
export function modelList(raw: string | undefined): string[] {
  const list = (raw ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? [...new Set(list)] : [DEFAULT_MODEL];
}

const MODELS = {
  read: () => modelList(process.env.AI_READ_MODEL),
  write: () => modelList(process.env.AI_WRITE_MODEL),
};

const baseUrl = () => (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");

export function aiEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** The model declined, was cut off, or returned something that didn't fit the schema. Callers fall back to plain code. */
export class AiUnavailableError extends Error {}

type ChatResponse = {
  choices?: { finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string; code?: number | string };
};

/** Models sometimes wrap JSON in a code fence even when told not to. */
function jsonFrom(content: string): unknown {
  const body = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(body);
}

/** Why one model attempt failed. Never holds prompt text, CV text or keys. */
type Attempt = { model: string; status?: number; reason: string };

/** Thrown inside one attempt. `stop` ends the whole chain (the key is rejected, so no model will help). */
class AttemptError extends Error {
  constructor(message: string, readonly status?: number, readonly stop = false) {
    super(message);
  }
}

async function attemptModel<S extends z.ZodType>(model: string, key: string, jsonSchema: Record<string, unknown>, opts: { task: "read" | "write"; system: string; prompt: string; schema: S; maxTokens?: number }): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional attribution headers OpenRouter shows on its dashboards.
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Shortlist",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 8000,
        temperature: opts.task === "write" ? 0.4 : 0,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema: jsonSchema } },
        // Only route to providers that honour the schema, and never to ones that keep prompts or train on them: the prompts hold people's CVs.
        provider: { require_parameters: true, data_collection: "deny" },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new AttemptError(timedOut ? "timeout" : "network error");
  }

  const data = (await res.json().catch(() => ({}))) as ChatResponse;
  // Never include the response body in the error: it can echo prompt text, which holds the user's CV.
  if (!res.ok) throw new AttemptError(`HTTP ${res.status}${data.error?.code ? ` (${data.error.code})` : ""}`, res.status, res.status === 401 || res.status === 403);
  if (data.error) throw new AttemptError(`provider error (${data.error.code ?? "unknown"})`, typeof data.error.code === "number" ? data.error.code : undefined);

  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new AttemptError("the model declined");
  if (choice?.finish_reason === "length") throw new AttemptError("the answer was cut off");
  const content = choice?.message?.content;
  if (!content) throw new AttemptError("the model returned nothing");

  let raw: unknown;
  try {
    raw = jsonFrom(content);
  } catch {
    throw new AttemptError("invalid JSON");
  }
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) throw new AttemptError("the answer didn't match the expected shape");
  return parsed.data;
}

/**
 * One request, one validated JSON answer. The reply is constrained to the schema by the
 * provider, then checked against it again here: nothing the model returns is trusted until
 * it has passed `schema`. Each configured model is tried in order (rate limit, server error,
 * timeout, bad JSON all move on to the next); only when every one has failed does the caller
 * get an AiUnavailableError and fall back to plain code, with one structured warning logged.
 */
export async function structured<S extends z.ZodType>(opts: {
  task: "read" | "write";
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiUnavailableError("OPENROUTER_API_KEY is not set");

  const jsonSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const attempts: Attempt[] = [];
  for (const model of opts.task === "write" ? MODELS.write() : MODELS.read()) {
    try {
      return await attemptModel(model, key, jsonSchema, { ...opts });
    } catch (err) {
      const e = err instanceof AttemptError ? err : new AttemptError("unexpected error");
      attempts.push({ model, status: e.status, reason: e.message });
      if (e.stop) break;
    }
  }
  console.warn(JSON.stringify({ event: "ai_fallback", task: opts.task, attempts }));
  throw new AiUnavailableError(`No model answered (${attempts.map((a) => `${a.model}: ${a.reason}`).join("; ")})`);
}

/** Wrap user-provided text so the model treats it as material to work on, not instructions. */
export function quoted(label: string, text: string): string {
  return `<${label}>\n${text.replace(new RegExp(`</?${label}>`, "gi"), "")}\n</${label}>`;
}
