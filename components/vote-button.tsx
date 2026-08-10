"use client";

import { ChevronUp } from "lucide-react";
import { classes } from "../lib/format";
import { voteBlockedReason, type Visibility } from "../lib/domain";
import { useErrorMessage, useVote } from "../lib/queries";
import { useAuth, useT } from "./providers";
import { useToast } from "./ui/toast";

export type VotableRequest = {
  id: string;
  title: string;
  votes: number;
  voted: boolean;
  creatorId: string;
  visibility: Visibility;
};

/**
 * Optimistic vote control. A user who cannot vote sees the control disabled *with a reason*
 * rather than hidden — its absence would read as a missing feature.
 *
 * Admins triage by priority, not by voting for their own requests, so votes are just a number
 * they read — not a button they can press. Rendering a plain stat (no button semantics) instead
 * of a disabled button keeps that distinction honest rather than looking like a blocked action.
 */
export function VoteButton({ request, size = "sm" }: { request: VotableRequest; size?: "sm" | "lg" }) {
  const t = useT();
  const { profile } = useAuth();
  const vote = useVote();
  const { toast } = useToast();
  const describeError = useErrorMessage();

  if (profile?.role === "admin") {
    return (
      <span
        className={classes("vote-stat", size === "lg" && "vote-stat-lg")}
        aria-label={`${request.votes} ${t.votes}`}
      >
        <ChevronUp size={size === "lg" ? 15 : 13} aria-hidden="true" />
        {request.votes}
      </span>
    );
  }

  const blocked = voteBlockedReason(profile, request);
  const reason = blocked === "own" ? t.voteOwnReason : blocked === "internal" ? t.voteInternalReason : undefined;
  const action = request.voted ? t.removeVote : t.voteAction;

  return (
    <button
      type="button"
      className={classes("vote-btn", "card-overlay", size === "lg" && "vote-btn-lg")}
      aria-pressed={request.voted}
      aria-label={`${action}: ${request.title}`}
      title={reason ?? action}
      disabled={!!blocked}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        vote.mutate(
          { id: request.id, voted: request.voted },
          { onError: (error) => toast(describeError(error), { tone: "error" }) },
        );
      }}
    >
      <ChevronUp size={size === "lg" ? 18 : 15} aria-hidden="true" />
      {request.votes}
      {size === "lg" && <span style={{ fontFamily: "var(--font-sans)", fontWeight: 600 }}>{request.voted ? t.votedAction : t.voteAction}</span>}
    </button>
  );
}
