import { forwardRef } from "react";
import { formatCurrency } from "@/lib/utils";

export interface ReceiptData {
  invoiceNumber: string;
  createdAt: string;
  cashierName?: string;
  customerName?: string;
  items: { name: string; size: string; color: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  payments: { method: string; amount: number }[];
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  receiptFooter?: string;
}

// Rendered permanently in the DOM (visually hidden) so `window.print()` can
// target it via the `.receipt-print-area` CSS below — this avoids the
// popup-blocker issues of opening a second window just to print.
export const Receipt = forwardRef<HTMLDivElement, { data: ReceiptData | null }>(({ data }, ref) => {
  if (!data) return <div ref={ref} />;

  return (
    <div ref={ref} className="receipt-print-area mx-auto max-w-xs bg-white p-4 font-mono text-xs text-black">
      <div className="text-center">
        <p className="text-sm font-bold">{data.storeName || "ThreadLine Store"}</p>
        {data.storeAddress && <p>{data.storeAddress}</p>}
        {data.storePhone && <p>{data.storePhone}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between">
        <span>{data.invoiceNumber}</span>
        <span>{new Date(data.createdAt).toLocaleString("en-IN")}</span>
      </div>
      {data.cashierName && <p>Cashier: {data.cashierName}</p>}
      <p>Customer: {data.customerName || "Walk-in"}</p>
      <div className="my-2 border-t border-dashed border-black" />
      {data.items.map((item, i) => (
        <div key={i} className="mb-1">
          <p>{item.name}</p>
          <div className="flex justify-between text-[11px]">
            <span>
              {item.size}/{item.color} x{item.quantity} @ {item.unitPrice.toFixed(2)}
            </span>
            <span>{item.lineTotal.toFixed(2)}</span>
          </div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatCurrency(data.subtotal)}</span>
      </div>
      {data.discountAmount > 0 && (
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-{formatCurrency(data.discountAmount)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Tax</span>
        <span>{formatCurrency(data.taxAmount)}</span>
      </div>
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(data.totalAmount)}</span>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {data.payments.map((p, i) => (
        <div key={i} className="flex justify-between">
          <span>{p.method}</span>
          <span>{formatCurrency(p.amount)}</span>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">{data.receiptFooter || "Thank you for shopping with us!"}</p>
    </div>
  );
});
Receipt.displayName = "Receipt";
