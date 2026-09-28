import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";
import { logActivity } from "../services/activityLogService.js";

const supplierSchema = z.object({
  company: z.string().min(1),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  gst: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
});

export async function listSuppliers(req, res) {
  const pagination = parsePagination(req.query);
  const { search } = req.query;

  const where = search
    ? { OR: [{ company: { contains: search, mode: "insensitive" } }, { contact: { contains: search, mode: "insensitive" } }] }
    : {};

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { company: "asc" }, skip: pagination.skip, take: pagination.take }),
    prisma.supplier.count({ where }),
  ]);

  res.json({ data: items, meta: buildMeta(pagination, total) });
}

export async function createSupplier(req, res) {
  const data = supplierSchema.parse(req.body);
  const supplier = await prisma.supplier.create({ data });
  await logActivity({ action: "SUPPLIER_CREATED", entity: "Supplier", entityId: supplier.id, userId: req.user.id });
  res.status(201).json({ data: supplier });
}

export async function updateSupplier(req, res) {
  const data = supplierSchema.partial().parse(req.body);
  const existing = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Supplier not found");
  const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data });
  await logActivity({ action: "SUPPLIER_UPDATED", entity: "Supplier", entityId: supplier.id, userId: req.user.id });
  res.json({ data: supplier });
}

export async function deactivateSupplier(req, res) {
  const existing = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Supplier not found");
  const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ data: supplier });
}
