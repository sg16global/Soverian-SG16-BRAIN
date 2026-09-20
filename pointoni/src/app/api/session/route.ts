import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "sg16_auth";

export async function GET() {
  return NextResponse.json({ authenticated: true });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { state?: string };
  const res = NextResponse.json({ ok: true, state: body.state });
  if (body.state === "out") {
    res.cookies.set(COOKIE, "out", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    res.cookies.set(COOKIE, "in", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
