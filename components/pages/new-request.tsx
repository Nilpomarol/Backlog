"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
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
import { Sheet } from "../ui/overlay";
import { useToast } from "../ui/toast";
import { VoteButton } from "../vote-button";

const TITLE_MIN = 3;
const TITLE_MAX = 160;
const DESCRIPTION_MAX = 4000;

/** The "new request" form, presented as a Sheet over the board it was opened from rather than
 *  a full-page route — so creating a card (or backing out of the form) never leaves the board
 *  behind in browser history. */
export function NewRequestSheet({
  appId,
  open,
  onClose,
}: {
  appId: string;
  open: boolean;
  onClose: () => void;
}) {
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
  const [visibility, setVisibility] = useState<Visibility>(isAdmin ? "internal" : "shared");
  const [touched, setTouched] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
      onClose();
      router.push(`/r/${encodeURIComponent(created.id)}`);
    } catch (error) {
      toast(describeError(error), { tone: "error" });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.newRequestTitle}
      subtitle={t.newRequestSubtitle}
      closeLabel={t.close}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" form="new-request-form" variant="primary" loading={createRequest.isPending}>
            {createRequest.isPending ? t.creating : t.create}
          </Button>
        </>
      }
    >
      <form
        id="new-request-form"
        onSubmit={submit}
        noValidate
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
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
          <div className="duplicates">
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
                <Link href={`/r/${encodeURIComponent(item.id)}`} className="btn btn-secondary btn-sm" onClick={onClose}>
                  {t.openInstead}
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="field" style={{ marginBottom: 0 }}>
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
                  className={`type-option type-option-${value}`}
                  onClick={() => setType(value)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {typeLabels[language][value]}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="disclosure-trigger"
          aria-expanded={detailsOpen}
          aria-controls="new-request-details"
          onClick={() => setDetailsOpen((value) => !value)}
        >
          <ChevronDown size={16} aria-hidden="true" />
          {detailsOpen ? t.hideDetails : t.addDetails}
        </button>

        {detailsOpen && (
          <div className="disclosure-body" id="new-request-details" style={{ paddingTop: 0 }}>
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
              <div className="field" style={{ marginBottom: 0 }}>
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
          </div>
        )}
      </form>
    </Sheet>
  );
}
