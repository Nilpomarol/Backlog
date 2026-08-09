import { redirect } from "next/navigation";

export default async function NewRequestRoute({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  redirect(`/a/${app}?new=1`);
}
