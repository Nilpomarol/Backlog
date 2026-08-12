"use client";

import {
  LayoutGrid,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Settings,
  SquareStack,
  Star,
  Loader2,
} from "lucide-react";
import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { clientRoute } from "../lib/client-route";
import { useOnlineStatus } from "../lib/connectivity";
import { LANGUAGES, type Language } from "../lib/i18n";
import { Link, usePathname, useSearchParams } from "../lib/local-navigation";
import { useAllItems, useApps } from "../lib/queries";
import { isRouteTransitionPending, markRouteTransitionEnd, subscribeRouteTransition } from "../lib/route-transition";
import { useAuth, useLanguage } from "./providers";
import { SyncStatus } from "./sync-status";
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
  const online = useOnlineStatus();
  return (
    <AuthShell>
      <span className="auth-mark">
        <LayoutGrid size={22} aria-hidden="true" />
      </span>
      <h1 className="auth-title">{t.signInTitle}</h1>
      <p className="auth-body">{t.signInBody}</p>
      {!online && <p className="field-hint">{t.signInRequiresOnline}</p>}
      <Button
        variant="primary"
        size="lg"
        block
        disabled={!online}
        icon={<LogIn size={18} aria-hidden="true" />}
        onClick={() => void signIn()}
      >
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
  active,
  onClick,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href} className="nav-item" aria-current={active ? "page" : undefined} onClick={onClick}>
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
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

function ReadyShell({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = profile?.role === "admin";

  // Closing the sheet from a Link's onClick would race the navigation itself: vinext resolves
  // Link clicks through several async hops before it calls history.pushState (see lib/route-
  // transition.ts), but the sheet's own history entry (from useHistoryBackToClose in overlay.tsx)
  // would already be popped by the time React committed the synchronous onClick — cancelling the
  // in-flight navigation. Closing in reaction to the pathname actually changing sidesteps the
  // race; adjusting state during render (React's endorsed alternative to a synchronising effect)
  // avoids the extra render pass a useEffect would add here.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (moreOpen) setMoreOpen(false);
  }

  // Background refetches get a thin top bar; the content underneath stays interactive.
  const backgroundFetches = useIsFetching();
  // Covers the router-navigation gap too (including back/forward, which vinext resolves over
  // the network rather than instantly) — see lib/route-transition.ts.
  const routeTransitionPending = useSyncExternalStore(subscribeRouteTransition, isRouteTransitionPending, () => false);
  useEffect(() => {
    markRouteTransitionEnd();
  }, [pathname, searchParams]);

  const { data: apps = [] } = useApps();
  // Warm the complete card index from every signed-in screen. useAllItems deduplicates this with
  // overview/mine and fans the response out into persistent per-board caches.
  const { data: allItems = [] } = useAllItems();

  const route = clientRoute(pathname);
  const currentAppId = route.kind === "app" ? route.appId : "";
  const requestAppId =
    route.kind === "request" ? allItems.find((item) => item.id === route.requestId)?.appId ?? "" : "";
  const backlogApp = apps.find((app) => app.id === (currentAppId || requestAppId)) ?? apps[0];
  const backlogHref = backlogApp ? `/a/${encodeURIComponent(backlogApp.id)}` : "/";
  const createHref = backlogApp ? `/a/${encodeURIComponent(backlogApp.id)}?new=1` : "/";

  const isOverview = route.kind === "overview";
  const isBacklog = route.kind === "app" || route.kind === "request";
  const isMine = route.kind === "mine";
  const isSettings = route.kind.startsWith("settings-");

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
        <SyncStatus />
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
        <Link href="/mine" className="tabbar-item" aria-current={isMine ? "page" : undefined}>
          <Star size={19} aria-hidden="true" />
          {t.myRequests}
        </Link>
        <button type="button" className="tabbar-item" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <MenuIcon size={19} aria-hidden="true" />
          {t.more}
        </button>
      </nav>

      {/* Floating on mobile so "add a proposal" is reachable from anywhere with one thumb tap,
          instead of competing for space inside the tab bar row — see .fab in globals.css.
          Hidden on the overview tab: there's no single "current app" there, and each app board
          already has its own "+" (see overview.tsx's AppBoard). */}
      {!isOverview && (
        <Link href={createHref} className="fab" aria-label={t.newRequest}>
          <Plus size={22} aria-hidden="true" />
        </Link>
      )}

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
