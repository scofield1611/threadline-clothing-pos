import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  TrendingUp,
  Package,
  AlertTriangle,
  XCircle,
  Receipt,
  Wallet,
  ShoppingBag,
  ScanBarcode,
  PlusCircle,
  Truck,
  BarChart3,
  Activity,
} from "lucide-react";
import type { DashboardSummary } from "@/types";

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  loading,
  size = "default",
  delay = 0,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  tone?: "default" | "success" | "warning" | "danger";
  loading?: boolean;
  size?: "default" | "compact";
  delay?: number;
}) {
  const toneClasses = {
    default: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
  }[tone];

  if (size === "compact") {
    return (
      <div className="flex items-center gap-2.5 bg-card px-4 py-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneClasses}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-4 w-12" /> : <p className="data-num text-sm font-semibold">{value}</p>}
        </div>
      </div>
    );
  }

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-1 duration-300"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-28" /> : <p className="data-num mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const quickActions = [
  { to: "/pos", label: "New sale", icon: ScanBarcode },
  { to: "/products", label: "Add product", icon: PlusCircle },
  { to: "/purchases", label: "New purchase", icon: Truck },
  { to: "/reports", label: "View reports", icon: BarChart3 },
];

export function DashboardPage() {
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => (await api.get("/dashboard/summary")).data,
    refetchInterval: 60_000,
  });

  const { data: chart } = useQuery<{ date: string; total: number }[]>({
    queryKey: ["dashboard-chart"],
    queryFn: async () => (await api.get("/dashboard/sales-chart")).data.data,
  });

  const { data: categoryPerformance, isLoading: categoryLoading } = useQuery<{ category: string; revenue: number; unitsSold: number }[]>({
    queryKey: ["dashboard-category-performance"],
    queryFn: async () => (await api.get("/dashboard/category-performance")).data.data,
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard-recent-activity"],
    queryFn: async () => (await api.get("/dashboard/recent-activity")).data.data,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((action, i) => (
          <Link
            key={action.to}
            to={action.to}
            className="group flex animate-in fade-in slide-in-from-bottom-1 items-center gap-2.5 rounded-lg border bg-card p-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-elevated"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <action.icon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's Sales" value={formatCurrency(summary?.todaySales.total || 0)} icon={Receipt} loading={isLoading} tone="success" delay={0} />
        <StatCard label="Monthly Sales" value={formatCurrency(summary?.monthSales.total || 0)} icon={TrendingUp} loading={isLoading} delay={40} />
        <StatCard label="Monthly Profit" value={formatCurrency(summary?.monthProfit || 0)} icon={Wallet} loading={isLoading} tone="success" delay={80} />
        <StatCard label="Inventory Value" value={formatCurrency(summary?.inventoryValue || 0)} icon={Package} loading={isLoading} delay={120} />
      </div>

      {/* Secondary metrics: a compact info bar rather than four more full
          cards — gives the primary KPIs above room to breathe and reads
          like an operational status strip (closer to how Stripe/Shopify
          separate "the numbers that matter" from supporting detail). */}
      <Card className="overflow-hidden">
        <CardContent className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-4">
          <StatCard size="compact" label="Total Products" value={String(summary?.totalProducts ?? 0)} icon={ShoppingBag} loading={isLoading} />
          <StatCard size="compact" label="Low Stock" value={String(summary?.lowStockCount ?? 0)} icon={AlertTriangle} loading={isLoading} tone="warning" />
          <StatCard size="compact" label="Out of Stock" value={String(summary?.outOfStockCount ?? 0)} icon={XCircle} loading={isLoading} tone="danger" />
          <StatCard size="compact" label="Orders Today" value={String(summary?.todaySales.count ?? 0)} icon={Receipt} loading={isLoading} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales — last 14 days</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chart || []}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  labelFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best sellers this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!summary?.bestSellers.length ? (
              <EmptyState icon={ShoppingBag} title="No sales yet this month" description="Best sellers will show up here once the POS records a sale." />
            ) : (
              summary.bestSellers.map((b, i) => (
                <div key={b.variantId} className="flex items-center justify-between rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium leading-tight">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.size} · {b.color}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="data-num text-sm font-medium">{formatCurrency(b.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{b.quantitySold} sold</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Category performance — last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            {categoryLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !categoryPerformance?.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No sales in the last 30 days yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryPerformance} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={110}
                    tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : !recentActivity?.length ? (
              <EmptyState icon={Activity} title="No activity yet" description="Actions across the store will show up here." />
            ) : (
              recentActivity.slice(0, 6).map((log: any) => (
                <div key={log.id} className="flex items-start justify-between gap-2 rounded-md -mx-2 px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
                  <div>
                    <Badge className="mb-1">{log.action.replaceAll("_", " ")}</Badge>
                    <p className="text-xs text-muted-foreground">{log.user?.name || "System"}</p>
                  </div>
                  <p className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent sales</CardTitle>
          <Link to="/reports" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {!summary?.recentSales.length ? (
            <EmptyState icon={Receipt} title="No sales yet" description="Completed sales from the POS will show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Invoice</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Cashier</th>
                    <th className="pb-2 font-medium">Items</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentSales.map((s) => (
                    <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="data-num py-2.5 font-medium">{s.invoiceNumber}</td>
                      <td className="py-2.5">{s.customer}</td>
                      <td className="py-2.5">{s.cashier}</td>
                      <td className="py-2.5">
                        <Badge>{s.itemCount} items</Badge>
                      </td>
                      <td className="data-num py-2.5 font-semibold">{formatCurrency(s.total)}</td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(s.createdAt)}</td>
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
