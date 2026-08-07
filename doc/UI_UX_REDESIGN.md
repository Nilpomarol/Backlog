# Backlog — Greenfield UI/UX Redesign

Design-only document. No code changes. The current implementation was read as a source of
*functional truth* (what exists, what the API allows, what the rules are), never as a visual
reference.

Contrast ratios in §5 were computed, not estimated. Every value below passes its WCAG target.

---

## 1. Product Understanding

### 1.1 What this application is

A **private, invitation-only feedback and delivery tracker for a small portfolio of personal
applications**, operated by a single developer and used by their friends and family.

It is not a project-management platform, and the specification explicitly forbids it becoming
one (`doc/SPEC.md` §14, `doc/TECHNICAL_PLAN.md` §17). The whole product is: *non-technical
people report and vote on things; one developer decides and ships them; everyone can see where
their request stands.*

### 1.2 The defining structural fact: role asymmetry

This is the single most important insight for the redesign, and the current UI does not reflect
it at all.

| | **Administrator** (1 person — the developer) | **Member** (N people — family, friends) |
|---|---|---|
| Population | Exactly one, realistically | Everyone else |
| Technical? | Yes | No |
| Primary device | Desktop | Phone |
| Core jobs | Triage the incoming, decide what's next, move work through states, break work into subtasks, keep internal notes | Report a problem, check whether their report went anywhere, vote for what they want |
| Frequency | Daily-ish, in focused sessions | Sporadic, seconds at a time |
| Can change status | **Yes — only they can** | No |
| Can see internal items | Yes | No |
| Can vote | On others' items | On others' items |

Today both roles receive the identical screen: a five-column kanban board. A kanban board is a
practitioner's instrument. Handing it to a relative who wants to say *"the photo upload is
broken"* is a category error. Conversely, the admin — whose actual job is cross-app triage —
has no view that spans applications, so triage requires visiting each app in turn.

**The redesign treats this as one product with two default entry points, not two products.**

### 1.3 Main entities

From `db/schema.ts`, which is well-formed and stays as-is:

- **App** — `id, name, icon (emoji, ≤16 chars), description?, sortOrder, isActive, createdAt`.
  Archived rather than deleted, so items survive.
- **User** — `id, firebaseUid?, email (unique), name, avatarUrl?, role (admin|user), isActive`.
  Doubles as the invitation allowlist and the profile record.
- **BacklogItem** — `id, appId, creatorId, title, description?, type, status, visibility,
  createdAt, updatedAt`.
  - `type`: `bug | feature | improvement | task`
  - `status`: `backlog | in_progress | in_review | done | discarded`
  - `visibility`: `shared | internal`
- **Vote** — composite PK `(itemId, userId)`. Structurally guarantees one vote per person per item.
- **Subtask** — `id, itemId, title, completed, position`. A flat ordered checklist. No assignees,
  dates, or independent status, by design.

### 1.4 Business rules that constrain the design

Enforced server-side in `lib/permissions.ts` and `api/router.ts`. The UI may never be the only
gate, but it must never *offer* an action the server will reject:

- Only an admin changes `status` or `visibility`.
- Only an admin reads or creates `internal` items.
- Owner or admin edits item content; owner or admin manages that item's subtasks.
- **You cannot vote for your own item, and you cannot vote on an internal item.**
- Owner edits accept only `title`, `description`, `type` — unknown fields fail validation outright.
- New member-created items are always `shared` + `backlog`.
- At least one app must remain active.
- An admin cannot revoke their own access or demote themselves.
- Only *pending* invitations (no linked `firebase_uid`) can be deleted.
- Active-item counts exclude `done` and `discarded`.

### 1.5 Technical constraints the design must respect

- **Writes are rate-limited to 40/minute per user** (`api/router.ts:110`), and request bodies are
  capped at 32 KiB. This directly bounds how aggressive optimistic UI and autosave can be — see §3.7.
- **Data cannot be fetched in Server Components.** Authentication is a Firebase ID token held in
  the browser and sent as a bearer header. Pages can be server-rendered as *shells*, but all
  authenticated data is client-fetched. This overrides the generic "fetch in Server Components"
  stack advice.
- Title 3–160 chars; description ≤4000 chars.
- Duplicate detection is a string-similarity pass over ≤100 recent items — cheap, no AI, and it
  only returns the top 4 above a 0.24 score.
- Tailwind v4 is already installed (`app/globals.css` imports it) but the app is written almost
  entirely in hand-authored semantic CSS classes.
- Geist and Geist Mono are already loaded via `next/font` in `app/layout.tsx` — **and then
  discarded**, because `globals.css` sets `body { font-family: Arial, Helvetica, sans-serif }`.
  The project is paying to download a good typeface and rendering Arial.

### 1.6 What the analysis found broken (functional, not stylistic)

These are structural problems that any redesign must solve regardless of visual direction:

1. **No URLs.** The entire app is one route (`app/page.tsx` → `BacklogApp`). Every view — a request,
   a filter, an app — is React state. You cannot link your brother to the bug he reported. You
   cannot bookmark, refresh, or use the back button. For a product whose purpose is shared
   awareness, this is the most damaging gap.
2. **There is no read view.** Clicking any card opens an *edit form*. Non-owners get that form with
   every field `disabled`. A member reading someone else's request is shown a greyed-out form.
