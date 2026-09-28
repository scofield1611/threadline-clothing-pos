import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
});

export async function listCustomers(req, res) {
  const pagination = parsePagination(req.query);
  const { search } = req.query;

  const where = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] }
    : {};

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: { _count: { select: { sales: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ data: items, meta: buildMeta(pagination, total) });
}

export async function getCustomer(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        include: { items: { include: { variant: { include: { product: true } } } }, payments: true },
      },
    },
  });
  if (!customer) throw ApiError.notFound("Customer not found");
  res.json({ data: customer });
}

export async function createCustomer(req, res) {
  const data = customerSchema.parse(req.body);
  const customer = await prisma.customer.create({ data: { ...data, phone: data.phone || null, email: data.email || null } });
  res.status(201).json({ data: customer });
}

export async function updateCustomer(req, res) {
  const data = customerSchema.partial().parse(req.body);
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Customer not found");
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
  res.json({ data: customer });
}
