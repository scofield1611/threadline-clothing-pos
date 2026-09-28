import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label } from "@/components/ui/Input";
import { Select, SelectItem } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { VariantRows, type VariantFormRow } from "./VariantRows";
import { api, apiErrorMessage } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
import type { Category, Brand } from "@/types";

export function ProductFormDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [description, setDescription] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [variants, setVariants] = useState<VariantFormRow[]>([
    { size: "M", color: "", sku: "", barcode: "", stock: "0", lowStockThreshold: "5" },
  ]);
  const [error, setError] = useState("");

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => (await api.get("/categories")).data.data,
    enabled: open,
  });
  const { data: brands } = useQuery<Brand[]>({
    queryKey: ["brands"],
    queryFn: async () => (await api.get("/brands")).data.data,
    enabled: open,
  });

  function resetForm() {
    setName("");
    setSku("");
    setBarcode("");
    setCategoryId("");
    setBrandId("");
    setDescription("");
    setCostPrice("");
    setSellPrice("");
    setVariants([{ size: "M", color: "", sku: "", barcode: "", stock: "0", lowStockThreshold: "5" }]);
    setError("");
  }

  const createProduct = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        sku,
        barcode: barcode || null,
        categoryId: categoryId || null,
        brandId: brandId || null,
        description: description || null,
        costPrice: parseFloat(costPrice) || 0,
        sellPrice: parseFloat(sellPrice) || 0,
        variants: variants.map((v) => ({
          size: v.size,
          color: v.color,
          sku: v.sku,
          barcode: v.barcode,
          stock: parseInt(v.stock, 10) || 0,
          lowStockThreshold: parseInt(v.lowStockThreshold, 10) || 5,
        })),
      };
      return (await api.post("/products", payload)).data.data;
    },
    onSuccess: () => {
      toast({ title: "Product created", description: `${name} was added to the catalog.`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // Creating a product can set opening stock, which is a real
      // inventory/dashboard change, not just a catalog change.
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Add product" description="Create a product and its size/colour variants." widthClassName="max-w-2xl">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          createProduct.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="productName">Product name</Label>
            <Input id="productName" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nike Classic T-Shirt" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="productSku">SKU</Label>
            <Input id="productSku" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="NIKE-TEE-001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="productBarcode">Barcode (optional)</Label>
            <Input id="productBarcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="8901234567000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="productCategory">Category</Label>
            <Select id="productCategory" value={categoryId} onValueChange={setCategoryId} placeholder="Select category">
              {(categories || []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="productBrand">Brand</Label>
            <Select id="productBrand" value={brandId} onValueChange={setBrandId} placeholder="Select brand">
              {(brands || []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="productCostPrice">Cost price (₹)</Label>
            <Input id="productCostPrice" required type="number" min={0} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="productSellPrice">Selling price (₹)</Label>
            <Input id="productSellPrice" required type="number" min={0} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="productDescription">Description</Label>
            <Input id="productDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <VariantRows rows={variants} onChange={setVariants} />

        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={createProduct.isPending}>
            Save product
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
