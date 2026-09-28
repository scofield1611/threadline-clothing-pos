import { Router } from "express";
import { listPurchases, getPurchase, createPurchase } from "../controllers/purchaseController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth, requireRole("OWNER", "MANAGER"));

router.get("/", listPurchases);
router.get("/:id", getPurchase);
router.post("/", createPurchase);

export default router;
