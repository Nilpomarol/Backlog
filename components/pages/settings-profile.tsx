"use client";

import { Camera, Loader2, LogOut, ShieldCheck, Upload, User } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { classes } from "../../lib/format";
import { useOnlineStatus } from "../../lib/connectivity";
import { LANGUAGES, type Language } from "../../lib/i18n";
import { useErrorMessage, useUpdateProfile } from "../../lib/queries";
import { IMAGE_ALLOWED_TYPES, ImageUploadError, uploadImage } from "../../lib/upload-image";
import { useAuth, useLanguage } from "../providers";
import { Avatar, Button, SegmentedControl, TextField } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { SettingsNav } from "./settings-nav";

export function ProfileSettingsPage() {
  const { t, language, setLanguage } = useLanguage();
  const { profile, googlePhotoUrl, signOut } = useAuth();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();
  const describeError = useErrorMessage();
  const online = useOnlineStatus();

  const [name, setName] = useState(profile?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");
  const [showCustom, setShowCustom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed the form when the stored profile changes (after a successful save, or once the
  // profile first arrives). Adjusting during render avoids an effect-driven cascade.
  const identity = profile ? `${profile.name} ${profile.avatarUrl ?? ""}` : null;
  const [syncedIdentity, setSyncedIdentity] = useState(identity);
  if (identity !== null && identity !== syncedIdentity) {
    setSyncedIdentity(identity);
    setName(profile!.name);
    setAvatarUrl(profile!.avatarUrl ?? "");
  }

  if (!profile) return null;

  const trimmedName = name.trim();
  const nameError = trimmedName.length > 0 && trimmedName.length < 2 ? t.required : undefined;
  const dirty = trimmedName !== profile.name || (avatarUrl || null) !== profile.avatarUrl;
  const isAdmin = profile.role === "admin";

  async function handlePhotoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!online) {
      toast(t.mediaRequiresOnline, { tone: "error" });
      return;
    }
    setUploading(true);
    try {
      setAvatarUrl(await uploadImage(file, "avatars"));
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
      setUploading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmedName.length < 2) return;
    updateProfile.mutate(
      { name: trimmedName, avatarUrl: avatarUrl.trim() || null },
      {
        onSuccess: () => toast(t.toastSaved),
        onError: (error) => toast(describeError(error), { tone: "error" }),
      },
    );
  }

  return (
    <div className="page page-prose">
      <header className="page-header">
        <h1 className="t-display">{t.settingsTitle}</h1>
      </header>
      <SettingsNav />

      <form className="settings-card" onSubmit={submit}>
        <div className="settings-card-head">
          <h2 className="t-title">{t.profile}</h2>
          <p className="settings-card-desc">{t.profileSubtitle}</p>
        </div>

        <div className="profile-identity">
          <div className="profile-avatar">
            <Avatar name={trimmedName || profile.name} url={avatarUrl || null} size="xl" admin={isAdmin} />
            <button
              type="button"
              className="profile-avatar-btn"
              aria-label={t.changePhoto}
              title={t.changePhoto}
              disabled={uploading || !online}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 size={15} className="spin" aria-hidden="true" />
              ) : (
                <Camera size={15} aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="profile-identity-body">
            <p className="profile-identity-name">{trimmedName || profile.name}</p>
            <p className="profile-identity-email">{profile.email}</p>
            <span className={classes("person-tag", isAdmin && "person-tag-admin")}>
              {isAdmin ? <ShieldCheck size={12} aria-hidden="true" /> : <User size={12} aria-hidden="true" />}
              {isAdmin ? t.administrator : t.member}
            </span>
          </div>
        </div>

        <div className="profile-photo-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={uploading}
            disabled={!online}
            icon={<Upload size={14} aria-hidden="true" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t.uploadPhoto}
          </Button>
          {!online && <span className="field-hint">{t.mediaRequiresOnline}</span>}
          {googlePhotoUrl && avatarUrl !== googlePhotoUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarUrl(googlePhotoUrl)}>
              {t.useGooglePhoto}
            </Button>
          )}
          {avatarUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarUrl("")}>
              {t.removePhoto}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={showCustom}
            onClick={() => setShowCustom((value) => !value)}
          >
            {t.customPhotoUrl}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ALLOWED_TYPES.join(",")}
            style={{ display: "none" }}
            onChange={(event) => void handlePhotoFile(event)}
          />
        </div>

        {showCustom && (
          <TextField
            label={t.customPhotoUrl}
            type="url"
            inputMode="url"
            value={avatarUrl}
            placeholder="https://…"
            hint={t.customPhotoHint}
            onChange={(event) => setAvatarUrl(event.target.value)}
          />
        )}

        <div className="settings-divider" aria-hidden="true" />

        <TextField
          label={t.displayName}
          value={name}
          minLength={2}
          maxLength={80}
          required
          error={nameError}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="settings-card-actions">
          <Button type="submit" variant="primary" loading={updateProfile.isPending && !updateProfile.isPaused} disabled={!dirty || !!nameError}>
            {t.saveChanges}
          </Button>
        </div>
      </form>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2 className="t-title">{t.language}</h2>
          <p className="settings-card-desc">{t.languageDescription}</p>
        </div>
        <SegmentedControl<Language>
          label={t.language}
          value={language}
          onChange={setLanguage}
          options={LANGUAGES.map((code) => ({ value: code, label: code === "ca" ? "Català" : "English" }))}
        />
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2 className="t-title">{t.session}</h2>
          <p className="settings-card-desc">
            {t.signedInAs} {profile.email}
          </p>
        </div>
        <div>
          <Button variant="secondary" icon={<LogOut size={16} aria-hidden="true" />} onClick={() => void signOut()}>
            {t.signOut}
          </Button>
        </div>
      </section>
    </div>
  );
}
