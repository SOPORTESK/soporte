import { createClient } from "@/lib/supabase/server";
import { Package, Search, Database, Sparkles, Brain, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/avatar";
import Link from "next/link";
import { InventoryClient } from "@/components/admin/inventory-client";

export const dynamic = "force-dynamic";

const ITEMS_PER_PAGE = 50;

export default async function AdminInventarioPage({ 
  searchParams 
}: { 
  searchParams: { page?: string } 
}) {
  const supabase = createClient();
  
  // Verificar rol del usuario
  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user?.email || "")
    .single();
  
  const isAdmin = currentAgent?.rol === "admin" || currentAgent?.rol === "superadmin";
  const isSuperadmin = currentAgent?.rol === "superadmin";
  
  // Calcular página actual
  const currentPage = Math.max(1, parseInt(searchParams.page || "1", 10));
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  
  // Obtener conteo total
  const { count: totalCount } = await supabase
    .from("sek_inventario")
    .select("*", { count: "exact", head: true });
  


  // Obtener items paginados
  const { data: items } = await supabase
    .from("sek_inventario")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  // Estadísticas globales (de todos los items, no solo la página)
  const { data: allStats } = await supabase
    .from("sek_inventario")
    .select("marca, modelo, nombre, categoria, cantidad")
    .limit(10000);
    
  const totalItems = totalCount || 0;
  const totalEquipos = (allStats || []).reduce((sum, i) => sum + (i.cantidad || 0), 0);
  const categoriasUnicas = [...new Set((allStats || []).map(i => i.categoria).filter(Boolean))];
  const marcasUnicas = [...new Set((allStats || []).map(i => i.marca).filter(Boolean))];
  const statsPorMarca = Object.entries(
    (allStats || []).reduce((acc: Record<string, number>, item) => {
      const marca = item.marca || "Sin marca";
      acc[marca] = (acc[marca] || 0) + 1;
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));
  
  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
  
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

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

      {/* Tabla de Inventario con Paginación */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Mostrando {items?.length || 0} de {formatNumber(totalItems)} artículos
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
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
            />
            
            {/* Controles de Paginación */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-border bg-muted/30 flex items-center justify-between">
                <Link
                  href={`/admin/inventario?page=${Math.max(1, currentPage - 1)}`}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === 1 
                      ? "pointer-events-none opacity-50 text-muted-foreground" 
                      : "bg-brand-700 text-white hover:bg-brand-800"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Link>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <Link
                        key={pageNum}
                        href={`/admin/inventario?page=${pageNum}`}
                        className={`w-8 h-8 rounded-lg text-sm font-medium flex items-center justify-center transition-colors ${
                          currentPage === pageNum
                            ? "bg-brand-700 text-white"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {pageNum}
                      </Link>
                    );
                  })}
                  {totalPages > 5 && (
                    <>
                      <span className="text-muted-foreground px-1">...</span>
                      <Link
                        href={`/admin/inventario?page=${totalPages}`}
                        className="w-8 h-8 rounded-lg text-sm font-medium flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                      >
                        {totalPages}
                      </Link>
                    </>
                  )}
                </div>
                
                <Link
                  href={`/admin/inventario?page=${Math.min(totalPages, currentPage + 1)}`}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === totalPages 
                      ? "pointer-events-none opacity-50 text-muted-foreground" 
                      : "bg-brand-700 text-white hover:bg-brand-800"
                  }`}
                >
                  Siguiente <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
