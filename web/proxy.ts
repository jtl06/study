import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export function proxy(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") return NextResponse.next();

  const runtimeEnv = env as unknown as {
    SITE_USERNAME?: string;
    SITE_PASSWORD?: string;
  };
  const username = runtimeEnv.SITE_USERNAME;
  const password = runtimeEnv.SITE_PASSWORD;

  // Keep local development frictionless. Railway provides both values.
  if (!username || !password) return NextResponse.next();

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Basic ")) {
    try {
      const credentials = atob(authorization.slice(6));
      const separator = credentials.indexOf(":");
      if (
        separator >= 0 &&
        credentials.slice(0, separator) === username &&
        credentials.slice(separator + 1) === password
      ) {
        return NextResponse.next();
      }
    } catch {
      // Fall through to the authentication challenge.
    }
  }

  return new Response("Study Lab authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="Study Lab", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: "/:path*",
};
