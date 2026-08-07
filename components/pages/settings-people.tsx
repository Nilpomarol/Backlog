"use client";

import { Ban, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { ManagedUser, Role } from "../../lib/domain";
import {
  useErrorMessage,
  useInviteUser,
  useManagedUsers,
  useRemoveInvitation,
  useSetUserAccess,
  useSetUserRole,
} from "../../lib/queries";
import { useAuth, useT } from "../providers";
import { Avatar, Button, IconButton, SkeletonList, TextField } from "../ui/primitives";
import { ConfirmDialog } from "../ui/overlay";
import { ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";
import { SettingsNav } from "./settings-nav";

type PendingAction = { kind: "revoke" | "remove"; user: ManagedUser } | null;

export function PeopleSettingsPage() {
  const t = useT();
  const router = useRouter();
  const { profile, status: authStatus } = useAuth();
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (authStatus === "ready" && !isAdmin) router.replace("/settings/profile");
  }, [authStatus, isAdmin, router]);

  const { data: users, isPending, isError, error, refetch } = useManagedUsers(!!isAdmin);
  const describeError = useErrorMessage();
  const invite = useInviteUser();
  const setRole = useSetUserRole();
  const setAccess = useSetUserAccess();
  const removeInvitation = useRemoveInvitation();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole_] = useState<Role>("user");
  const [pending, setPending] = useState<PendingAction>(null);

  const onError = (failure: unknown) => toast(describeError(failure), { tone: "error" });

  if (!isAdmin) return null;

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || name.trim().length < 2) return;
    invite.mutate(
      { email: email.trim(), name: name.trim(), role },
      {
        onError,
        onSuccess: () => {
          toast(t.toastInvited);
          setEmail("");
          setName("");
          setRole_("user");
        },
      },
    );
  }

  const statusLabel = (user: ManagedUser) =>
    user.status === "linked" ? t.statusLinked : user.status === "revoked" ? t.statusRevoked : t.statusPending;

  const groups: [string, ManagedUser[]][] = [
    [t.statusLinked, (users ?? []).filter((user) => user.status === "linked")],
    [t.statusPending, (users ?? []).filter((user) => user.status === "pending")],
    [t.statusRevoked, (users ?? []).filter((user) => user.status === "revoked")],
  ];

  return (
    <div className="page page-prose">
      <header className="page-header">
        <h1 className="t-display">{t.settingsTitle}</h1>
      </header>
      <SettingsNav />

      <form className="panel" onSubmit={submitInvite}>
        <h2 className="panel-title">{t.invite}</h2>
        <p className="panel-subtitle">{t.peopleSubtitle}</p>

        <div className="form-grid form-grid-2">
          <TextField
            label={t.inviteEmail}
            type="email"
            inputMode="email"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label={t.inviteName}
            value={name}
            minLength={2}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="invite-role">
            {t.inviteRole}
          </label>
          <select
            id="invite-role"
            className="select"
            value={role}
            onChange={(event) => setRole_(event.target.value as Role)}
          >
            <option value="user">{t.member}</option>
            <option value="admin">{t.administrator}</option>
          </select>
        </div>

        <div className="btn-row btn-row-end">
          <Button
            type="submit"
            variant="primary"
            loading={invite.isPending}
            icon={<UserPlus size={15} aria-hidden="true" />}
            disabled={!email.trim() || name.trim().length < 2}
          >
            {t.sendInvitation}
          </Button>
        </div>
      </form>

      {isError ? (
        <ErrorState
          title={t.errorLoading}
          message={describeError(error)}
          onRetry={() => void refetch()}
          retryLabel={t.retry}
        />
      ) : isPending ? (
        <SkeletonList count={3} label={t.loading} />
      ) : (
        groups.map(([label, members]) =>
          members.length === 0 ? null : (
            <section className="section" key={label}>
              <div className="section-header">
                <h2 className="t-heading">{label}</h2>
                <span className="result-count">{members.length}</span>
              </div>
              <div className="data-list">
                {members.map((user) => {
                  const isSelf = user.id === profile?.id;
                  return (
                    <article
                      className={`data-row${user.status === "revoked" ? " data-row-muted" : ""}`}
                      key={user.id}
                    >
                      <Avatar name={user.name} url={user.avatarUrl} size="md" admin={user.role === "admin"} />
                      <div className="data-row-body">
                        <p className="data-row-name">
                          {user.name}
                          {isSelf && <span className="field-optional"> · {t.you}</span>}
                        </p>
                        <p className="data-row-meta">{user.email}</p>
                        <p className="data-row-meta">{statusLabel(user)}</p>
                      </div>

                      <div className="data-row-actions">
                        <select
                          className="select select-sm"
                          value={user.role}
                          aria-label={`${t.inviteRole}: ${user.name}`}
                          disabled={isSelf || user.status === "revoked"}
                          title={isSelf ? t.cannotChangeSelf : undefined}
                          onChange={(event) =>
                            setRole.mutate(
                              { id: user.id, role: event.target.value as Role },
                              { onError, onSuccess: () => toast(t.toastSaved) },
                            )
                          }
                        >
                          <option value="user">{t.member}</option>
                          <option value="admin">{t.administrator}</option>
                        </select>

                        {!isSelf &&
                          (user.status === "pending" ? (
                            <IconButton
                              label={`${t.removeInvitation}: ${user.name}`}
                              tone="danger"
                              onClick={() => setPending({ kind: "remove", user })}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </IconButton>
                          ) : user.status === "revoked" ? (
                            <IconButton
                              label={`${t.restoreAccess}: ${user.name}`}
                              onClick={() =>
                                setAccess.mutate(
                                  { id: user.id, active: true },
                                  { onError, onSuccess: () => toast(t.toastAccessChanged) },
                                )
                              }
                            >
                              <RotateCcw size={15} aria-hidden="true" />
                            </IconButton>
                          ) : (
                            <IconButton
                              label={`${t.revokeAccess}: ${user.name}`}
                              tone="danger"
                              onClick={() => setPending({ kind: "revoke", user })}
                            >
                              <Ban size={15} aria-hidden="true" />
                            </IconButton>
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ),
        )
      )}

      <ConfirmDialog
        open={pending?.kind === "revoke"}
        onClose={() => setPending(null)}
        title={t.revokeConfirmTitle}
        body={t.revokeConfirmBody}
        confirmLabel={t.revokeAccess}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive
        busy={setAccess.isPending}
        onConfirm={() => {
          if (pending?.kind !== "revoke") return;
          setAccess.mutate(
            { id: pending.user.id, active: false },
            {
              onError,
              onSuccess: () => {
                toast(t.toastAccessChanged);
                setPending(null);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={pending?.kind === "remove"}
        onClose={() => setPending(null)}
        title={t.removeInvitationConfirmTitle}
        body={t.removeInvitationConfirmBody}
        confirmLabel={t.removeInvitation}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive
        busy={removeInvitation.isPending}
        onConfirm={() => {
          if (pending?.kind !== "remove") return;
          removeInvitation.mutate(pending.user.id, {
            onError,
            onSuccess: () => {
              toast(t.toastSaved);
              setPending(null);
            },
          });
        }}
      />
    </div>
  );
}
