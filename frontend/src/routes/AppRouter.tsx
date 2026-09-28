import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { POSPage } from "@/pages/POSPage";

// Secondary/management screens are lazy-loaded: they're visited far less
// often than Dashboard/POS, and several of them pull in real weight
// (JsBarcode/PapaParse are only ever needed on Inventory) that shouldn't
// be in the first paint's bundle for a cashier who just wants the POS open.
const ProductsPage = lazy(() => import("@/pages/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const InventoryPage = lazy(() => import("@/pages/InventoryPage").then((m) => ({ default: m.InventoryPage })));
const PurchasesPage = lazy(() => import("@/pages/PurchasesPage").then((m) => ({ default: m.PurchasesPage })));
const CustomersPage = lazy(() => import("@/pages/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const SuppliersPage = lazy(() => import("@/pages/SuppliersPage").then((m) => ({ default: m.SuppliersPage })));
const ReturnsPage = lazy(() => import("@/pages/ReturnsPage").then((m) => ({ default: m.ReturnsPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const CatalogPage = lazy(() => import("@/pages/CatalogPage").then((m) => ({ default: m.CatalogPage })));
const ActivityLogsPage = lazy(() => import("@/pages/ActivityLogsPage").then((m) => ({ default: m.ActivityLogsPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center py-24" role="status" aria-label="Loading page">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/pos" element={<POSPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/returns" element={<ReturnsPage />} />

              <Route element={<ProtectedRoute roles={["OWNER", "MANAGER"]} />}>
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/purchases" element={<PurchasesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/activity-logs" element={<ActivityLogsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
