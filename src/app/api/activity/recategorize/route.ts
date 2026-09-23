import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return NextResponse.json({
    message: "La recategorización obsoleta ha sido deshabilitada para proteger el árbol oficial de categorías operativas.",
    updated: 0,
  });
}
