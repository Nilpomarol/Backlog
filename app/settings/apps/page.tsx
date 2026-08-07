import type { Metadata } from "next";
import { AppsSettingsPage } from "../../../components/pages/settings-apps";

export const metadata: Metadata = { title: "Aplicacions" };

export default function AppsSettingsRoute() {
  return <AppsSettingsPage />;
}
