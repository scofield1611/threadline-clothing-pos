import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/settingsController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", getSettings);
router.patch("/", requireRole("OWNER", "MANAGER"), updateSettings);

export default router;
