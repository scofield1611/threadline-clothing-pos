import { Router } from "express";
import { makeSimpleEntityController } from "../controllers/simpleEntityController.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

// Shared route builder for Category and Brand — both are simple
// { id, name, isActive } lookup tables used by the product form.
function buildRouter(modelName, entityLabel) {
  const router = Router();
  const c = makeSimpleEntityController(modelName, entityLabel);

  router.use(requireAuth);
  router.get("/", c.list);
  router.post("/", requireRole("OWNER", "MANAGER"), c.create);
  router.patch("/:id", requireRole("OWNER", "MANAGER"), c.update);
  router.delete("/:id", requireRole("OWNER", "MANAGER"), c.remove);

  return router;
}

export const categoryRouter = buildRouter("category", "Category");
export const brandRouter = buildRouter("brand", "Brand");
