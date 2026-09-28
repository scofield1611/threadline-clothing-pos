import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { logActivity } from "../services/activityLogService.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["OWNER", "MANAGER", "CASHIER"]).default("CASHIER"),
});

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function login(req, res) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw ApiError.unauthorized("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized("Invalid email or password");

  const token = signToken(user);
  await logActivity({ action: "LOGIN", entity: "User", entityId: user.id, userId: user.id });

  res.json({ token, user: publicUser(user) });
}

export async function me(req, res) {
  res.json({ user: req.user });
}

// Only an OWNER or MANAGER can provision new staff accounts.
export async function createUser(req, res) {
  const data = createUserSchema.parse(req.body);

  if (data.role === "OWNER" && req.user.role !== "OWNER") {
    throw ApiError.forbidden("Only an owner can create another owner account");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash, role: data.role },
  });

  await logActivity({
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    userId: req.user.id,
    details: { role: user.role },
  });

  res.status(201).json({ user: publicUser(user) });
}

export async function listUsers(req, res) {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
}
