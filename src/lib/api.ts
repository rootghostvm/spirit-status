import { NextResponse } from "next/server";

/** Map store/R2 failures to a JSON admin API response. */
export function adminErrorResponse(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback;
  const status = /persist|storage|R2|flush/i.test(message) ? 503 : 400;
  return NextResponse.json({ error: message }, { status });
}
