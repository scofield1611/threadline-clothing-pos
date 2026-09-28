import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Shirt } from "lucide-react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductFormDrawer } from "@/components/products/ProductFormDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { formatCurrency } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { PaginatedResponse, Product } from "@/types";

const stockBadge = {
  IN_STOCK: { label: "In stock", variant: "success" as const },
  LOW_STOCK: { label: "Low stock", variant: "warning" as const },
  OUT_OF_STOCK: { label: "Out of stock", variant: "danger" as const },
};

const PAGE_SIZE = 20;

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading } = useQuery<PaginatedResponse<Product>>({
    queryKey: ["products", debouncedSearch, page],
    queryFn: async () => (await api.get("/products", { params: { search: debouncedSearch, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: (prev) => prev,
  });

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1); // a new search invalidates the current page position
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, SKU, barcode..." value={search} onChange={(e) => updateSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data?.data.length ? (
            <div className="p-5">
              <EmptyState
                icon={Shirt}
                title="No products yet"
                description="Add your first product with its size and colour variants to start selling."
                actionLabel="Add product"
                onAction={() => setDrawerOpen(true)}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Product</th>
                    <th className="p-3 font-medium">Category</th>
                    <th className="p-3 font-medium">Brand</th>
                    <th className="p-3 font-medium">Variants</th>
                    <th className="p-3 font-medium">Stock</th>
                    <th className="p-3 font-medium">Price</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((product) => {
                    const worstStatus = product.variants.some((v) => v.stockStatus === "OUT_OF_STOCK")
                      ? "OUT_OF_STOCK"
                      : product.variants.some((v) => v.stockStatus === "LOW_STOCK")
                      ? "LOW_STOCK"
                      : "IN_STOCK";
                    return (
                      <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3">
                          <p className="font-medium">{product.name}</p>
                          <p className="data-num text-xs text-muted-foreground">{product.sku}</p>
                        </td>
                        <td className="p-3 text-muted-foreground">{product.category?.name || "—"}</td>
                        <td className="p-3 text-muted-foreground">{product.brand?.name || "—"}</td>
                        <td className="p-3">{product.variants.length}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="data-num">{product.totalStock ?? 0}</span>
                            <Badge variant={stockBadge[worstStatus].variant}>{stockBadge[worstStatus].label}</Badge>
                          </div>
                        </td>
                        <td className="data-num p-3 font-medium">{formatCurrency(product.sellPrice)}</td>
                        <td className="p-3">
                          <Badge variant={product.status === "ACTIVE" ? "success" : "default"}>{product.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data?.meta && (
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </CardContent>
      </Card>

      <ProductFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
