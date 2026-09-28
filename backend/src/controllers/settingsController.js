import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { logActivity } from "../services/activityLogService.js";

const SETTINGS_ID = "store_settings";

const settingsSchema = z.object({
  storeName: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  gstNumber: z.string().optional().nullable(),
  invoicePrefix: z.string().min(1).max(10),
  defaultTaxRate: z.number().min(0).max(100),
  currencyCode: z.string().min(1).max(5),
  receiptFooter: z.string().optional().nullable(),
  lowStockThresholdDefault: z.number().int().min(0),
});

// Settings is a single row that's created on first read if it doesn't
// exist yet, so the frontend never has to special-case "not configured".
export async function getSettings(req, res) {
  const settings = await prisma.storeSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  res.json({ data: settings });
}

export async function updateSettings(req, res) {
  const data = settingsSchema.partial().parse(req.body);

  const settings = await prisma.storeSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { ...data, email: data.email || null },
    create: { id: SETTINGS_ID, ...data },
  });

  await logActivity({ action: "STORE_SETTINGS_UPDATED", entity: "StoreSettings", entityId: SETTINGS_ID, userId: req.user.id });
  res.json({ data: settings });
}
