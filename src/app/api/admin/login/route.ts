import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { assertProductionSecrets } from "@/lib/config";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function allowLogin(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    assertProductionSecrets();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server auth is misconfigured",
      },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  if (!allowLogin(key)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;

  if (!body?.password || !verifyPassword(body.password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  loginAttempts.delete(key);

  const response = NextResponse.json({ ok: true });
  const forwardedProto = request.headers.get("x-forwarded-proto");
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" || forwardedProto === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
