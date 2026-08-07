import { describe, expect, it } from "vitest";
import { api } from "../api/router";

const executionContext = { waitUntil() {}, passThroughOnException() {}, props: {} };

describe("API guardrails", () => {
  it("rejects oversized write bodies before authentication or database work", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/items", { method: "POST", body: JSON.stringify({ value: "x".repeat(33_000) }), headers: { "content-type": "application/json" } }),
      {},
      executionContext,
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns a safe request identifier on failed requests", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/apps", { headers: { "x-request-id": "client_request_123" } }),
      {},
      executionContext,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBe("client_request_123");
  });
});
