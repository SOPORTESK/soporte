"use client";

import * as React from "react";
import { 
  Shield, Plus, Trash2, Save, Users, UserPlus, X,
  MessageSquare, BarChart3, Package, BookOpen, Bot, Settings,
  Loader2, CheckCircle2, UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PermissionGroup, GroupPermissions } from "@/lib/permissions";

interface AgentItem {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  avatar_url?: string | null;
}

export function GroupPermissionsManager({ isSuperadmin }: { isSuperadmin?: boolean }) {
  const [groups, setGroups] = React.useState<PermissionGroup[]>([]);
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>("admin");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [assigningAgent, setAssigningAgent] = React.useState<string>("");

  // Crear nuevo grupo
  const [isCreating, setIsCreating] = React.useState(false);
  const [newGroupName, setNewGroupName] = React.useState("");
  const [newGroupDesc, setNewGroupDesc] = React.useState("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/permission-groups");
      if (!res.ok) throw new Error("Error al cargar datos");
      const data = await res.json();
      if (data.groups && Array.isArray(data.groups)) {
        setGroups(data.groups);
        if (!selectedGroupId && data.groups[0]) {
          setSelectedGroupId(data.groups[0].id);
        }
      }
      if (data.agents && Array.isArray(data.agents)) {
        setAgents(data.agents);
      }
    } catch (e: any) {
      toast.error("Error cargando permisos", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || groups[0];
  const groupMembers = agents.filter(a => a.rol === selectedGroup?.id);
  const availableAgents = agents.filter(a => a.rol !== selectedGroup?.id);

  function togglePerm(moduleKey: keyof PermissionGroup["permissions"], actionKey: keyof GroupPermissions) {
    if (!selectedGroup) return;
    if (selectedGroup.id === "superadmin") {
      toast.warning("El grupo Superadmin cuenta con acceso total fijo.");
      return;
    }

    setGroups(prev => prev.map(g => {
      if (g.id !== selectedGroup.id) return g;
      const currentModule = { ...g.permissions[moduleKey] };
      currentModule[actionKey] = !currentModule[actionKey];

      // Si desactiva view, desactivar edit, create, delete
      if (actionKey === "view" && !currentModule.view) {
        currentModule.edit = false;
        currentModule.create = false;
        currentModule.delete = false;
      }
      // Si activa edit/create/delete, activar view automáticamente
      if (actionKey !== "view" && currentModule[actionKey]) {
        currentModule.view = true;
      }

      return {
        ...g,
        permissions: {
          ...g.permissions,
          [moduleKey]: currentModule,
        },
      };
    }));
  }

  async function handleSavePermissions() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/permission-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!res.ok) throw new Error("Error al guardar cambios");
      toast.success("Matriz de permisos guardada exitosamente");
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
    const newId = newGroupName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") + "-" + Date.now().toString().slice(-4);
    const newGroup: PermissionGroup = {
      id: newId,
      name: newGroupName.trim(),
      description: newGroupDesc.trim() || "Grupo personalizado",
      isSystem: false,
      permissions: {
        inbox: { view: true, edit: true, create: true, delete: false },
        stats: { view: false, edit: false, create: false, delete: false },
        inventory: { view: true, edit: false, create: false, delete: false },
        manuals: { view: true, edit: false, create: false, delete: false },
        ai: { view: false, edit: false, create: false, delete: false },
        settings: { view: false, edit: false, create: false, delete: false },
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
      toast.error("No se pueden eliminar los roles base del sistema");
      return;
    }
    setGroups(prev => prev.filter(g => g.id !== id));
    if (selectedGroupId === id) {
      setSelectedGroupId("admin");
    }
    toast.success("Grupo eliminado");
  }

  async function handleAssignMember(emailToAssign: string, targetGroupId: string) {
    if (!emailToAssign) return;
    try {
      const res = await fetch("/api/admin/permission-groups/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToAssign, groupId: targetGroupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al asignar miembro");

      setAgents(prev => prev.map(a => a.email === emailToAssign ? { ...a, rol: targetGroupId } : a));
      setAssigningAgent("");
      toast.success("Miembro asignado correctamente al grupo");
    } catch (e: any) {
      toast.error("Error al asignar miembro", { description: e.message });
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        <p className="text-xs font-semibold">Cargando matriz de permisos y miembros...</p>
      </div>
    );
  }

  const MODULES: { key: keyof PermissionGroup["permissions"]; label: string; icon: any; color: string; desc: string }[] = [
    { key: "inbox", label: "Bandeja de Entrada & Chats", icon: MessageSquare, color: "text-sky-400 bg-sky-500/10 border-sky-500/20", desc: "Gestión de tickets, atención de clientes y notas internas" },
    { key: "stats", label: "Estadísticas & Reportes", icon: BarChart3, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", desc: "Métricas de SLA, volumen de mensajes y exportación de datos" },
    { key: "inventory", label: "Inventario de Equipos", icon: Package, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", desc: "Catálogo de marcas, modelos y compatibilidad técnica" },
    { key: "manuals", label: "Manuales y Documentos", icon: BookOpen, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", desc: "Base de conocimiento y guías de servicio técnico" },
    { key: "ai", label: "Agente IA y Automatizaciones", icon: Bot, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", desc: "Entrenamiento del asistente virtual y modos de operación" },
    { key: "settings", label: "Configuración & Plataforma", icon: Settings, color: "text-rose-400 bg-rose-500/10 border-rose-500/20", desc: "Canales de mensajería, conexión QR de WhatsApp y ajustes globales" },
  ];

  return (
    <div className="p-6 space-y-6 animate-in fade-in-50 duration-150">
      {/* Header con botón Guardar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base font-black text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-500" /> Matriz de Permisos y Gestión de Grupos
          </h3>
          <p className="text-xs text-muted-foreground">
            Cree grupos de trabajo, asigne técnicos y active o desactive permisos granulares por módulo.
          </p>
        </div>

        <button
          onClick={handleSavePermissions}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-600/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Guardando..." : "Guardar Permisos"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── COLUMNA IZQUIERDA: LISTA DE GRUPOS ── */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Grupos Configurados</span>
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
              const count = agents.filter(a => a.rol === group.id).length;

              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    "p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between gap-2 group",
                    isSelected
                      ? "bg-brand-600/10 border-brand-500/40 ring-1 ring-brand-500/20 shadow-sm"
                      : "bg-muted/30 border-border/50 hover:bg-muted/60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-xs font-bold truncate", isSelected ? "text-brand-400" : "text-foreground")}>
                        {group.name}
                      </p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold shrink-0">
                        {count} {count === 1 ? "miembro" : "miembros"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{group.description}</p>
                  </div>

                  {!isSys && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all shrink-0"
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
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <input
                type="text"
                placeholder="Descripción corta del grupo"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
                >
                  Crear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA: GESTIÓN DE MIEMBROS Y MATRIZ DE PERMISOS ── */}
        <div className="lg:col-span-8 space-y-6">
          {selectedGroup && (
            <div className="space-y-6">
              
              {/* ── SECCIÓN 1: MIEMBROS ASIGNADOS AL GRUPO ── */}
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center shrink-0">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                        Miembros en <span className="text-brand-400">{selectedGroup.name}</span> ({groupMembers.length})
                      </h4>
                      <p className="text-[10px] text-muted-foreground">Técnicos que heredan automáticamente estos permisos</p>
                    </div>
                  </div>

                  {/* Asignar nuevo miembro */}
                  <div className="flex items-center gap-2">
                    <select
                      value={assigningAgent}
                      onChange={(e) => setAssigningAgent(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none"
                    >
                      <option value="">+ Seleccionar técnico para agregar...</option>
                      {availableAgents.map(a => (
                        <option key={a.email} value={a.email}>
                          {[a.nombre, a.apellido].filter(Boolean).join(" ") || a.email} ({a.rol})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssignMember(assigningAgent, selectedGroup.id)}
                      disabled={!assigningAgent}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all disabled:opacity-40"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Asignar
                    </button>
                  </div>
                </div>

                {/* Lista de Chips de Miembros */}
                <div className="flex flex-wrap gap-2">
                  {groupMembers.map(member => {
                    const name = [member.nombre, member.apellido].filter(Boolean).join(" ") || member.email;
                    const isProtected = member.rol === "superadmin" && !isSuperadmin;

                    return (
                      <div
                        key={member.email}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/60 bg-background text-xs font-medium group"
                      >
                        <div className="h-5 w-5 rounded-full bg-brand-500/20 text-brand-400 grid place-items-center text-[10px] font-bold shrink-0">
                          {name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-foreground">{name}</span>
                        <span className="text-[10px] text-muted-foreground">({member.email})</span>
                        
                        {!isProtected && selectedGroup.id !== "tecnico" && (
                          <button
                            onClick={() => handleAssignMember(member.email, "tecnico")}
                            className="text-muted-foreground hover:text-red-500 p-0.5 rounded transition-colors ml-1"
                            title="Remover de este grupo (reasignar a Soporte Avanzado)"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {groupMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      No hay técnicos asignados a este grupo actualmente.
                    </p>
                  )}
                </div>
              </div>

              {/* ── SECCIÓN 2: TABLA MATRIZ FORMAL DE PERMISOS ── */}
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                {/* Cabecera de la tabla */}
                <div className="p-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                      Matriz de Accesos por Módulo
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Controles de Lectura, Escritura, Creación y Borrado
                    </p>
                  </div>
                  {selectedGroup.id === "superadmin" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Superadmin: Acceso Total Fijo
                    </span>
                  )}
                </div>

                {/* Tabla formal */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/10 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="py-3 px-4">Módulo / Panel</th>
                        <th className="py-3 px-3 text-center w-24">Ver (Lectura)</th>
                        <th className="py-3 px-3 text-center w-24">Editar</th>
                        <th className="py-3 px-3 text-center w-24">Crear</th>
                        <th className="py-3 px-3 text-center w-24">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {MODULES.map((mod) => {
                        const perms = selectedGroup.permissions[mod.key];

                        return (
                          <tr key={mod.key} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className={cn("h-8 w-8 rounded-lg border grid place-items-center shrink-0", mod.color)}>
                                  <mod.icon className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="font-bold text-foreground text-xs">{mod.label}</p>
                                  <p className="text-[10px] text-muted-foreground leading-tight">{mod.desc}</p>
                                </div>
                              </div>
                            </td>

                            {/* Columna Ver */}
                            <td className="py-3.5 px-3 text-center">
                              <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                <input
                                  type="checkbox"
                                  checked={perms.view}
                                  onChange={() => togglePerm(mod.key, "view")}
                                  disabled={selectedGroup.id === "superadmin"}
                                  className="h-4 w-4 rounded accent-brand-500 cursor-pointer disabled:opacity-50"
                                />
                              </label>
                            </td>

                            {/* Columna Editar */}
                            <td className="py-3.5 px-3 text-center">
                              <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                <input
                                  type="checkbox"
                                  checked={perms.edit}
                                  onChange={() => togglePerm(mod.key, "edit")}
                                  disabled={selectedGroup.id === "superadmin"}
                                  className="h-4 w-4 rounded accent-brand-500 cursor-pointer disabled:opacity-50"
                                />
                              </label>
                            </td>

                            {/* Columna Crear */}
                            <td className="py-3.5 px-3 text-center">
                              <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                <input
                                  type="checkbox"
                                  checked={perms.create}
                                  onChange={() => togglePerm(mod.key, "create")}
                                  disabled={selectedGroup.id === "superadmin"}
                                  className="h-4 w-4 rounded accent-brand-500 cursor-pointer disabled:opacity-50"
                                />
                              </label>
                            </td>

                            {/* Columna Eliminar */}
                            <td className="py-3.5 px-3 text-center">
                              <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                <input
                                  type="checkbox"
                                  checked={perms.delete}
                                  onChange={() => togglePerm(mod.key, "delete")}
                                  disabled={selectedGroup.id === "superadmin"}
                                  className="h-4 w-4 rounded accent-brand-500 cursor-pointer disabled:opacity-50"
                                />
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}