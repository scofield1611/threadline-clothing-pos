import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // express.json() throws a SyntaxError before any route handler runs when
  // the request body isn't valid JSON — without this branch it fell
  // through to the generic 500 below, which is the wrong status code for
  // "the client sent us garbage."
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: { message: "Request body is not valid JSON" } });
  }

  // Zod validation errors -> 400 with field-level details
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: "Validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }

  // Known Prisma errors -> friendly messages instead of raw stack traces
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: { message: `A record with this ${err.meta?.target?.join(", ") || "value"} already exists` },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { message: "Record not found" } });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: { message: "This record is referenced elsewhere and can't be modified" } });
    }
  }

  // Our own thrown ApiError instances
  if (err.isApiError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  console.error(err);
  return res.status(500).json({ error: { message: "Something went wrong on our end" } });
}
