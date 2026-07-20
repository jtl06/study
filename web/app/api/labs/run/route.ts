import { env } from "cloudflare:workers";

const MAX_CODE_LENGTH = 64 * 1024;

export async function POST(request: Request) {
  let body: { problemKey?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (
    typeof body.problemKey !== "string" ||
    typeof body.code !== "string" ||
    !body.code.trim()
  ) {
    return Response.json(
      { error: "A problem key and C source are required." },
      { status: 400 },
    );
  }
  if (body.code.length > MAX_CODE_LENGTH) {
    return Response.json({ error: "C source exceeds the 64 KB limit." }, { status: 413 });
  }

  const runtimeEnv = env as unknown as {
    C_RUNNER_URL?: string;
    C_RUNNER_TOKEN?: string;
  };
  if (!runtimeEnv.C_RUNNER_URL || !runtimeEnv.C_RUNNER_TOKEN) {
    return Response.json(
      { error: "The Railway C runner is not configured." },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${runtimeEnv.C_RUNNER_URL}/compile`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtimeEnv.C_RUNNER_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(125_000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return Response.json(
      { error: "The Railway C runner is unavailable." },
      { status: 502 },
    );
  }
}
