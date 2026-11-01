import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Two jobs for the model: reading (turning a CV or job post into structured data, cheap and
 * fast) and writing (tailoring, cover letters, interview feedback, where quality matters).
 * Both call Claude through the official Anthropic SDK; the model for each job is set in env.
 */
const DEFAULT_READ_MODELS = "claude-haiku-5-5,claude-sonnet-5-5";
const DEFAULT_WRITE_MODELS = "claude-sonnet-5-5,claude-opus-5-5";

/** A comma-separated list in the env var, tried in order: "claude-haiku-5-5, claude-sonnet-5-5". */
export function modelList(raw: string | undefined, fallback = DEFAULT_WRITE_MODELS): string[] {
  const parse = (value: string) => value.split(",").map((m) => m.trim()).filter(Boolean);
  const list = parse(raw ?? "");
  return [...new Set(list.length ? list : parse(fallback))];
}

const MODELS = {
  read: () => modelList(process.env.AI_READ_MODEL, DEFAULT_READ_MODELS),
  write: () => modelList(process.env.AI_WRITE_MODEL, DEFAULT_WRITE_MODELS),
};

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** The model declined, was cut off, or returned something that didn't fit the schema. Callers fall back to plain code. */
export class AiUnavailableError extends Error {}

/** Why one model attempt failed. Never holds prompt text, CV text or keys. */
type Attempt = { model: string; status?: number; reason: string };

/** Thrown inside one attempt. `stop` ends the whole chain (the key is rejected, so no model will help). */
class AttemptError extends Error {
  constructor(message: string, readonly status?: number, readonly stop = false) {
    super(message);
  }
}

async function attemptModel<S extends z.ZodType>(model: string, key: string, opts: { task: "read" | "write"; system: string; prompt: string; schema: S; maxTokens?: number }): Promise<z.infer<S>> {
  // Built per call so tests can swap `fetch`. Retries are off: the model list is the retry policy.
  const client = new Anthropic({ apiKey: key, baseURL: process.env.ANTHROPIC_BASE_URL || undefined, maxRetries: 0, timeout: 90_000 });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: zodOutputFormat(opts.schema) },
    });
  } catch (err) {
    // Never include the API error body: it can echo prompt text, which holds the user's CV.
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AttemptError("timeout");
    if (err instanceof Anthropic.APIConnectionError) throw new AttemptError("network error");
    if (err instanceof Anthropic.APIError) {
      throw new AttemptError(`HTTP ${err.status}`, err.status, err.status === 401 || err.status === 403);
    }
    throw new AttemptError("unexpected error");
  }

  if (message.stop_reason === "refusal") throw new AttemptError("the model declined");
  if (message.stop_reason === "max_tokens") throw new AttemptError("the answer was cut off");
  const content = message.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!content) throw new AttemptError("the model returned nothing");

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AttemptError("invalid JSON");
  }
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) throw new AttemptError("the answer didn't match the expected shape");
  return parsed.data;
}

/**
 * One request, one validated JSON answer. The reply is constrained to the schema by the API,
 * then checked against it again here: nothing the model returns is trusted until it has passed
 * `schema`. Each configured model is tried in order (rate limit, server error, timeout, bad
 * JSON all move on to the next); only when every one has failed does the caller get an
 * AiUnavailableError and fall back to plain code, with one structured warning logged.
 */
export async function structured<S extends z.ZodType>(opts: {
  task: "read" | "write";
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");

  const attempts: Attempt[] = [];
  for (const model of opts.task === "write" ? MODELS.write() : MODELS.read()) {
    try {
      return await attemptModel(model, key, opts);
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
