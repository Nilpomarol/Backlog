import { AppBacklogPage } from "../../../components/pages/app-backlog";

export default async function AppBacklogRoute({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  return <AppBacklogPage appId={decodeURIComponent(app)} />;
}
