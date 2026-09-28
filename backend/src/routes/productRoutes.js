import { Router } from "express";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  findByBarcode,
  bulkImportProducts,
} from "../controllers/productController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", listProducts);
router.get("/barcode/:barcode", findByBarcode);
router.get("/:id", getProduct);
router.post("/", requireRole("OWNER", "MANAGER"), createProduct);
router.post("/bulk-import", requireRole("OWNER", "MANAGER"), bulkImportProducts);
router.patch("/:id", requireRole("OWNER", "MANAGER"), updateProduct);
router.delete("/:id", requireRole("OWNER", "MANAGER"), deleteProduct);

export default router;
