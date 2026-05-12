"use client";

import { useState, useMemo } from "react";
import { Edit2, Trash2, Plus, X, Save, Search, Upload } from "lucide-react";
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
}

export function InventoryClient({ items, statsPorMarca, totalModelos, isAdmin, isSuperadmin }: InventoryClientProps) {
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Ordenar items por marca alfabéticamente
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const marcaA = (a.marca || "").toLowerCase();
      const marcaB = (b.marca || "").toLowerCase();
      if (marcaA < marcaB) return -1;
      if (marcaA > marcaB) return 1;
      return 0;
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return sortedItems;
    const term = searchTerm.toLowerCase();
    return sortedItems.filter(i => 
      (i.marca?.toLowerCase() || "").includes(term) ||
      (i.modelo?.toLowerCase() || "").includes(term) ||
      (i.nombre?.toLowerCase() || "").includes(term)
    );
  }, [sortedItems, searchTerm]);

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
    {/* Estadísticas por Marca - Grid compacto para 37 marcas */}
      <div className="mb-4 p-4 rounded-xl border border-border bg-muted/30">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modelos por Marca</p>
          <span className="text-xs text-muted-foreground">{statsPorMarca.length} marcas · {new Intl.NumberFormat('en-US').format(totalModelos)} modelos</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-32 overflow-y-auto">
          {statsPorMarca.map(([marca, count]) => (
            <div key={marca} className="flex items-center justify-between px-2 py-1.5 rounded bg-card border border-border text-xs">
              <span className="font-medium truncate" title={marca}>{marca}</span>
              <span className="text-muted-foreground bg-muted px-1 rounded text-[10px]">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controles: Búsqueda + Upload + Agregar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por marca, modelo o descripción..."
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

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-semibold">Marca</th>
              <th className="p-3 font-semibold">Modelo</th>
              <th className="p-3 font-semibold">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((i) => (
              <tr key={i.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-3 text-muted-foreground whitespace-nowrap">{i.marca || "—"}</td>
                <td className="p-3 text-muted-foreground font-mono text-xs whitespace-nowrap">{i.modelo || "—"}</td>
                <td className="p-3 font-medium truncate max-w-md lg:max-w-2xl" title={i.nombre}>{i.nombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
