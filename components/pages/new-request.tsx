"use client";

import { ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ITEM_TYPES, type ItemType, type Visibility } from "../../lib/domain";
import { typeLabels } from "../../lib/i18n";
import {
  useAppItems,
  useApps,
  useCreateRequest,
  useErrorMessage,
  useSimilarRequests,
} from "../../lib/queries";
import { typeIcons } from "../badges";
import { useAuth, useLanguage } from "../providers";
import { Button, SegmentedControl, TextAreaField, TextField } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { VoteButton } from "../vote-button";

const TITLE_MIN = 3;
const TITLE_MAX = 160;
const DESCRIPTION_MAX = 4000;

export function NewRequestPage({ appId }: { appId: string }) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { toast } = useToast();
  const describeError = useErrorMessage();

  const { data: apps = [] } = useApps();
  const createRequest = useCreateRequest();

  const [targetAppId, setTargetAppId] = useState(appId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ItemType>("feature");
  const [visibility, setVisibility] = useState<Visibility>("shared");
  const [touched, setTouched] = useState(false);

  // Debounce the title before asking the server for possible duplicates.
  const [debouncedTitle, setDebouncedTitle] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(title), 275);
    return () => clearTimeout(timer);
  }, [title]);

  const { data: similar = [] } = useSimilarRequests(targetAppId, debouncedTitle);
  const { data: appItems = [] } = useAppItems(targetAppId);

  // Similar-request rows only carry a summary; the full record (needed to know whether the
  // current user may vote) comes from the app's own list.
  const suggestions = useMemo(
    () =>
      similar.map((item) => ({
        ...item,
        full: appItems.find((candidate) => candidate.id === item.id),
      })),
    [similar, appItems],
  );

  const trimmedTitle = title.trim();
  const titleError = touched && trimmedTitle.length < TITLE_MIN ? t.titleTooShort : undefined;
  const app = apps.find((entry) => entry.id === targetAppId);
  const descriptionLeft = DESCRIPTION_MAX - description.length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (trimmedTitle.length < TITLE_MIN) return;

    try {
      const created = await createRequest.mutateAsync({
        appId: targetAppId,
        title: trimmedTitle,
        description: description.trim(),
        type,
        visibility,
      });
      toast(t.toastCreated);
      router.push(`/r/${encodeURIComponent(created.id)}`);
    } catch (error) {
      toast(describeError(error), { tone: "error" });
    }
  }

  return (
    <div className="page page-prose">
      <nav className="breadcrumb" aria-label={t.backTo}>
        <Link href={`/a/${encodeURIComponent(appId)}`} className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} aria-hidden="true" />
          {app?.name ?? t.backToBacklog}
        </Link>
      </nav>

      <header className="page-header">
        <h1 className="t-display">{t.newRequestTitle}</h1>
        <p className="page-subtitle">{t.newRequestSubtitle}</p>
      </header>

      <form onSubmit={submit} noValidate>
        <TextField
          label={t.titleLabel}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={t.titlePlaceholder}
          maxLength={TITLE_MAX}
          error={titleError}
          large
          autoFocus
          required
        />

        {suggestions.length > 0 && (
          <div className="duplicates" style={{ marginBottom: "var(--space-4)" }}>
            <p className="duplicates-title">
              <Lightbulb size={13} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
              {t.duplicatesTitle}
            </p>
            <p className="duplicates-hint">{t.duplicatesHint}</p>
            {suggestions.map((item) => (
              <div className="duplicate-row" key={item.id}>
                <span className="duplicate-body">
                  <span className="duplicate-title">{item.title}</span>
                </span>
                {item.full ? (
                  <VoteButton request={item.full} />
                ) : (
                  <span className="t-mono text-tertiary">{item.votes}</span>
                )}
                <Link href={`/r/${encodeURIComponent(item.id)}`} className="btn btn-secondary btn-sm">
                  {t.openInstead}
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <p className="field-label" id="type-label">
            {t.typeLabel}
          </p>
          <div className="type-picker" role="radiogroup" aria-labelledby="type-label">
            {ITEM_TYPES.map((value) => {
              const Icon = typeIcons[value];
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  className="type-option"
                  onClick={() => setType(value)}
                >
                  <Icon size={20} aria-hidden="true" />
                  {typeLabels[language][value]}
                </button>
              );
            })}
          </div>
        </div>

        <TextAreaField
          label={t.descriptionLabel}
          optional={t.optional}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t.descriptionPlaceholder}
          maxLength={DESCRIPTION_MAX}
          rows={5}
          trailing={
            descriptionLeft < 500 ? (
              <p className={`char-counter${descriptionLeft < 100 ? " char-counter-warn" : ""}`}>
                {t.charactersLeft(descriptionLeft)}
              </p>
            ) : undefined
          }
        />

        {apps.length > 1 && (
          <div className="field">
            <label className="field-label" htmlFor="target-app">
              {t.appLabel}
            </label>
            <select
              id="target-app"
              className="select"
              value={targetAppId}
              onChange={(event) => setTargetAppId(event.target.value)}
            >
              {apps.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isAdmin && (
          <div className="field">
            <p className="field-label">{t.visibilityLabel}</p>
            <SegmentedControl<Visibility>
              label={t.visibilityLabel}
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "shared", label: t.shared },
                { value: "internal", label: t.internal },
              ]}
            />
            <p className="field-hint">{t.visibilityHint}</p>
          </div>
        )}

        <div className="btn-row btn-row-end" style={{ marginTop: "var(--space-6)" }}>
          <Link href={`/a/${encodeURIComponent(appId)}`} className="btn btn-secondary">
            {t.cancel}
          </Link>
          <Button type="submit" variant="primary" loading={createRequest.isPending}>
            {createRequest.isPending ? t.creating : t.create}
          </Button>
        </div>
      </form>
    </div>
  );
}
