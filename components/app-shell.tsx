"use client";

import {
  Inbox,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Settings,
  SquareStack,
  Star,
  Loader2,
  WifiOff,
} from "lucide-react";
import { useIsFetching } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { rememberVisitedUrl } from "../lib/board-return";
import { LANGUAGES, type Language } from "../lib/i18n";
import { useAllItems, useApps } from "../lib/queries";
import { isRouteTransitionPending, markRouteTransitionEnd, subscribeRouteTransition } from "../lib/route-transition";
import { useAuth, useLanguage } from "./providers";
import { AppIcon, Avatar, Button, SegmentedControl, SkeletonCard } from "./ui/primitives";
import { Sheet } from "./ui/overlay";

// --- Auth screens -----------------------------------------------------------------------------

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen">
      <div className="auth-card">{children}</div>
    </main>
  );
}

/**
 * Rendered on the server and while the session resolves. It paints the real chrome rather than
 * a bare spinner, so the first frame already shows the product instead of an empty page.
 */
function PendingShell() {
  const { t } = useLanguage();
  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label={t.primaryNavigation}>
        <div className="brand">
          <span className="brand-mark">
            <LayoutGrid size={15} aria-hidden="true" />
          </span>
          {t.appName}
        </div>
        <div className="nav-group">
          <span className="nav-item">
            <span className="nav-item-icon">
              <SquareStack size={16} aria-hidden="true" />
            </span>
            <span className="nav-item-label">{t.overview}</span>
          </span>
          <span className="nav-item">
            <span className="nav-item-icon">
              <Star size={16} aria-hidden="true" />
            </span>
            <span className="nav-item-label">{t.myRequests}</span>
          </span>
        </div>
        <div className="nav-group">
          <p className="nav-group-label">{t.apps}</p>
          {[0, 1, 2].map((index) => (
            <span className="nav-item" key={index}>
              <span className="skeleton skeleton-line" style={{ width: "70%", height: 12 }} />
            </span>
          ))}
        </div>
      </nav>

      <div className="main">
        <main id="main" className="page page-narrow" role="status" aria-busy="true">
          <p
            style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", marginBottom: 24 }}
          >
            <Loader2 size={16} className="spin" aria-hidden="true" />
            {t.checkingAccess}
          </p>
          <div className="request-list" aria-hidden="true">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </main>
      </div>
    </div>
  );
}

function SignInScreen() {
  const { t } = useLanguage();
  const { signIn, problem } = useAuth();
  return (
    <AuthShell>
      <span className="auth-mark">
        <LayoutGrid size={22} aria-hidden="true" />
      </span>
      <h1 className="auth-title">{t.signInTitle}</h1>
      <p className="auth-body">{t.signInBody}</p>
      <Button variant="primary" size="lg" block icon={<LogIn size={18} aria-hidden="true" />} onClick={() => void signIn()}>
        {t.signInGoogle}
      </Button>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
    </AuthShell>
  );
}

function NoAccessScreen() {
  const { t } = useLanguage();
  const { email, signOut } = useAuth();
  return (
    <AuthShell>
      <span className="auth-mark">
        <LayoutGrid size={22} aria-hidden="true" />
      </span>
      <h1 className="auth-title">{t.noAccessTitle}</h1>
      <p className="auth-body">{t.noAccessBody}</p>
      {email && (
        <p className="auth-email">
          <span className="sr-only">{t.signedInAs} </span>
          {email}
        </p>
      )}
      <Button variant="secondary" block icon={<LogOut size={16} aria-hidden="true" />} onClick={() => void signOut()}>
        {t.signOut}
      </Button>
    </AuthShell>
  );
}

function UnavailableScreen() {
  const { t } = useLanguage();
  const { retry, signOut } = useAuth();
  return (
    <AuthShell>
      <h1 className="auth-title">{t.errorLoading}</h1>
      <p className="auth-body">{t.errorGeneric}</p>
      <div className="btn-row">
        <Button variant="primary" onClick={retry}>
          {t.retry}
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          {t.signOut}
        </Button>
      </div>
    </AuthShell>
  );
}

// --- Navigation -------------------------------------------------------------------------------

