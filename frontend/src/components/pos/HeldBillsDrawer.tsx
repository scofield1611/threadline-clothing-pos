import { Clock, Trash2, PlayCircle } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";
import type { HeldBill } from "@/pages/POSPage";

export function HeldBillsDrawer({
  open,
  onOpenChange,
  heldBills,
  onResume,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heldBills: HeldBill[];
  onResume: (bill: HeldBill) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Held bills" description="Parked sales, waiting to be resumed at checkout.">
      {heldBills.length === 0 ? (
        <EmptyState icon={Clock} title="No held bills" description="Press F6 (or the Hold button) during a sale to park it and start a new one." />
      ) : (
        <div className="space-y-2">
          {heldBills.map((bill) => {
            const total = bill.cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
            return (
              <div key={bill.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{bill.customer?.name || "Walk-in"}</p>
                  <p className="text-xs text-muted-foreground">
                    {bill.cart.length} item{bill.cart.length !== 1 ? "s" : ""} · {formatCurrency(total)} ·{" "}
                    {new Date(bill.heldAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => onResume(bill)}>
                    <PlayCircle className="h-3.5 w-3.5" /> Resume
                  </Button>
                  <button onClick={() => onDiscard(bill.id)} className="p-1.5 text-muted-foreground hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
