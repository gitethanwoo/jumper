import { generateCode } from "./codes";
import { RelaySession } from "./relay-session";

interface Env {
  RELAY_SESSION: DurableObjectNamespace;
  CODES: KVNamespace;
}

const CODE_TTL_SECONDS = 600;

function relayHeaders({
  request,
  role,
  sessionId,
  code,
  token,
}: {
  request: Request;
  role: "bridge" | "mobile";
  sessionId: string;
  code?: string;
  token?: string;
}): Headers {
  const headers = new Headers(request.headers);
  headers.set("X-Relay-Role", role);
  headers.set("X-Relay-Session-Id", sessionId);

  if (code) {
    headers.set("X-Relay-Code", code);
  }

  if (token) {
    headers.set("X-Relay-Token", token);
  }

  return headers;
}

async function routeToSession(
  request: Request,
  env: Env,
  role: "bridge" | "mobile",
  sessionId: string,
  options?: { code?: string; token?: string }
): Promise<Response> {
  const id = env.RELAY_SESSION.idFromString(sessionId);
  const stub = env.RELAY_SESSION.get(id);

  const requestWithRelayHeaders = new Request(request.url, {
    method: request.method,
    headers: relayHeaders({
      request,
      role,
      sessionId,
      code: options?.code,
      token: options?.token,
    }),
  });

  return stub.fetch(requestWithRelayHeaders);
}

async function createBridgeSession(request: Request, env: Env): Promise<Response> {
  const sessionId = env.RELAY_SESSION.newUniqueId().toString();
  const code = generateCode();
  await env.CODES.put(code, sessionId, {
    expirationTtl: CODE_TTL_SECONDS,
  });

  return routeToSession(request, env, "bridge", sessionId, { code });
}

async function reconnectBridge(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const token = url.searchParams.get("token");

  if (!sessionId || !token) {
    return new Response("Missing session/token", { status: 400 });
  }

  return routeToSession(request, env, "bridge", sessionId, { token });
}

async function pairMobileWithCode(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const sessionId = await env.CODES.get(code);
  if (!sessionId) {
    return new Response("Code not found", { status: 404 });
  }

  await env.CODES.delete(code);
  return routeToSession(request, env, "mobile", sessionId, { code });
}

async function reconnectMobile(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const token = url.searchParams.get("token");

  if (!sessionId || !token) {
    return new Response("Missing session/token", { status: 400 });
  }

  return routeToSession(request, env, "mobile", sessionId, { token });
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/ws/bridge") {
      const hasSession = url.searchParams.has("session");
      const hasToken = url.searchParams.has("token");
      if (hasSession || hasToken) {
        if (!(hasSession && hasToken)) {
          return new Response("Missing session/token", { status: 400 });
        }

        return reconnectBridge(request, env);
      }

      return createBridgeSession(request, env);
    }

    if (url.pathname === "/ws/mobile") {
      const hasSession = url.searchParams.has("session");
      const hasToken = url.searchParams.has("token");
      const hasCode = url.searchParams.has("code");

      if (hasSession && hasToken) {
        return reconnectMobile(request, env);
      }

      if (hasSession || hasToken) {
        return new Response("Missing session/token", { status: 400 });
      }

      if (hasCode) {
        return pairMobileWithCode(request, env);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

export { RelaySession, Env, worker as default };
