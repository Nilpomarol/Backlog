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
 */
export function VoteButton({ request, size = "sm" }: { request: VotableRequest; size?: "sm" | "lg" }) {
  const t = useT();
  const { profile } = useAuth();
  const vote = useVote();
  const { toast } = useToast();
  const describeError = useErrorMessage();

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
