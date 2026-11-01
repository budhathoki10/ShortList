import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiUnavailableError, modelList, structured } from "@/lib/ai";

const schema = z.object({ ok: z.boolean() });
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }), { status: 200 });
const status = (code: number) => new Response(JSON.stringify({ error: { code, message: "SECRET PROMPT ECHO" } }), { status: code });
const run = () => structured({ task: "write", system: "s", prompt: "my private cv text", schema });

describe("model lists", () => {
  it("parses comma-separated models, trims, de-duplicates and defaults", () => {
    expect(modelList(" a/one , b/two,a/one,, ")).toEqual(["a/one", "b/two"]);
    expect(modelList(undefined)).toEqual(["openrouter/free"]);
    expect(modelList("  ")).toEqual(["openrouter/free"]);
  });
});

describe("structured() with several models", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key-not-real";
    process.env.AI_WRITE_MODEL = "m/one, m/two, m/three";
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_WRITE_MODEL;
    warn.mockRestore();
  });
  const stub = (...responses: (Response | Error)[]) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)).model);
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    });
    return calls;
  };

  it("uses the first model when it works", async () => {
    const calls = stub(reply('{"ok":true}'));
    expect(await run()).toEqual({ ok: true });
    expect(calls).toEqual(["m/one"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("moves on after 429, 5xx, timeout and invalid JSON", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const calls = stub(status(429), status(503), timeout, reply("not json"), reply('{"ok":true}'));
    process.env.AI_WRITE_MODEL = "a,b,c,d,e";
    expect(await run()).toEqual({ ok: true });
    expect(calls).toEqual(["a", "b", "c", "d", "e"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("also moves on when the shape is wrong", async () => {
    const calls = stub(reply('{"nope":1}'), reply('```json\n{"ok":true}\n```'));
    expect(await run()).toEqual({ ok: true });
    expect(calls).toEqual(["m/one", "m/two"]);
  });

  it("throws AiUnavailableError and logs one safe warning when every model fails", async () => {
    stub(status(429), status(500), reply("{"));
    await expect(run()).rejects.toBeInstanceOf(AiUnavailableError);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    const logged = JSON.parse(line);
    expect(logged).toMatchObject({ event: "ai_fallback", task: "write" });
    expect(logged.attempts).toEqual([
      { model: "m/one", status: 429, reason: "HTTP 429 (429)" },
      { model: "m/two", status: 500, reason: "HTTP 500 (500)" },
      { model: "m/three", reason: "invalid JSON" },
    ]);
    expect(line).not.toMatch(/SECRET|private cv|test-key/);
  });

  it("stops at once when the key is rejected", async () => {
    const calls = stub(status(401));
    await expect(run()).rejects.toBeInstanceOf(AiUnavailableError);
    expect(calls).toEqual(["m/one"]);
  });
});
