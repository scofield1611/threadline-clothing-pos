import { Router } from "express";
import { listCustomers, getCustomer, createCustomer, updateCustomer } from "../controllers/customerController.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", listCustomers);
router.get("/:id", getCustomer);
router.post("/", createCustomer);
router.patch("/:id", updateCustomer);

export default router;
