import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across the app (and across hot reloads in dev)
// to avoid exhausting Postgres connections.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
