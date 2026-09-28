export type Role = "OWNER" | "MANAGER" | "CASHIER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
}

export type Size = "XS" | "S" | "M" | "L" | "XL" | "XXL";

export interface ProductVariant {
  id: string;
  size: Size;
  color: string;
  sku: string;
  barcode: string;
  stock: number;
  price: string | null;
  lowStockThreshold: number;
  stockStatus?: StockStatus;
  productId: string;
  product?: Product;
}

export type ProductStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  costPrice: string;
  sellPrice: string;
  images: string[];
  status: ProductStatus;
  category?: Category | null;
  brand?: Brand | null;
  variants: ProductVariant[];
  totalStock?: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  company: string;
  contact: string | null;
  phone: string | null;
  gst: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  _count?: { sales: number };
}

export interface CartLine {
  variantId: string;
  productName: string;
  size: Size;
  color: string;
  sku: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  availableStock: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface DashboardSummary {
  todaySales: { total: number; count: number };
  monthSales: { total: number; count: number };
  monthProfit: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: number;
  bestSellers: { variantId: string; name: string; size: Size; color: string; quantitySold: number; revenue: number }[];
  recentSales: { id: string; invoiceNumber: string; total: number; customer: string; cashier: string; itemCount: number; createdAt: string }[];
}
