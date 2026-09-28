import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Trash2 } from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { Select, SelectItem } from "@/components/ui/Select";
import { useToast } from "@/contexts/ToastContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import type { Supplier } from "@/types";

interface PurchaseLine {
  variantBarcode: string;
  quantity: string;
  purchasePrice: string;
}

const PAGE_SIZE = 20;

export function PurchasesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([{ variantBarcode: "", quantity: "", purchasePrice: "" }]);
  const [error, setError] = useState("");

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["purchases", page],
    queryFn: async () => (await api.get("/purchases", { params: { page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (prev) => prev,
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get("/suppliers", { params: { pageSize: 100 } })).data.data,
    enabled: drawerOpen,
  });

  const create = useMutation({
    mutationFn: async () => {
      // Resolve each scanned/typed barcode to a variant id first.
      const items = await Promise.all(
        lines
          .filter((l) => l.variantBarcode)
          .map(async (l) => {
            const variant = (await api.get(`/products/barcode/${encodeURIComponent(l.variantBarcode)}`)).data.data;
            return { variantId: variant.id, quantity: parseInt(l.quantity, 10) || 0, purchasePrice: parseFloat(l.purchasePrice) || 0 };
          })
      );
      return (await api.post("/purchases", { supplierId, invoiceNumber, items })).data.data;
    },
    onSuccess: () => {
      toast({ title: "Purchase recorded", description: "Stock has been added to inventory.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setDrawerOpen(false);
      setSupplierId("");
      setInvoiceNumber("");
      setLines([{ variantBarcode: "", quantity: "", purchasePrice: "" }]);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function updateLine(i: number, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Stock received from suppliers, recorded against an invoice.</p>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" /> New purchase
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !purchases?.data.length ? (
            <div className="p-5">
              <EmptyState icon={Truck} title="No purchases yet" description="Record stock received from a supplier to add it to inventory." actionLabel="New purchase" onAction={() => setDrawerOpen(true)} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Invoice</th>
                    <th className="p-3 font-medium">Supplier</th>
                    <th className="p-3 font-medium">Items</th>
                    <th className="p-3 font-medium">Total</th>
                    <th className="p-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.data.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="data-num p-3 font-medium">{p.invoiceNumber}</td>
                      <td className="p-3">{p.supplier.company}</td>
                      <td className="p-3">{p.items.length}</td>
                      <td className="data-num p-3 font-semibold">{formatCurrency(p.totalAmount)}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(p.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {purchases?.meta && (
            <Pagination page={purchases.meta.page} totalPages={purchases.meta.totalPages} total={purchases.meta.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </CardContent>
      </Card>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="New purchase" description="Enter a supplier invoice to add stock." widthClassName="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            create.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="purchaseSupplier">Supplier</Label>
              <Select id="purchaseSupplier" value={supplierId} onValueChange={setSupplierId} placeholder="Select supplier">
                {(suppliers || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.company}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchaseInvoiceNumber">Invoice number</Label>
              <Input id="purchaseInvoiceNumber" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-0091" />
            </div>
          </div>

          <div className="space-y-2">
            <Label id="purchaseLineItemsLabel">Line items — scan or type each variant's barcode</Label>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input
                  className="col-span-6"
                  placeholder="Variant barcode"
                  value={line.variantBarcode}
                  onChange={(e) => updateLine(i, { variantBarcode: e.target.value })}
                />
                <Input
                  type="number"
                  min={1}
                  className="col-span-2"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  className="col-span-3"
                  placeholder="Purchase price"
                  value={line.purchasePrice}
                  onChange={(e) => updateLine(i, { purchasePrice: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  className="col-span-1 flex justify-center text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, { variantBarcode: "", quantity: "", purchasePrice: "" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>

          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Save purchase
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
