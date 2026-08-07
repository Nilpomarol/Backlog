import type { Metadata } from "next";
import { OverviewPage } from "../components/pages/overview";

export const metadata: Metadata = {
  title: "Resum",
  description: "Vota idees, comunica errors i segueix què es construirà a continuació.",
};

export default function Home() {
  return <OverviewPage />;
}
