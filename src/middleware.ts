import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.*\\.json|sw.*\\.js|widget-standalone\\.html|api/webhooks(?:/.*)?|test-whatsapp(?:/.*)?|api/test(?:/.*)?|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
