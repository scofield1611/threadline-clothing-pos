import { Router } from "express";
import { listReturns, createReturn } from "../controllers/returnController.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", listReturns);
router.post("/", createReturn);

export default router;
