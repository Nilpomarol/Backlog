"use client";

import { FileQuestion } from "lucide-react";
import { Link } from "../../lib/local-navigation";
import { useT } from "../providers";
import { EmptyState } from "../ui/states";

export function NotFoundPage() {
  const t = useT();
  return (
    <div className="page page-prose">
      <EmptyState
        icon={FileQuestion}
        title={t.routeNotFoundTitle}
        body={t.routeNotFoundBody}
        action={
          <Link href="/" className="btn btn-secondary">
            {t.backToBacklog}
          </Link>
        }
      />
    </div>
  );
}
