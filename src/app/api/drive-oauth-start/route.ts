import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-drive";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authUrl = getAuthUrl();
  return NextResponse.redirect(authUrl);
}
