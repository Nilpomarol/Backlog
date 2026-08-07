import type { Metadata } from "next";
import { PeopleSettingsPage } from "../../../components/pages/settings-people";

export const metadata: Metadata = { title: "Persones" };

export default function PeopleSettingsRoute() {
  return <PeopleSettingsPage />;
}
