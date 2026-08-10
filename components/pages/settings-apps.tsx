"use client";

import { Archive, ArrowDown, ArrowUp, KeyRound, LayoutGrid, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { IMAGE_ALLOWED_TYPES, ImageUploadError, uploadImage } from "../../lib/upload-image";
import type { ManagedApplication } from "../../lib/domain";
import {
  useAppUsers,
  useCreateApp,
  useDeleteApp,
  useErrorMessage,
  useManagedApps,
  useManagedUsers,
  useSetAppUsers,
  useUpdateApp,
} from "../../lib/queries";
import { useAuth, useT } from "../providers";
import { AppIcon, Avatar, Button, IconButton, SkeletonList, TextAreaField, TextField } from "../ui/primitives";
import { ConfirmDialog, Menu, MenuItem, MenuSeparator, Sheet } from "../ui/overlay";
import { EmptyState, ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";
import { AccessSheet } from "./access-sheet";
import { SettingsNav } from "./settings-nav";

export function AppsSettingsPage() {
  const t = useT();
  const router = useRouter();
  const { profile, status: authStatus } = useAuth();
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (authStatus === "ready" && !isAdmin) router.replace("/settings/profile");
  }, [authStatus, isAdmin, router]);

  const { data: apps, isPending, isError, error, refetch } = useManagedApps(!!isAdmin);
  const { data: people } = useManagedUsers(!!isAdmin);
  const describeError = useErrorMessage();
  const createApp = useCreateApp();
  const updateApp = useUpdateApp();
  const deleteApp = useDeleteApp();
  const setAppUsers = useSetAppUsers();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<ManagedApplication | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedApplication | null>(null);
  const [reordering, setReordering] = useState(false);
  const [showLogoUrlField, setShowLogoUrlField] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [accessApp, setAccessApp] = useState<ManagedApplication | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const { data: grantedUsers, isPending: grantsPending } = useAppUsers(accessApp?.id, !!accessApp);
  // Admins already reach every app, so only non-admin members are worth granting per-app.
  const userOptions = useMemo(
    () =>
      [...(people ?? [])]
        .filter((person) => person.role === "user" && person.status !== "revoked")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => ({
          id: person.id,
          primary: person.name,
          secondary: person.email,
          media: <Avatar name={person.name} url={person.avatarUrl} size="md" />,
        })),
    [people],
  );

  const onError = (failure: unknown) => toast(describeError(failure), { tone: "error" });

  if (!isAdmin) return null;

  const ordered = [...(apps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const activeApps = ordered.filter((app) => app.isActive);
  const archivedApps = ordered.filter((app) => !app.isActive);

  function resetForm() {
    setEditingId(null);
    setName("");
    setLogoUrl("");
    setDescription("");
    setShowLogoUrlField(false);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(app: ManagedApplication) {
    setEditingId(app.id);
    setName(app.name);
    setLogoUrl(app.logoUrl ?? "");
    setDescription(app.description ?? "");
    setShowLogoUrlField(!!app.logoUrl);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
  }

  function restore(app: ManagedApplication) {
    updateApp.mutate({ id: app.id, isActive: true }, { onError, onSuccess: () => toast(t.toastAppSaved) });
  }

  async function handleLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingLogo(true);
    try {
      setLogoUrl(await uploadImage(file, "app-logos"));
    } catch (error) {
      const code = error instanceof ImageUploadError ? error.code : "upload";
      toast(
        {
          type: t.logoInvalidType,
          "source-too-large": t.logoSourceTooLarge,
          "svg-too-large": t.logoSvgTooLarge,
          compress: t.logoTooLarge,
          upload: t.logoUploadFailed,
        }[code],
        { tone: "error" },
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    const payload = { name: name.trim(), logoUrl: logoUrl.trim() || null, description: description.trim() };
    const done = { onError, onSuccess: () => { toast(t.toastAppSaved); closeForm(); } };
    if (editingId) updateApp.mutate({ id: editingId, ...payload }, done);
    else createApp.mutate({ id: crypto.randomUUID(), ...payload }, done);
  }

  /**
   * Reorder renumbers the active apps to a clean 0..n-1 sequence — the exact order the nav and
   * overview render. Archived apps aren't shown anywhere ordered, so they sit out of this.
   */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= activeApps.length) return;
    const next = [...activeApps];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      for (const [position, app] of next.entries()) {
        if (app.sortOrder !== position) await updateApp.mutateAsync({ id: app.id, sortOrder: position });
      }
    } catch (failure) {
      onError(failure);
    } finally {
      setReordering(false);
    }
  }

  function ActionsMenu({ app }: { app: ManagedApplication }) {
    return (
      <Menu
        label={`${t.moreActions}: ${app.name}`}
        trigger={(props) => (
          <IconButton label={`${t.moreActions}: ${app.name}`} size="sm" {...props}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </IconButton>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={<Pencil size={15} aria-hidden="true" />} onClick={() => { close(); openEdit(app); }}>
              {t.editApp}
            </MenuItem>
            <MenuItem icon={<KeyRound size={15} aria-hidden="true" />} onClick={() => { close(); setAccessApp(app); }}>
              {t.manageAccess}
            </MenuItem>
            {app.isActive ? (
              <MenuItem
                icon={<Archive size={15} aria-hidden="true" />}
                disabled={activeApps.length <= 1}
                onClick={() => { close(); setArchiveTarget(app); }}
              >
                {t.archive}
              </MenuItem>
            ) : (
              <MenuItem icon={<RotateCcw size={15} aria-hidden="true" />} onClick={() => { close(); restore(app); }}>
                {t.restoreAppAction}
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem
              danger
              icon={<Trash2 size={15} aria-hidden="true" />}
              disabled={app.itemCount > 0}
              onClick={() => { close(); setDeleteTarget(app); }}
            >
              {t.deleteApp}
            </MenuItem>
          </>
        )}
      </Menu>
    );
  }

  return (
    <div className="page page-prose">
      <header className="page-header">
        <h1 className="t-display">{t.settingsTitle}</h1>
      </header>
      <SettingsNav />

      <div className="appmgr-head">
        <div>
          <div className="appmgr-headline">
            <h2 className="t-title">{t.appsTitle}</h2>
            {!isPending && !isError && ordered.length > 0 && <span className="appmgr-count">{ordered.length}</span>}
          </div>
          <p className="appmgr-lead">{t.appsSubtitle}</p>
        </div>
        {!isPending && !isError && ordered.length > 0 && (
          <Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={openCreate}>
            {t.addApp}
          </Button>
        )}
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
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={t.noAppsYet}
          body={t.noAppsYetBody}
          action={
            <Button variant="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={openCreate}>
              {t.addApp}
            </Button>
          }
        />
      ) : (
        <>
          <section className="appmgr-section">
            <div className="appmgr-section-head">
              <span className="appmgr-section-label">{t.appsActiveSection}</span>
              <span className="appmgr-count">{activeApps.length}</span>
              <span className="appmgr-section-rule" aria-hidden="true" />
            </div>
            <div className="appmgr-list">
              {activeApps.map((app, index) => (
                <article className="appmgr-card" key={app.id}>
                  <span className="appmgr-pos" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <AppIcon name={app.name} logoUrl={app.logoUrl} className="appmgr-logo" />
                  <div className="appmgr-info">
                    <p className="appmgr-name">{app.name}</p>
                    {app.description && <p className="appmgr-desc">{app.description}</p>}
                    <p className="appmgr-metric">{t.itemsCounted(app.itemCount)}</p>
                  </div>
                  <div className="appmgr-actions">
                    <div className="appmgr-reorder">
                      <IconButton
                        label={`${t.reorderUp}: ${app.name}`}
                        size="sm"
                        disabled={index === 0 || reordering}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`${t.reorderDown}: ${app.name}`}
                        size="sm"
                        disabled={index === activeApps.length - 1 || reordering}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                    <ActionsMenu app={app} />
                  </div>
                </article>
              ))}
            </div>
          </section>

          {archivedApps.length > 0 && (
            <section className="appmgr-section">
              <div className="appmgr-section-head">
                <span className="appmgr-section-label">{t.appsArchivedSection}</span>
                <span className="appmgr-count">{archivedApps.length}</span>
                <span className="appmgr-section-rule" aria-hidden="true" />
              </div>
              <div className="appmgr-list">
                {archivedApps.map((app) => (
                  <article className="appmgr-card appmgr-card-archived" key={app.id}>
                    <AppIcon name={app.name} logoUrl={app.logoUrl} className="appmgr-logo" />
                    <div className="appmgr-info">
                      <p className="appmgr-name">{app.name}</p>
                      <p className="appmgr-metric">{t.itemsCounted(app.itemCount)}</p>
                    </div>
                    <div className="appmgr-actions">
                      <Button size="sm" variant="secondary" icon={<RotateCcw size={14} aria-hidden="true" />} onClick={() => restore(app)}>
                        {t.restoreAppAction}
                      </Button>
                      <ActionsMenu app={app} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Sheet
        open={formOpen}
        onClose={closeForm}
        title={editingId ? t.editApp : t.newApp}
        subtitle={t.appsSubtitle}
        closeLabel={t.close}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              form="app-form"
              variant="primary"
              loading={createApp.isPending || updateApp.isPending}
              disabled={name.trim().length < 2}
            >
              {editingId ? t.saveChanges : t.createApp}
            </Button>
          </>
        }
      >
        <form id="app-form" onSubmit={submit}>
          <TextField
            label={t.appNameLabel}
            value={name}
            minLength={2}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
          />

          <div className="field">
            <label className="field-label">
              {t.appLogoLabel}
              <span className="field-optional">{t.optional}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AppIcon name={name} logoUrl={logoUrl || null} className="tile-icon" style={{ width: 40, height: 40, fontSize: 20 }} />
              <div className="btn-row">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={uploadingLogo}
                  icon={<Upload size={14} aria-hidden="true" />}
                  onClick={() => logoFileInputRef.current?.click()}
                >
                  {t.uploadLogo}
                </Button>
                {logoUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLogoUrl("")}>
                    {t.removeLogo}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowLogoUrlField((value) => !value)}
                  aria-expanded={showLogoUrlField}
                >
                  {t.pasteLogoUrl}
                </Button>
              </div>
              <input
                ref={logoFileInputRef}
                type="file"
                accept={IMAGE_ALLOWED_TYPES.join(",")}
                style={{ display: "none" }}
                onChange={(event) => void handleLogoFile(event)}
              />
            </div>
            <p className="field-hint">{t.appLogoHint}</p>
          </div>

          {showLogoUrlField && (
            <TextField
              label={t.pasteLogoUrl}
              type="url"
              value={logoUrl}
              maxLength={1000}
              placeholder="https://…"
              onChange={(event) => setLogoUrl(event.target.value)}
            />
          )}

          <TextAreaField
            label={t.appDescriptionLabel}
            optional={t.optional}
            value={description}
            maxLength={500}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </form>
      </Sheet>

      <AccessSheet
        open={!!accessApp}
        onClose={() => setAccessApp(null)}
        title={accessApp ? `${t.manageAccess} · ${accessApp.name}` : t.manageAccess}
        subtitle={t.manageAccessForAppSubtitle}
        options={userOptions}
        initialSelected={grantedUsers}
        loading={grantsPending}
        saving={setAppUsers.isPending}
        copy={{
          save: t.saveChanges,
          cancel: t.cancel,
          close: t.close,
          loading: t.loading,
          empty: t.noPeopleToGrant,
          selectedCount: (count) => t.peopleSelected(count),
        }}
        onSave={(userIds) => {
          if (!accessApp) return;
          setAppUsers.mutate(
            { appId: accessApp.id, userIds },
            {
              onError,
              onSuccess: () => {
                toast(t.toastAccessChanged);
                setAccessApp(null);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={t.archiveConfirmTitle}
        body={t.archiveConfirmBody}
        confirmLabel={t.archive}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive
        busy={updateApp.isPending}
        onConfirm={() => {
          if (!archiveTarget) return;
          updateApp.mutate(
            { id: archiveTarget.id, isActive: false },
            {
              onError,
              onSuccess: () => {
                toast(t.toastAppSaved);
                setArchiveTarget(null);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t.deleteAppConfirmTitle}
        body={t.deleteAppConfirmBody}
        confirmLabel={t.deleteApp}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive
        busy={deleteApp.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteApp.mutate(deleteTarget.id, {
            onError,
            onSuccess: () => {
              toast(t.toastAppDeleted);
              setDeleteTarget(null);
            },
          });
        }}
      />
    </div>
  );
}
