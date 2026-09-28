import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ScanBarcode,
  Trash2,
  Plus,
  Minus,
  Receipt as ReceiptIcon,
  Loader2,
  Search,
  PauseCircle,
  ListChecks,
  Printer,
  Banknote,
  Smartphone,
  CreditCard,
  Layers,
  User as UserIcon,
} from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select, SelectItem } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/contexts/ToastContext";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerPicker } from "@/components/pos/CustomerPicker";
import { HeldBillsDrawer } from "@/components/pos/HeldBillsDrawer";
import { Receipt, type ReceiptData } from "@/components/pos/Receipt";
import type { CartLine, Customer, ProductVariant } from "@/types";

type DiscountType = "NONE" | "FLAT" | "PERCENTAGE";
type PaymentMethod = "CASH" | "UPI" | "CARD" | "MIXED";

export interface HeldBill {
  id: string;
  heldAt: string;
  cart: CartLine[];
  customer: Customer | null;
  discountType: DiscountType;
  discountValue: string;
}

const HELD_BILLS_KEY = "threadline_held_bills";

function loadHeldBills(): HeldBill[] {
  try {
    return JSON.parse(localStorage.getItem(HELD_BILLS_KEY) || "[]");
  } catch {
    return [];
  }
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function POSPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const [scanValue, setScanValue] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [discountValue, setDiscountValue] = useState("");
  const [taxRate, setTaxRate] = useState("5");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);

  const [heldBills, setHeldBills] = useState<HeldBill[]>(loadHeldBills);
  const [heldDrawerOpen, setHeldDrawerOpen] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const { data: settings } = useQuery({
    queryKey: ["store-settings"],
    queryFn: async () => (await api.get("/settings")).data.data,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (settings?.defaultTaxRate != null) setTaxRate(String(settings.defaultTaxRate));
  }, [settings?.defaultTaxRate]);

  useEffect(() => {
    localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(heldBills));
  }, [heldBills]);

  // Keep the scanner input focused by default, WITHOUT stealing focus away
  // from any field the cashier is actively using — this replaces a previous
  // version that refocused on every window click and made the discount/tax/
  // payment inputs unusable by mouse.
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  function refocusScanIfIdle() {
    const active = document.activeElement;
    const isTypingElsewhere = active instanceof HTMLInputElement && active !== scanRef.current;
    if (!isTypingElsewhere) scanRef.current?.focus();
  }

  const chargeButtonRef = useRef<HTMLButtonElement>(null);

  // holdBill (defined below) closes over cart/customer/discount, which
  // change on nearly every keystroke. Capturing it in a ref and mounting
  // the keydown listener exactly once (empty deps) avoids removing and
  // re-adding a window-level event listener dozens of times per second
  // while the cashier is typing in the discount/tax/payment fields.
  const holdBillRef = useRef<() => void>(() => {});

  function addVariantToCart(variant: ProductVariant) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) {
        if (existing.quantity + 1 > variant.stock) {
          setScanError(`Only ${variant.stock} in stock for ${existing.sku}`);
          return prev;
        }
        return prev.map((l) => (l.variantId === variant.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (variant.stock <= 0) {
        setScanError(`${variant.product?.name} (${variant.size}/${variant.color}) is out of stock`);
        return prev;
      }
      const line: CartLine = {
        variantId: variant.id,
        productName: variant.product?.name || "Product",
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        barcode: variant.barcode,
        unitPrice: Number(variant.price ?? variant.product?.sellPrice ?? 0),
        quantity: 1,
        availableStock: variant.stock,
      };
      return [line, ...prev];
    });
  }

  async function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const barcode = scanValue.trim();
    if (!barcode) return;
    setScanError("");
    setScanning(true);
    try {
      const res = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
      addVariantToCart(res.data.data);
    } catch (err) {
      setScanError(apiErrorMessage(err));
    } finally {
      setScanning(false);
      setScanValue("");
    }
  }

  function updateQty(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(Math.max(l.quantity + delta, 0), l.availableStock) } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function resetSaleState() {
    setCart([]);
    setCustomer(null);
    setDiscountType("NONE");
    setDiscountValue("");
    setCashAmount("");
    setUpiAmount("");
    setCardAmount("");
    idempotencyKey.current = newIdempotencyKey();
    scanRef.current?.focus();
  }

  function holdBill() {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Scan something before holding a bill.", variant: "info" });
      return;
    }
    const bill: HeldBill = {
      id: newIdempotencyKey(),
      heldAt: new Date().toISOString(),
      cart,
      customer,
      discountType,
      discountValue,
    };
    setHeldBills((prev) => [bill, ...prev]);
    toast({ title: "Bill held", description: "Resume it anytime from Held bills (F7).", variant: "info" });
    resetSaleState();
  }

  // Keep the ref in sync every render so the mount-once listener below
  // always calls the current holdBill (with the current cart/customer/
  // discount), without itself needing to be recreated.
  useEffect(() => {
    holdBillRef.current = holdBill;
  });

  // Keyboard shortcuts: F2 jump to scanner, F4 charge, F6 hold, F7 held
  // bills list, Esc clear the scan field. Mounted once — see holdBillRef
  // above for why this doesn't need cart/customer/discount in its deps.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        scanRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        chargeButtonRef.current?.click();
      } else if (e.key === "F6") {
        e.preventDefault();
        holdBillRef.current();
      } else if (e.key === "F7") {
        e.preventDefault();
        setHeldDrawerOpen(true);
      } else if (e.key === "Escape" && document.activeElement === scanRef.current) {
        setScanValue("");
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function resumeBill(bill: HeldBill) {
    setCart(bill.cart);
    setCustomer(bill.customer);
    setDiscountType(bill.discountType);
    setDiscountValue(bill.discountValue);
    setHeldBills((prev) => prev.filter((b) => b.id !== bill.id));
    setHeldDrawerOpen(false);
  }

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discountAmount =
    discountType === "FLAT"
      ? Math.min(parseFloat(discountValue) || 0, subtotal)
      : discountType === "PERCENTAGE"
      ? +(subtotal * ((parseFloat(discountValue) || 0) / 100)).toFixed(2)
      : 0;
  const taxable = subtotal - discountAmount;
  const taxAmount = +(taxable * ((parseFloat(taxRate) || 0) / 100)).toFixed(2);
  const total = +(taxable + taxAmount).toFixed(2);

  const checkout = useMutation({
    mutationFn: async () => {
      let payments;
      if (paymentMethod === "MIXED") {
        payments = [
          { method: "CASH" as const, amount: parseFloat(cashAmount) || 0 },
          { method: "UPI" as const, amount: parseFloat(upiAmount) || 0 },
          { method: "CARD" as const, amount: parseFloat(cardAmount) || 0 },
        ].filter((p) => p.amount > 0);
      } else {
        payments = [{ method: paymentMethod, amount: total }];
      }

      const body = {
        clientRef: idempotencyKey.current,
        customerId: customer?.id || null,
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        discount: discountType === "NONE" ? null : { type: discountType, value: parseFloat(discountValue) || 0 },
        taxRate: (parseFloat(taxRate) || 0) / 100,
        payments,
      };
      return (await api.post("/sales", body)).data.data;
    },
    onSuccess: (sale) => {
      toast({ title: "Sale completed", description: `Invoice ${sale.invoiceNumber} — ${formatCurrency(sale.totalAmount)}`, variant: "success" });
      // The sale just changed stock levels and today's sales figures —
      // without this, Inventory/Dashboard show pre-sale numbers until
      // their staleTime elapses or the person manually refreshes.
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-chart"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-category-performance"] });
      setLastReceipt({
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        cashierName: user?.name,
        customerName: sale.customer?.name,
        items: sale.items.map((i: any) => ({
          name: i.variant.product.name,
          size: i.variant.size,
          color: i.variant.color,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.lineTotal),
        })),
        subtotal: Number(sale.subtotal),
        discountAmount: Number(sale.discountAmount),
        taxAmount: Number(sale.taxAmount),
        totalAmount: Number(sale.totalAmount),
        payments: sale.payments.map((p: any) => ({ method: p.method, amount: Number(p.amount) })),
        storeName: settings?.storeName,
        storeAddress: settings?.address,
        storePhone: settings?.phone,
        receiptFooter: settings?.receiptFooter,
      });
      resetSaleState();
    },
    onError: (err) => toast({ title: "Checkout failed", description: apiErrorMessage(err), variant: "error" }),
  });

  const paidTotal =
    paymentMethod === "MIXED" ? (parseFloat(cashAmount) || 0) + (parseFloat(upiAmount) || 0) + (parseFloat(cardAmount) || 0) : total;
  const paymentMismatch = paymentMethod === "MIXED" && Math.abs(paidTotal - total) > 0.01;

  function printReceipt() {
    window.print();
  }

  const shortcutHints = useMemo(
    () => [
      { key: "F2", label: "Scan" },
      { key: "F4", label: "Charge" },
      { key: "F6", label: "Hold" },
      { key: "F7", label: `Held (${heldBills.length})` },
    ],
    [heldBills.length]
  );

  const paymentMethodIcons: Record<PaymentMethod, typeof Banknote> = {
    CASH: Banknote,
    UPI: Smartphone,
    CARD: CreditCard,
    MIXED: Layers,
  };

  return (
    <>
      {/* Deliberately outside the flex layout below: this div is either
          display:none (has data, see .receipt-print-area in index.css) or
          empty (no data yet) — either way it must never be a flex item in
          the row below, or the `gap-4` on that row would inject an extra
          gap before the left column even though this element is invisible. */}
      <Receipt ref={receiptRef} data={lastReceipt} />

      {/* h-full anchors this page to the viewport height DashboardLayout's
          <main> already provides; combined with min-h-0 on every flex
          ancestor below, this is what lets the cart list scroll internally
          instead of the whole page scrolling — the payment panel on the
          right never moves out of view while browsing a long cart. */}
      <div onClick={refocusScanIfIdle} className="flex flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden">
        {/* Left: scanner + customer (fixed height) + cart (scrolls internally) */}
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
        <Card className="shrink-0">
          <CardContent className="space-y-3 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="scan" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ScanBarcode className="h-3.5 w-3.5" /> Scan barcode
              </Label>
              <Button size="sm" variant="outline" onClick={() => setHeldDrawerOpen(true)}>
                <ListChecks className="h-3.5 w-3.5" /> Held ({heldBills.length})
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="scan"
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Scan or type a barcode, then press Enter"
                className="h-11 pl-9 text-base"
                autoFocus
                aria-describedby={scanError ? "scan-error" : undefined}
              />
              {scanning && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
            </div>
            {scanError && (
              <p id="scan-error" role="alert" className="text-sm text-danger">
                {scanError}
              </p>
            )}

            <div className="flex items-center gap-2 border-t pt-3">
              <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <CustomerPicker customer={customer} onSelect={setCustomer} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-t pt-2.5">
              {shortcutHints.map((h) => (
                <span key={h.key} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  <kbd className="rounded border bg-card px-1 font-mono text-[10px]">{h.key}</kbd> {h.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col lg:min-h-0 lg:flex-1">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle>Cart ({cart.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {cart.length === 0 ? (
              <EmptyState icon={ScanBarcode} title="Cart is empty" description="Scan a product barcode above to add it to the sale." />
            ) : (
              <div className="divide-y">
                {cart.map((line) => (
                  <div key={line.variantId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.size} · {line.color} · <span className="data-num">{line.sku}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQty(line.variantId, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Decrease quantity of ${line.productName}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="data-num w-6 text-center text-sm font-medium" aria-live="polite">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(line.variantId, 1)}
                        disabled={line.quantity >= line.availableStock}
                        className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Increase quantity of ${line.productName}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="data-num w-24 shrink-0 text-right text-sm font-semibold">{formatCurrency(line.unitPrice * line.quantity)}</p>
                    <button
                      onClick={() => removeLine(line.variantId)}
                      className="shrink-0 text-muted-foreground hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={`Remove ${line.productName} from cart`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: order summary (scrolls if it must) + a payment panel that's
          always fully visible — the actual "sticky payment panel" ask. */}
      <div className="flex w-full flex-col gap-3 lg:h-full lg:min-h-0 lg:w-[380px] lg:shrink-0">
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {lastReceipt && (
            <Card className="border-dashed">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Last invoice</p>
                  <p className="data-num text-sm font-semibold">{lastReceipt.invoiceNumber}</p>
                  <p className="data-num text-xs text-muted-foreground">{formatCurrency(lastReceipt.totalAmount)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={printReceipt}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="data-num">{formatCurrency(subtotal)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
                  <SelectItem value="NONE">No discount</SelectItem>
                  <SelectItem value="FLAT">Flat ₹</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage %</SelectItem>
                </Select>
                <Input
                  type="number"
                  min={0}
                  placeholder="Value"
                  value={discountValue}
                  disabled={discountType === "NONE"}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  aria-label="Discount value"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="data-num text-danger">-{formatCurrency(discountAmount)}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="taxRate" className="text-sm text-muted-foreground">
                  Tax rate (%)
                </Label>
                <Input
                  id="taxRate"
                  type="number"
                  min={0}
                  max={100}
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-20 text-right"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="data-num">{formatCurrency(taxAmount)}</span>
              </div>

              <div className="flex justify-between border-t pt-3 text-base font-bold">
                <span>Total</span>
                <span className="data-num" aria-live="polite">
                  {formatCurrency(total)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sticky payment panel: on desktop this never scrolls out of view,
            regardless of how long the cart or order summary gets. */}
        <div className="shrink-0 rounded-lg border bg-card shadow-elevated lg:sticky lg:bottom-0">
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-4 gap-2">
              {(["CASH", "UPI", "CARD", "MIXED"] as PaymentMethod[]).map((m) => {
                const Icon = paymentMethodIcons[m];
                return (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    aria-pressed={paymentMethod === m}
                    className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      paymentMethod === m ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {m}
                  </button>
                );
              })}
            </div>

            {paymentMethod === "MIXED" && (
              <div className="space-y-2 rounded-md bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="cashAmount" className="text-xs">
                    Cash
                  </Label>
                  <Input id="cashAmount" type="number" min={0} value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="w-28 text-right" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="upiAmount" className="text-xs">
                    UPI
                  </Label>
                  <Input id="upiAmount" type="number" min={0} value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="w-28 text-right" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="cardAmount" className="text-xs">
                    Card
                  </Label>
                  <Input id="cardAmount" type="number" min={0} value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} className="w-28 text-right" />
                </div>
                {paymentMismatch && (
                  <p role="alert" className="text-xs text-danger">
                    Entered {formatCurrency(paidTotal)}, needs to equal {formatCurrency(total)}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" disabled={cart.length === 0} onClick={holdBill}>
                <PauseCircle className="h-4 w-4" /> Hold
              </Button>
              <Button
                ref={chargeButtonRef}
                size="lg"
                disabled={cart.length === 0 || paymentMismatch}
                loading={checkout.isPending}
                onClick={() => checkout.mutate()}
              >
                <ReceiptIcon className="h-4 w-4" />
                Charge {formatCurrency(total)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <HeldBillsDrawer
        open={heldDrawerOpen}
        onOpenChange={setHeldDrawerOpen}
        heldBills={heldBills}
        onResume={resumeBill}
        onDiscard={(id) => setHeldBills((prev) => prev.filter((b) => b.id !== id))}
      />
      </div>
    </>
  );
}
