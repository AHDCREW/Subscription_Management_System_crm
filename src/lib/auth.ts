import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { db } from "@/lib/db";

const SESSION_COOKIE = "subflow_session";
const SESSION_DAYS = 7;

export type SessionUser = Pick<User, "id" | "name" | "email" | "role" | "company">;

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// The cookie holds a random token; MySQL only stores its SHA-256 hash.
export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true, company: true, approvedAt: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  // A customer still waiting for approval counts as signed out everywhere,
  // even if a session exists, so the portal and every role guard block them.
  const { approvedAt, ...user } = session.user;
  if (!isApproved({ role: user.role, approvedAt })) return null;
  return user;
}

// Team accounts are always approved. Customers who sign up themselves wait
// until an admin or staff member approves them.
export function isApproved(user: Pick<User, "role" | "approvedAt">) {
  return user.role !== "CUSTOMER" || user.approvedAt !== null;
}

// Use at the top of every page and server action. Redirects to /login when
// signed out, and to the user's home when their role is not allowed.
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // ?denied=1 lets the home page explain the redirect (see AccessDeniedNotice).
  if (roles && !roles.includes(user.role)) redirect(`${homeFor(user.role)}?denied=1`);
  return user;
}

export const requireAdmin = () => requireUser(["ADMIN"]);
export const requireTeam = () => requireUser(["ADMIN", "STAFF"]);
export const requireCustomer = () => requireUser(["CUSTOMER"]);

export function homeFor(role: Role) {
  return role === "CUSTOMER" ? "/portal" : "/dashboard";
}
