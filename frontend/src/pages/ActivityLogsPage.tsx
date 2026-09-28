import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

export function ActivityLogsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["activity-logs", page],
    queryFn: async () => (await api.get("/activity-logs", { params: { page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (prev) => prev,
  });

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <div className="p-5">
            <EmptyState icon={ClipboardList} title="No activity yet" description="Every product change, sale, purchase, and login is recorded here." />
          </div>
        ) : (
          <div className="divide-y">
            {data.data.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between p-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge>{log.action}</Badge>
                    {log.entity && <span className="text-xs text-muted-foreground">{log.entity}</span>}
                  </div>
                  <p className="mt-1 text-sm">{log.user?.name || "System"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
        {data?.meta && (
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        )}
      </CardContent>
    </Card>
  );
}
