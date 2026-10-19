import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ds_ws";

/** Gives each visitor an anonymous workspace id on their first request. */
export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const id = crypto.randomUUID();
  // Make the new cookie visible to this same request, then send it to the browser.
  req.cookies.set(COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}

export const config = {
  // Pages and the app's own API; not static files, the public REST endpoint or the cron job.
  matcher: ["/((?!_next/|samples/|favicon|icon|api/extract|api/cron).*)"],
};