3. **Votes do nothing.** Voting is the product's stated prioritisation mechanism ("votes help the
   most useful ideas rise"), but the only ordering that exists is `ORDER BY updated_at DESC`
   (`api/router.ts:269`). There is no sort control anywhere. Nothing rises.
4. **Filters conflate three unrelated axes.** One flat chip row mixes ownership (mine/others),
   visibility (internal), and type (bug/feature/…) as if they were mutually exclusive options.
   They are not — you can never ask for "my bugs".
5. **Search is client-side and title-only** (`backlog-app.tsx:214`), so it silently misses
   everything in descriptions and everything not yet loaded.
6. **Drag-and-drop is the only board-level way to move work**, on a product whose own technical
   plan says "Do not require hover, precise pointer input, or drag-and-drop" (§10) and lists DnD
   as an explicit non-goal (§17). It is unusable on the admin's phone.
7. **Discarded permanently occupies a fifth of the board.** The spec says discarded "may appear in
   a separate view or filter" — it was built as a first-class column instead.
8. **An item cannot be moved between apps.** The technical plan (§6) says owner edits accept
   `appId`; the implementation's `updateItemSchema` (`api/router.ts:31`) omits it. A relative who
   files against the wrong app creates a permanently misfiled item.
9. **Feedback is a single global error banner and three `window.confirm()` calls.** No toasts, no
   undo, no per-field validation, no distinction between "rate limited", "offline", and "forbidden".
10. **Every mutation triggers a full list refetch** and there are no optimistic updates, so voting —
    the lightest possible interaction — costs a round trip and a flash.
11. **Fake internationalisation.** Item titles are typed `Record<'ca'|'en', string>` but both keys
    are populated with the same string (`backlog-app.tsx:180`). The language toggle translates
    chrome only. This is dead complexity that implies a capability that does not exist.
12. **Admin tools hide inside the profile panel.** "Manage users" and "Manage applications" are
    buttons in the footer of a personal-profile dialog.
13. Smaller: `activeAppId` is hardcoded to `"atlas"`; the top nav's only link points at `#board`
    and does nothing; app `sortOrder` exists in the schema and is set on create but can never be
    edited; the avatar field asks non-technical users to paste an HTTPS URL while Firebase already
    supplies their Google photo.

---

## 2. Proposed Information Architecture

### 2.1 Principle

> Organise by **question the user is asking**, not by database table.

Members ask "what happened to my thing?" and "what else is being considered?".
Admins ask "what came in?" and "what am I doing next?".
Neither question is "show me a table of backlog_items filtered by app_id".

### 2.2 Route map

Real URLs, replacing the single-page state machine. Filters live in query params so every view is
linkable and survives refresh.

```
/                          Overview  — role-aware landing
/a/[app]                   App backlog (board on desktop, grouped list on mobile)
                             ?view=board|list &status= &type= &author= &vis= &q= &sort=
/a/[app]/new               New request  (full page ≤768px; dialog over board ≥768px)
/r/[id]                    Request detail  ← the missing route; shareable, deep-linkable
/inbox                     Triage across all apps  (admin only)
/mine                      My requests + my votes  (member's home for follow-up)
/settings/profile          Name, photo, language, sign out
/settings/people           Invitations, roles, access   (admin only)
/settings/apps             Create, edit, reorder, archive apps  (admin only)
/signin
/no-access
```

`/` resolves by role:

- **Member →** *Your requests* (with current status), then *Recently updated*, then app entry tiles.
- **Admin →** *Needs triage* (new + `backlog`, across all apps, vote-sorted), then *In progress*,
  then per-app counts.

Both roles finally get an answer to "what should I look at?" — a question today's UI never asks.

### 2.3 Navigation chrome

**Desktop (≥1024px) — persistent left sidebar, 240px:**

```
┌────────────────┐
│ ◆ Backlog      │   brand
├────────────────┤
│ Overview       │   ← primary views
│ Inbox      ⑤   │   admin only; count = untriaged
│ My requests    │
├────────────────┤
│ APPS           │
│ 🗺  Atlas    12 │   ← emoji is app identity (content), count = active
│ 🏠  Home      3 │
│ 🍲  Recipes   7 │
├────────────────┤
│ ⚙  Settings    │   bottom-anchored
└────────────────┘
```

Apps are a *section of* navigation, not a separate rail competing with it. The current design has
a top bar whose only link does nothing, plus a left rail that only switches apps — two navigation
systems, neither complete.

**Mobile (<768px) — bottom tab bar, 5 items max, ≥44×44px targets:**

```
┌──────────────────────────────────────┐
│  Atlas ▾            🔍     ⋯         │  ← app switcher is a header dropdown
├──────────────────────────────────────┤
│                                      │
│              content                 │
│                                      │
├──────────────────────────────────────┤
│  ▣        ☰        ⊕      ★      ⋯   │
│ Over-   Backlog   New    Mine   More │
└──────────────────────────────────────┘
```

The centre `⊕` is the create action. A tab-bar centre action beats a floating action button here
because a FAB permanently occludes the bottom-right card in a scrolling list, and this list is the
whole product.

### 2.4 Grouping rationale

| Group | Contains | Why |
|---|---|---|
| **Views** (Overview, Inbox, My requests) | Cross-app, question-shaped | These are what people actually open the app for |
| **Apps** | One entry per active app | The app is a *context filter*, not a destination in itself |
| **Settings** | Profile, People, Apps | Administration is infrequent, deliberate, and does not belong inside a profile dialog |

