import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, History } from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/contexts/ToastContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import type { Customer, PaginatedResponse } from "@/types";

const PAGE_SIZE = 20;

export function CustomersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ["customers", debouncedSearch, page],
    queryFn: async () => (await api.get("/customers", { params: { search: debouncedSearch, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (prev) => prev,
  });

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const { data: historyDetail } = useQuery({
    queryKey: ["customer-detail", historyFor?.id],
    queryFn: async () => (await api.get(`/customers/${historyFor?.id}`)).data.data,
    enabled: !!historyFor,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/customers", { name, phone: phone || null, email: email || null })).data,
    onSuccess: () => {
      toast({ title: "Customer added", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDrawerOpen(false);
      setName("");
      setPhone("");
      setEmail("");
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search} onChange={(e) => updateSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" /> Add customer
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
          ) : !data?.data.length ? (
            <div className="p-5">
              <EmptyState icon={Users} title="No customers yet" description="Add walk-in customers to track their purchase history." actionLabel="Add customer" onAction={() => setDrawerOpen(true)} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Phone</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Orders</th>
                    <th className="p-3 font-medium">Since</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="data-num p-3">{c.phone || "—"}</td>
                      <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
                      <td className="p-3">{c._count?.sales ?? 0}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setHistoryFor(c)}>
                          <History className="h-3.5 w-3.5" /> History
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

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Add customer">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="customerName">Name</Label>
            <Input id="customerName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input id="customerPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customerEmail">Email</Label>
            <Input id="customerEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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

      <Drawer open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} title={historyFor?.name || ""} description="Purchase history">
        {!historyDetail?.sales.length ? (
          <EmptyState icon={Users} title="No purchases yet" description="Sales linked to this customer will show up here." />
        ) : (
          <div className="divide-y">
            {historyDetail.sales.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="data-num text-sm font-medium">{s.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{s.items.length} items</p>
                </div>
                <div className="text-right">
                  <p className="data-num text-sm font-semibold">{formatCurrency(s.totalAmount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
