import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiUnavailableError, modelList, structured } from "@/lib/ai";

const schema = z.object({ ok: z.boolean() });
const message = (content: string, stop_reason = "end_turn") => new Response(JSON.stringify({ type: "message", role: "assistant", stop_reason, content: [{ type: "text", text: content }] }), { status: 200, headers: { "content-type": "application/json" } });
const reply = (content: string) => message(content);
const status = (code: number) => new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "SECRET PROMPT ECHO" } }), { status: code, headers: { "content-type": "application/json" } });
const run = () => structured({ task: "write", system: "s", prompt: "my private cv text", schema });

describe("model lists", () => {
  it("parses comma-separated models, trims, de-duplicates and defaults", () => {
    expect(modelList(" a/one , b/two,a/one,, ")).toEqual(["a/one", "b/two"]);
    expect(modelList(undefined, "x/default")).toEqual(["x/default"]);
    expect(modelList("  ", "x/a, x/b")).toEqual(["x/a", "x/b"]);
  });
});

describe("structured() with several models", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    process.env.AI_WRITE_MODEL = "m/one, m/two, m/three";
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
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

  it("also moves on when the shape is wrong or the model declines", async () => {
    const calls = stub(reply('{"nope":1}'), message('{"nope":2}', "refusal"), reply('{"ok":true}'));
    expect(await run()).toEqual({ ok: true });
    expect(calls).toEqual(["m/one", "m/two", "m/three"]);
  });

  it("throws AiUnavailableError and logs one safe warning when every model fails", async () => {
    stub(status(429), status(500), reply("{"));
    await expect(run()).rejects.toBeInstanceOf(AiUnavailableError);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    const logged = JSON.parse(line);
    expect(logged).toMatchObject({ event: "ai_fallback", task: "write" });
    expect(logged.attempts).toEqual([
      { model: "m/one", status: 429, reason: "HTTP 429" },
      { model: "m/two", status: 500, reason: "HTTP 500" },
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
