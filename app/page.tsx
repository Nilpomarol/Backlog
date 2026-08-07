import type { Metadata } from "next";
import { BacklogApp } from "./backlog-app";

export const metadata: Metadata = {
  title: "Millores d’Atlas",
  description: "Vota idees, comunica errors i segueix què es construirà a continuació.",
};

export default function Home() {
  return <BacklogApp />;
}
