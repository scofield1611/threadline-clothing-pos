import { prisma } from "../config/prisma.js";

// Fire-and-forget style logger (awaited, but never throws) so an audit-log
// failure never blocks the actual business operation that triggered it.
export async function logActivity({ action, entity, entityId, details, userId }) {
  try {
    await prisma.activityLog.create({
      data: { action, entity, entityId, details, userId },
    });
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}
