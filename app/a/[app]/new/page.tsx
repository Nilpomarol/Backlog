import type { Metadata } from "next";
import { NewRequestPage } from "../../../../components/pages/new-request";

export const metadata: Metadata = { title: "Nova proposta" };

export default async function NewRequestRoute({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  return <NewRequestPage appId={decodeURIComponent(app)} />;
}
