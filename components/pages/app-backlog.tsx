"use client";

import {
  Check,
  ChevronDown,
  Columns3,
  Inbox as InboxIcon,
  Plus,
  Rows3,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_STATUSES,
  BOARD_STATUSES,
  ITEM_PRIORITIES,
  ITEM_TYPES,
  isItemPriority,
  isItemStatus,
  isItemType,
  type ItemStatus,
  type RequestSummary,
} from "../../lib/domain";
import { priorityLabels, statusLabels, typeLabels } from "../../lib/i18n";
import { useAppItems, useApps, useErrorMessage, useSetStatus, useSetVisibility } from "../../lib/queries";
import { StatusDot } from "../badges";
import { useAuth, useLanguage } from "../providers";
import { RequestCard, RequestRow } from "../request-card";
import { AppIcon, Button, IconButton, SkeletonCard, SkeletonList } from "../ui/primitives";
import { Menu, MenuLabel, Sheet } from "../ui/overlay";
import { EmptyState, ErrorState } from "../ui/states";
import { useToast } from "../ui/toast";

type Author = "all" | "mine" | "others";
type Vis = "all" | "shared" | "internal";
type Sort = "votes" | "updated" | "newest" | "oldest";
type View = "board" | "list";

const SORTS: Sort[] = ["updated", "votes", "newest", "oldest"];

/** Filter state lives entirely in the URL, so every view is linkable and survives a refresh. */
function useFilters() {
  const params = useSearchParams();
  const router = useRouter();

  const state = useMemo(() => {
    const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
    return {
      q: params.get("q") ?? "",
      types: list("type").filter(isItemType),
      statuses: list("status").filter(isItemStatus),
      priorities: list("priority").filter(isItemPriority),
      author: (params.get("author") ?? "all") as Author,
      vis: (params.get("vis") ?? "all") as Vis,
      sort: (SORTS.includes(params.get("sort") as Sort) ? params.get("sort") : "updated") as Sort,
      view: (params.get("view") === "list" ? "list" : "board") as View,
      discarded: params.get("discarded") === "1",
    };
  }, [params]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [params, router],
  );

  const reset = useCallback(() => {
    const next = new URLSearchParams();
    if (state.view === "list") next.set("view", "list");
    const query = next.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }, [router, state.view]);

  return { ...state, update, reset };
}

