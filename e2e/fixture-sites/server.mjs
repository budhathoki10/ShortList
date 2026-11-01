// Local stand-ins for the outside world in tests: job pages to read and a fake Anthropic API.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.FIXTURE_PORT ?? 4100);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

/** The last Messages request the fake Anthropic API saw, so tests can check what the app sent. */
let lastChat = null;

async function fakeAnthropic(req, res, url) {
  if (url.pathname === "/anthropic/_last") return json(res, 200, lastChat ?? {});
  if (url.pathname !== "/anthropic/v1/messages" || req.method !== "POST") return json(res, 404, { type: "error", error: { type: "not_found_error", message: "Not found" } });
  const key = req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (key !== "fake-anthropic-key") return json(res, 401, { type: "error", error: { type: "authentication_error", message: "No auth" } });
  const body = await readJson(req);
  lastChat = { headers: { apiKey: key }, body };
  const props = Object.keys(body.output_config?.format?.schema?.properties ?? {});
  // What the "model" says depends on the shape asked for, so tests can ask for good and bad answers.
  const text = props.includes("answer")
    ? JSON.stringify({ answer: "ok" })
    : props.includes("truncated")
      ? '{"truncated": "never fin'
      : props.includes("refused")
        ? ""
        : JSON.stringify({ unexpected: true });
  const stop_reason = props.includes("truncated") ? "max_tokens" : props.includes("refused") ? "refusal" : "end_turn";
  return json(res, 200, { id: "msg_fake", type: "message", role: "assistant", model: body.model, stop_reason, content: text ? [{ type: "text", text }] : [], usage: { input_tokens: 1, output_tokens: 1 } });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname.startsWith("/anthropic/")) return fakeAnthropic(req, res, url);
  if (url.pathname.startsWith("/company")) {
    const pages = {
      "/company": '<html><head><title>Example Company</title></head><body><h1>Example Company</h1><p>Our product helps small teams organise applications and customer conversations with a reliable online platform.</p><a href="/company/about">About our products</a><a href="/company/careers">Careers and culture</a><a href="https://unrelated.example/careers">An unrelated careers site</a></body></html>',
      "/company/about": '<html><head><title>Our product and engineering</title></head><body><p>Our engineering team builds Python services and maintains documented APIs with repeatable automated testing.</p><p>Our product supports small teams by keeping their customer records organised and searchable.</p></body></html>',
      "/company/careers": '<html><head><title>Careers at Example Company</title></head><body><p>Our remote team values collaboration, thoughtful written communication and regular feedback on practical work.</p><p>Our hiring process includes an introductory interview followed by a practical assessment and a discussion with the team.</p></body></html>',
    };
    const html = pages[url.pathname];
    res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
    return res.end(html ?? "Not found");
  }
  // A site that only shows posts to signed-in users.
  if (url.pathname === "/jobs/login-wall") {
    res.writeHead(403, { "content-type": "text/html" });
    return res.end("<h1>Sign in to see this job</h1>");
  }
  if (url.pathname === "/jobs/empty") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end("<html><body><p>Loading…</p></body></html>");
  }
  const name = url.pathname.replace(/^\//, "");
  if (!/^jobs\/[a-z-]+\.html$/.test(name)) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("Not found");
  }
  try {
    const html = await readFile(path.join(here, name), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Fixtures on http://127.0.0.1:${port}`));
