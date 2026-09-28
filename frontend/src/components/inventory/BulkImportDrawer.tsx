import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { api, apiErrorMessage } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";

interface ImportRow {
  name: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  category?: string;
  brand?: string;
  costPrice: number;
  sellPrice: number;
  stock?: number;
}

interface ImportResult {
  row: number;
  sku: string;
  status: "success" | "error";
  message?: string;
}

const TEMPLATE_HEADER = "name,sku,barcode,size,color,category,brand,costPrice,sellPrice,stock";
const TEMPLATE_EXAMPLE = "Nike Classic T-Shirt,NIKE-TEE-002,8901234567999,M,Navy,T-Shirts,Nike,450,899,25";

export function BulkImportDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [results, setResults] = useState<ImportResult[] | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setResults(null);

    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const required = ["name", "sku", "barcode", "size", "color", "costPrice", "sellPrice"];
        const missing = required.filter((col) => !res.meta.fields?.includes(col));
        if (missing.length) {
          setParseError(`Missing required column(s): ${missing.join(", ")}`);
          return;
        }
        setRows(
          res.data.map((r: any) => ({
            ...r,
            costPrice: parseFloat(r.costPrice),
            sellPrice: parseFloat(r.sellPrice),
            stock: r.stock ? parseInt(r.stock, 10) : 0,
          }))
        );
      },
      error: (err) => setParseError(err.message),
    });
  }

  const importMutation = useMutation({
    mutationFn: async () => (await api.post("/products/bulk-import", { rows })).data.data as ImportResult[],
    onSuccess: (data) => {
      setResults(data);
      const succeeded = data.filter((r) => r.status === "success").length;
      toast({ title: `Imported ${succeeded} of ${data.length} products`, variant: succeeded === data.length ? "success" : "info" });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) => setParseError(apiErrorMessage(err)),
  });

  function downloadTemplate() {
    const blob = new Blob([`${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "threadline-product-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setRows([]);
    setFileName("");
    setParseError("");
    setResults(null);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Bulk import products"
      description="Upload a CSV (or export your Excel sheet as CSV) — one row per size/colour."
      widthClassName="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-fit">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Download CSV template
        </Button>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-muted/40">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">{fileName || "Click to choose a CSV file"}</span>
          <span className="text-xs text-muted-foreground">Required columns: name, sku, barcode, size, color, costPrice, sellPrice</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </label>

        {parseError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{parseError}</p>}

        {rows.length > 0 && !results && (
          <div className="rounded-md border">
            <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">{rows.length} rows ready to import</div>
            <div className="max-h-64 overflow-y-auto">
              {rows.slice(0, 20).map((r, i) => (
                <div key={i} className="flex items-center justify-between border-b px-3 py-1.5 text-xs last:border-0">
                  <span>{r.name}</span>
                  <span className="data-num text-muted-foreground">
                    {r.sku} · {r.size}/{r.color}
                  </span>
                </div>
              ))}
              {rows.length > 20 && <p className="p-2 text-center text-xs text-muted-foreground">+{rows.length - 20} more</p>}
            </div>
          </div>
        )}

        {results && (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {results.map((r) => (
              <div key={r.row} className="flex items-center gap-2 text-xs">
                {r.status === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
                )}
                <span className="data-num">{r.sku}</span>
                {r.message && <span className="text-danger">— {r.message}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!results && (
            <Button disabled={rows.length === 0} loading={importMutation.isPending} onClick={() => importMutation.mutate()}>
              Import {rows.length > 0 ? rows.length : ""} products
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
