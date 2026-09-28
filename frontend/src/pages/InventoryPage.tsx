import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, History, Printer, Search, SlidersHorizontal, Tag, Upload } from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { Select, SelectItem } from "@/components/ui/Select";
import { useToast } from "@/contexts/ToastContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency } from "@/lib/utils";
import { InventoryTimeline } from "@/components/inventory/InventoryTimeline";
import { BarcodeLabelSheet, type LabelData } from "@/components/inventory/BarcodeLabel";
import { BulkImportDrawer } from "@/components/inventory/BulkImportDrawer";
import { Pagination } from "@/components/ui/Pagination";
import type { PaginatedResponse, ProductVariant } from "@/types";

const filters = [
  { value: "ALL", label: "All stock" },
  { value: "LOW_STOCK", label: "Low stock" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
];

const statusBadge = {
  IN_STOCK: { label: "In stock", variant: "success" as const },
  LOW_STOCK: { label: "Low stock", variant: "warning" as const },
  OUT_OF_STOCK: { label: "Out of stock", variant: "danger" as const },
};

const PAGE_SIZE = 20;

export function InventoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"STOCK" | "HISTORY">("STOCK");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [adjustDrawer, setAdjustDrawer] = useState<ProductVariant | null>(null);
  const [adjustType, setAdjustType] = useState<"ADJUSTMENT" | "DAMAGE">("ADJUSTMENT");
  const [adjustChange, setAdjustChange] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [labelsToPrint, setLabelsToPrint] = useState<LabelData[]>([]);

  const { data: summary } = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: async () => (await api.get("/inventory/summary")).data,
  });

  const { data, isLoading } = useQuery<PaginatedResponse<ProductVariant>>({
    queryKey: ["inventory", debouncedSearch, filter, page],
    queryFn: async () =>
      (await api.get("/inventory", { params: { search: debouncedSearch, filter: filter === "ALL" ? undefined : filter, page, pageSize: PAGE_SIZE } }))
        .data,
    placeholderData: (prev) => prev,
    enabled: tab === "STOCK",
  });

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateFilter(value: string) {
    setFilter(value);
    setPage(1);
  }

  const adjust = useMutation({
    mutationFn: async () => {
      if (!adjustDrawer) return;
      const change = adjustType === "DAMAGE" ? -Math.abs(parseInt(adjustChange, 10) || 0) : parseInt(adjustChange, 10) || 0;
      return (
        await api.post("/inventory/adjust", { variantId: adjustDrawer.id, change, type: adjustType, reason: adjustReason })
      ).data;
    },
    onSuccess: () => {
      toast({ title: "Stock updated", description: "The inventory ledger has been updated.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setAdjustDrawer(null);
      setAdjustChange("");
      setAdjustReason("");
    },
    onError: (err) => setAdjustError(apiErrorMessage(err)),
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function printSelectedLabels() {
    const chosen = (data?.data || []).filter((v) => selected.has(v.id));
    if (!chosen.length) return;
    setLabelsToPrint(
      chosen.map((v) => ({
        productName: v.product?.name || "",
        size: v.size,
        color: v.color,
        barcode: v.barcode,
        price: Number(v.price ?? v.product?.sellPrice ?? 0),
      }))
    );
    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="flex flex-col gap-4">
      <BarcodeLabelSheet labels={labelsToPrint} />

      {/* Valuation + alert banner */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inventory value (cost)</p>
            <p className="data-num mt-1 text-lg font-semibold">{formatCurrency(summary?.costValue || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inventory value (retail)</p>
            <p className="data-num mt-1 text-lg font-semibold">{formatCurrency(summary?.retailValue || 0)}</p>
          </CardContent>
        </Card>
        <Card className={summary?.lowStockCount || summary?.outOfStockCount ? "border-warning/40 bg-warning/5" : ""}>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">Needs attention</p>
              <p className="text-sm font-semibold">
                {summary?.lowStockCount ?? 0} low stock · {summary?.outOfStockCount ?? 0} out of stock
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-md bg-muted p-1">
          <button
            onClick={() => setTab("STOCK")}
            className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium ${tab === "STOCK" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            <Boxes className="h-3.5 w-3.5" /> Stock
          </button>
          <button
            onClick={() => setTab("HISTORY")}
            className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium ${tab === "HISTORY" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> Bulk import
        </Button>
      </div>

      {tab === "HISTORY" ? (
        <Card>
          <CardContent className="p-5">
            <InventoryTimeline />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search SKU, barcode, product..." value={search} onChange={(e) => updateSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              {filters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => updateFilter(f.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f.value ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              {selected.size > 0 && (
                <Button size="sm" onClick={printSelectedLabels}>
                  <Printer className="h-3.5 w-3.5" /> Print {selected.size} label{selected.size !== 1 ? "s" : ""}
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !data?.data.length ? (
                <div className="p-5">
                  <EmptyState icon={Boxes} title="No stock found" description="Try a different search or filter." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="w-10 p-3"></th>
                        <th className="p-3 font-medium">Product</th>
                        <th className="p-3 font-medium">Variant</th>
                        <th className="p-3 font-medium">SKU / Barcode</th>
                        <th className="p-3 font-medium">Stock</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((variant) => (
                        <tr key={variant.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selected.has(variant.id)}
                              onChange={() => toggleSelected(variant.id)}
                              aria-label={`Select ${variant.product?.name || "variant"} ${variant.size}/${variant.color} for label printing`}
                            />
                          </td>
                          <td className="p-3 font-medium">{variant.product?.name}</td>
                          <td className="p-3 text-muted-foreground">
                            {variant.size} · {variant.color}
                          </td>
                          <td className="p-3">
                            <p className="data-num text-xs">{variant.sku}</p>
                            <p className="data-num text-xs text-muted-foreground">{variant.barcode}</p>
                          </td>
                          <td className="data-num p-3 font-semibold">{variant.stock}</td>
                          <td className="p-3">
                            <Badge variant={statusBadge[variant.stockStatus || "IN_STOCK"].variant}>{statusBadge[variant.stockStatus || "IN_STOCK"].label}</Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Print barcode label for ${variant.product?.name || "this variant"}`}
                                onClick={() => {
                                  setLabelsToPrint([
                                    {
                                      productName: variant.product?.name || "",
                                      size: variant.size,
                                      color: variant.color,
                                      barcode: variant.barcode,
                                      price: Number(variant.price ?? variant.product?.sellPrice ?? 0),
                                    },
                                  ]);
                                  setTimeout(() => window.print(), 100);
                                }}
                              >
                                <Tag className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setAdjustDrawer(variant)}>
                                <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data?.meta && (
                <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Drawer
        open={!!adjustDrawer}
        onOpenChange={(o) => !o && setAdjustDrawer(null)}
        title="Adjust stock"
        description={adjustDrawer ? `${adjustDrawer.product?.name} — ${adjustDrawer.size}/${adjustDrawer.color} (currently ${adjustDrawer.stock})` : ""}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setAdjustError("");
            adjust.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="adjustType">Type</Label>
            <Select id="adjustType" value={adjustType} onValueChange={(v) => setAdjustType(v as any)}>
              <SelectItem value="ADJUSTMENT">Manual adjustment (+/-)</SelectItem>
              <SelectItem value="DAMAGE">Damage / write-off (-)</SelectItem>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adjustChange">{adjustType === "DAMAGE" ? "Quantity damaged" : "Change (use - to reduce)"}</Label>
            <Input id="adjustChange" type="number" required value={adjustChange} onChange={(e) => setAdjustChange(e.target.value)} placeholder="e.g. 5 or -3" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adjustReason">Reason</Label>
            <Input id="adjustReason" required value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Stock count correction" />
          </div>
          {adjustError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{adjustError}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setAdjustDrawer(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjust.isPending}>
              Save adjustment
            </Button>
          </div>
        </form>
      </Drawer>

      <BulkImportDrawer open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
