import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { parsePagination, buildMeta } from "../utils/pagination.js";

const router = Router();
router.use(requireAuth, requireRole("OWNER", "MANAGER"));

router.get("/", async (req, res) => {
  const pagination = parsePagination(req.query);
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.activityLog.count(),
  ]);
  res.json({ data: items, meta: buildMeta(pagination, total) });
});

export default router;
