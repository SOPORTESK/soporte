import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith("/login");
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/widget") ||
    pathname.startsWith("/api/widget") ||
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/admin/impersonate/go") ||
    pathname.startsWith("/api/");

  if (isPublic) {
    return NextResponse.next();
  }

  // Comprobar presencia de cookie de sesión de Supabase de forma instantánea (0ms)
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.includes("auth-token") && c.value && c.value !== "[]" && c.value !== '""'
  );

  if (!hasAuthCookie && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
