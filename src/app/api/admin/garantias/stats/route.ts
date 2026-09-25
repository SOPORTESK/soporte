import { NextRequest, NextResponse } from "next/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTATUS_CERRADOS = ['reemplazo_total', 'repuesto_ingresado', 'nota_credito_marca', 'fuera_garantia', 'compra_repuesto'];
const ESTATUS_ABIERTOS = ['en_proceso', 'pendiente_tramite'];

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const client = createGarantiasServiceClient();
    const { data: allRecords, error } = await client
      .from("garantias")
      .select("*")
      .order("fecha_creacion", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const records = allRecords || [];
    const total = records.length;
    const defCount = records.filter(r => r.tipo === "salida_definitiva").length;
    const tempCount = records.filter(r => r.tipo === "salida_temporal").length;

    // RMA pool: salidas temporales (sin excluir) + cualquier registro con datos RMA
    const limpio = (v: any) => v ? v.toString().trim().replace(/^[\-\s—–]+$/, '') : '';
    const rmaRecords = records.filter(r => {
      if (r.excluir_rma) return false;
      const esCat = (r.categoria || '').toLowerCase().includes('rma');
      const tieneDatos = limpio(r.ticket_rma) !== '' || limpio(r.fecha_rma) !== '' || limpio(r.serie_fabrica) !== '' || limpio(r.estatus) !== '';
      return r.tipo === 'salida_temporal' || esCat || tieneDatos;
    });

    const rmaTotal = rmaRecords.length;
    const rmaEnProceso = rmaRecords.filter(r => r.estatus === "en_proceso").length;
    const rmaPendientes = rmaRecords.filter(r => r.estatus === "pendiente_tramite" || !r.estatus).length;
    const rmaResueltos = rmaRecords.filter(r => r.estatus && ESTATUS_CERRADOS.includes(r.estatus)).length;
    const tasaResolucion = rmaTotal > 0 ? Math.round((rmaResueltos / rmaTotal) * 100) : 0;

    // Casos NC sin DEV
    const ncSinDev = records.filter(r => {
      const cat = String(r.categoria || "").toLowerCase();
      const esNC = cat.includes("nota_credito");
      const tieneDev = limpio(r.dev) !== "" || limpio(r.fecha_dev) !== "";
      return esNC && !tieneDev;
    });

    // Desglose por Marcas
    const marcasMap: Record<string, { total: number; enProceso: number; pendientes: number; resueltos: number; dias: number[] }> = {};
    for (const r of rmaRecords) {
      const m = (r.marca || "Sin Marca").trim().toUpperCase();
      if (!marcasMap[m]) {
        marcasMap[m] = { total: 0, enProceso: 0, pendientes: 0, resueltos: 0, dias: [] };
      }
      marcasMap[m].total++;
      if (r.estatus === "en_proceso") marcasMap[m].enProceso++;
      else if (r.estatus === "pendiente_tramite" || !r.estatus) marcasMap[m].pendientes++;
      else if (r.estatus && ESTATUS_CERRADOS.includes(r.estatus)) {
        marcasMap[m].resueltos++;
        if (r.fecha_creacion && r.fecha_modificacion) {
          const d = Math.round((new Date(r.fecha_modificacion).getTime() - new Date(r.fecha_creacion).getTime()) / 86400000);
          if (d >= 0) marcasMap[m].dias.push(d);
        }
      }
    }

    const marcasStats = Object.entries(marcasMap).map(([marca, st]) => {
      const avgDias = st.dias.length > 0 ? (st.dias.reduce((a, b) => a + b, 0) / st.dias.length).toFixed(1) : "-";
      const minDias = st.dias.length > 0 ? Math.min(...st.dias) : "-";
      const maxDias = st.dias.length > 0 ? Math.max(...st.dias) : "-";
      const tasa = st.total > 0 ? Math.round((st.resueltos / st.total) * 100) : 0;
      return {
        marca,
        total: st.total,
        enProceso: st.enProceso,
        pendientes: st.pendientes,
        resueltos: st.resueltos,
        tasa,
        avgDias,
        minDias,
        maxDias
      };
    }).sort((a, b) => b.total - a.total);

    // Casos críticos (> 14d y > 30d abiertos)
    const now = Date.now();
    const casosCriticos = rmaRecords.filter(r => {
      const esCerrado = r.estatus && ESTATUS_CERRADOS.includes(r.estatus);
      if (esCerrado) return false;
      const f = r.fecha_rma || r.fecha_creacion;
      if (!f) return false;
      const diasAbierto = Math.floor((now - new Date(f).getTime()) / 86400000);
      return diasAbierto > 14;
    }).map(r => {
      const f = r.fecha_rma || r.fecha_creacion;
      const dias = Math.floor((now - new Date(f!).getTime()) / 86400000);
      return {
        ...r,
        diasAbierto: dias,
        nivel: dias > 30 ? "critico" : "advertencia"
      };
    }).sort((a, b) => b.diasAbierto - a.diasAbierto);

    return NextResponse.json({
      total,
      defCount,
      tempCount,
      rmaTotal,
      rmaEnProceso,
      rmaPendientes,
      rmaResueltos,
      tasaResolucion,
      ncSinDevTotal: ncSinDev.length,
      ncSinDevList: ncSinDev,
      marcasStats,
      casosCriticos
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al calcular estadísticas" }, { status: 500 });
  }
}
