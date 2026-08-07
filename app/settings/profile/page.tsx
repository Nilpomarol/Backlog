import type { Metadata } from "next";
import { ProfileSettingsPage } from "../../../components/pages/settings-profile";

export const metadata: Metadata = { title: "El teu perfil" };

export default function ProfileSettingsRoute() {
  return <ProfileSettingsPage />;
}
