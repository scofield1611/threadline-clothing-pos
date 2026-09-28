import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils";

export function ReportsPage() {
  const { data: sales, isLoading } = useQuery({
    queryKey: ["reports-sales"],
    queryFn: async () => (await api.get("/sales", { params: { pageSize: 100 } })).data.data,
  });

  function exportCsv() {
    if (!sales?.length) return;
    const header = ["Invoice", "Date", "Customer", "Cashier", "Items", "Subtotal", "Discount", "Tax", "Total"];
    const rows = sales.map((s: any) => [
      s.invoiceNumber,
      new Date(s.createdAt).toISOString(),
      s.customer?.name || "Walk-in",
      s.cashier.name,
      s.items.length,
      s.subtotal,
      s.discountAmount,
      s.taxAmount,
      s.totalAmount,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = (sales || []).reduce(
    (acc: any, s: any) => ({
      subtotal: acc.subtotal + Number(s.subtotal),
      discount: acc.discount + Number(s.discountAmount),
      tax: acc.tax + Number(s.taxAmount),
      total: acc.total + Number(s.totalAmount),
    }),
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Sales report for the last 100 transactions.</p>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gross subtotal</p>
            <p className="data-num mt-1 text-lg font-semibold">{formatCurrency(totals.subtotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Discounts given</p>
            <p className="data-num mt-1 text-lg font-semibold text-danger">-{formatCurrency(totals.discount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tax collected</p>
            <p className="data-num mt-1 text-lg font-semibold">{formatCurrency(totals.tax)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Net revenue</p>
            <p className="data-num mt-1 text-lg font-semibold text-success">{formatCurrency(totals.total)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading...</p>
          ) : !sales?.length ? (
            <div className="p-8 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No sales recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Invoice</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Customer</th>
                    <th className="p-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s: any) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="data-num p-3">{s.invoiceNumber}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(s.createdAt)}</td>
                      <td className="p-3">{s.customer?.name || "Walk-in"}</td>
                      <td className="data-num p-3 font-medium">{formatCurrency(s.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
