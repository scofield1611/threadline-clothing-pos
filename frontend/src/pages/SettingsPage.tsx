import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Store } from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/contexts/ToastContext";

export function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings"],
    queryFn: async () => (await api.get("/settings")).data.data,
  });

  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch("/settings", {
          storeName: form.storeName,
          address: form.address,
          phone: form.phone,
          email: form.email,
          gstNumber: form.gstNumber,
          invoicePrefix: form.invoicePrefix,
          defaultTaxRate: parseFloat(form.defaultTaxRate),
          currencyCode: form.currencyCode,
          receiptFooter: form.receiptFooter,
          lowStockThresholdDefault: parseInt(form.lowStockThresholdDefault, 10),
        })
      ).data.data,
    onSuccess: (updated) => {
      toast({ title: "Settings saved", variant: "success" });
      queryClient.setQueryData(["store-settings"], updated);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  if (isLoading || !form) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  function update(field: string, value: string) {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Store settings"
        description="This information appears on printed receipts and invoices."
        actions={
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-4 w-4" /> Store profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="storeName">Store name</Label>
              <Input id="storeName" value={form.storeName || ""} onChange={(e) => update("storeName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storeAddress">Address</Label>
              <Input id="storeAddress" value={form.address || ""} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="storePhone">Phone</Label>
                <Input id="storePhone" value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storeEmail">Email</Label>
                <Input id="storeEmail" type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storeGst">GST number</Label>
              <Input id="storeGst" value={form.gstNumber || ""} onChange={(e) => update("gstNumber", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoicing &amp; receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoicePrefix">Invoice prefix</Label>
                <Input id="invoicePrefix" value={form.invoicePrefix || ""} onChange={(e) => update("invoicePrefix", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currencyCode">Currency code</Label>
                <Input id="currencyCode" value={form.currencyCode || ""} onChange={(e) => update("currencyCode", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="defaultTaxRate">Default tax rate (%)</Label>
                <Input id="defaultTaxRate" type="number" value={form.defaultTaxRate ?? ""} onChange={(e) => update("defaultTaxRate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lowStockThresholdDefault">Default low-stock threshold</Label>
                <Input
                  id="lowStockThresholdDefault"
                  type="number"
                  value={form.lowStockThresholdDefault ?? ""}
                  onChange={(e) => update("lowStockThresholdDefault", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receiptFooter">Receipt footer message</Label>
              <Input id="receiptFooter" value={form.receiptFooter || ""} onChange={(e) => update("receiptFooter", e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
