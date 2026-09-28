import { Router } from "express";
import { listSuppliers, createSupplier, updateSupplier, deactivateSupplier } from "../controllers/supplierController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", listSuppliers);
router.post("/", requireRole("OWNER", "MANAGER"), createSupplier);
router.patch("/:id", requireRole("OWNER", "MANAGER"), updateSupplier);
router.delete("/:id", requireRole("OWNER", "MANAGER"), deactivateSupplier);

export default router;
