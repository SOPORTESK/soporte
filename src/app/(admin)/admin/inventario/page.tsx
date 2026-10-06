import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Package, Search, Database, Sparkles, Brain, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/avatar";
import Link from "next/link";
import { InventoryClient } from "@/components/admin/inventory-client";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";

export const dynamic = "force-dynamic";

export default async function AdminInventarioPage() {
  const supabase = createClient();
  
  // Verificar rol del usuario
  const { user } = await getUserWithTimeout(supabase);
  const email = user?.email || "";

  const { data: currentAgent } = await queryWithFallback(
    `agent_config_${email}`,
    async () => {
      const { data, error } = await supabase
        .from("sek_agent_config")
        .select("rol")
        .ilike("email", email)
        .maybeSingle();
      return { data, error };
    },
    { rol: "admin" },
    60000
  );
  
  const isAdmin = currentAgent?.rol === "admin" || currentAgent?.rol === "superadmin";
  const isSuperadmin = currentAgent?.rol === "superadmin";
  
  // Obtener items de inventario con paginación completa y cliente de servicio (sin límite de RLS)
  const { data: items } = await queryWithFallback(
    "admin_inventario_items_full_v2",
    async () => {
      const sb = createServiceClient();
      const all: any[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await sb
          .from("sek_inventario")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + 999);
        if (error) {
          console.error("[inventario] Error paginando en offset", offset, error.message);
          return { data: all, error };
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
      // Deduplicar estrictamente por ID para evitar colisiones en paginación
      const seen = new Set<string>();
      const unique = all.filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      return { data: unique, error: null };
    },
    [],
    60000
  );

  const allItems = items || [];
  const totalItems = allItems.length;
  const totalEquipos = allItems.reduce((sum: number, i: any) => sum + (i.cantidad || 0), 0);
  const categoriasUnicas = Array.from(new Set(allItems.map((i: any) => (i.categoria || "").trim()).filter(Boolean))).sort();
  
  // Normalizar marcas para evitar colisiones de mayúsculas/minúsculas
  const brandCountMap = allItems.reduce((acc: Record<string, number>, item: any) => {
    const marca = (item.marca || "GENÉRICO").trim().toUpperCase();
    acc[marca] = (acc[marca] || 0) + 1;
    return acc;
  }, {});

  const statsPorMarca = Object.entries(brandCountMap).sort(([a], [b]) => a.localeCompare(b));
  const marcasUnicas = statsPorMarca.map(([marca]) => marca);
  
  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-8">
      {/* Header */}
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Gestión</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <Package className="h-7 w-7" /> Inventario Inteligente
        </h1>
        <p className="text-muted-foreground mt-1">
          Base de equipos con búsqueda fuzzy para el agente IA. El Asistente Virtual consulta aquí para diagnósticos.
          <span className="block mt-1 text-brand-700">Total: {formatNumber(totalItems)} artículos</span>
        </p>
      </header>

      {/* Stats Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Items</p>
              <p className="text-3xl font-bold mt-2">{formatNumber(totalItems)}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 grid place-items-center">
              <Database className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Existencias</p>
              <p className="text-3xl font-bold mt-2">{formatNumber(totalEquipos)}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 grid place-items-center">
              <Package className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categorías</p>
              <p className="text-3xl font-bold mt-2">{categoriasUnicas.length}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 grid place-items-center">
              <Filter className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Marcas</p>
              <p className="text-3xl font-bold mt-2">{marcasUnicas.length}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Tabla de Inventario */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Base de Conocimiento
            </span>
          </div>
        </div>
        
        {(!items || items.length === 0) ? (
          <div className="p-12 text-center text-muted-foreground">
            Sin items en inventario.
          </div>
        ) : (
          <>
            <InventoryClient 
              items={items || []} 
              statsPorMarca={statsPorMarca}
              totalModelos={totalItems}
              isAdmin={isAdmin} 
              isSuperadmin={isSuperadmin}
              categorias={categoriasUnicas}
            />
            
          </>
        )}
      </section>
    </div>
  );
}
