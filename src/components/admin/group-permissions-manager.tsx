"use client";

import * as React from "react";
import { 
  Shield, Plus, Trash2, Save, 
  MessageSquare, BarChart3, Package, BookOpen, Bot,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  permissions: {
    inbox: {
      view: boolean;
      viewAll: boolean;
      reply: boolean;
      reassign: boolean;
      internalNotes: boolean;
      closeCase: boolean;
      delete?: boolean;
    };
    stats: {
      view: boolean;
      viewSLA: boolean;
      viewVolume: boolean;
      export: boolean;
    };
    inventory: {
      view: boolean;
      create: boolean;
      edit: boolean;
      delete: boolean;
    };
    manuals: {
      view: boolean;
      upload: boolean;
      delete: boolean;
    };
    ai: {
      view: boolean;
      toggleMode: boolean;
      train: boolean;
      restorePrompt: boolean;
    };
    settings: {
      view: boolean;
      manageChannels: boolean;
      qrConnect: boolean;
      dangerZone: boolean;
    };
  };
}

export function GroupPermissionsManager({ isSuperadmin }: { isSuperadmin?: boolean }) {
  const [groups, setGroups] = React.useState<PermissionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>("admin");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Modal para nuevo grupo
  const [isCreating, setIsCreating] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState("");
  const [newGroupDesc, setNewGroupDesc] = React.useState("");

  const loadGroups = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/permission-groups");
      if (!res.ok) throw new Error("Error al cargar grupos");
      const data = await res.json();
      if (data.groups && Array.isArray(data.groups)) {
        setGroups(data.groups);
        if (!selectedGroupId && data.groups[0]) {
          setSelectedGroupId(data.groups[0].id);
        }
      }
    } catch (e: any) {
      toast.error("Error cargando grupos", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId]);

  React.useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || groups[0];

  function togglePerm(module: keyof PermissionGroup["permissions"], permKey: string) {
    if (!selectedGroup) return;
    if (selectedGroup.id === "superadmin" && !isSuperadmin) {
      toast.warning("El grupo Superadmin tiene permisos totales fijos");
      return;
    }

    setGroups(prev => prev.map(g => {
      if (g.id !== selectedGroup.id) return g;
      const mod = { ...g.permissions[module] } as any;
      mod[permKey] = !mod[permKey];
      return {
        ...g,
        permissions: {
          ...g.permissions,
          [module]: mod,
        },
      };
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/permission-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!res.ok) throw new Error("Error al guardar cambios");
      toast.success("Permisos de grupos actualizados correctamente");
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  function handleCreateGroup() {
    if (!newGroupName.trim()) {
      toast.error("El nombre del grupo es obligatorio");
      return;
    }
    const newId = newGroupName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now().toString().slice(-4);
    const newGroup: PermissionGroup = {
      id: newId,
      name: newGroupName.trim(),
      description: newGroupDesc.trim() || "Grupo personalizado",
      isSystem: false,
      permissions: {
        inbox: { view: true, viewAll: false, reply: true, reassign: false, internalNotes: true, closeCase: true, delete: false },
        stats: { view: false, viewSLA: false, viewVolume: false, export: false },
        inventory: { view: true, create: false, edit: false, delete: false },
        manuals: { view: true, upload: false, delete: false },
        ai: { view: false, toggleMode: false, train: false, restorePrompt: false },
        settings: { view: false, manageChannels: false, qrConnect: false, dangerZone: false },
      },
    };

    setGroups(prev => [...prev, newGroup]);
    setSelectedGroupId(newId);
    setIsCreating(false);
    setNewGroupName("");
    setNewGroupDesc("");
    toast.success(`Grupo "${newGroup.name}" creado`);
  }

  function handleDeleteGroup(id: string) {
    if (["superadmin", "admin", "tecnico"].includes(id)) {
      toast.error("No se pueden eliminar los grupos principales del sistema");
      return;
    }
    setGroups(prev => prev.filter(g => g.id !== id));
    if (selectedGroupId === id) {
      setSelectedGroupId("admin");
    }
    toast.success("Grupo eliminado");
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        <p className="text-xs">Cargando matriz de permisos...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in-50 duration-150">
      {/* Encabezado y Guardar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base font-black text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-500" /> Matriz de Permisos y Accesos por Grupo
          </h3>
          <p className="text-xs text-muted-foreground">
            Configure con casillas e interruptores qué puede ver y editar cada grupo en cada panel y subpanel.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-600/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Guardando..." : "Guardar Permisos"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lista de Grupos */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Grupos Disponibles</span>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 text-xs font-bold text-brand-500 hover:text-brand-400 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo Grupo
            </button>
          </div>

          <div className="space-y-2">
            {groups.map((group) => {
              const isSelected = group.id === selectedGroupId;
              const isSys = group.isSystem;

              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    "p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between gap-2 group",
                    isSelected
                      ? "bg-brand-600/10 border-brand-500/40 ring-1 ring-brand-500/20"
                      : "bg-muted/30 border-border/50 hover:bg-muted/60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-xs font-bold", isSelected ? "text-brand-400" : "text-foreground")}>
                        {group.name}
                      </p>
                      {isSys && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-bold">
                          Sistema
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{group.description}</p>
                  </div>

                  {!isSys && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                      title="Eliminar grupo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Formulario Inline para Crear Grupo */}
          {isCreating && (
            <div className="p-3.5 rounded-xl border border-brand-500/30 bg-background/80 space-y-2.5 animate-in fade-in-50">
              <p className="text-xs font-bold text-foreground">Crear Nuevo Grupo</p>
              <input
                type="text"
                placeholder="Nombre del grupo (ej: Facturación / Ventas)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
              />
              <input
                type="text"
                placeholder="Descripción corta"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateGroup}
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-brand-600 text-white hover:bg-brand-700"
                >
                  Crear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha: Matriz de Permisos */}
        <div className="lg:col-span-8 space-y-4">
          {selectedGroup && (
            <div className="rounded-2xl border border-border/60 bg-background/50 p-5 space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-foreground">
                    Permisos para: <span className="text-brand-400">{selectedGroup.name}</span>
                  </h4>
                  {selectedGroup.id === "superadmin" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Acceso Total Fijo
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedGroup.description}</p>
              </div>

              {/* Módulo 1: Bandeja de Entrada & Chats */}
              <div className="space-y-3 rounded-xl border border-border/40 p-4 bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <MessageSquare className="h-4 w-4 text-sky-400" />
                  <span className="text-xs font-black uppercase text-foreground">Bandeja de Entrada & Chats</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { key: "view", label: "Acceso a la Bandeja", desc: "Permite abrir la vista del chat" },
                    { key: "viewAll", label: "Ver Todos los Casos", desc: "Ver casos de otros técnicos además de los propios" },
                    { key: "reply", label: "Responder y Enviar Mensajes", desc: "Escribir respuestas y enviar archivos" },
                    { key: "reassign", label: "Reasignar Casos", desc: "Transferir casos a otros compañeros" },
                    { key: "internalNotes", label: "Notas Internas", desc: "Crear y ver notas amarillas privadas" },
                    { key: "closeCase", label: "Cerrar / Resolver Casos", desc: "Marcar tickets como resueltos o cerrados" },
                  ].map(p => {
                    const checked = (selectedGroup.permissions.inbox as any)[p.key] ?? false;
                    return (
                      <div
                        key={p.key}
                        onClick={() => togglePerm("inbox", p.key)}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors",
                          checked ? "bg-sky-500/10 border-sky-500/30" : "bg-background/40 border-border/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-foreground">{p.label}</p>
                          <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded accent-sky-500 pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Módulo 2: Estadísticas & Analítica */}
              <div className="space-y-3 rounded-xl border border-border/40 p-4 bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-black uppercase text-foreground">Estadísticas & Reportes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { key: "view", label: "Ver Panel de Estadísticas", desc: "Acceso general a /admin/estadisticas" },
                    { key: "viewSLA", label: "Ver Rendimiento y SLAs", desc: "Métricas de tiempos y ranking de agentes" },
                    { key: "viewVolume", label: "Pestaña Volumen de Mensajes", desc: "Conteo exacto de mensajes clientes/técnicos" },
                    { key: "export", label: "Exportar Reportes", desc: "Descarga de datos a Excel, CSV y PDF" },
                  ].map(p => {
                    const checked = (selectedGroup.permissions.stats as any)[p.key] ?? false;
                    return (
                      <div
                        key={p.key}
                        onClick={() => togglePerm("stats", p.key)}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors",
                          checked ? "bg-emerald-500/10 border-emerald-500/30" : "bg-background/40 border-border/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-foreground">{p.label}</p>
                          <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded accent-emerald-500 pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Módulo 3: Inventario & Manuales */}
              <div className="space-y-3 rounded-xl border border-border/40 p-4 bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Package className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-black uppercase text-foreground">Inventario & Manuales</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { mod: "inventory", key: "view", label: "Consultar Inventario", desc: "Ver lista de modelos y compatibilidad" },
                    { mod: "inventory", key: "edit", label: "Modificar Equipos", desc: "Crear y editar modelos de inventario" },
                    { mod: "inventory", key: "delete", label: "Eliminar Equipos", desc: "Borrar registros del inventario" },
                    { mod: "manuals", key: "view", label: "Consultar Manuales", desc: "Buscar y ver guías técnicas" },
                    { mod: "manuals", key: "upload", label: "Subir Manuales", desc: "Cargar nuevos archivos PDF/docs" },
                    { mod: "manuals", key: "delete", label: "Eliminar Manuales", desc: "Borrar manuales de la base técnica" },
                  ].map(p => {
                    const checked = ((selectedGroup.permissions as any)[p.mod] as any)[p.key] ?? false;
                    return (
                      <div
                        key={`${p.mod}-${p.key}`}
                        onClick={() => togglePerm(p.mod as any, p.key)}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors",
                          checked ? "bg-amber-500/10 border-amber-500/30" : "bg-background/40 border-border/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-foreground">{p.label}</p>
                          <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded accent-amber-500 pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Módulo 4: IA & Plataforma */}
              <div className="space-y-3 rounded-xl border border-border/40 p-4 bg-muted/20">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Bot className="h-4 w-4 text-purple-400" />
                  <span className="text-xs font-black uppercase text-foreground">IA & Configuración de Plataforma</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { mod: "ai", key: "view", label: "Acceso a Panel IA", desc: "Ver métricas y estado del bot" },
                    { mod: "ai", key: "toggleMode", label: "Modo IA & No Atendido", desc: "Encender/Apagar el bot y horario nocturno" },
                    { mod: "ai", key: "train", label: "Entrenar Asistente IA", desc: "Modificar prompt y reglas del sistema" },
                    { mod: "ai", key: "restorePrompt", label: "Restaurar Versiones Prompt", desc: "Revertir a versiones anteriores del bot" },
                    { mod: "settings", key: "manageChannels", label: "Configurar Canales", desc: "Activar y parametrizar canales de chat" },
                    { mod: "settings", key: "qrConnect", label: "Vincular WhatsApp QR", desc: "Escanear QR de Evolution API" },
                  ].map(p => {
                    const checked = ((selectedGroup.permissions as any)[p.mod] as any)[p.key] ?? false;
                    return (
                      <div
                        key={`${p.mod}-${p.key}`}
                        onClick={() => togglePerm(p.mod as any, p.key)}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors",
                          checked ? "bg-purple-500/10 border-purple-500/30" : "bg-background/40 border-border/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-foreground">{p.label}</p>
                          <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded accent-purple-500 pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}