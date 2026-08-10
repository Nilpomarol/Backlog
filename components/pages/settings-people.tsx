"use client";

import { AppWindow, Ban, MoreHorizontal, RotateCcw, ShieldCheck, Trash2, User, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { classes } from "../../lib/format";
import type { ManagedUser, Role } from "../../lib/domain";
import { useRouter } from "../../lib/local-navigation";
import {
  useErrorMessage,
  useInviteUser,
  useManagedApps,
  useManagedUsers,
  useRemoveInvitation,
  useSetUserAccess,
  useSetUserApps,
  useSetUserRole,
  useUserApps,
} from "../../lib/queries";
import { useAuth, useT } from "../providers";
import { AppIcon, Avatar, Button, IconButton, SkeletonList, TextField } from "../ui/primitives";
import { ConfirmDialog, Menu, MenuItem, MenuSeparator, Sheet } from "../ui/overlay";
import { ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";
import { AccessSheet } from "./access-sheet";
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
  const { data: apps } = useManagedApps(!!isAdmin);
  const describeError = useErrorMessage();
  const invite = useInviteUser();
  const setRole = useSetUserRole();
  const setAccess = useSetUserAccess();
  const setUserApps = useSetUserApps();
  const removeInvitation = useRemoveInvitation();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole_] = useState<Role>("user");
  const [pending, setPending] = useState<PendingAction>(null);
  const [accessUser, setAccessUser] = useState<ManagedUser | null>(null);

  const { data: grantedApps, isPending: grantsPending } = useUserApps(accessUser?.id, !!accessUser);
  const appOptions = useMemo(
    () =>
      [...(apps ?? [])]
        .filter((app) => app.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((app) => ({
          id: app.id,
          primary: app.name,
          secondary: app.description ?? undefined,
          media: <AppIcon name={app.name} logoUrl={app.logoUrl} className="access-icon" />,
        })),
    [apps],
  );

  const onError = (failure: unknown) => toast(describeError(failure), { tone: "error" });

  if (!isAdmin) return null;

  function openInvite() {
    setEmail("");
    setName("");
    setRole_("user");
    setInviteOpen(true);
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || name.trim().length < 2) return;
    invite.mutate(
      { id: crypto.randomUUID(), email: email.trim(), name: name.trim(), role },
      {
        onError,
        onSuccess: () => {
          toast(t.toastInvited);
          setInviteOpen(false);
        },
      },
    );
  }

  const changeRole = (user: ManagedUser, nextRole: Role) =>
    setRole.mutate({ id: user.id, role: nextRole }, { onError, onSuccess: () => toast(t.toastSaved) });

  const restore = (user: ManagedUser) =>
    setAccess.mutate({ id: user.id, active: true }, { onError, onSuccess: () => toast(t.toastAccessChanged) });

  const groups: { key: ManagedUser["status"]; label: string; members: ManagedUser[] }[] = [
    { key: "linked", label: t.statusLinked, members: (users ?? []).filter((user) => user.status === "linked") },
    { key: "pending", label: t.statusPending, members: (users ?? []).filter((user) => user.status === "pending") },
    { key: "revoked", label: t.statusRevoked, members: (users ?? []).filter((user) => user.status === "revoked") },
  ];

  function PersonMenu({ user }: { user: ManagedUser }) {
    const isSelf = user.id === profile?.id;
    const canChangeRole = !isSelf && user.status !== "revoked";
    const canManageAccess = user.role === "user" && user.status !== "revoked";
    const canRevoke = !isSelf && user.status === "linked";
    const canRestore = user.status === "revoked";
    const canRemove = !isSelf && user.status === "pending";
    if (!canChangeRole && !canManageAccess && !canRevoke && !canRestore && !canRemove) return null;

    const roleItem = user.role === "admin" ? t.makeMember : t.makeAdministrator;
    const RoleIcon = user.role === "admin" ? User : ShieldCheck;
    const needsSeparator = (canChangeRole || canManageAccess) && (canRevoke || canRestore || canRemove);

    return (
      <Menu
        label={`${t.moreActions}: ${user.name}`}
        trigger={(props) => (
          <IconButton label={`${t.moreActions}: ${user.name}`} size="sm" {...props}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </IconButton>
        )}
      >
        {(close) => (
          <>
            {canChangeRole && (
              <MenuItem
                icon={<RoleIcon size={15} aria-hidden="true" />}
                onClick={() => { close(); changeRole(user, user.role === "admin" ? "user" : "admin"); }}
              >
                {roleItem}
              </MenuItem>
            )}
            {canManageAccess && (
              <MenuItem
                icon={<AppWindow size={15} aria-hidden="true" />}
                onClick={() => { close(); setAccessUser(user); }}
              >
                {t.manageAppAccess}
              </MenuItem>
            )}
            {needsSeparator && <MenuSeparator />}
            {canRestore && (
              <MenuItem
                icon={<RotateCcw size={15} aria-hidden="true" />}
                onClick={() => { close(); restore(user); }}
              >
                {t.restoreAccess}
              </MenuItem>
            )}
            {canRevoke && (
              <MenuItem
                danger
                icon={<Ban size={15} aria-hidden="true" />}
                onClick={() => { close(); setPending({ kind: "revoke", user }); }}
              >
                {t.revokeAccess}
              </MenuItem>
            )}
            {canRemove && (
              <MenuItem
                danger
                icon={<Trash2 size={15} aria-hidden="true" />}
                onClick={() => { close(); setPending({ kind: "remove", user }); }}
              >
                {t.removeInvitation}
              </MenuItem>
            )}
          </>
        )}
      </Menu>
    );
  }

  function AccessTag({ user }: { user: ManagedUser }) {
    if (user.role === "admin") {
      return (
        <span className="person-tag person-tag-admin">
          <ShieldCheck size={12} aria-hidden="true" />
          {t.administrator}
        </span>
      );
    }
    const label = user.accessCount === 0 ? t.noAppAccess : t.appsCount(user.accessCount);
    if (user.status === "revoked") {
      return (
        <span className={classes("person-tag", user.accessCount === 0 && "person-tag-empty")}>
          <AppWindow size={12} aria-hidden="true" />
          {label}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={classes("person-tag person-tag-action", user.accessCount === 0 && "person-tag-empty")}
        onClick={() => setAccessUser(user)}
        aria-label={`${t.manageAppAccess}: ${user.name}`}
      >
        <AppWindow size={12} aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <div className="page page-prose">
      <header className="page-header">
        <h1 className="t-display">{t.settingsTitle}</h1>
      </header>
      <SettingsNav />

      <div className="people-head">
        <div>
          <div className="people-headline">
            <h2 className="t-title">{t.people}</h2>
            {!isPending && !isError && (users?.length ?? 0) > 0 && (
              <span className="people-count">{users!.length}</span>
            )}
          </div>
          <p className="people-lead">{t.peopleSubtitle}</p>
        </div>
        <Button variant="primary" icon={<UserPlus size={15} aria-hidden="true" />} onClick={openInvite}>
          {t.invite}
        </Button>
      </div>

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
        groups.map(({ key, label, members }) =>
          members.length === 0 ? null : (
            <section className="people-section" key={key}>
              <div className="people-section-head">
                <span className="people-section-label">{label}</span>
                <span className="people-count">{members.length}</span>
                <span className="people-section-rule" aria-hidden="true" />
              </div>
              <div className="people-list">
                {members.map((user) => {
                  const isSelf = user.id === profile?.id;
                  return (
                    <article
                      className={classes("person-card", user.status === "revoked" && "person-card-muted")}
                      key={user.id}
                    >
                      <Avatar name={user.name} url={user.avatarUrl} size="lg" admin={user.role === "admin"} />
                      <div className="person-info">
                        <p className="person-name">
                          {user.name}
                          {isSelf && <span className="person-you">{t.you}</span>}
                        </p>
                        <p className="person-email">{user.email}</p>
                        <div className="person-tags">
                          <AccessTag user={user} />
                          {user.status === "pending" && (
                            <span className="person-tag person-tag-empty">{t.statusPending}</span>
                          )}
                        </div>
                      </div>
                      <PersonMenu user={user} />
                    </article>
                  );
                })}
              </div>
            </section>
          ),
        )
      )}

      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t.invite}
        subtitle={t.peopleSubtitle}
        closeLabel={t.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              form="invite-form"
              variant="primary"
              loading={invite.isPending}
              icon={<UserPlus size={15} aria-hidden="true" />}
              disabled={!email.trim() || name.trim().length < 2}
            >
              {t.sendInvitation}
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={submitInvite}>
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
            <p className="field-hint">{t.manageAppAccessForUserSubtitle}</p>
          </div>
        </form>
      </Sheet>

      <AccessSheet
        open={!!accessUser}
        onClose={() => setAccessUser(null)}
        title={accessUser ? `${t.manageAppAccess} · ${accessUser.name}` : t.manageAppAccess}
        subtitle={t.manageAppAccessForUserSubtitle}
        options={appOptions}
        initialSelected={grantedApps}
        loading={grantsPending}
        saving={setUserApps.isPending}
        copy={{
          save: t.saveChanges,
          cancel: t.cancel,
          close: t.close,
          loading: t.loading,
          empty: t.noAppsYet,
          selectedCount: (count) => t.appsSelected(count),
        }}
        onSave={(appIds) => {
          if (!accessUser) return;
          setUserApps.mutate(
            { userId: accessUser.id, appIds },
            {
              onError,
              onSuccess: () => {
                toast(t.toastAccessChanged);
                setAccessUser(null);
              },
            },
          );
        }}
      />

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