function toggleInList<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FilterBar({
  filters,
  isAdmin,
  resultCount,
}: {
  filters: ReturnType<typeof useFilters>;
  isAdmin: boolean;
  resultCount: number;
}) {
  const { t, language } = useLanguage();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(filters.q);
  const [syncedQuery, setSyncedQuery] = useState(filters.q);

  // Keep the input in step with URL changes (back button, "clear filters") by adjusting state
  // during render rather than in an effect, which would cause a cascading re-render.
  if (syncedQuery !== filters.q) {
    setSyncedQuery(filters.q);
    setDraft(filters.q);
  }

  // Debounce so typing doesn't push a history entry per keystroke.
  const debouncedUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draft === filters.q) return;
    const timer = setTimeout(() => {
      debouncedUpdateRef.current = null;
      filters.update({ q: draft || null });
    }, 250);
    debouncedUpdateRef.current = timer;
    return () => clearTimeout(timer);
  }, [draft, filters]);

  // The URL only catches up with a back/forward navigation once its (async) transition commits,
  // which can take longer than the debounce above — without this, a pending edit can fire after
  // the user has already navigated away from it and silently reapply the search they just left.
  useEffect(() => {
    function onPopState() {
      if (debouncedUpdateRef.current === null) return;
      clearTimeout(debouncedUpdateRef.current);
      debouncedUpdateRef.current = null;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const activeCount =
    filters.types.length +
    filters.statuses.length +
    filters.priorities.length +
    (filters.author !== "all" ? 1 : 0) +
    (filters.vis !== "all" ? 1 : 0) +
    (filters.q ? 1 : 0);
  const sortLabels = { updated: t.sortUpdated, votes: t.sortVotes, newest: t.sortNewest, oldest: t.sortOldest };
  const authorOptions: [Author, string][] = [
    ["all", t.authorAll],
    ["mine", t.authorMine],
    ["others", t.authorOthers],
  ];
  const visOptions: [Vis, string][] = [
    ["all", t.visibilityAll],
    ["shared", t.shared],
    ["internal", t.internal],
  ];

  // Individually removable pills for whatever is currently active, so the effect of each
  // filter is visible without opening the sheet. Only rendered when there's something to show.
  const activePills: { key: string; label: string; onRemove: () => void }[] = [
    ...(filters.q ? [{ key: "q", label: `"${filters.q}"`, onRemove: () => setDraft("") }] : []),
    ...filters.types.map((type) => ({
      key: `type-${type}`,
      label: typeLabels[language][type],
      onRemove: () => filters.update({ type: toggleInList(filters.types, type).join(",") || null }),
    })),
    ...filters.statuses.map((status) => ({
      key: `status-${status}`,
      label: statusLabels[language][status],
      onRemove: () => filters.update({ status: toggleInList(filters.statuses, status).join(",") || null }),
    })),
    ...filters.priorities.map((priority) => ({
      key: `priority-${priority}`,
      label: priorityLabels[language][priority],
      onRemove: () => filters.update({ priority: toggleInList(filters.priorities, priority).join(",") || null }),
    })),
    ...(filters.author !== "all"
      ? [{ key: "author", label: authorOptions.find(([v]) => v === filters.author)![1], onRemove: () => filters.update({ author: null }) }]
      : []),
    ...(filters.vis !== "all"
      ? [{ key: "vis", label: visOptions.find(([v]) => v === filters.vis)![1], onRemove: () => filters.update({ vis: null }) }]
      : []),
    ...(filters.discarded
      ? [{ key: "discarded", label: t.showDiscarded, onRemove: () => filters.update({ discarded: null }) }]
      : []),
  ];

  return (
    <>
      <div className="filter-bar">
        <div className="search-field">
          <span className="search-icon">
            <Search size={16} aria-hidden="true" />
          </span>
          <input
            type="search"
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.search}
          />
          {draft && (
            <span className="search-clear">
              <IconButton label={t.clearFilters} size="sm" onClick={() => setDraft("")}>
                <X size={14} aria-hidden="true" />
              </IconButton>
            </span>
          )}
        </div>

        <Button
          size="sm"
          variant={activeCount > 0 ? "primary" : "secondary"}
          icon={<SlidersHorizontal size={15} aria-hidden="true" />}
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="sr-only-mobile">{t.filters}</span>
          {activeCount > 0 && <span className="filter-trigger-badge">{activeCount}</span>}
        </Button>

        <div className="segmented" role="group" aria-label={t.changeView}>
          <button
            type="button"
            className="segmented-item"
            aria-pressed={filters.view === "board"}
            onClick={() => filters.update({ view: null })}
          >
            <Columns3 size={14} aria-hidden="true" />
            <span className="sr-only">{t.viewBoard}</span>
          </button>
          <button
            type="button"
            className="segmented-item"
            aria-pressed={filters.view === "list"}
            onClick={() => filters.update({ view: "list" })}
          >
            <Rows3 size={14} aria-hidden="true" />
            <span className="sr-only">{t.viewList}</span>
          </button>
        </div>
      </div>

      {(activePills.length > 0 || resultCount > 0) && (
        <div className="result-line">
          {activePills.length > 0 && (
            <div className="filter-active-chips">
              {activePills.map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  className="chip chip-neutral chip-removable"
                  onClick={pill.onRemove}
                  aria-label={t.removeFilter(pill.label)}
                >
                  {pill.label}
                  <X size={11} aria-hidden="true" />
                </button>
              ))}
              <button type="button" className="filter-active-clear" onClick={filters.reset}>
                {t.clearFilters}
              </button>
            </div>
          )}
          <span className="result-line-count" style={activePills.length > 0 ? { marginLeft: "auto" } : undefined}>
            {t.requestsCounted(resultCount)}
          </span>
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t.filtersTitle} closeLabel={t.close}>
        <div className="filter-sections">
          <div className="filter-cell">
            <p className="filter-cell-label" id="filter-sort">
              {t.sortBy}
            </p>
            <div className="filter-chips" role="group" aria-labelledby="filter-sort">
              {SORTS.map((sort) => (
                <button
                  key={sort}
                  type="button"
                  className="filter-chip"
                  aria-pressed={filters.sort === sort}
                  onClick={() => filters.update({ sort: sort === "updated" ? null : sort })}
                >
                  {filters.sort === sort && <Check size={13} aria-hidden="true" />}
                  {sortLabels[sort]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-cell">
            <p className="filter-cell-label" id="filter-type">
              {t.type}
            </p>
            <div className="filter-chips" role="group" aria-labelledby="filter-type">
              {ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="filter-chip"
                  aria-pressed={filters.types.includes(type)}
                  onClick={() => filters.update({ type: toggleInList(filters.types, type).join(",") || null })}
                >
                  {typeLabels[language][type]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-cell">
            <p className="filter-cell-label" id="filter-priority">
              {t.priority}
            </p>
            <div className="filter-chips" role="group" aria-labelledby="filter-priority">
              {ITEM_PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  className="filter-chip"
                  aria-pressed={filters.priorities.includes(priority)}
                  onClick={() => filters.update({ priority: toggleInList(filters.priorities, priority).join(",") || null })}
                >
                  {priorityLabels[language][priority]}
                </button>
              ))}
            </div>
          </div>

          {filters.view === "list" && (
            <div className="filter-cell">
              <p className="filter-cell-label" id="filter-status">
                {t.status}
              </p>
              <div className="filter-chips" role="group" aria-labelledby="filter-status">
                {ALL_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="filter-chip"
                    aria-pressed={filters.statuses.includes(status)}
                    onClick={() => filters.update({ status: toggleInList(filters.statuses, status).join(",") || null })}
                  >
                    {statusLabels[language][status]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="filter-cell">
            <p className="filter-cell-label" id="filter-author">
              {t.author}
            </p>
            <div className="filter-chips" role="group" aria-labelledby="filter-author">
              {authorOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="filter-chip"
                  aria-pressed={filters.author === value}
                  onClick={() => filters.update({ author: value === "all" ? null : value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="filter-cell">
              <p className="filter-cell-label" id="filter-vis">
                {t.visibility}
              </p>
              <div className="filter-chips" role="group" aria-labelledby="filter-vis">
                {visOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="filter-chip"
                    aria-pressed={filters.vis === value}
                    onClick={() => filters.update({ vis: value === "all" ? null : value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="filter-toggle-row">
            <input
              type="checkbox"
              className="checkbox"
              checked={filters.discarded}
              onChange={(event) => filters.update({ discarded: event.target.checked ? "1" : null })}
            />
            {t.showDiscarded}
          </label>
        </div>
      </Sheet>
    </>
  );
}

function applyFilters(
  items: RequestSummary[],
  filters: ReturnType<typeof useFilters>,
  currentUserId: string | undefined,
) {
  const query = filters.q.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => {
    if (!filters.discarded && item.status === "discarded") return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) return false;
    if (filters.types.length > 0 && !filters.types.includes(item.type)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(item.priority)) return false;
    if (filters.author === "mine" && item.creatorId !== currentUserId) return false;
    if (filters.author === "others" && item.creatorId === currentUserId) return false;
    if (filters.vis !== "all" && item.visibility !== filters.vis) return false;
    if (query) {
      const haystack = `${item.title} ${item.description ?? ""}`.toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (filters.sort) {
      case "votes":
        return b.votes - a.votes || b.updatedAt - a.updatedAt;
      case "newest":
        return b.createdAt - a.createdAt;
      case "oldest":
        return a.createdAt - b.createdAt;
      default:
        return b.updatedAt - a.updatedAt;
    }
  });
  return sorted;
}

function BulkBar({
  ids,
  onDone,
  clearLabel,
}: {
  ids: string[];
  onDone: () => void;
  clearLabel: string;
}) {
  const t = useLanguage().t;
  const setStatus = useSetStatus();
  const setVisibility = useSetVisibility();
  const { toast } = useToast();
  const describeError = useErrorMessage();
  const [busy, setBusy] = useState(false);

  const run = async (action: (id: string) => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      for (const id of ids) await action(id);
      toast(message);
      onDone();
    } catch (error) {
      toast(describeError(error), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulk-bar" role="region" aria-label={t.bulkActions}>
      <span className="bulk-bar-count">{t.selectedCount(ids.length)}</span>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={() => void run((id) => setStatus.mutateAsync({ id, status: "in_progress" }), t.toastStatusChanged)}
      >
        {t.start}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={() => void run((id) => setStatus.mutateAsync({ id, status: "discarded" }), t.toastDiscarded)}
      >
        {t.discard}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={() =>
          void run((id) => setVisibility.mutateAsync({ id, visibility: "internal" }), t.toastVisibilityChanged)
        }
      >
        {t.makeInternal}
      </Button>
      <span className="toolbar-spacer" />
      <Button size="sm" variant="ghost" onClick={onDone}>
        {clearLabel}
      </Button>
    </div>
  );
}

export function AppBacklogPage({ appId }: { appId: string }) {
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const filters = useFilters();

  const { data: apps = [] } = useApps();
  const { data: items, isPending, isError, error, refetch } = useAppItems(appId);
  const describeError = useErrorMessage();

  const [collapsed, setCollapsed] = useState<ItemStatus[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const app = apps.find((entry) => entry.id === appId);
  const visible = useMemo(() => applyFilters(items ?? [], filters, profile?.id), [items, filters, profile?.id]);
  const columns = filters.discarded ? ALL_STATUSES : BOARD_STATUSES;

  // Selection only means anything for rows currently on screen, so it is derived rather than
  // pruned in an effect — filtering a row out simply deselects it.
  const activeSelection = useMemo(
    () => selected.filter((id) => visible.some((item) => item.id === id)),
    [selected, visible],
  );

  const hasFilters =
    !!filters.q ||
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.author !== "all" ||
    filters.vis !== "all";

  return (
    <div className="page">
      <header className="page-header-board">
        <div className="page-title-group">
          <AppIcon name={app?.name ?? ""} logoUrl={app?.logoUrl} className="page-app-icon" />
          <div style={{ minWidth: 0 }}>
            {apps.length > 1 ? (
              <Menu
                label={t.chooseApp}
                trigger={(props) => (
                  // The switcher is the page's h1: it names the page *and* changes it.
                  <h1 className="t-display page-title">
                    <button type="button" className="page-title-trigger" {...props}>
                      <span className="page-title-text">{app?.name ?? appId}</span>
                      <ChevronDown size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
                    </button>
                  </h1>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>{t.apps}</MenuLabel>
                    {apps.map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/a/${encodeURIComponent(entry.id)}`}
                        className="menu-item"
                        role="menuitem"
                        onClick={close}
                      >
                        <AppIcon name={entry.name} logoUrl={entry.logoUrl} className="menu-app-icon" />
                        {entry.name}
                        {entry.id === appId && <Check size={14} style={{ marginLeft: "auto" }} aria-hidden="true" />}
                      </Link>
                    ))}
                  </>
                )}
              </Menu>
            ) : (
              <h1 className="t-display page-title">{app?.name ?? appId}</h1>
            )}
            {app?.description && <p className="page-subtitle">{app.description}</p>}
          </div>
        </div>

        <Link href={`/a/${encodeURIComponent(appId)}/new`} className="btn btn-primary page-new-btn">
          <Plus size={18} aria-hidden="true" />
          <span className="sr-only-mobile">{t.newRequest}</span>
        </Link>
      </header>

      {isError ? (
        <ErrorState
          title={t.errorLoading}
          message={describeError(error)}
          onRetry={() => void refetch()}
          retryLabel={t.retry}
        />
      ) : (
        <>
          <FilterBar filters={filters} isAdmin={!!isAdmin} resultCount={visible.length} />

          {isPending ? (
            filters.view === "list" ? (
              <SkeletonList count={5} label={t.loading} />
            ) : (
              <div className="board" style={{ ["--board-columns" as string]: columns.length }}>
                {columns.map((status) => (
                  <section className={`board-column board-column-${status}`} key={status}>
                    <div className="column-header">
                      <StatusDot status={status} />
                      <span className="column-title">{statusLabels[language][status]}</span>
                    </div>
                    <div className="card-stack">
                      <SkeletonCard />
                      <SkeletonCard />
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : visible.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={SearchX}
                title={t.noMatches}
                body={t.noMatchesBody}
                action={
                  <Button variant="secondary" onClick={filters.reset}>
                    {t.clearFilters}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={InboxIcon}
                title={t.noRequests}
                body={t.noRequestsBody}
                action={
                  <Link href={`/a/${encodeURIComponent(appId)}/new`} className="btn btn-primary">
                    <Plus size={16} aria-hidden="true" />
                    {t.newRequest}
                  </Link>
                }
              />
            )
          ) : filters.view === "list" ? (
            <>
              <div className="request-list">
                {visible.map((item) => (
                  <RequestRow
                    key={item.id}
                    request={item}
                    showStatus
                    selectLabel={isAdmin ? t.selectRequest : undefined}
                    selected={activeSelection.includes(item.id)}
                    onSelect={
                      isAdmin
                        ? (checked) =>
                            setSelected((current) =>
                              checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                            )
                        : undefined
                    }
                  />
                ))}
              </div>
              {activeSelection.length > 0 && (
                <BulkBar ids={activeSelection} onDone={() => setSelected([])} clearLabel={t.clearSelection} />
              )}
            </>
          ) : (
            <div className="board" style={{ ["--board-columns" as string]: columns.length }}>
              {columns.map((status) => {
                const cards = visible.filter((item) => item.status === status);
                const isCollapsed = collapsed.includes(status);
                const headingId = `column-${status}`;
                return (
                  <section className={`board-column board-column-${status}`} key={status} aria-labelledby={headingId}>
                    <div className="column-header">
                      {/* The count sits outside the heading so the accessible name stays
                          "Pendents" rather than running together as "Pendents3". */}
                      <h2 className="column-heading">
                        <button
                          type="button"
                          className="group-toggle"
                          id={headingId}
                          aria-expanded={!isCollapsed}
                          onClick={() => setCollapsed((current) => toggleInList(current, status))}
                        >
                          <StatusDot status={status} />
                          <span className="column-title">{statusLabels[language][status]}</span>
                          <ChevronDown
                            size={14}
                            aria-hidden="true"
                            className="column-chevron"
                            style={{ transform: isCollapsed ? "rotate(-90deg)" : undefined }}
                          />
                        </button>
                      </h2>
                      <span className="column-count" aria-hidden="true">
                        {cards.length}
                      </span>
                    </div>
                    {!isCollapsed && (
                      <div className="card-stack">
                        {cards.length === 0 ? (
                          <p className="column-empty">{t.columnEmpty}</p>
                        ) : (
                          cards.map((item) => <RequestCard key={item.id} request={item} />)
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
