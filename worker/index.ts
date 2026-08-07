import handler from "vinext/server/app-router-entry";
import { api, type ApiEnvironment } from "../api/router";

interface Env extends ApiEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return api.fetch(request, env, context as never);
    }
    return handler.fetch(request, env, context);
  },
};

export default worker;
