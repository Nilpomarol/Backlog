import type { Metadata } from "next";
import { MinePage } from "../../components/pages/mine";

export const metadata: Metadata = { title: "Les meves propostes" };

export default function MineRoute() {
  return <MinePage />;
}