Admin-only entries (`Inbox`, `People`, `Apps`) are **absent**, not disabled, for members — a
disabled control you can never enable is noise.

---

## 3. UX / Workflow Design

### 3.1 Report a request — the member's critical path

Product principle: *"Creating a card must take only a few seconds."*

**Entry:** `⊕` in the mobile tab bar · "New request" button in the app header · `C` keyboard shortcut.

**Steps:**

1. **Title first, alone, autofocused.** One large field. Nothing else competes.
2. As typing passes 3 characters, **duplicate suggestions appear inline beneath the field**
   (debounced 275ms, already implemented server-side). Each suggestion shows title, type chip, and
   vote count, with a **"Vote for this instead"** button *directly on the suggestion*.
   → Today a suggestion only opens the item's edit panel; the user must then find the vote control.
     Voting is the outcome the feature exists to produce, so it belongs on the suggestion itself.
3. **Type** — 4 large segmented buttons with icon + label, not a `<select>`. `Feature` preselected
   (it is the common case for a family feature-request board).
4. **Description** — optional, clearly marked, auto-growing textarea, 4000-char counter appearing
   only past 3500.
5. **Visibility** — admin only, rendered as a two-option segmented control with a plain-language
   hint ("Internal requests are visible only to you"). Absent entirely for members.
6. **Submit.** → navigate to `/r/[id]` with a success toast, so the user immediately sees the thing
   they made and can share its URL.

**Missing capability introduced:** the app selector. Creating from within an app pre-fills it;
creating from Overview requires choosing. Either way it is an editable field, which is what makes
§3.6 possible.

### 3.2 Follow up on a request — the member's second path

Today: impossible without scanning five columns of every app.

**`/mine`** — a grouped list:

- **Your open requests**, each with a status pill and, for `in_progress`, subtask progress.
- **Recently changed** — items whose status moved since the user's last visit, marked with a dot.
- **You voted for** — so a member can see the fate of things they backed.

This uses only data that already exists. It converts a write-only suggestion box into a loop.

### 3.3 Triage — the admin's critical path

**`/inbox`** — every `backlog` item across all apps, default-sorted by votes desc, then newest.

Each row is dense and carries its own actions:

```
┌───────────────────────────────────────────────────────────────┐
│ ☐  🗺 Atlas   [● Bug]   Photo upload fails on large files      │
│    ▲ 4   Marta · 2d ago              [ Start ]  [ Discard ] ⋯ │
└───────────────────────────────────────────────────────────────┘
```

- **`Start`** — one tap, `backlog → in_progress`. The most common triage outcome deserves one tap,
  not a panel and a `<select>`.
- **`Discard`** — one tap, with an **undo toast** (genuinely reversible: it is a status PATCH).
- **`⋯`** — Make internal · Move to app · Open · Delete.
- **Checkbox → bulk actions.** After a burst of family reports, acting on eight items individually
  is the failure mode. Selecting several and choosing *Start* / *Discard* / *Make internal* is the
  real workflow. **List view only** — bulk selection on a kanban board is incoherent.

### 3.4 Move work through states — admin

Drag-and-drop is removed as the primary mechanism. Three explicit paths replace it:

1. **Board card `⋯` menu** → "Move to ▸" with the four other states. Keyboard-reachable.
2. **Detail page status stepper** — a horizontal segmented control of the 5 states with the current
   one filled. One tap to advance. Replaces the `<select>`.
3. **Bulk action** in list/inbox view.

Drag-and-drop may remain as a *desktop-only progressive enhancement* layered on top, but it must
never be the only route to a state change.

### 3.5 Read a request — everyone

**`/r/[id]` is a readable document, not a form.** This is the largest single correction.

```
Atlas  ›  Request                                    [⋯]

[● Bug]  [🔒 Internal]                        ← chips, only if applicable

Photo upload fails on large files             ← h1
Reported by Marta · 12 Mar · updated 2d ago

When I pick a photo over about 10 MB the
spinner runs forever and nothing uploads.     ← description as prose

   ▲  4 votes        [ Vote for this ]        ← disabled + explained if own item

── Progress ────────────────────────── 2 / 4 ──
  ☑ Reproduce on device
  ☑ Add size check
  ☐ Compress before upload
  ☐ Show a clear error

── Status ───────────────────────────────────
  ○ Backlog  ●In progress  ○ In review  ○ Done   ← admin: interactive stepper
                                                    member: read-only indicator
```

**Editing is inline, not a mode.** Title and description become inputs on click (owner/admin only)
and save on blur — the same interaction subtasks already use. Rationale: this app's edits are
overwhelmingly one-field typo fixes, and a full form round-trip for a typo is disproportionate.
A pencil affordance appears on hover/focus so the capability is discoverable rather than hidden.

**Permission expression:** controls the viewer cannot use are **removed**, not disabled — except
the vote button on one's own item, which is disabled *with a tooltip and helper text* ("You can't
vote for your own request"), because its absence would read as a bug.

### 3.6 Move a request to a different app — new capability

**Problem:** a relative files "recipes app is slow" against Atlas. Today it is stuck there forever.

**Solution:** `⋯` → *Move to app…* → app picker → confirm. Requires adding `appId` to
`updateItemSchema` — which the technical plan (§6) already specifies and only the implementation
omits. Available to owner and admin.

