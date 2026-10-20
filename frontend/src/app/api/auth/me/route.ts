// GET /api/auth/me
//
// Returns the current user as JSON or 401 if no valid session exists.
// Cheap probe for client components that want to swap the Sign In /
// Account chip without a full page navigation.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    console.error("[auth] me failed:", e);
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}
