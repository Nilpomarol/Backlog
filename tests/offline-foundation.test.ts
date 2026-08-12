import { QueryClient } from "@tanstack/react-query";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientRoute } from "../lib/client-route";
import { ApiError } from "../lib/api";
import { mutationKeys, registerOfflineMutationDefaults } from "../lib/offline-mutations";
import { buildOfflineRequestDetails, groupItemsByApp, hasPersistableQueryData } from "../lib/query-persistence";
import { revisionConflicts } from "../api/router";

describe("offline client routing", () => {
  it("resolves dynamic routes without an RSC response", () => {
    expect(clientRoute("/a/my%20app")).toEqual({ kind: "app", appId: "my app", compose: false });
    expect(clientRoute("/a/my%20app/new")).toEqual({ kind: "app", appId: "my app", compose: true });
    expect(clientRoute("/r/local-id")).toEqual({ kind: "request", requestId: "local-id" });
    expect(clientRoute("/settings/people")).toEqual({ kind: "settings-people" });
    expect(clientRoute("/unknown")).toEqual({ kind: "not-found" });
    expect(clientRoute("/r/local-id/extra")).toEqual({ kind: "not-found" });
    expect(clientRoute("/settings/unknown")).toEqual({ kind: "not-found" });
  });
});

describe("durable mutation defaults", () => {
  it("retries network failures so React Query can pause and persist them", () => {
    const client = new QueryClient();
    registerOfflineMutationDefaults(client);
    const defaults = client.getMutationDefaults(mutationKeys.createRequest);
    const retry = defaults.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new ApiError("offline", 0, "offline"))).toBe(true);
    expect(retry(0, new ApiError("forbidden", 403, "forbidden"))).toBe(false);
    expect(defaults.scope).toEqual({ id: "offline-outbox" });
    expect(client.getMutationDefaults(mutationKeys.updateProfile).mutationFn).toBeTypeOf("function");
  });
});

describe("offline conflict detection", () => {
  it("accepts an unchanged base revision and rejects a stale one", () => {
    expect(revisionConflicts(undefined, 20)).toBe(false);
    expect(revisionConflicts(20, 20)).toBe(false);
    expect(revisionConflicts(19, 20)).toBe(true);
  });
});

describe("offline query persistence", () => {
  it("keeps cached data after an offline refresh changes the query to error", () => {
    expect(hasPersistableQueryData({ state: { data: [{ id: "cached-card" }] } })).toBe(true);
    expect(hasPersistableQueryData({ state: { data: null } })).toBe(true);
    expect(hasPersistableQueryData({ state: { data: undefined } })).toBe(false);
  });

  it("builds board caches from the global card index", () => {
    const grouped = groupItemsByApp([
      { id: "one", appId: "alpha" },
      { id: "two", appId: "beta" },
      { id: "three", appId: "alpha" },
    ]);
    expect(grouped.get("alpha")?.map((item) => item.id)).toEqual(["one", "three"]);
    expect(grouped.get("beta")?.map((item) => item.id)).toEqual(["two"]);
  });

  it("builds full task-detail caches from one offline snapshot", () => {
    const base = {
      appId: "alpha",
      description: null,
      type: "task" as const,
      status: "backlog" as const,
      priority: "none" as const,
      effort: "unknown" as const,
      visibility: "shared" as const,
      parentTitle: null,
      creatorId: "user",
      creatorName: "User",
      creatorAvatarUrl: null,
      creatorRole: "user" as const,
      votes: 0,
      voted: false,
      subtaskCount: 0,
      completedSubtasks: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const details = buildOfflineRequestDetails(
      [
        { ...base, id: "parent", title: "Parent", parentId: null },
        { ...base, id: "child", title: "Child", parentId: "parent", parentTitle: "Parent" },
      ],
      [{ id: "check", requestId: "parent", title: "Verify", done: false, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    );
    expect(details.get("parent")?.children.map((item) => item.id)).toEqual(["child"]);
    expect(details.get("parent")?.checklist.map((item) => item.id)).toEqual(["check"]);
    expect(details.get("child")?.parent).toEqual({ id: "parent", title: "Parent" });
  });
});

describe("production precache", () => {
  it("contains every generated application asset", async () => {
    const assetDirectory = path.resolve("dist/client/assets");
    const assetNames = await readdir(assetDirectory);
    const manifest = await readFile(path.resolve("dist/client/precache-manifest.js"), "utf8");
    expect(assetNames.length).toBeGreaterThan(10);
    for (const name of assetNames) expect(manifest).toContain(`/assets/${name}`);
    expect(manifest).toMatch(/__BACKLOG_CACHE_VERSION = "[a-f0-9]{12}"/);
  });
});
