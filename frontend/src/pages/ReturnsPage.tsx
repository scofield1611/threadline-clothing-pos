import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { formatCurrency, formatDate } from "@/lib/utils";

interface ReturnLine {
  variantBarcode: string;
  quantity: string;
  refundAmount: string;
}

export function ReturnsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [type, setType] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([{ variantBarcode: "", quantity: "", refundAmount: "" }]);
  const [error, setError] = useState("");

  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => (await api.get("/returns")).data.data,
  });

  const create = useMutation({
    mutationFn: async () => {
      // Look up the sale by invoice number via the sales list, then match
      // client-side (fine at this scale; a dedicated lookup endpoint would
      // be a natural follow-up as sales volume grows).
      const all = await api.get("/sales", { params: { pageSize: 100 } });
      const sale = all.data.data.find((s: any) => s.invoiceNumber === invoiceNumber);
      if (!sale) throw new Error(`No sale found with invoice number ${invoiceNumber}`);

      const items = await Promise.all(
        lines
          .filter((l) => l.variantBarcode)
          .map(async (l) => {
            const variant = (await api.get(`/products/barcode/${encodeURIComponent(l.variantBarcode)}`)).data.data;
            return { variantId: variant.id, quantity: parseInt(l.quantity, 10) || 0, refundAmount: parseFloat(l.refundAmount) || 0 };
          })
      );

      return (await api.post("/returns", { saleId: sale.id, type, reason: reason || null, items })).data.data;
    },
    onSuccess: () => {
      toast({ title: "Return recorded", description: "Inventory has been updated.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setDrawerOpen(false);
      setInvoiceNumber("");
      setReason("");
      setLines([{ variantBarcode: "", quantity: "", refundAmount: "" }]);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function updateLine(i: number, patch: Partial<ReturnLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Process a return or exchange against an existing invoice.</p>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" /> New return
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !returns?.length ? (
            <div className="p-5">
              <EmptyState icon={RotateCcw} title="No returns yet" description="Returns and exchanges will show up here." actionLabel="New return" onAction={() => setDrawerOpen(true)} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Invoice</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Items</th>
                    <th className="p-3 font-medium">Reason</th>
                    <th className="p-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="data-num p-3 font-medium">{r.sale.invoiceNumber}</td>
                      <td className="p-3">
                        <Badge variant={r.type === "EXCHANGE" ? "primary" : "default"}>{r.type}</Badge>
                      </td>
                      <td className="p-3">{r.items.length}</td>
                      <td className="p-3 text-muted-foreground">{r.reason || "—"}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="New return / exchange" widthClassName="max-w-xl">
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
              <Label htmlFor="returnInvoiceNumber">Original invoice number</Label>
              <Input id="returnInvoiceNumber" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="returnType">Type</Label>
              <Select id="returnType" value={type} onValueChange={(v) => setType(v as any)}>
                <SelectItem value="RETURN">Return</SelectItem>
                <SelectItem value="EXCHANGE">Exchange</SelectItem>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="returnReason">Reason</Label>
            <Input id="returnReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size" />
          </div>

          <div className="space-y-2">
            <Label id="returnItemsLabel">Items being returned</Label>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-6" placeholder="Variant barcode" value={line.variantBarcode} onChange={(e) => updateLine(i, { variantBarcode: e.target.value })} />
                <Input type="number" min={1} className="col-span-2" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                <Input type="number" min={0} className="col-span-3" placeholder="Refund ₹" value={line.refundAmount} onChange={(e) => updateLine(i, { refundAmount: e.target.value })} />
                <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="col-span-1 flex justify-center text-muted-foreground hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, { variantBarcode: "", quantity: "", refundAmount: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>

          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
