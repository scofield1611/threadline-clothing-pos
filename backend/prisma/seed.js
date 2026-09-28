import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mirrors inventoryService.computeStockStatus — duplicated here (rather than
// imported) since this script runs standalone via `node prisma/seed.js`,
// outside the app's module graph.
function computeStockStatus(stock, lowStockThreshold) {
  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock <= lowStockThreshold) return "LOW_STOCK";
  return "IN_STOCK";
}

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@store.com" },
    update: {},
    create: { name: "Store Owner", email: "owner@store.com", passwordHash, role: "OWNER" },
  });

  await prisma.user.upsert({
    where: { email: "manager@store.com" },
    update: {},
    create: { name: "Store Manager", email: "manager@store.com", passwordHash, role: "MANAGER" },
  });

  await prisma.user.upsert({
    where: { email: "cashier@store.com" },
    update: {},
    create: { name: "Store Cashier", email: "cashier@store.com", passwordHash, role: "CASHIER" },
  });

  const category = await prisma.category.upsert({ where: { name: "T-Shirts" }, update: {}, create: { name: "T-Shirts" } });
  await prisma.category.upsert({ where: { name: "Jeans" }, update: {}, create: { name: "Jeans" } });
  const brand = await prisma.brand.upsert({ where: { name: "Nike" }, update: {}, create: { name: "Nike" } });
  await prisma.brand.upsert({ where: { name: "Levi's" }, update: {}, create: { name: "Levi's" } });

  const supplier = await prisma.supplier.upsert({
    where: { id: "seed-supplier-1" },
    update: {},
    create: {
      id: "seed-supplier-1",
      company: "Apex Garments Pvt Ltd",
      contact: "Rakesh Sharma",
      phone: "9876543210",
      gst: "27ABCDE1234F1Z5",
      email: "sales@apexgarments.com",
      address: "Plot 14, Textile Park, Mumbai",
    },
  });

  const existingProduct = await prisma.product.findUnique({ where: { sku: "NIKE-TEE-001" } });
  if (!existingProduct) {
    const product = await prisma.product.create({
      data: {
        name: "Nike Classic T-Shirt",
        sku: "NIKE-TEE-001",
        barcode: "8901234567000",
        categoryId: category.id,
        brandId: brand.id,
        costPrice: 450,
        sellPrice: 899,
        variants: {
          create: [
            { size: "S", color: "Black", sku: "NIKE-TEE-001-S-BLK", barcode: "8901234567891" },
            { size: "M", color: "Black", sku: "NIKE-TEE-001-M-BLK", barcode: "8901234567890" },
            { size: "L", color: "Black", sku: "NIKE-TEE-001-L-BLK", barcode: "8901234567892" },
            { size: "M", color: "White", sku: "NIKE-TEE-001-M-WHT", barcode: "8901234567893" },
          ],
        },
      },
      include: { variants: true },
    });

    // Give it opening stock via a real purchase, so the ledger stays consistent.
    const purchase = await prisma.purchase.create({
      data: {
        invoiceNumber: "SEED-INV-0001",
        supplierId: supplier.id,
        createdById: owner.id,
        totalAmount: product.variants.length * 20 * 450,
        items: { create: product.variants.map((v) => ({ variantId: v.id, quantity: 20, purchasePrice: 450 })) },
      },
    });

    for (const variant of product.variants) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { stock: 20, stockStatus: computeStockStatus(20, variant.lowStockThreshold) },
      });
      await prisma.inventoryTransaction.create({
        data: { variantId: variant.id, change: 20, type: "PURCHASE", referenceType: "PURCHASE", referenceId: purchase.id, createdById: owner.id },
      });
    }
  }

  console.log("Seed complete. Login with owner@store.com / manager@store.com / cashier@store.com, password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
