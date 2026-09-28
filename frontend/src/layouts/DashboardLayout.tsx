import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/pos": "POS / Billing",
  "/products": "Products",
  "/inventory": "Inventory",
  "/purchases": "Purchases",
  "/suppliers": "Suppliers",
  "/customers": "Customers",
  "/returns": "Returns & Exchanges",
  "/reports": "Reports",
  "/catalog": "Categories & Brands",
  "/activity-logs": "Activity Logs",
  "/settings": "Store Settings",
};

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const title = titles[location.pathname] || "ThreadLine";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar onOpenMobileMenu={() => setMobileOpen(true)} title={title} />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div key={location.pathname} className="h-full animate-in fade-in duration-200">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
