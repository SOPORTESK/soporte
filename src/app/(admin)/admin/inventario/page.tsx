import { createClient } from "@/lib/supabase/server";
import { Package } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminInventarioPage() {
  const supabase = createClient();
  const { data } = await supabase.from("sek_inventario").select("*").order("created_at", { ascending: false }).limit(500);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Gestión</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <Package className="h-7 w-7" /> Inventario
        </h1>
        <p className="text-muted-foreground mt-1">Equipos y materiales disponibles.</p>
      </header>

      {(!data || data.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground bg-card">
          Sin items en inventario.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-semibold">Código</th>
                <th className="p-3 font-semibold">Nombre</th>
                <th className="p-3 font-semibold">Categoría</th>
                <th className="p-3 font-semibold">Marca / Modelo</th>
                <th className="p-3 font-semibold text-right">Cantidad</th>
                <th className="p-3 font-semibold">Ubicación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((i: any) => (
                <tr key={i.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono text-xs">{i.codigo}</td>
                  <td className="p-3 font-medium">{i.nombre}</td>
                  <td className="p-3 text-muted-foreground">{i.categoria || "—"}</td>
                  <td className="p-3 text-muted-foreground">{[i.marca, i.modelo].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{i.cantidad ?? 0}</td>
                  <td className="p-3 text-muted-foreground">{i.ubicacion || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
