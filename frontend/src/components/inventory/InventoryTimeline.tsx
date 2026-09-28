import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import { api } from "@/services/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  PURCHASE: "Purchase",
  SALE: "Sale",
  RETURN: "Return",
  DAMAGE: "Damage",
  ADJUSTMENT: "Adjustment",
};

export function InventoryTimeline({ variantId }: { variantId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["inventory-history", variantId],
    queryFn: async () => (await api.get("/inventory/history", { params: { variantId, pageSize: 50 } })).data,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data?.data.length) {
    return <EmptyState icon={History} title="No stock movements yet" description="Purchases, sales, returns, and adjustments will appear here." />;
  }

  return (
    <div className="divide-y">
      {data.data.map((tx: any) => (
        <div key={tx.id} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            {tx.change > 0 ? <ArrowUpCircle className="h-4 w-4 text-success" /> : <ArrowDownCircle className="h-4 w-4 text-danger" />}
            <div>
              <p className="text-sm font-medium">
                {tx.variant.product.name} — {tx.variant.size}/{tx.variant.color}
              </p>
              <p className="text-xs text-muted-foreground">
                {typeLabel[tx.type] || tx.type} {tx.reason ? `· ${tx.reason}` : ""} · {tx.createdBy?.name || "System"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`data-num text-sm font-semibold ${tx.change > 0 ? "text-success" : "text-danger"}`}>
              {tx.change > 0 ? "+" : ""}
              {tx.change}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