### 3.7 Feedback, states, and error handling

Replacing one global banner and three `window.confirm()` calls.

| State | Treatment |
|---|---|
| **Loading (first paint)** | Skeleton cards matching real card geometry — 3 per column, 6 in list. Never a "Loading…" string repeated in five columns. |
| **Loading (refetch)** | 2px indeterminate bar under the header. Content stays interactive. |
| **Optimistic** | **Vote** and **subtask toggle** only — instant, reverting with an error toast on failure. Sanctioned by the technical plan §11 and safe within the 40 writes/min budget. |
| **Not optimistic** | Delete, status change, visibility change, reorder — these wait for the server, per plan §11. |
| **Success** | Toast, bottom-centre on mobile / bottom-right on desktop, auto-dismiss 4s, `aria-live="polite"`. |
| **Undo** | Offered for **status change and discard** (a reversible PATCH). **Not** offered for hard delete — instead delete uses a proper confirmation dialog naming the item. Promising undo that cannot be delivered is worse than no undo. |
| **Field error** | Inline, below the field, `role="alert"`, `aria-describedby`, red text **plus** an icon. Validate on blur, re-validate on change once errored. |
| **Rate limited (429)** | Specific message: "Too many changes at once — try again in a few seconds." Not a generic failure. |
| **Forbidden (403)** | Explain the rule: "Only an administrator can change status." |
| **Offline / network** | Persistent bar with Retry; queued optimistic actions roll back visibly. |
| **Empty — no items at all** | Centred: line icon, "No requests yet", one-line explanation, primary "Report the first thing". |
| **Empty — no filter matches** | Distinct: "No requests match these filters" + **Clear filters** button. Conflating these two is why empty screens feel broken. |
| **Empty — single board column** | Quiet dashed outline with the column name. Not the page-level empty state. |
| **Access denied** | Full page explaining the invitation model, with the signed-in email shown and a sign-out action. |

### 3.8 Filters, search, sort — rebuilt as separate axes

A filter bar with genuinely independent controls, all reflected in the URL:

- **Search** — one input, debounced 250ms, matching title **and** description, server-side.
- **Type** — multi-select chips: Bug · Feature · Improvement · Task.
- **Status** — multi-select (list view only; the board already expresses status spatially).
- **Author** — All · Mine · Others.
- **Visibility** — All · Shared · Internal (admin only).
- **Sort** — **Most votes** · Recently updated (default) · Newest · Oldest.
  This is what finally makes voting functional.
- **Show discarded** — an off-by-default toggle, replacing the permanent fifth column.
- Active filters render as removable tokens with **Clear all**.

---

## 4. Design Direction

### 4.1 The direction: functional Swiss minimalism, with colour reserved for meaning

Grounded in the UI/UX Pro Max database: **Minimalism & Swiss Style** (rated *best for enterprise
apps, dashboards, professional tools*; WCAG AAA; excellent performance) crossed with the
**Productivity Tool** product profile's recommendation of *Flat Design + Micro-interactions* and
*"clear hierarchy + functional colours"*.

I deliberately **rejected** two things the tool's `--design-system` pass returned:

- **The "Interactive Demo + Feature-Rich" landing pattern** (Hero → Features → CTA). That is a
  marketing-site structure. This product has no marketing surface; every user is invited and
  authenticated before they see anything.
- **"Modern Dark (Cinema Mobile)"** — glassmorphism, blur layers, ambient animated light blobs.
  It is a React-Native media-app style. Frosted blur behind dense small text actively harms
  legibility, and the primary audience is family members reading on phones in varied light.

### 4.2 The governing rule

> **Chrome is achromatic. Every saturated colour in the interface carries data meaning.**

This product has nine semantic values competing for attention (4 types × 5 statuses) plus
visibility and authorship markers. If the brand also claims a hue, the semantics blur.

So: **the primary action colour is near-black ink**, not a brand hue. Buttons, headers, and
navigation are neutral. Red means bug. Violet means feature. Green means done. Colour is never
decoration.

This also makes the interface age well and keeps a one-person codebase from drifting.

### 4.3 Design principles

1. **Answer the question first.** Every screen opens with what the user came to find out, not with
   controls.
2. **Colour is data.** See above.
3. **Never colour-only.** Type is icon + colour + label. Status is dot + colour + label. Internal is
   lock + label. Required by WCAG 1.4.1 and by the technical plan §10.
4. **Remove, don't disable.** Except where absence would read as a defect (own-item vote).
5. **Read before write.** Every object has a readable presentation; editing is an affordance on top.
6. **Dense information, generous targets.** A 4px spatial grid and a compact type scale, with hit
   areas expanded to ≥44px via padding — visual density and touch comfort are not in conflict if
   you separate the ink from the target.
7. **The URL is the state.** If it is on screen, it is linkable.
8. **Motion clarifies causality, or it doesn't ship.**

### 4.4 Density and layout philosophy

Density dial **8/10** (dense/dashboard) for information, deliberately paired with comfort-scale
touch targets. A family backlog will hold tens — not thousands — of items, so the goal is *seeing
the whole picture at once*, not virtualised infinite scroll.

Layout is a **12-column fluid grid** with a fixed 240px sidebar on desktop, and a single column
with 16px gutters on mobile. Board columns are equal-width flex children with a 280px minimum.

### 4.5 Interaction philosophy

**Direct, reversible, and never modal when it doesn't have to be.**

