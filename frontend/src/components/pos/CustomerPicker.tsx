import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User, X } from "lucide-react";
import { api } from "@/services/api";
import { Input } from "@/components/ui/Input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { Customer } from "@/types";

export function CustomerPicker({
  customer,
  onSelect,
}: {
  customer: Customer | null;
  onSelect: (customer: Customer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);

  const { data } = useQuery<Customer[]>({
    queryKey: ["pos-customer-search", debouncedQuery],
    queryFn: async () => (await api.get("/customers", { params: { search: debouncedQuery, pageSize: 8 } })).data.data,
    enabled: open && debouncedQuery.length > 0,
  });

  if (customer) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium leading-tight">{customer.name}</p>
            {customer.phone && <p className="data-num text-xs text-muted-foreground">{customer.phone}</p>}
          </div>
        </div>
        <button onClick={() => onSelect(null)} className="text-muted-foreground hover:text-danger" aria-label="Switch to walk-in customer" title="Switch to walk-in">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Walk-in — search customer by name/phone"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="pl-8 text-sm"
      />
      {open && debouncedQuery && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-card shadow-elevated">
          {!data?.length ? (
            <p className="p-3 text-xs text-muted-foreground">No matching customers — sale will be recorded as Walk-in.</p>
          ) : (
            data.map((c) => (
              <button
                key={c.id}
                onMouseDown={() => {
                  onSelect(c);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{c.name}</span>
                <span className="data-num text-xs text-muted-foreground">{c.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
