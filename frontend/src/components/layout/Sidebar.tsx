import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ScanBarcode,
  Shirt,
  Boxes,
  Truck,
  Users,
  RotateCcw,
  BarChart3,
  ClipboardList,
  Tags,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS / Billing", icon: ScanBarcode },
  { to: "/products", label: "Products", icon: Shirt, roles: ["OWNER", "MANAGER"] },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/purchases", label: "Purchases", icon: Truck, roles: ["OWNER", "MANAGER"] },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/returns", label: "Returns", icon: RotateCcw },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["OWNER", "MANAGER"] },
  { to: "/catalog", label: "Categories & Brands", icon: Tags, roles: ["OWNER", "MANAGER"] },
  { to: "/activity-logs", label: "Activity Logs", icon: ClipboardList, roles: ["OWNER", "MANAGER"] },
  { to: "/settings", label: "Store Settings", icon: Settings, roles: ["OWNER", "MANAGER"] },
];

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { user } = useAuth();
  const visible = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Shirt className="h-4.5 w-4.5" />
            </div>
            <span className="font-display text-base font-bold tracking-tight">ThreadLine</span>
          </div>
          <button onClick={onCloseMobile} className="text-muted-foreground lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-4 text-xs text-muted-foreground">
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium text-foreground">Barcode scanner ready</p>
            <p className="mt-0.5">Scan anywhere in POS — no click needed.</p>
          </div>
        </div>
      </aside>
    </>
  );
}
