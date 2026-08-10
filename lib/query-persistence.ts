import type { ChecklistItem, RequestDetail, RequestSummary } from "./domain";

/**
 * Keep the last usable copy of a query even when a background refresh failed offline.
 *
 * TanStack's default persistence filter only includes queries whose current status is
 * `success`. A query with cached data changes to `error` after a failed refresh, so using the
 * default would remove that still-usable data from the next IndexedDB snapshot.
 */
export function hasPersistableQueryData(query: { state: { data: unknown } }): boolean {
  return query.state.data !== undefined;
}

/** Split the all-items response into the exact datasets consumed by individual boards. */
export function groupItemsByApp<T extends { appId: string }>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const group = grouped.get(item.appId);
    if (group) group.push(item);
    else grouped.set(item.appId, [item]);
  }
  return grouped;
}

/** Build the same per-task shape returned by GET /items/:id from a single bulk snapshot. */
export function buildOfflineRequestDetails(
  items: readonly RequestSummary[],
  checklist: readonly ChecklistItem[],
): Map<string, RequestDetail> {
  const children = new Map<string, RequestSummary[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const group = children.get(item.parentId);
    if (group) group.push(item);
    else children.set(item.parentId, [item]);
  }

  const checklistByRequest = new Map<string, ChecklistItem[]>();
  for (const entry of checklist) {
    const group = checklistByRequest.get(entry.requestId);
    if (group) group.push(entry);
    else checklistByRequest.set(entry.requestId, [entry]);
  }

  return new Map(
    items.map((item) => [
      item.id,
      {
        ...item,
        children: children.get(item.id) ?? [],
        checklist: checklistByRequest.get(item.id) ?? [],
        parent: item.parentId ? { id: item.parentId, title: item.parentTitle ?? "" } : null,
      },
    ]),
  );
}
