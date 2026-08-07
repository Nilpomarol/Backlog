import { describe, expect, it } from "vitest";
import {
  canChangeWorkflow,
  canDeleteItem,
  canEditItem,
  canManageSubtasks,
  canReadItem,
  canVote,
} from "../lib/permissions";

const admin = { id: "admin", role: "admin" as const };
const owner = { id: "owner", role: "user" as const };
const other = { id: "other", role: "user" as const };
const shared = { creatorId: owner.id, visibility: "shared" as const };
const internal = { creatorId: admin.id, visibility: "internal" as const };

describe("card permissions", () => {
  it("keeps internal cards visible only to administrators", () => {
    expect(canReadItem(admin, internal)).toBe(true);
    expect(canReadItem(owner, internal)).toBe(false);
    expect(canReadItem(other, internal)).toBe(false);
  });

  it("lets an owner edit and delete only their own card", () => {
    expect(canEditItem(owner, shared)).toBe(true);
    expect(canDeleteItem(owner, shared)).toBe(true);
    expect(canEditItem(other, shared)).toBe(false);
    expect(canDeleteItem(other, shared)).toBe(false);
    expect(canEditItem(admin, shared)).toBe(true);
  });

  it("reserves workflow changes for administrators", () => {
    expect(canChangeWorkflow(admin)).toBe(true);
    expect(canChangeWorkflow(owner)).toBe(false);
  });

  it("allows subtask management by the owner or administrator", () => {
    expect(canManageSubtasks(owner, shared)).toBe(true);
    expect(canManageSubtasks(admin, shared)).toBe(true);
    expect(canManageSubtasks(other, shared)).toBe(false);
  });

  it("prevents self-votes and votes on internal cards", () => {
    expect(canVote(owner, shared)).toBe(false);
    expect(canVote(other, shared)).toBe(true);
    expect(canVote(admin, internal)).toBe(false);
  });
});
