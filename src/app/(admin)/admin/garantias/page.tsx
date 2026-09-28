import { createClient } from "@/lib/supabase/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { GarantiasClient } from "@/components/admin/garantias/garantias-client";
import { redirect } from "next/navigation";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Garantías | Panel Admin Sekunet",
  description: "Módulo administrativo integral de garantías, RMA y control de calidad",
};

export default async function AdminGarantiasPage() {
  const supabase = createClient();

  // Verificar autenticación y rol de manera ultra-rápida (con cache de token en memoria)
  const { user } = await getUserWithTimeout(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: currentAgent } = await queryWithFallback(
    `agent_config_${user.email || ""}`,
    async () => {
      const { data, error } = await supabase
        .from("sek_agent_config")
        .select("nombre, apellido, rol")
        .ilike("email", user.email || "")
        .maybeSingle();
      return { data, error };
    },
    null,
    60000
  );

  const currentUser = {
    email: user.email || "",
    nombre: currentAgent?.nombre || "",
    apellido: currentAgent?.apellido || "",
  };

  const isAdmin = currentAgent?.rol === "admin" || currentAgent?.rol === "superadmin";
  const isSuperadmin = currentAgent?.rol === "superadmin";

  let initialRecords: any[] = [];
  let initialStats: any = null;

  try {
    const garantiasClient = createGarantiasServiceClient();

    // Consultar los registros de garantías con cache de alta velocidad (20s TTL)
    const { data: recordsData } = await queryWithFallback(
      "admin_garantias_records",
      async () => {
        const { data, error } = await garantiasClient
          .from("garantias")
          .select("*")
          .order("fecha_creacion", { ascending: false })
          .limit(1000);
        return { data, error };
      },
      [],
      20000 // 20s TTL para navegación instantánea
    );

    if (recordsData && Array.isArray(recordsData)) {
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
        currentUser={currentUser}
        isAdmin={isAdmin}
        isSuperadmin={isSuperadmin}
      />
    </div>
  );
}
