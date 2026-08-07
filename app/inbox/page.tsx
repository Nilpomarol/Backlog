import type { Metadata } from "next";
import { InboxPage } from "../../components/pages/inbox";

export const metadata: Metadata = { title: "Per decidir" };

export default function InboxRoute() {
  return <InboxPage />;
}
