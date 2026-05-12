import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const target = searchParams.get("to");
  const returnUrl = searchParams.get("returnUrl");
  const agentName = searchParams.get("name") || "";

  if (!target) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Una sola respuesta: borra cookies de sesión actual Y redirige al magic link
  const res = NextResponse.redirect(target);

  // Borrar todas las cookies de sesión de Supabase
  req.cookies.getAll().forEach(({ name }) => {
    if (name.includes("supabase") || name.startsWith("sb-")) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  });

  // Guardar returnUrl y nombre en cookies accesibles por el cliente para el banner
  if (returnUrl) {
    res.cookies.set("sek_return_url", returnUrl, { path: "/", maxAge: 60 * 60 * 8 });
  }
  if (agentName) {
    res.cookies.set("sek_impersonating", agentName, { path: "/", maxAge: 60 * 60 * 8 });
  }

  return res;
}
