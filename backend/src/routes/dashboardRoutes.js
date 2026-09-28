import { Router } from "express";
import { getSummary, getSalesChart, getCategoryPerformance, getRecentActivity } from "../controllers/dashboardController.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/summary", getSummary);
router.get("/sales-chart", getSalesChart);
router.get("/category-performance", getCategoryPerformance);
router.get("/recent-activity", getRecentActivity);

export default router;
