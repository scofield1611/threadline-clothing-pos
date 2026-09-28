/**
 * Demo data generator for showcasing ThreadLine (portfolio/demo purposes).
 *
 * Run separately from prisma/seed.js (which just creates the 3 login
 * accounts + one sample product for local dev). This script additionally
 * populates a realistic, browsable dataset: run `npm run seed` first,
 * then `npm run seed:demo`.
 *
 *   npm run seed        # 3 accounts + 1 sample product (fast, for dev)
 *   npm run seed:demo   # + 200+ products, hundreds of purchases/sales, etc.
 *
 * IMPORTANT — a deliberate, narrow exception to the app's core invariant:
 * everywhere else in this codebase, `productVariant.stock` is only ever
 * mutated via `inventoryService.applyInventoryChange` (see that file's
 * comments). This script does NOT call it. Calling it here would mean
 * ~15,000+ sequential round trips (a findUnique + conditional updateMany +
 * a second findUnique + an InventoryTransaction insert, for every single
 * purchase/sale line item), which would make seeding take the better part
 * of an hour. Instead, this script:
 *   1. Tracks stock in a plain in-memory map as it generates purchases/
 *      sales/returns (the same arithmetic applyInventoryChange would do),
 *   2. Writes the FINAL stock + stockStatus per variant in one pass,
 *   3. Bulk-inserts every InventoryTransaction row via chunked createMany.
 * The resulting ledger and stock counts are exactly as consistent as if
 * applyInventoryChange had been called for each line item — this is a
 * performance optimization for a one-time, offline data-generation script,
 * not a runtime code path, and it reuses the same computeStockStatus
 * classification helper the real service uses so the two never disagree.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { computeStockStatus } from "../src/services/inventoryService.js";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Small deterministic-ish random helpers
// ---------------------------------------------------------------------------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function pickMany(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
  }
  return out;
}
function pickWeightedDaysAgo(buckets) {
  // buckets: [{ weight, min, max }] — pick a bucket by weight, then a
  // uniform day offset within it. Used to bias sales toward "recent".
  const total = buckets.reduce((s, b) => s + b.weight, 0);
  let roll = Math.random() * total;
  for (const b of buckets) {
    if (roll < b.weight) return randInt(b.min, b.max);
    roll -= b.weight;
  }
  return buckets[buckets.length - 1].max;
}
function dateDaysAgo(days, hour = randInt(10, 20), minute = randInt(0, 59)) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function invoiceNumber(prefix, date) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
async function chunkedCreateMany(model, rows, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await model.createMany({ data: rows.slice(i, i + chunkSize), skipDuplicates: true });
  }
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------
const CATEGORY_NAMES = [
  "T-Shirts", "Shirts", "Jeans", "Trousers", "Shorts", "Jackets", "Hoodies",
  "Sweaters", "Dresses", "Skirts", "Ethnic Wear", "Formal Wear", "Activewear",
  "Innerwear", "Loungewear", "Kids Wear", "Footwear", "Winterwear", "Sarees",
  "Accessories",
];

// Fictional brand names — deliberately not real-world trademarks, since
// this dataset is generated at a scale (15 brands) where reproducing real
// brand names would look like (and functionally be) trademark reproduction,
// not a one-off illustrative example.
const BRAND_NAMES = [
  "Urban Weave", "Nordic Thread", "Vantage Point", "Solstice", "Aurelia",
  "Metro Vogue", "Northline", "Crestwear", "Bloom & Co", "Ashford Lane",
  "Pinnacle Apparel", "Rustic Loom", "Zephyr", "Ember & Oak", "Modern Muse",
];

const COLORS = [
  "Black", "White", "Navy", "Grey", "Beige", "Maroon", "Olive", "Mustard",
  "Blue", "Red", "Green", "Pink", "Charcoal", "Brown", "Teal",
];

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const PRODUCT_TEMPLATES = {
  "T-Shirts": ["Classic Crew Neck Tee", "Graphic Print Tee", "V-Neck Basic Tee", "Henley Tee", "Oversized Tee", "Polo Tee"],
  Shirts: ["Formal Cotton Shirt", "Checked Casual Shirt", "Linen Shirt", "Denim Shirt", "Printed Shirt"],
  Jeans: ["Slim Fit Jeans", "Straight Fit Jeans", "Skinny Jeans", "Bootcut Jeans", "Relaxed Fit Jeans"],
  Trousers: ["Chino Trousers", "Formal Trousers", "Cargo Trousers", "Track Pants"],
  Shorts: ["Denim Shorts", "Cargo Shorts", "Sports Shorts", "Bermuda Shorts"],
  Jackets: ["Bomber Jacket", "Denim Jacket", "Windcheater", "Leather Jacket", "Puffer Jacket"],
  Hoodies: ["Pullover Hoodie", "Zip-Up Hoodie", "Graphic Hoodie"],
  Sweaters: ["Crew Neck Sweater", "Cardigan", "Turtleneck Sweater"],
  Dresses: ["A-Line Dress", "Wrap Dress", "Maxi Dress", "Bodycon Dress", "Shirt Dress"],
  Skirts: ["A-Line Skirt", "Pencil Skirt", "Pleated Skirt"],
  "Ethnic Wear": ["Kurta Set", "Anarkali Suit", "Nehru Jacket", "Dhoti Pants"],
  "Formal Wear": ["Formal Blazer", "Three-Piece Suit", "Waistcoat"],
  Activewear: ["Training Tee", "Compression Leggings", "Running Shorts", "Track Jacket"],
  Innerwear: ["Cotton Briefs Pack", "Vest Pack", "Boxer Shorts Pack"],
  Loungewear: ["Pajama Set", "Lounge Pants", "Bathrobe"],
  "Kids Wear": ["Kids Graphic Tee", "Kids Party Dress", "Kids Shorts Set"],
  Footwear: ["Canvas Sneakers", "Leather Loafers", "Sports Shoes", "Flat Sandals"],
  Winterwear: ["Puffer Vest", "Wool Overcoat", "Thermal Top"],
  Sarees: ["Cotton Handloom Saree", "Silk Blend Saree", "Printed Georgette Saree"],
  Accessories: ["Leather Belt", "Canvas Cap", "Wool Scarf", "Cotton Socks Pack"],
};

const STYLE_MODIFIERS = ["Classic", "Signature", "Essential", "Everyday", "Premium", "Heritage", "Urban", ""];

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Krishna", "Ishaan",
  "Rohan", "Kabir", "Ananya", "Diya", "Saanvi", "Aadhya", "Myra", "Anika",
  "Ira", "Kavya", "Riya", "Sara", "Priya", "Neha", "Pooja", "Sanya",
  "Rahul", "Amit", "Vikram", "Sanjay", "Rajesh", "Suresh", "Meera", "Nisha",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Malhotra", "Kapoor", "Mehta", "Joshi", "Reddy",
  "Nair", "Iyer", "Chatterjee", "Banerjee", "Patel", "Shah", "Desai", "Rao",
  "Singh", "Kumar", "Agarwal", "Bhatia", "Chopra", "Khanna", "Menon", "Pillai",
];
const CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Pune", "Ahmedabad", "Chennai",
  "Kolkata", "Surat", "Jaipur", "Lucknow", "Indore", "Nagpur", "Bhopal", "Coimbatore",
];

function randomPersonName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}
function randomPhone() {
  return `9${randInt(100000000, 999999999)}`;
}
function randomGst() {
  const stateCode = String(randInt(10, 37)).padStart(2, "0");
  const letters = Array.from({ length: 5 }, () => String.fromCharCode(65 + randInt(0, 25))).join("");
  return `${stateCode}${letters}${randInt(1000, 9999)}${pick(["A", "B", "C"])}1Z${randInt(1, 9)}`;
}

async function main() {
  console.log("Seeding demo data — this generates a few thousand records and will take a few minutes.\n");

  // ---------------------------------------------------------------------
  // 1. Users — the 3 core accounts plus a couple more cashiers, so sales
  //    are attributed to more than one person.
  // ---------------------------------------------------------------------
  const passwordHash = await bcrypt.hash("password123", 10);
  const owner = await prisma.user.upsert({
    where: { email: "owner@store.com" },
    update: {},
    create: { name: "Store Owner", email: "owner@store.com", passwordHash, role: "OWNER" },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@store.com" },
    update: {},
    create: { name: "Store Manager", email: "manager@store.com", passwordHash, role: "MANAGER" },
  });
  const cashier1 = await prisma.user.upsert({
    where: { email: "cashier@store.com" },
    update: {},
    create: { name: "Store Cashier", email: "cashier@store.com", passwordHash, role: "CASHIER" },
  });
  const cashier2 = await prisma.user.upsert({
    where: { email: "cashier2@store.com" },
    update: {},
    create: { name: "Priya Sharma", email: "cashier2@store.com", passwordHash, role: "CASHIER" },
  });
  const cashiers = [cashier1, cashier2];
  console.log("Users ready.");

  // ---------------------------------------------------------------------
  // 2. Categories & Brands
  // ---------------------------------------------------------------------
  await chunkedCreateMany(prisma.category, CATEGORY_NAMES.map((name) => ({ name })));
  await chunkedCreateMany(prisma.brand, BRAND_NAMES.map((name) => ({ name })));
  const categories = await prisma.category.findMany();
  const brands = await prisma.brand.findMany();
  console.log(`Categories: ${categories.length}, Brands: ${brands.length}`);

  // ---------------------------------------------------------------------
  // 3. Suppliers (50)
  // ---------------------------------------------------------------------
  const supplierSuffixes = ["Textiles", "Garments", "Apparel Co", "Fabrics", "Exports", "Mills", "Clothing Ltd"];
  const supplierRows = Array.from({ length: 50 }, (_, i) => {
    const city = pick(CITIES);
    return {
      company: `${pick(["Apex", "Silverline", "Crown", "Bluewave", "Sunrise", "Everest", "Golden", "Royal", "Prime", "Metro"])} ${pick(supplierSuffixes)} ${i + 1}`,
      contact: randomPersonName(),
      phone: randomPhone(),
      gst: randomGst(),
      email: `contact${i + 1}@supplier${i + 1}.com`,
      address: `Plot ${randInt(1, 200)}, Industrial Area, ${city}`,
    };
  });
  await chunkedCreateMany(prisma.supplier, supplierRows);
  const suppliers = await prisma.supplier.findMany();
  console.log(`Suppliers: ${suppliers.length}`);

  // ---------------------------------------------------------------------
  // 4. Customers (150)
  // ---------------------------------------------------------------------
  const usedPhones = new Set();
  const customerRows = [];
  while (customerRows.length < 150) {
    const phone = randomPhone();
    if (usedPhones.has(phone)) continue;
    usedPhones.add(phone);
    const name = randomPersonName();
    customerRows.push({
      name,
      phone,
      email: Math.random() > 0.3 ? `${name.toLowerCase().replace(/\s+/g, ".")}${randInt(1, 99)}@example.com` : null,
    });
  }
  await chunkedCreateMany(prisma.customer, customerRows);
  const customers = await prisma.customer.findMany();
  console.log(`Customers: ${customers.length}`);

  // ---------------------------------------------------------------------
  // 5. Products + Variants (210 products, 2-4 variants each)
  // ---------------------------------------------------------------------
  let barcodeCounter = 8901000000000;
  const nextBarcode = () => String(barcodeCounter++);

  const products = [];
  let productIndex = 0;
  for (const category of categories) {
    const templates = PRODUCT_TEMPLATES[category.name] || ["Essential Item"];
    const productsPerCategory = Math.ceil(210 / categories.length);

    for (let i = 0; i < productsPerCategory; i++) {
      productIndex++;
      const brand = pick(brands);
      const template = pick(templates);
      const modifier = pick(STYLE_MODIFIERS);
      const name = modifier ? `${brand.name} ${modifier} ${template}` : `${brand.name} ${template}`;
      const sku = `P${String(productIndex).padStart(4, "0")}`;
      const costPrice = randInt(150, 1800);
      const sellPrice = round2(costPrice * (1.6 + Math.random() * 0.9)); // ~60-150% markup

      const variantCount = randInt(2, 4);
      const variantColors = pickMany(COLORS, Math.min(variantCount, COLORS.length));
      const variantSizes = pickMany(SIZES, Math.min(variantCount, SIZES.length));
      const variantData = [];
      for (let v = 0; v < variantCount; v++) {
        variantData.push({
          size: variantSizes[v % variantSizes.length],
          color: variantColors[v % variantColors.length],
          sku: `${sku}-V${v + 1}`,
          barcode: nextBarcode(),
          stock: 0,
          stockStatus: "OUT_OF_STOCK",
          lowStockThreshold: 5,
        });
      }

      const product = await prisma.product.create({
        data: {
          name,
          sku,
          categoryId: category.id,
          brandId: brand.id,
          costPrice,
          sellPrice,
          status: "ACTIVE",
          variants: { create: variantData },
        },
        include: { variants: true },
      });
      products.push(product);
    }
    if (products.length >= 210) break;
  }
  console.log(`Products: ${products.length}, Variants: ${products.reduce((s, p) => s + p.variants.length, 0)}`);

  const allVariants = products.flatMap((p) => p.variants.map((v) => ({ ...v, costPrice: Number(p.costPrice), sellPrice: Number(p.sellPrice), productName: p.name })));
  const stockMap = new Map(allVariants.map((v) => [v.id, 0]));
  const ledgerRows = [];
  const activityRows = [];

  // ---------------------------------------------------------------------
  // 6. Purchases (250) - dated further back so most stock exists before
  //    the sales below draw it down (see file header for why this script
  //    tracks stock in-memory instead of calling applyInventoryChange).
  // ---------------------------------------------------------------------
  const purchaseCount = 250;
  for (let i = 0; i < purchaseCount; i++) {
    const supplier = pick(suppliers);
    const createdBy = pick([owner, manager]);
    const date = dateDaysAgo(randInt(20, 200));
    const lineCount = randInt(3, 8);
    const chosenVariants = pickMany(allVariants, lineCount);

    const items = chosenVariants.map((v) => {
      const quantity = randInt(10, 40);
      stockMap.set(v.id, (stockMap.get(v.id) || 0) + quantity);
      return { variantId: v.id, quantity, purchasePrice: v.costPrice };
    });
    const totalAmount = round2(items.reduce((s, it) => s + it.quantity * Number(it.purchasePrice), 0));

    const purchase = await prisma.purchase.create({
      data: {
        invoiceNumber: invoiceNumber("PINV", date),
        supplierId: supplier.id,
        createdById: createdBy.id,
        date,
        createdAt: date,
        totalAmount,
        items: { create: items },
      },
      include: { items: true },
    });

    for (const item of purchase.items) {
      ledgerRows.push({
        variantId: item.variantId,
        change: item.quantity,
        type: "PURCHASE",
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        createdById: createdBy.id,
        createdAt: date,
      });
    }
    activityRows.push({ action: "PURCHASE_ADDED", entity: "Purchase", entityId: purchase.id, userId: createdBy.id, createdAt: date });

    if (i % 50 === 0) console.log(`  purchases: ${i}/${purchaseCount}`);
  }
  console.log(`Purchases: ${purchaseCount}`);

  // ---------------------------------------------------------------------
  // 7. Sales (600) - recency-weighted dates so the dashboard's 14-day
  //    chart and "this month" figures look like an actually-open store.
  // ---------------------------------------------------------------------
  const saleCount = 600;
  const completedSales = [];
  const dayBuckets = [
    { weight: 45, min: 0, max: 14 },
    { weight: 30, min: 15, max: 30 },
    { weight: 25, min: 31, max: 90 },
  ];

  for (let i = 0; i < saleCount; i++) {
    const date = dateDaysAgo(pickWeightedDaysAgo(dayBuckets));
    const cashier = pick(cashiers);
    const withCustomer = Math.random() < 0.65;
    const customer = withCustomer ? pick(customers) : null;

    // Only offer variants that currently have stock, so we never try to
    // oversell — mirrors the real applyInventoryChange guard, just
    // enforced here in-memory instead of via a DB round trip.
    const inStock = allVariants.filter((v) => (stockMap.get(v.id) || 0) > 0);
    if (inStock.length === 0) break;

    const lineCount = Math.min(randInt(1, 5), inStock.length);
    const chosenVariants = pickMany(inStock, lineCount);
    const items = [];
    for (const v of chosenVariants) {
      const available = stockMap.get(v.id) || 0;
      if (available <= 0) continue;
      const quantity = Math.min(randInt(1, 3), available);
      const unitPrice = v.price ? Number(v.price) : v.sellPrice;
      items.push({ variantId: v.id, quantity, unitPrice, lineTotal: round2(unitPrice * quantity) });
      stockMap.set(v.id, available - quantity);
    }
    if (items.length === 0) continue;

    const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));
    const hasDiscount = Math.random() < 0.2;
    const discountType = hasDiscount ? pick(["FLAT", "PERCENTAGE"]) : null;
    const discountValue = discountType === "FLAT" ? randInt(50, 200) : discountType === "PERCENTAGE" ? randInt(5, 15) : null;
    const discountAmount = discountType === "FLAT" ? Math.min(discountValue, subtotal) : discountType === "PERCENTAGE" ? round2(subtotal * (discountValue / 100)) : 0;
    const taxable = subtotal - discountAmount;
    const taxAmount = round2(taxable * 0.05);
    const totalAmount = round2(taxable + taxAmount);

    const methodRoll = Math.random();
    const method = methodRoll < 0.4 ? "CASH" : methodRoll < 0.7 ? "UPI" : methodRoll < 0.9 ? "CARD" : "MIXED";
    const payments =
      method === "MIXED"
        ? (() => {
            const cashPart = round2(totalAmount * 0.5);
            return [
              { method: "CASH", amount: cashPart },
              { method: "UPI", amount: round2(totalAmount - cashPart) },
            ];
          })()
        : [{ method, amount: totalAmount }];

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: invoiceNumber("INV", date),
        customerId: customer?.id || null,
        cashierId: cashier.id,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        discountType,
        discountValue,
        createdAt: date,
        items: { create: items },
        payments: { create: payments },
      },
      include: { items: true },
    });
    completedSales.push({ ...sale, date });

    for (const item of sale.items) {
      ledgerRows.push({
        variantId: item.variantId,
        change: -item.quantity,
        type: "SALE",
        referenceType: "SALE",
        referenceId: sale.id,
        createdById: cashier.id,
        createdAt: date,
      });
    }
    activityRows.push({ action: "SALE_CREATED", entity: "Sale", entityId: sale.id, userId: cashier.id, createdAt: date, details: { total: totalAmount } });

    if (i % 100 === 0) console.log(`  sales: ${i}/${saleCount}`);
  }
  console.log(`Sales: ${completedSales.length}`);

  // ---------------------------------------------------------------------
  // 8. Returns (~40) - against a random subset of completed sales, always
  //    a full return of one line item (keeps the seed script's own
  //    quantity bookkeeping simple while still exercising the feature).
  // ---------------------------------------------------------------------
  const returnCandidates = pickMany(completedSales, Math.min(40, completedSales.length));
  let returnCount = 0;
  for (const sale of returnCandidates) {
    if (!sale.items.length) continue;
    const item = pick(sale.items);
    const returnDate = new Date(sale.date.getTime() + randInt(1, 10) * 24 * 60 * 60 * 1000);
    if (returnDate > new Date()) continue; // don't backdate a return into the future

    const ret = await prisma.return.create({
      data: {
        saleId: sale.id,
        type: Math.random() < 0.8 ? "RETURN" : "EXCHANGE",
        reason: pick(["Wrong size", "Changed mind", "Defective item", "Color not as expected", null]),
        createdAt: returnDate,
        items: {
          create: [{ variantId: item.variantId, quantity: item.quantity, refundAmount: Number(item.lineTotal) }],
        },
      },
      include: { items: true },
    });

    stockMap.set(item.variantId, (stockMap.get(item.variantId) || 0) + item.quantity);
    ledgerRows.push({
      variantId: item.variantId,
      change: item.quantity,
      type: "RETURN",
      referenceType: "RETURN",
      referenceId: ret.id,
      createdAt: returnDate,
    });

    const totalSold = sale.items.reduce((s, i) => s + i.quantity, 0);
    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: item.quantity >= totalSold ? "RETURNED" : "PARTIALLY_RETURNED" },
    });

    activityRows.push({ action: "RETURN_CREATED", entity: "Return", entityId: ret.id, createdAt: returnDate });
    returnCount++;
  }
  console.log(`Returns: ${returnCount}`);

  // ---------------------------------------------------------------------
  // 9. Write final stock + stockStatus per variant, and bulk-insert the
  //    full inventory ledger + activity log.
  // ---------------------------------------------------------------------
  console.log("Writing final stock levels...");
  for (const variant of allVariants) {
    const finalStock = Math.max(stockMap.get(variant.id) || 0, 0);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: finalStock, stockStatus: computeStockStatus(finalStock, variant.lowStockThreshold) },
    });
  }

  console.log(`Writing ${ledgerRows.length} inventory ledger rows...`);
  await chunkedCreateMany(prisma.inventoryTransaction, ledgerRows);

  console.log(`Writing ${activityRows.length} activity log rows...`);
  await chunkedCreateMany(prisma.activityLog, activityRows);

  // ---------------------------------------------------------------------
  // 10. Store settings
  // ---------------------------------------------------------------------
  await prisma.storeSettings.upsert({
    where: { id: "store_settings" },
    update: {},
    create: {
      id: "store_settings",
      storeName: "ThreadLine Demo Store",
      address: "42 MG Road, Bengaluru, Karnataka 560001",
      phone: "9876543210",
      email: "hello@threadlinedemo.com",
      gstNumber: "29ABCDE1234F1Z5",
      invoicePrefix: "INV",
      defaultTaxRate: 5,
      currencyCode: "INR",
      receiptFooter: "Thank you for shopping with us! Exchanges within 7 days with receipt.",
      lowStockThresholdDefault: 5,
    },
  });

  console.log("\nDemo data seed complete.");
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Brands: ${brands.length}`);
  console.log(`  Suppliers: ${suppliers.length}`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Products: ${products.length}`);
  console.log(`  Purchases: ${purchaseCount}`);
  console.log(`  Sales: ${completedSales.length}`);
  console.log(`  Returns: ${returnCount}`);
  console.log(`  Inventory ledger rows: ${ledgerRows.length}`);
  console.log(`  Activity log rows: ${activityRows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
