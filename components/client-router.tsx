"use client";

import { useEffect } from "react";
import { clientRoute } from "../lib/client-route";
import { installLocalLinkNavigation, usePathname } from "../lib/local-navigation";
import { AppBacklogPage } from "./pages/app-backlog";
import { MinePage } from "./pages/mine";
import { OverviewPage } from "./pages/overview";
import { RequestDetailPage } from "./pages/request-detail";
import { AppsSettingsPage } from "./pages/settings-apps";
import { PeopleSettingsPage } from "./pages/settings-people";
import { ProfileSettingsPage } from "./pages/settings-profile";

export function ClientRouter() {
  const pathname = usePathname();
  const route = clientRoute(pathname);

  useEffect(() => installLocalLinkNavigation(), []);

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
      return <AppBacklogPage appId={route.appId} />;
    case "request":
      return <RequestDetailPage requestId={route.requestId} />;
    default:
      return <OverviewPage />;
  }
}
