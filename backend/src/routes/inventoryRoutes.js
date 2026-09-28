import { Router } from "express";
import { listStock, listInventoryHistory, createAdjustment, getInventorySummary } from "../controllers/inventoryController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", listStock);
router.get("/summary", getInventorySummary);
router.get("/history", listInventoryHistory);
router.post("/adjust", requireRole("OWNER", "MANAGER"), createAdjustment);

export default router;
