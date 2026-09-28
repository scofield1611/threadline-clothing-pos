import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { logActivity } from "../services/activityLogService.js";

const nameSchema = z.object({ name: z.string().min(1), isActive: z.boolean().optional() });

// Builds a full set of Express handlers for a simple `{ id, name, isActive }`
// model like Category or Brand, so those two files stay tiny.
export function makeSimpleEntityController(modelName, entityLabel) {
  const model = prisma[modelName];

  return {
    async list(req, res) {
      const items = await model.findMany({ orderBy: { name: "asc" } });
      res.json({ data: items });
    },

    async create(req, res) {
      const data = nameSchema.parse(req.body);
      const item = await model.create({ data });
      await logActivity({ action: `${entityLabel.toUpperCase()}_CREATED`, entity: entityLabel, entityId: item.id, userId: req.user.id });
      res.status(201).json({ data: item });
    },

    async update(req, res) {
      const data = nameSchema.partial().parse(req.body);
      const existing = await model.findUnique({ where: { id: req.params.id } });
      if (!existing) throw ApiError.notFound(`${entityLabel} not found`);
      const item = await model.update({ where: { id: req.params.id }, data });
      await logActivity({ action: `${entityLabel.toUpperCase()}_UPDATED`, entity: entityLabel, entityId: item.id, userId: req.user.id });
      res.json({ data: item });
    },

    async remove(req, res) {
      const existing = await model.findUnique({ where: { id: req.params.id } });
      if (!existing) throw ApiError.notFound(`${entityLabel} not found`);
      // Soft-delete: catalog terms may still be referenced by historical products/sales
      const item = await model.update({ where: { id: req.params.id }, data: { isActive: false } });
      await logActivity({ action: `${entityLabel.toUpperCase()}_DEACTIVATED`, entity: entityLabel, entityId: item.id, userId: req.user.id });
      res.json({ data: item });
    },
  };
}
