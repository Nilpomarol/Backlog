import { RequestDetailPage } from "../../../components/pages/request-detail";

export default async function RequestDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetailPage requestId={decodeURIComponent(id)} />;
}
