"use client";

import { clientRoute } from "../lib/client-route";
import { usePathname } from "../lib/local-navigation";
import { AppBacklogPage } from "./pages/app-backlog";
import { MinePage } from "./pages/mine";
import { NotFoundPage } from "./pages/not-found";
import { OverviewPage } from "./pages/overview";
import { RequestDetailPage } from "./pages/request-detail";
import { AppsSettingsPage } from "./pages/settings-apps";
import { PeopleSettingsPage } from "./pages/settings-people";
import { ProfileSettingsPage } from "./pages/settings-profile";

export function ClientRouter() {
  const pathname = usePathname();
  const route = clientRoute(pathname);

  switch (route.kind) {
    case "mine":
      return <MinePage />;
    case "settings-apps":
      return <AppsSettingsPage />;
    case "settings-people":
      return <PeopleSettingsPage />;
    case "settings-profile":
      return <ProfileSettingsPage />;
    case "app":
      return <AppBacklogPage appId={route.appId} openComposer={route.compose} />;
    case "request":
      return <RequestDetailPage requestId={route.requestId} />;
    case "overview":
      return <OverviewPage />;
    default:
      return <NotFoundPage />;
  }
}
