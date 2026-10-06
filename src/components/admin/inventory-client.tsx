"use client";

import { useState, useMemo, useEffect } from "react";
import { Edit2, Trash2, Plus, X, Save, Search, Upload, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Badge } from "@/components/ui/avatar";

interface InventoryItem {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  marca: string | null;
  modelo: string | null;
  cantidad: number | null;
  ubicacion: string | null;
}

interface InventoryClientProps {
  items: InventoryItem[];
  statsPorMarca: Array<[string, number]>;
  totalModelos: number;
  isAdmin: boolean;
  isSuperadmin: boolean;
  categorias?: string[];
}

export function InventoryClient({ items, statsPorMarca, totalModelos, isAdmin, isSuperadmin, categorias = [] }: InventoryClientProps) {
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);

  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Resetear a página 1 cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBrand, selectedCategory, searchTerm, pageSize]);

  // Ordenar items determinísticamente por marca -> modelo -> nombre
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const marcaA = (a.marca || "GENÉRICO").trim().toUpperCase();
      const marcaB = (b.marca || "GENÉRICO").trim().toUpperCase();
      if (marcaA !== marcaB) return marcaA.localeCompare(marcaB);
      const modA = (a.modelo || "").trim().toUpperCase();
      const modB = (b.modelo || "").trim().toUpperCase();
      if (modA !== modB) return modA.localeCompare(modB);
      return (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    const brand = selectedBrand.trim().toUpperCase();
    const cat = selectedCategory.trim();
    const term = searchTerm.trim().toLowerCase();

    return sortedItems.filter((i) => {
      if (brand !== "ALL") {
        const itemBrand = (i.marca || "GENÉRICO").trim().toUpperCase();
        if (itemBrand !== brand) {
          return false;
        }
      }
      if (cat !== "all" && (i.categoria || "").trim() !== cat) {
        return false;
      }
      if (term) {
        const matches =
          (i.marca?.toLowerCase() || "").includes(term) ||
          (i.modelo?.toLowerCase() || "").includes(term) ||
          (i.nombre?.toLowerCase() || "").includes(term) ||
          (i.categoria?.toLowerCase() || "").includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [sortedItems, searchTerm, selectedBrand, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredItems.length);
  const paginatedItems = useMemo(() => {
    const slice = filteredItems.slice(startIndex, endIndex);
    if (selectedBrand.trim().toUpperCase() !== "ALL") {
      const targetBrand = selectedBrand.trim().toUpperCase();
      return slice.filter((i) => (i.marca || "GENÉRICO").trim().toUpperCase() === targetBrand);
    }
    return slice;
  }, [filteredItems, startIndex, endIndex, selectedBrand]);

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData(item);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({
      codigo: "",
      nombre: "",
      categoria: "",
      marca: "",
      modelo: "",
      cantidad: 0,
      ubicacion: ""
    });
  };

  const handleSave = async () => {
    // Aquí iría la llamada a la API
    alert(`Guardando: ${JSON.stringify(formData)}`);
    setEditingItem(null);
    setIsCreating(false);
    // Recargar la página para ver cambios
    window.location.reload();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este item?")) return;
    
    try {
      const res = await fetch(`/api/admin/inventario?id=${id}`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        alert("Item eliminado");
        window.location.reload();
      } else {
        alert("Error al eliminar");
      }
    } catch (error) {
      alert("Error de conexión");
    }
  };

  const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/admin/inventario/upload", {
        method: "POST",
        body: formData
      });
      
      if (res.ok) {
        const result = await res.json();
        alert(`Inventario actualizado: ${result.message}`);
        window.location.reload();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (err) {
      alert("Error de conexión");
    }
    setIsUploading(false);
  };

  return (
    <>
    {/* Estadísticas por Marca - Grid interactivo */}
      <div className="mb-4 p-4 rounded-xl border border-border bg-muted/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Modelos por Marca</p>
            {selectedBrand !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-violet-600 text-white shadow-sm">
                Filtrando: {selectedBrand}
                <button
                  type="button"
                  onClick={() => { setSelectedBrand("all"); setCurrentPage(1); }}
                  className="hover:opacity-75 font-bold"
                  title="Quitar filtro de marca"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">
              {statsPorMarca.length} marcas · {new Intl.NumberFormat('en-US').format(totalModelos)} modelos
            </span>
            {(selectedBrand !== "all" || selectedCategory !== "all") && (
              <button
                type="button"
                onClick={() => { setSelectedBrand("all"); setSelectedCategory("all"); setCurrentPage(1); }}
                className="text-xs text-violet-400 hover:underline font-semibold"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-40 overflow-y-auto pr-1">
          {statsPorMarca.map(([marca, count]) => {
            const isSelected = selectedBrand.toUpperCase() === marca.toUpperCase();
            return (
              <button
                type="button"
                key={marca}
                onClick={() => {
                  setSelectedBrand(isSelected ? "all" : marca);
                  setCurrentPage(1);
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-violet-600 text-white border-violet-500 shadow-md ring-2 ring-violet-400/50 font-bold"
                    : "bg-card border-border hover:bg-muted text-foreground"
                }`}
              >
                <span className="truncate" title={marca}>{marca}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de Categorías (Pills) */}
      {categorias.length > 0 && (
        <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-colors ${
              selectedCategory === "all"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Todas ({items.length})
          </button>
          {categorias.map((cat) => {
            const count = items.filter((i) => i.categoria === cat).length;
            const isSel = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSel ? "all" : cat)}
                className={`px-3 py-1.5 rounded-lg font-medium shrink-0 transition-colors ${
                  isSel
                    ? "bg-violet-600 text-white shadow-sm font-bold"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {cat} <span className="opacity-70 ml-1">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Controles: Búsqueda + Upload + Agregar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por marca, modelo, categoría o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        {(isAdmin || isSuperadmin) && (
          <>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors cursor-pointer">
              <Upload className="h-4 w-4" />
              {isUploading ? "Subiendo..." : "Subir Excel"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { setIsUploading(true); handleFileUpload(e); }}
              />
            </label>
            <button 
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </>
        )}
      </div>

      {/* Tabla con scroll contenido y cabecera fija */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/90 backdrop-blur sticky top-0 z-10 text-left border-b border-border shadow-xs">
              <tr>
                <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Marca</th>
                <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Modelo</th>
                <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Categoría</th>
                <th className="p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedItems.map((i, idx) => (
                <tr key={`${i.id}-${i.modelo || ''}-${startIndex + idx}`} className="hover:bg-muted/40 transition-colors">
                  <td className="p-3 font-bold text-foreground whitespace-nowrap">{i.marca || "—"}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs whitespace-nowrap">{i.modelo || "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                      {i.categoria || "Sin categoría"}
                    </span>
                  </td>
                  <td className="p-3 font-medium truncate max-w-md lg:max-w-2xl text-foreground/90" title={i.nombre}>
                    {i.nombre}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginación */}
        {filteredItems.length > 0 && (
          <div className="p-3 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>
                Mostrando <strong className="text-foreground">{startIndex + 1}</strong> - <strong className="text-foreground">{endIndex}</strong> de <strong className="text-foreground">{new Intl.NumberFormat('en-US').format(filteredItems.length)}</strong> modelos
              </span>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1.5">
                <span>Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground cursor-pointer"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safePage <= 1}
                className="p-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                title="Primera página"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>
              <span className="px-2 font-mono text-muted-foreground">
                Pág. <strong className="text-foreground">{safePage}</strong> de <strong className="text-foreground">{totalPages}</strong>
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage >= totalPages}
                className="p-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                title="Última página"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {filteredItems.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No se encontraron resultados para los filtros seleccionados.
          </div>
        )}
      </div>

      {/* Modal Editar/Crear */}
      {(editingItem || isCreating) && (
        <Modal 
          title={isCreating ? "Agregar Item" : "Editar Item"}
          onClose={() => { setEditingItem(null); setIsCreating(false); }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Código</label>
              <input
                type="text"
                value={formData.codigo || ""}
                onChange={(e) => setFormData({...formData, codigo: e.target.value})}
                className="w-full p-2 rounded-lg border border-border bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nombre</label>
              <input
                type="text"
                value={formData.nombre || ""}
                onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                className="w-full p-2 rounded-lg border border-border bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Categoría</label>
              <input
                type="text"
                value={formData.categoria || ""}
                onChange={(e) => setFormData({...formData, categoria: e.target.value})}
                className="w-full p-2 rounded-lg border border-border bg-background"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Marca</label>
                <input
                  type="text"
                  value={formData.marca || ""}
                  onChange={(e) => setFormData({...formData, marca: e.target.value})}
                  className="w-full p-2 rounded-lg border border-border bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Modelo</label>
                <input
                  type="text"
                  value={formData.modelo || ""}
                  onChange={(e) => setFormData({...formData, modelo: e.target.value})}
                  className="w-full p-2 rounded-lg border border-border bg-background"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Cantidad</label>
                <input
                  type="number"
                  value={formData.cantidad || 0}
                  onChange={(e) => setFormData({...formData, cantidad: parseInt(e.target.value)})}
                  className="w-full p-2 rounded-lg border border-border bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ubicación</label>
                <input
                  type="text"
                  value={formData.ubicacion || ""}
                  onChange={(e) => setFormData({...formData, ubicacion: e.target.value})}
                  className="w-full p-2 rounded-lg border border-border bg-background"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSave}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
              >
                <Save className="h-4 w-4" /> Guardar
              </button>
              <button
                onClick={() => { setEditingItem(null); setIsCreating(false); }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
