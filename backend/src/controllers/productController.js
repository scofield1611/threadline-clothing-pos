import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";
import { logActivity } from "../services/activityLogService.js";
import { computeStockStatus } from "../services/inventoryService.js";

const variantSchema = z.object({
  id: z.string().optional(), // present when editing an existing variant
  size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]),
  color: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().min(1),
  price: z.number().positive().nullable().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(), // initial stock only, recorded as an ADJUSTMENT tx
});

const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  costPrice: z.number().min(0),
  sellPrice: z.number().min(0),
  images: z.array(z.string()).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  variants: z.array(variantSchema).min(1, "Add at least one size/color variant"),
});

function withComputedFields(product) {
  return {
    ...product,
    totalStock: product.variants.reduce((sum, v) => sum + v.stock, 0),
  };
}

export async function listProducts(req, res) {
  const pagination = parsePagination(req.query);
  const { search, categoryId, brandId, status, stockFilter } = req.query;

  // stockFilter is applied at the variant level via the persisted
  // `stockStatus` column (see schema/inventoryService), so pagination and
  // `meta.total` stay correct instead of being computed after the fact.
  const stockFilterClause =
    stockFilter === "LOW_STOCK" || stockFilter === "OUT_OF_STOCK"
      ? { variants: { some: { stockStatus: stockFilter } } }
      : {};

  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      categoryId ? { categoryId } : {},
      brandId ? { brandId } : {},
      status ? { status } : {},
      stockFilterClause,
    ],
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, brand: true, variants: true },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ data: items.map(withComputedFields), meta: buildMeta(pagination, total) });
}

export async function getProduct(req, res) {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { category: true, brand: true, variants: true },
  });
  if (!product) throw ApiError.notFound("Product not found");
  res.json({ data: withComputedFields(product) });
}

// Scanner-friendly lookup: given a barcode (product OR variant), return the
// exact variant + parent product so the POS can add it to cart instantly.
export async function findByBarcode(req, res) {
  const { barcode } = req.params;

  const variant = await prisma.productVariant.findUnique({
    where: { barcode },
    include: { product: { include: { brand: true, category: true } } },
  });

  if (!variant) throw ApiError.notFound(`No product found for barcode ${barcode}`);
  res.json({ data: variant });
}

export async function createProduct(req, res) {
  const data = productSchema.parse(req.body);

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode || null,
        brandId: data.brandId || null,
        categoryId: data.categoryId || null,
        description: data.description || null,
        costPrice: data.costPrice,
        sellPrice: data.sellPrice,
        images: data.images || [],
        status: data.status || "ACTIVE",
        variants: {
          create: data.variants.map((v) => ({
            size: v.size,
            color: v.color,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price ?? null,
            lowStockThreshold: v.lowStockThreshold ?? 5,
            stock: 0, // real stock only ever set via inventory transactions below
            stockStatus: "OUT_OF_STOCK",
          })),
        },
      },
      include: { variants: true },
    });

    // Record initial stock (if any) as ADJUSTMENT transactions so the ledger
    // has a starting point, instead of writing to `stock` directly.
    for (const variant of created.variants) {
      const requested = data.variants.find((v) => v.sku === variant.sku)?.stock || 0;
      if (requested > 0) {
        const status = computeStockStatus(requested, variant.lowStockThreshold);
        await tx.productVariant.update({ where: { id: variant.id }, data: { stock: requested, stockStatus: status } });
        await tx.inventoryTransaction.create({
          data: {
            variantId: variant.id,
            change: requested,
            type: "ADJUSTMENT",
            reason: "Initial stock on product creation",
            referenceType: "PRODUCT_CREATE",
            referenceId: created.id,
            createdById: req.user.id,
          },
        });
      }
    }

    return tx.product.findUnique({ where: { id: created.id }, include: { variants: true, brand: true, category: true } });
  });

  await logActivity({ action: "PRODUCT_CREATED", entity: "Product", entityId: product.id, userId: req.user.id });
  res.status(201).json({ data: withComputedFields(product) });
}