- Inline editing over form round-trips.
- One-tap primary actions where the outcome is overwhelmingly predictable (`Start`, `Vote`).
- Confirmation reserved for genuinely destructive and irreversible acts (hard delete), where it is
  a real dialog naming the target — not `window.confirm`.
- Undo for everything reversible.
- Full keyboard operation, with shortcuts for the admin power path (`C` new, `/` search, `E` edit,
  `1–5` set status on a focused card, `Esc` close).

### 4.6 Motion

Motion dial **3/10 — subtle**. CSS transitions only; **no GSAP**. The database's ScrollTrigger
reveal preset was rejected: scroll-reveal choreography belongs on marketing pages, and staggered
entrance animation on a task list actively delays the information the user opened the app to read.

- Duration 120–180ms for state changes, 200ms for panels and dialogs.
- Easing `cubic-bezier(0.2, 0, 0, 1)` in, `cubic-bezier(0.4, 0, 1, 1)` out (exits faster than
  entrances).
- Meaningful uses only: vote count ticks up; a card moving status slides into its new column;
  a completed subtask strikes through; a panel slides from the edge it belongs to; toasts rise.
- `@media (prefers-reduced-motion: reduce)` collapses all of it to opacity-only or nothing.

---

## 5. Design System

### 5.1 Colour

**All values below were computed against WCAG 2.1.** Three candidates failed on first pass and were
corrected (tertiary text, control borders, and the discarded status dot).

**Neutrals — warm-tinted, deliberately not cold SaaS grey**

| Token | Value | Use | Verified |
|---|---|---|---|
| `--canvas` | `#FAFAF8` | Page background | — |
| `--surface` | `#FFFFFF` | Cards, panels, sheets | — |
| `--surface-sunken` | `#F4F4F1` | Board column wells, inset areas | — |
| `--border-subtle` | `#E0E0D8` | Dividers, card outlines (decorative — 1.4.11 exempt) | — |
| `--border-control` | `#86867B` | Input, checkbox, toggle, outline-button borders | **3.68:1** on surface ✓ |
| `--text-primary` | `#16181C` | Body, headings | **17.0:1** on canvas ✓ AAA |
| `--text-secondary` | `#545B64` | Supporting text, labels | **6.57:1** ✓ AA |
| `--text-tertiary` | `#686F78` | Metadata, timestamps (≥14px) | **4.86:1** ✓ AA *(corrected from `#6E757E`, which measured 4.46:1)* |
| `--action` | `#16181C` | Primary button fill | white on it **17.8:1** ✓ |
| `--focus-ring` | `#2563EB` | 3px ring, 2px offset | **4.95:1** vs canvas ✓ |

**Type — filled tinted chip, icon + label**

| Type | Text | Tint background | Solid mark | Verified |
|---|---|---|---|---|
| Bug | `#9B2016` | `#FDEDEA` | `#B42318` | **7.07:1** ✓ |
| Feature | `#5B32B0` | `#F3EEFC` | `#6941C6` | **7.30:1** ✓ |
| Improvement | `#8A3A05` | `#FDF1E3` | `#B54708` | **7.02:1** ✓ |
| Task | `#3B4551` | `#EFF1F4` | `#475467` | **8.61:1** ✓ |

**Status — outline pill + dot, on a deliberately separate hue track**

Type and status appear side by side, so they are separated by **visual register** (filled chip vs.
outlined pill + dot) *and* by hue family — status never uses red, amber, or violet.

| Status | Colour | Dot vs canvas | Label text |
|---|---|---|---|
| Backlog | `#667085` / text `#545B64` | **4.76:1** ✓ | 6.57:1 ✓ |
| In progress | `#1570EF` / text `#175CD3` | **4.37:1** ✓ | 5.73:1 ✓ |
| In review | `#0E7490` | **5.13:1** ✓ | 5.13:1 ✓ |
| Done | `#067647` | **5.45:1** ✓ | 5.45:1 ✓ |
| Discarded | `#848C99` | **3.25:1** ✓ *(corrected from `#8A929E` at 3.01:1)* | + 60% opacity + strikethrough title |

**Semantic states:** destructive `#B42318` (6.57:1 both as text on white and as a fill under white
text) · success `#067647` · warning `#B54708` · info `#175CD3`.

**Dark mode** is not in scope for the core redesign, but the token architecture above is
primitive → semantic, so dark mode is a value swap rather than a rewrite. See §9.

### 5.2 Typography

