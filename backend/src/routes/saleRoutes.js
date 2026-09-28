import { Router } from "express";
import { listSales, getSale, createSale } from "../controllers/saleController.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

// All authenticated staff (Owner/Manager/Cashier) can operate the POS.
router.get("/", listSales);
router.get("/:id", getSale);
router.post("/", createSale);

export default router;
