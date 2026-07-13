import { spawn } from "node:child_process";
import { createServer } from "node:http";

const proxyPort = 8790;
const openAIKey = process.env.OPENAI_API_KEY ?? "";
const allowedPaths = new Set([
  "/v1/responses",
  "/v1/responses/input_tokens",
]);

const proxy = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (request.method !== "POST" || !allowedPaths.has(path)) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (
    !openAIKey ||
    request.headers.authorization !== `Bearer ${openAIKey}`
  ) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(`https://api.openai.com${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${openAIKey}`,
        "content-type": "application/json",
      },
      body: Buffer.concat(chunks),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    });
    response.end(body);
  } catch {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "OpenAI request failed" }));
  }
});

proxy.listen(proxyPort, "127.0.0.1", () => {
  const args = [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    "/data",
    "--port",
    process.env.PORT ?? "3000",
    "--ip",
    "0.0.0.0",
    "--var",
    `OPENAI_API_KEY:${openAIKey}`,
    "--var",
    `OPENAI_API_BASE_URL:http://127.0.0.1:${proxyPort}/v1`,
    "--var",
    `SITE_USERNAME:${process.env.SITE_USERNAME ?? ""}`,
    "--var",
    `SITE_PASSWORD:${process.env.SITE_PASSWORD ?? ""}`,
  ];
  const worker = spawn(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
  });

  const stop = (signal) => worker.kill(signal);
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  worker.on("exit", (code, signal) => {
    proxy.close(() => process.exit(code ?? (signal ? 1 : 0)));
  });
});
