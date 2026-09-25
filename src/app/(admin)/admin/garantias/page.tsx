import { createClient } from "@/lib/supabase/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { GarantiasClient } from "@/components/admin/garantias/garantias-client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Garantías | Panel Admin Sekunet",
  description: "Módulo administrativo integral de garantías, RMA y control de calidad",
};

export default async function AdminGarantiasPage() {
  const supabase = createClient();

  // Verificar autenticación y rol
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email || "")
    .maybeSingle();

  const isAdmin = currentAgent?.rol === "admin" || currentAgent?.rol === "superadmin";
  const isSuperadmin = currentAgent?.rol === "superadmin";

  let initialRecords: any[] = [];
  let initialStats: any = null;

  try {
    const garantiasClient = createGarantiasServiceClient();

    // Consultar los registros de garantías
    const { data: recordsData, error: recordsError } = await garantiasClient
      .from("garantias")
      .select("*")
      .order("fecha_creacion", { ascending: false })
      .limit(1000);

    if (!recordsError && recordsData) {
      initialRecords = recordsData;
    }

    // Calcular estadísticas base para la carga rápida
    const all = initialRecords || [];
    const def = all.filter((r) => r.tipo === "salida_definitiva");
    const temp = all.filter((r) => r.tipo === "salida_temporal");
    const rma = all.filter((r) => r.tipo === "salida_temporal" || (r.categoria && r.categoria.includes("rma")));

    const marcas = Array.from(new Set(rma.map((r) => (r.marca || "").trim().toUpperCase()).filter(Boolean)));
    const porMarca = marcas.map((m) => {
      const deMarca = rma.filter((r) => (r.marca || "").trim().toUpperCase() === m);
      const resueltos = deMarca.filter(
        (r) =>
          r.estatus &&
          ["reemplazo_total", "repuesto_ingresado", "nota_credito_marca", "fuera_garantia", "compra_repuesto"].includes(
            r.estatus
          )
      );
      return {
        marca: m,
        total: deMarca.length,
        resueltos: resueltos.length,
        pendientes: deMarca.length - resueltos.length,
        promedio_dias: null,
        min_dias: null,
        max_dias: null,
      };
    });

    initialStats = {
      total: all.length,
      definitivas: def.length,
      temporales: temp.length,
      rma_total: rma.length,
      por_marca: porMarca,
    };
  } catch (err) {
    console.error("Error al cargar registros iniciales de garantías:", err);
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
      <GarantiasClient
        initialRecords={initialRecords}
        initialStats={initialStats}
        isAdmin={isAdmin}
        isSuperadmin={isSuperadmin}
      />
    </div>
  );
}
