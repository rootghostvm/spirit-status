import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getAdminPassword, getAdminSecret } from "./config";

export const SESSION_COOKIE = "spirit_admin_session";

export function createSessionToken() {
  return createHmac("sha256", getAdminSecret())
    .update(`admin:${getAdminPassword()}`)
    .digest("hex");
}

export function verifyPassword(password: string) {
  const expected = getAdminPassword();
  const a = Buffer.from(password.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isValidSessionToken(token: string | undefined | null) {
  if (!token) return false;
  const expected = createSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return isValidSessionToken(token);
}
