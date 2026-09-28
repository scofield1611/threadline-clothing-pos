import { Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/Input";
import { Select, SelectItem } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

export interface VariantFormRow {
  size: string;
  color: string;
  sku: string;
  barcode: string;
  stock: string;
  lowStockThreshold: string;
}

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export function VariantRows({
  rows,
  onChange,
}: {
  rows: VariantFormRow[];
  onChange: (rows: VariantFormRow[]) => void;
}) {
  function update(index: number, patch: Partial<VariantFormRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rows, { size: "M", color: "", sku: "", barcode: "", stock: "0", lowStockThreshold: "5" }]);
  }
  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Size / colour variants</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add variant
        </Button>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-md border p-2">
            <div className="col-span-2">
              <Select value={row.size} onValueChange={(v) => update(i, { size: v })}>
                {SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <Input
              className="col-span-2"
              placeholder="Colour"
              value={row.color}
              onChange={(e) => update(i, { color: e.target.value })}
            />
            <Input className="col-span-3" placeholder="SKU" value={row.sku} onChange={(e) => update(i, { sku: e.target.value })} />
            <Input
              className="col-span-3"
              placeholder="Barcode"
              value={row.barcode}
              onChange={(e) => update(i, { barcode: e.target.value })}
            />
            <Input
              type="number"
              min={0}
              className="col-span-1"
              placeholder="Stock"
              value={row.stock}
              onChange={(e) => update(i, { stock: e.target.value })}
            />
            <button type="button" onClick={() => remove(i)} className="col-span-1 flex justify-center text-muted-foreground hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