**Geist Sans + Geist Mono** — already installed via `next/font` and currently overridden by Arial.
Using them costs nothing new, fixes a live defect, and Geist is a Swiss-adjacent neutral grotesque
that suits this direction exactly. *(Database equivalent if a change is preferred: Inter — "Flat
Design Mobile", recommended for dashboards and system UI.)*

Mono is used for a narrow, deliberate purpose: vote counts, subtask ratios (`2 / 4`), dates, and
request IDs — anything where digits should align and not reflow.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 28 / 34 | 600 | Page titles (`/`, request h1) |
| `title` | 20 / 28 | 600 | Panel and section titles |
| `heading` | 16 / 24 | 600 | Card titles, column headers |
| `body` | 15 / 22 | 400 | Descriptions, prose |
| `body-sm` | 14 / 20 | 400 | Secondary text, list meta |
| `label` | 13 / 16 | 500 | Form labels, chips |
| `meta` | 12 / 16 | 500 | Timestamps, counts (≥12px floor) |
| `mono-sm` | 13 / 16 | 500 | Counts, ratios, dates |

Letter-spacing `-0.01em` at `heading` and above, `0` below. Body max measure **68ch**.

### 5.3 Spacing, sizing, radius, borders, shadows

**Spacing** — 4px base: `1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64`.

**Sizing** — control heights `sm 32 · md 40 · lg 48`; icon sizes `14 / 16 / 20`; sidebar 240px;
board column min 280px; detail panel 420px; content max-width 1440px.

**Radius** — `sm 4` (chips, dots) · `md 8` (buttons, inputs, cards) · `lg 12` (panels, dialogs) ·
`full` (pills, avatars). Nothing above 12px — large radii read as consumer-playful and fight the
density.

**Borders** — 1px default. Cards use `--border-subtle`; anything interactive uses
`--border-control`. Focus is a 3px `--focus-ring` at 2px offset, never removed.

**Shadows** — used only for genuine elevation, never decoration:
- `sm` — `0 1px 2px rgb(22 24 28 / 6%)` — cards on hover
- `md` — `0 4px 12px rgb(22 24 28 / 8%)` — dropdowns, popovers
- `lg` — `0 12px 32px rgb(22 24 28 / 12%)` — dialogs, side panels
Resting cards carry **no shadow** — a 1px border does the work at lower visual cost.

### 5.4 Grid and layout

| Breakpoint | Layout |
|---|---|
| `<640` | Single column, 16px gutters, bottom tab bar, grouped list |
| `640–767` | Single column, 24px gutters, wider cards |
| `768–1023` | Collapsible icon sidebar (64px), list view default, 2-up board optional |
| `1024–1279` | Full 240px sidebar, 4-column board |
| `≥1280` | Sidebar + board + optional 420px detail panel (route changes, board stays) |

### 5.5 Interaction states

Every interactive element defines all six: **rest · hover · focus-visible · active · disabled · loading**.

- Hover: background steps one level (`surface → surface-sunken`), 120ms. Never the sole signal.
- Focus-visible: 3px ring, 2px offset, always visible, never suppressed.
- Active: scale `0.98` on buttons, 80ms.
- Disabled: 45% opacity, `cursor: not-allowed`, `aria-disabled`, and — where non-obvious — an
  adjacent explanation.
- Loading: in-place spinner replacing the label, width preserved to prevent layout shift.
- `cursor: pointer` on everything clickable.

### 5.6 Accessibility rules (non-negotiable)

1. Text ≥4.5:1; large text and UI boundaries ≥3:1. **Verified above.**
2. Touch targets ≥44×44px, ≥8px apart.
3. Never colour alone — type, status, visibility, and authorship all carry icon + text.
4. Full keyboard operation; logical tab order; visible focus everywhere.
5. Dialogs and panels: focus trap, `Esc` to close, focus returns to the trigger, `aria-modal`.
6. Semantic headings `h1 → h2 → h3`, no level skipping; one `h1` per page.
7. Errors `role="alert"` and associated via `aria-describedby`; toasts in an `aria-live="polite"`
   region.
8. Board columns are `<section>` with `aria-labelledby`; card counts announced in the heading.
9. Subtasks are real `<input type="checkbox">` with real `<label>`.
10. `prefers-reduced-motion` respected globally.
11. Skip-to-content link; `<html lang>` follows the language toggle.
12. Icon-only buttons always carry `aria-label`.
13. No text below 12px anywhere.

---

## 6. Screen-by-Screen Plan

### 6.1 Overview `/`

- **Purpose:** answer "what should I look at?" for whichever role is signed in.
- **Information:** *Member* — your open requests with status, recently changed items, app tiles.
  *Admin* — untriaged count, in-progress work, per-app active counts.
- **Layout:** single column, max 960px, sections separated by 32px with `heading`-level titles.
- **Primary action:** New request. **Secondary:** jump into an app, open Inbox (admin).
- **States:** skeleton sections · brand-new-account empty state with a short explanation of how the
  backlog works · error with retry.
- **Responsive:** app tiles 3-up ≥1024, 2-up ≥640, stacked below.

### 6.2 App backlog `/a/[app]`

- **Purpose:** see everything for one application, grouped by state.
- **Information:** app name + emoji + description; filter bar; board or grouped list.
- **Layout (≥1024):** four columns — Backlog · In progress · In review · Done. Discarded is behind
  the "Show discarded" toggle. Column headers are sticky and carry a status dot, name, and count.
- **Layout (<768):** **a single scrolling list grouped by status with sticky group headers**, each
  collapsible.
  *Opinionated departure:* the technical plan (§10) specifies mobile status tabs. Tabs hide 80% of
  the board behind a tap, and the mobile user's dominant question — "did my thing move?" — requires
  scanning across states. With the tens-of-items scale this product is designed for, a grouped
  scroll answers it in one gesture. Tabs remain the correct fallback if any single app exceeds
  ~60 open items.
- **Card contents** (per SPEC §11, nothing more): type chip · title · internal + admin-created
  markers when relevant · subtask progress bar when subtasks exist · creator avatar + name ·
  vote button with count.
- **Primary action:** New request. **Secondary:** filters, sort, view toggle, per-card `⋯`.
- **States:** skeletons · no-items empty · no-filter-match empty (distinct, with Clear filters) ·
  per-column quiet empty · error banner with retry.

### 6.3 Request detail `/r/[id]`

- **Purpose:** the shareable, readable record of one request. See §3.5 for the full layout.
- **Primary action:** Vote (or Start, for an admin on a `backlog` item).
- **Secondary:** inline edit, subtask management, `⋯` (move app, visibility, delete).
- **States:** skeleton · 404 for a nonexistent *or* internal-and-unauthorised item (the API
  deliberately returns 404 rather than 403 to avoid leaking internal items — the UI must not
  contradict that) · save-in-flight per field · conflict.
- **Responsive:** full page <1280px; right-hand 420px panel over the board ≥1280px, with the URL
  still changing so the link is shareable either way.

### 6.4 New request `/a/[app]/new`

Full page on mobile, dialog over the board on desktop. Flow exactly as §3.1. States: idle ·
checking duplicates (inline spinner on the suggestion area only) · duplicates shown · validating ·
submitting · error.

### 6.5 Inbox `/inbox` — admin

Per §3.3. Dense rows, one-tap `Start` / `Discard`, bulk selection, cross-app. Empty state — "Nothing
to triage" — is a *success* state and should read as one.

### 6.6 My requests `/mine`

Per §3.2. Three grouped sections. Empty state invites reporting.

### 6.7 Settings › Profile `/settings/profile`

Name · **photo (redesigned: use your Google photo / remove — the pasted-HTTPS-URL field demoted to
an advanced disclosure, since Firebase already supplies `identity.picture`)** · language · role
(read-only) · sign out.

### 6.8 Settings › People `/settings/people` — admin

Invite form (email, name, role) · list with avatar, name, email, and a **status pill** —
`Pending` / `Linked` / `Revoked`. Row actions per the server rules: change role (never your own),
revoke/restore (never your own), delete invitation (pending only). Confirmation dialogs for revoke
and delete. Grouped: Active → Pending → Revoked.

### 6.9 Settings › Apps `/settings/apps` — admin

Create/edit form (emoji, name, description) · list with item counts and active/archived state ·
**reorder up/down — a new control exposing the `sortOrder` column that already exists and currently
cannot be changed** · archive/restore with the "at least one must stay active" rule surfaced
*before* the attempt, not as a server error afterwards.

### 6.10 Sign in `/signin` and No access `/no-access`

Sign-in: centred card, product name, one-line explanation of the invite model, Continue with Google.
No access: explains that access is by invitation, shows the signed-in email, offers sign-out — never
a dead end.

---

## 7. Component System

**Primitives** — Button (primary/secondary/ghost/destructive × sm/md/lg) · IconButton · Input ·
Textarea (auto-grow) · Select · Checkbox · SegmentedControl · Switch · Chip/Token · Avatar (with
initials fallback) · Tooltip · Badge · Spinner · Skeleton · ProgressBar · Divider · Kbd.

**Composites** — TypeChip · StatusPill · StatusStepper · VoteButton (optimistic, with own-item
disabled state) · RequestCard · RequestRow (dense, for list/inbox) · SubtaskList + SubtaskRow ·
DuplicateSuggestion · FilterBar · SortMenu · SearchInput (debounced) · BulkActionBar · AppTile ·
AppSwitcher · UserRow · EmptyState (variants: no-data / no-results / success) · ErrorState ·
Toast + ToastRegion · ConfirmDialog · SidePanel · Dialog · BottomSheet (mobile panel equivalent) ·
DropdownMenu · Sidebar · BottomTabBar · PageHeader · Breadcrumb.

**Layout** — AppShell · PageContainer · BoardColumn · GroupedList · Section · Stack/Cluster.

Every component ships with all six interaction states (§5.5) and its accessibility contract
(role, labelling, keyboard behaviour) defined alongside it.

---

## 8. UX Additions, Redesigns, and Removals

### 8.1 Missing interactions to add

| Addition | UX reason |
|---|---|
| **Real URLs for every view** | Nothing is currently linkable, bookmarkable, or back-button-safe. In a product about shared awareness, "here's the link to the bug you reported" is a core interaction that does not exist. |
| **Read-only request detail** | Non-owners are currently shown a disabled edit form. Reading is the most common action and has no proper presentation. |
| **Sort by votes** | Voting is the stated prioritisation mechanism but no ordering uses it. The feature is currently decorative. |
| **`/inbox` cross-app triage** | The admin's actual daily job spans apps; the UI is organised so it cannot be done in one place. |
| **Bulk actions (list view)** | Triaging a burst of reports one panel at a time is the dominant friction in the admin path. |
| **`/mine` follow-up view** | Members have no way to find out what happened to what they reported. Today the app is write-only for them. |
| **Move a request between apps** | Misfiled requests are permanently stuck. The technical plan already specifies `appId` as an editable field; only the implementation omits it. |
| **Composite filters + description search** | You currently cannot ask for "my bugs", and search silently ignores descriptions. |
| **Toasts + undo for reversible actions** | A single global error banner cannot express per-action outcomes. |
| **Skeletons and distinct empty states** | "Nothing matched your filter" and "nothing exists yet" currently look identical, which reads as breakage. |
| **Optimistic vote and subtask toggle** | The lightest interactions currently cost a full round trip and a list refetch. |
| **App reordering** | `sortOrder` exists in the schema, is set on creation, and can never be changed. |
| **Keyboard shortcuts** | The admin is a daily power user on a desktop; there is currently no acceleration at all. |
| **"Vote for this instead" on duplicate suggestions** | Duplicate detection exists to produce a vote, but the suggestion only opens an edit panel. |

### 8.2 Existing interactions to redesign

| Current | Redesigned | Why |
|---|---|---|
| Card click → disabled edit form | Card click → readable detail; edit inline | Reading ≠ editing |
| Status via `<select>` or drag | Status stepper, card menu, bulk action | DnD is touch-hostile and contradicts the project's own plan (§10, §17) |
| One flat chip row mixing 3 axes | Independent filter controls, all in the URL | "My bugs" is currently unaskable |
| `window.confirm()` ×3 | Proper dialogs naming the target; undo where reversible | Native confirms are unstyleable, unlocalised, and untestable |
| Single global error banner | Field-level errors + toasts + typed messages for 403/429/offline | One banner cannot express what actually failed |
| Admin tools inside the profile dialog | A real `/settings` section | Administration is not a personal preference |
| Paste-an-HTTPS-URL avatar | Use Google photo (already captured) / remove; URL demoted to advanced | Non-technical users cannot be asked to source an image URL |
| App emoji as the only identity | Emoji retained as app identity, paired with name and a per-app accent | Emoji is legitimate *content* here; it is never used for UI affordances |

### 8.3 To remove or simplify

| Remove | Why |
|---|---|
| **Discarded as a permanent board column** | Consumes 20% of the board for a graveyard. SPEC §5 explicitly allows "a separate view or filter". → a toggle. |
| **Drag-and-drop as the primary move mechanism** | Fails on touch; listed as a non-goal in the technical plan. May survive as a desktop-only enhancement. |
| **`LocalizedText` on item titles** | Both language keys are populated with the same string. Dead complexity implying a capability that does not exist. → a plain string. |
| **The top-bar "Apps"/"Activity" link** | Points at `#board` and does nothing. |
| **The profile panel as a navigation hub** | It is doing triple duty as profile editor, admin menu, and sign-out. |
| **The hardcoded `"atlas"` default app** | Should derive from the URL, then the first app. |
| **Per-mutation full list refetch** | Replace with targeted cache updates (TanStack Query is already a dependency but is not currently used in the component). |

---

## 9. Priority

### Tier 1 — Core redesign (the foundation; do these together)

1. **Routing and URL state** — real routes, filters in query params, deep-linkable requests.
   *Everything else depends on this; it is also the single biggest user-visible win.*
2. **Design system implementation** — tokens (§5.1–5.3), Geist wired up correctly, base primitives.
3. **App shell** — sidebar, mobile tab bar, page header, responsive scaffolding.
4. **Request detail as a read view** with inline editing and the status stepper.
5. **Board and grouped-list rebuild** with the new card, real empty states, and skeletons.
6. **Status changes without drag-and-drop**; Discarded behind a toggle.
7. **Feedback layer** — toasts, confirm dialogs, field validation, typed error messages.
8. **Accessibility pass** — focus, targets, roles, labels, reduced motion.

### Tier 2 — High-value UX improvements

9. **Filter/search/sort rebuild**, including sort-by-votes and description search.
10. **`/inbox` admin triage** with one-tap Start/Discard.
11. **`/mine` member follow-up view.**
12. **Optimistic vote and subtask toggle** + targeted cache updates via TanStack Query.
13. **Create flow rebuild**, with "Vote for this instead" on duplicate suggestions.
14. **`/settings` section** — Profile (with the Google-photo fix), People, Apps.
15. **Move request between apps** *(requires adding `appId` to `updateItemSchema` — a change the
    technical plan already specifies)*.
16. **App reordering** *(exposes the existing `sortOrder` column)*.
17. **Bulk actions** in list and inbox views.

### Tier 3 — Optional enhancements

18. **Keyboard shortcuts** for the admin path.
19. **Dark mode** — cheap, because §5.1 tokens are already primitive → semantic.
20. **"Changed since your last visit"** — a subtle dot and an Overview summary.
    *This is the one item requiring a schema change (`users.last_seen_at`). It stays firmly inside
    SPEC §14's exclusion of "advanced notifications": no email, no push, purely in-app.*
21. **Desktop drag-and-drop** as an enhancement layered over the menu-based mechanism.
22. **Detail-panel-over-board** at ≥1280px.
23. **Remove `LocalizedText`** and simplify the language layer.

---

## Appendix — Deliberate departures from the existing technical plan

| Plan says | This design says | Reason |
|---|---|---|
| §10: mobile status **tabs** | Grouped list with sticky headers | Members' core question spans states; tabs hide 80% of the board. Tabs remain correct beyond ~60 open items per app. |
| §9 routes: `/apps`, `/apps/:appId`, `/items/:itemId` | `/`, `/a/[app]`, `/r/[id]`, `/inbox`, `/mine` | Adds the two role-shaped views the plan lacks; shorter request URLs because they get shared in chat messages. |
| §17: no drag-and-drop | Agreed — and the current code contradicts this | The implementation shipped DnD as the only board-level move path. |
| §6: owner edits accept `appId` | Agreed — implementation omits it | Restoring it enables the "move between apps" fix. |

**Nothing in this document changes the product's purpose, and nothing adds a feature the
specification excludes.** Comments, attachments, assignees, estimates, sprints, dependencies,
deadlines, and audit history all remain out of scope.
