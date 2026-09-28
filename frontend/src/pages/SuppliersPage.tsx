import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Search } from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import type { PaginatedResponse, Supplier } from "@/types";

const PAGE_SIZE = 20;

export function SuppliersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ company: "", contact: "", phone: "", gst: "", email: "", address: "" });
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<PaginatedResponse<Supplier>>({
    queryKey: ["suppliers", debouncedSearch, page],
    queryFn: async () => (await api.get("/suppliers", { params: { search: debouncedSearch, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (prev) => prev,
  });

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const { data: history } = useQuery({
    queryKey: ["supplier-purchases", historyFor?.id],
    queryFn: async () => (await api.get("/purchases", { params: { supplierId: historyFor?.id, pageSize: 20 } })).data.data,
    enabled: !!historyFor,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/suppliers", form)).data,
    onSuccess: () => {
      toast({ title: "Supplier added", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDrawerOpen(false);
      setForm({ company: "", contact: "", phone: "", gst: "", email: "", address: "" });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="h-4 w-4" /> Add supplier
          </Button>
        }
      />

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search company or contact..." value={search} onChange={(e) => updateSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.data.length ? (
            <div className="p-5">
              <EmptyState icon={Truck} title="No suppliers yet" description="Add a supplier before recording your first purchase." actionLabel="Add supplier" onAction={() => setDrawerOpen(true)} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Company</th>
                    <th className="p-3 font-medium">Contact</th>
                    <th className="p-3 font-medium">Phone</th>
                    <th className="p-3 font-medium">GST</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.company}</td>
                      <td className="p-3 text-muted-foreground">{s.contact || "—"}</td>
                      <td className="data-num p-3">{s.phone || "—"}</td>
                      <td className="data-num p-3 text-muted-foreground">{s.gst || "—"}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setHistoryFor(s)}>
                          Purchase history
                        </Button>
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

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Add supplier">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="supplierCompany">Company</Label>
            <Input id="supplierCompany" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplierContact">Contact person</Label>
            <Input id="supplierContact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplierPhone">Phone</Label>
              <Input id="supplierPhone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierGst">GST number</Label>
              <Input id="supplierGst" value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplierEmail">Email</Label>
            <Input id="supplierEmail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplierAddress">Address</Label>
            <Input id="supplierAddress" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

      <Drawer open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} title={historyFor?.company || ""} description="Purchase history">
        {!history?.length ? (
          <EmptyState icon={Truck} title="No purchases yet" description="Purchases from this supplier will show up here." />
        ) : (
          <div className="divide-y">
            {history.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="data-num text-sm font-medium">{p.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{p.items.length} items</p>
                </div>
                <div className="text-right">
                  <p className="data-num text-sm font-semibold">{formatCurrency(p.totalAmount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
