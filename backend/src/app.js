import "express-async-errors"; // must be imported before routes are registered
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import { categoryRouter, brandRouter } from "./routes/catalogRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import saleRoutes from "./routes/saleRoutes.js";
import returnRoutes from "./routes/returnRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import activityLogRoutes from "./routes/activityLogRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

// Strict limiter for auth endpoints — this is the actual brute-force
// defense; login has no other protection against a script trying
// thousands of passwords per minute against a known email.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many attempts. Please wait a minute and try again." } },
});

// Looser general limiter for the rest of the API — mainly a backstop
// against runaway clients/scripts, not meant to constrain normal POS usage.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp() {
  const app = express();

  app.use(helmet());

  // CORS + credentials cannot use a wildcard origin per spec — browsers
  // reject that combination outright. In production CLIENT_ORIGIN is
  // required (enforced at boot by assertRequiredEnv); in development we
  // fall back to the Vite dev server's default origin instead of "*" so
  // the credentialed requests this app actually makes still work.
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      credentials: true,
    })
  );

  app.use(express.json({ limit: "5mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use("/api", apiLimiter);
  app.use("/api/auth", authLimiter);

  app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/categories", categoryRouter);
  app.use("/api/brands", brandRouter);
  app.use("/api/suppliers", supplierRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/purchases", purchaseRoutes);
  app.use("/api/sales", saleRoutes);
  app.use("/api/returns", returnRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/activity-logs", activityLogRoutes);
  app.use("/api/settings", settingsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