function NavLink({
  href,
  icon,
  label,
  count,
  active,
  onClick,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href} className="nav-item" aria-current={active ? "page" : undefined} onClick={onClick}>
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
      {count !== undefined && count > 0 && <span className="nav-item-count">{count}</span>}
    </Link>
  );
}

function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <SegmentedControl<Language>
      label={t.language}
      value={language}
      onChange={setLanguage}
      options={LANGUAGES.map((code) => ({ value: code, label: code.toUpperCase() }))}
    />
  );
}

// --- Shell ------------------------------------------------------------------------------------

export function AppShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "signed-out") return <SignInScreen />;
  if (status === "denied") return <NoAccessScreen />;
  if (status === "unavailable") return <UnavailableScreen />;
  if (status === "loading") return <PendingShell />;
  return <ReadyShell>{children}</ReadyShell>;
}

/** Connectivity is an external store, so it is read rather than mirrored into state. */
function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function ReadyShell({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = profile?.role === "admin";

  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
  // Background refetches get a thin top bar; the content underneath stays interactive.
  const backgroundFetches = useIsFetching();
  // Covers the router-navigation gap too (including back/forward, which vinext resolves over
  // the network rather than instantly) — see lib/route-transition.ts.
  const routeTransitionPending = useSyncExternalStore(subscribeRouteTransition, isRouteTransitionPending, () => false);
  useEffect(() => {
    markRouteTransitionEnd();
  }, [pathname, searchParams]);

  // Tracks "the page before this one" across every navigation in the app (see
  // lib/board-return.ts) — not just the board, so breadcrumbs elsewhere (e.g. a subtask's
  // parent) can return you to wherever you actually came from.
  const currentUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const search = searchParams.toString();
    const url = search ? `${pathname}?${search}` : pathname;
    if (currentUrlRef.current && currentUrlRef.current !== url) rememberVisitedUrl(currentUrlRef.current);
    currentUrlRef.current = url;
  }, [pathname, searchParams]);

  const { data: apps = [] } = useApps();
  // Admins get a triage badge. Reusing the unfiltered cross-app query means the overview and
  // the sidebar share one request instead of issuing two.
  const { data: crossAppItems = [] } = useAllItems(undefined, { enabled: isAdmin });
  const untriagedCount = crossAppItems.filter((item) => item.status === "backlog").length;

  // Closing the sheet from a Link's onClick would race the navigation itself: vinext resolves
  // Link clicks through several async hops before it calls history.pushState (see lib/route-
  // transition.ts), but the sheet's own history entry (from useHistoryBackToClose in overlay.tsx)
  // would already be popped by the time React commits the synchronous onClick — cancelling the
  // in-flight navigation. Closing in reaction to the pathname actually changing sidesteps the race.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const currentAppId = pathname.startsWith("/a/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : "";
  const backlogApp = apps.find((app) => app.id === currentAppId) ?? apps[0];
  const backlogHref = backlogApp ? `/a/${encodeURIComponent(backlogApp.id)}` : "/";
  const createHref = backlogApp ? `/a/${encodeURIComponent(backlogApp.id)}?new=1` : "/";

  const isOverview = pathname === "/";
  const isBacklog = pathname.startsWith("/a/") || pathname.startsWith("/r/");
  const isInbox = pathname === "/inbox";
  const isMine = pathname === "/mine";
  const isSettings = pathname.startsWith("/settings");

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t.skipToContent}
      </a>

      {(backgroundFetches > 0 || routeTransitionPending) && <div className="route-progress" aria-hidden="true" />}

      <nav className="sidebar" aria-label={t.primaryNavigation}>
        <div className="brand">
          <span className="brand-mark">
            <LayoutGrid size={15} aria-hidden="true" />
          </span>
          {t.appName}
        </div>

        <div className="nav-group">
          <NavLink href="/" icon={<SquareStack size={16} aria-hidden="true" />} label={t.overview} active={isOverview} />
          {isAdmin && (
            <NavLink
              href="/inbox"
              icon={<Inbox size={16} aria-hidden="true" />}
              label={t.inbox}
              count={untriagedCount}
              active={isInbox}
            />
          )}
          <NavLink href="/mine" icon={<Star size={16} aria-hidden="true" />} label={t.myRequests} active={isMine} />
        </div>

        <div className="nav-group">
          <p className="nav-group-label" id="nav-apps-label">
            {t.apps}
          </p>
          <div aria-labelledby="nav-apps-label">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/a/${encodeURIComponent(app.id)}`}
                className="nav-item"
                aria-current={currentAppId === app.id ? "page" : undefined}
              >
                <AppIcon name={app.name} logoUrl={app.logoUrl} className="nav-app-icon" />
                <span className="nav-item-label">{app.name}</span>
                {app.activeItemCount > 0 && <span className="nav-item-count">{app.activeItemCount}</span>}
              </Link>
            ))}
          </div>
        </div>

        <div className="nav-spacer" />

        <div className="nav-group" style={{ marginBottom: 0 }}>
          <NavLink
            href="/settings/profile"
            icon={<Settings size={16} aria-hidden="true" />}
            label={t.settings}
            active={isSettings}
          />
          {profile && (
            <Link href="/settings/profile" className="nav-item" style={{ gap: 10 }}>
              <Avatar name={profile.name} url={profile.avatarUrl} admin={isAdmin} />
              <span className="nav-item-label" style={{ fontSize: 13 }}>
                {profile.name}
              </span>
            </Link>
          )}
        </div>
      </nav>

      <div className="main">
        {!online && (
          <p className="offline-bar" role="status">
            <WifiOff size={15} aria-hidden="true" />
            {t.errorOffline}
          </p>
        )}
        <main id="main">{children}</main>
      </div>

      <nav className="tabbar" aria-label={t.primaryNavigation}>
        <Link href="/" className="tabbar-item" aria-current={isOverview ? "page" : undefined}>
          <SquareStack size={19} aria-hidden="true" />
          {t.overview}
        </Link>
        <Link href={backlogHref} className="tabbar-item" aria-current={isBacklog ? "page" : undefined}>
          <LayoutGrid size={19} aria-hidden="true" />
          {backlogApp?.name ?? t.apps}
        </Link>
        <Link href={createHref} className="tabbar-item tabbar-item-create">
          <span className="tabbar-create-mark">
            <Plus size={18} aria-hidden="true" />
          </span>
          <span className="sr-only">{t.newRequest}</span>
        </Link>
        {isAdmin ? (
          <Link href="/inbox" className="tabbar-item" aria-current={isInbox ? "page" : undefined}>
            <Inbox size={19} aria-hidden="true" />
            {t.inbox}
          </Link>
        ) : (
          <Link href="/mine" className="tabbar-item" aria-current={isMine ? "page" : undefined}>
            <Star size={19} aria-hidden="true" />
            {t.myRequests}
          </Link>
        )}
        <button type="button" className="tabbar-item" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <MenuIcon size={19} aria-hidden="true" />
          {t.more}
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t.more} closeLabel={t.closeMenu}>
        {profile && (
          <div className="profile-preview">
            <Avatar name={profile.name} url={profile.avatarUrl} size="md" admin={isAdmin} />
            <div style={{ minWidth: 0 }}>
              <p className="data-row-name">{profile.name}</p>
              <p className="data-row-meta">{isAdmin ? t.administrator : t.member}</p>
            </div>
          </div>
        )}

        <p className="nav-group-label">{t.apps}</p>
        <div className="nav-group">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/a/${encodeURIComponent(app.id)}`}
              className="nav-item"
              aria-current={currentAppId === app.id ? "page" : undefined}
            >
              <AppIcon name={app.name} logoUrl={app.logoUrl} className="nav-app-icon" />
              <span className="nav-item-label">{app.name}</span>
              {app.activeItemCount > 0 && <span className="nav-item-count">{app.activeItemCount}</span>}
            </Link>
          ))}
        </div>

        <div className="nav-group">
          {!isAdmin && (
            <NavLink
              href="/mine"
              icon={<Star size={16} aria-hidden="true" />}
              label={t.myRequests}
              active={isMine}
            />
          )}
          <NavLink
            href="/settings/profile"
            icon={<Settings size={16} aria-hidden="true" />}
            label={t.settings}
            active={isSettings}
          />
        </div>

        <div className="field">
          <p className="field-label">{t.language}</p>
          <LanguagePicker />
        </div>

        <Button variant="secondary" block icon={<LogOut size={16} aria-hidden="true" />} onClick={() => void signOut()}>
          {t.signOut}
        </Button>
      </Sheet>
    </div>
  );
}