// Updates product fields AND variants: existing variants (matched by `id`)
// are updated in place; variants without an `id` are created as new
// size/colour combinations. Stock itself is still never set directly here —
// only non-stock fields (price, threshold, sku, barcode, size, color) are
// editable through this path; use /inventory/adjust for stock corrections.
export async function updateProduct(req, res) {
  const data = productSchema.partial().parse(req.body);
  const { variants, ...productFields } = data;

  const existing = await prisma.product.findUnique({ where: { id: req.params.id }, include: { variants: true } });
  if (!existing) throw ApiError.notFound("Product not found");

  const product = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: req.params.id },
      data: { ...productFields, barcode: productFields.barcode ?? undefined },
    });

    if (variants) {
      for (const v of variants) {
        if (v.id) {
          const current = existing.variants.find((ev) => ev.id === v.id);
          if (!current) throw ApiError.notFound(`Variant ${v.id} not found on this product`);
          await tx.productVariant.update({
            where: { id: v.id },
            data: {
              size: v.size,
              color: v.color,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price ?? null,
              lowStockThreshold: v.lowStockThreshold ?? current.lowStockThreshold,
              stockStatus: computeStockStatus(current.stock, v.lowStockThreshold ?? current.lowStockThreshold),
            },
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId: req.params.id,
              size: v.size,
              color: v.color,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price ?? null,
              lowStockThreshold: v.lowStockThreshold ?? 5,
              stock: 0,
              stockStatus: "OUT_OF_STOCK",
            },
          });
        }
      }
    }

    return tx.product.findUnique({ where: { id: req.params.id }, include: { variants: true, brand: true, category: true } });
  });

  await logActivity({ action: "PRODUCT_UPDATED", entity: "Product", entityId: product.id, userId: req.user.id });
  res.json({ data: withComputedFields(product) });
}

export async function deleteProduct(req, res) {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Product not found");

  await prisma.product.update({ where: { id: req.params.id }, data: { status: "DISCONTINUED" } });

  await logActivity({ action: "PRODUCT_DISCONTINUED", entity: "Product", entityId: existing.id, userId: req.user.id });
  res.json({ data: { id: existing.id, status: "DISCONTINUED" } });
}

// Bulk import: accepts pre-parsed rows (frontend parses the CSV/XLSX with
// papaparse/SheetJS and posts JSON, so the backend stays format-agnostic
// and validation-first). Each row creates one product with exactly one
// variant — the common case for a first bulk load — and reports per-row
// success/failure so a partial import doesn't look like a silent failure.
const importRowSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(1),
  barcode: z.string().min(1),
  size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]),
  color: z.string().min(1),
  category: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  costPrice: z.coerce.number().min(0),
  sellPrice: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0).optional().default(0),
});

export async function bulkImportProducts(req, res) {
  const rows = z.array(importRowSchema).min(1).max(1000, "Import is limited to 1,000 rows at a time — please split larger files").parse(req.body.rows);

  const results = [];
  for (const [index, row] of rows.entries()) {
    try {
      const [category, brand] = await Promise.all([
        row.category
          ? prisma.category.upsert({ where: { name: row.category }, update: {}, create: { name: row.category } })
          : null,
        row.brand ? prisma.brand.upsert({ where: { name: row.brand }, update: {}, create: { name: row.brand } }) : null,
      ]);

      const status = computeStockStatus(row.stock, 5);
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name: row.name,
            sku: row.sku,
            categoryId: category?.id || null,
            brandId: brand?.id || null,
            costPrice: row.costPrice,
            sellPrice: row.sellPrice,
            variants: {
              create: [{ size: row.size, color: row.color, sku: `${row.sku}-${row.size}-${row.color}`.toUpperCase(), barcode: row.barcode, stock: row.stock, stockStatus: status }],
            },
          },
          include: { variants: true },
        });
        if (row.stock > 0) {
          await tx.inventoryTransaction.create({
            data: {
              variantId: created.variants[0].id,
              change: row.stock,
              type: "ADJUSTMENT",
              reason: "Bulk import initial stock",
              referenceType: "BULK_IMPORT",
              createdById: req.user.id,
            },
          });
        }
        return created;
      });

      results.push({ row: index + 1, sku: row.sku, status: "success", productId: product.id });
    } catch (err) {
      results.push({ row: index + 1, sku: row.sku, status: "error", message: err.message?.slice(0, 200) || "Import failed" });
    }
  }

  await logActivity({
    action: "PRODUCTS_BULK_IMPORTED",
    entity: "Product",
    userId: req.user.id,
    details: { total: rows.length, succeeded: results.filter((r) => r.status === "success").length },
  });

  res.status(201).json({ data: results });
}
