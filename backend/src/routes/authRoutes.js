import { Router } from "express";
import { login, me, createUser, listUsers } from "../controllers/authController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router = Router();

router.post("/login", login);
router.get("/me", requireAuth, me);

// Staff management — Owner/Manager only
router.get("/users", requireAuth, requireRole("OWNER", "MANAGER"), listUsers);
router.post("/users", requireAuth, requireRole("OWNER", "MANAGER"), createUser);

export default router;
