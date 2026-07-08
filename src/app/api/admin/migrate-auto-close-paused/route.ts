import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verificar si el campo existe
    const { data: testData, error: testError } = await supabaseAdmin
      .from('sek_cases')
      .select('auto_close_paused')
      .limit(1);

    if (!testError) {
      // El campo ya existe
      return NextResponse.json({ success: true, message: "Campo auto_close_paused ya existe" });
    }

    // El campo no existe, necesitamos agregarlo
    // Usamos el endpoint de Supabase para ejecutar SQL directo
    const sqlUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    const sqlStatements = [
      `ALTER TABLE sek_cases ADD COLUMN IF NOT EXISTS auto_close_paused BOOLEAN DEFAULT FALSE;`,
      `CREATE INDEX IF NOT EXISTS idx_sek_cases_auto_close_paused ON sek_cases(auto_close_paused);`
    ];

    const results = [];
    for (const sql of sqlStatements) {
      const response = await fetch(`${sqlUrl}rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ sql })
      });

      if (!response.ok) {
        const text = await response.text();
        // Ignorar error si es "already exists"
        if (!text.includes('already exists') && !text.includes('duplicate')) {
          results.push({ sql, error: text });
        }
      } else {
        results.push({ sql, success: true });
      }
    }

    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Campo auto_close_paused agregado correctamente" });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
