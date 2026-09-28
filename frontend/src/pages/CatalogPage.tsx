import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag, Trash2 } from "lucide-react";
import { api, apiErrorMessage } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/contexts/ToastContext";
import type { Brand, Category } from "@/types";

function EntityPanel({ title, resource }: { title: string; resource: "categories" | "brands" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery<(Category | Brand)[]>({
    queryKey: [resource],
    queryFn: async () => (await api.get(`/${resource}`)).data.data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post(`/${resource}`, { name })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      setName("");
    },
    onError: (err) => toast({ title: "Couldn't add", description: apiErrorMessage(err), variant: "error" }),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/${resource}/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resource] }),
    onError: (err) => toast({ title: "Couldn't update", description: apiErrorMessage(err), variant: "error" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input placeholder={`New ${title.toLowerCase().slice(0, -1)} name`} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" loading={create.isPending}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !data?.length ? (
          <EmptyState icon={Tag} title={`No ${title.toLowerCase()}`} description={`Add your first ${title.toLowerCase().slice(0, -1)} above.`} />
        ) : (
          <div className="space-y-1">
            {data.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span className="text-sm">{item.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={item.isActive ? "success" : "default"}>{item.isActive ? "Active" : "Inactive"}</Badge>
                  {item.isActive && (
                    <button onClick={() => deactivate.mutate(item.id)} className="text-muted-foreground hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CatalogPage() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <EntityPanel title="Categories" resource="categories" />
      <EntityPanel title="Brands" resource="brands" />
    </div>
  );
}
