"use client";

import * as React from "react";
import { 
  Shield, Plus, Trash2, Save, Users, UserPlus, X,
  MessageSquare, BarChart3, Package, BookOpen, Bot, Settings,
  Loader2, ChevronDown, ChevronRight, Sliders, Activity, UserCheck,
  TrendingUp, Globe, Smartphone, Database, Lock
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PermissionGroup } from "@/lib/permissions";

interface AgentItem {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  avatar_url?: string | null;
}

interface SubcategoryDef {
  key: string;
  label: string;
  desc: string;
}

interface ModuleDef {
  key: keyof PermissionGroup["permissions"];
  label: string;
  icon: any;
  color: string;
  desc: string;
  subcategories: SubcategoryDef[];
}

export const COMPLETE_MODULE_DEFINITIONS: ModuleDef[] = [
  {
    key: "stats",
    label: "Estadísticas, Analítica & CRM",
    icon: BarChart3,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    desc: "Métricas globales, KPIs de atención, SLAs, volumen y analítica de clientes",
    subcategories: [
      { key: "resumen_general", label: "Resumen General (/admin)", desc: "Panel de control principal con tarjetas y actividad en vivo" },
      { key: "registro_actividad", label: "Suite de Auditoría & Actividad (/admin/actividad)", desc: "Monitoreo en tiempo real de espacios de trabajo, apps y colaboradores" },
      { key: "auditoria_pantalla", label: "Galería de Capturas de Pantalla (HD)", desc: "Inspección visual de escritorios capturados por la app Electron" },
      { key: "ranking_apps_sitios", label: "Ranking de Apps & Sitios Web", desc: "Tiempos de uso en WhatsApp, Softphone, Odoo, Office y sitios" },
      { key: "heatmap_intensidad", label: "Mapa de Calor Horario (Intensidad)", desc: "Visualización de picos de concentración e inactividad (8am - 6pm)" },
      { key: "dictamen_ejecutivo_ia", label: "Dictamen Ejecutivo de Auditoría con IA", desc: "Generación de informes de jornada con Gemini y exportación PDF/Excel" },
      { key: "estadisticas_detalladas", label: "Estadísticas Detalladas (/admin/estadisticas)", desc: "Analítica profunda, gráficos de volumen histórico y estados" },
      { key: "estadisticas_atencion", label: "Estadísticas de Atención & SLAs (/admin/estadisticas/atencion)", desc: "Ranking de agentes, tiempos de respuesta (AHT) y SLAs" },
      { key: "volumen_mensajes", label: "Pestaña Volumen de Mensajes", desc: "Conteo exacto de mensajes de clientes, técnicos e IA" },
      { key: "analitica_clientes", label: "Analítica de Clientes & CRM (/admin/clientes)", desc: "Directorio de clientes, historial de contacto y desbloqueo" },
      { key: "exportar_reportes", label: "Exportación de Reportes", desc: "Descarga de métricas en formatos Excel, CSV e Imprimir PDF" },
    ],
  },
  {
    key: "team",
    label: "Equipo & Desempeño",
    icon: Users,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    desc: "Gestión de agentes, perfiles, rendimiento, contraseñas y permisos",
    subcategories: [
      { key: "view_team_list", label: "Tabla Rendimiento por Agente (/admin/equipo)", desc: "Ver técnicos, scores individuales y estado de actividad" },
      { key: "view_agent_profile", label: "Perfiles Detallados (/admin/equipo/perfil)", desc: "Ver ficha completa, métricas y casos atendidos por agente" },
      { key: "add_agent", label: "Invitar / Agregar Nuevos Agentes", desc: "Crear cuentas de técnicos y administradores" },
      { key: "edit_agent", label: "Modificar Perfiles y Roles", desc: "Editar nombres, teléfonos y asignación de rol" },
      { key: "reset_password", label: "Restablecer Contraseñas", desc: "Cambiar o generar nuevas claves de acceso para técnicos" },
      { key: "delete_agent", label: "Eliminar Cuentas de Técnicos", desc: "Borrar agentes de la plataforma" },
      { key: "manage_groups", label: "Pestaña Permisos y Grupos", desc: "Crear grupos de trabajo y configurar la matriz de accesos" },
    ],
  },
  {
    key: "inbox",
    label: "Bandeja de Entrada & Atención",
    icon: MessageSquare,
    color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    desc: "Bandejas de chat, soporte avanzado, notas internas y gestión de tickets",
    subcategories: [
      { key: "inbox_principal", label: "Bandeja Principal (/inbox)", desc: "Acceso al chat unificado para atender clientes" },
      { key: "smart_inbox", label: "Smart Inbox (/smart-inbox)", desc: "Bandeja inteligente con categorización automática" },
      { key: "soporte_avanzado", label: "Soporte Avanzado N2 (/soporte-avanzado)", desc: "Casos escalados que requieren diagnóstico especializado" },
      { key: "mi_gestion", label: "Mi Gestión (/mi-gestion)", desc: "Vista filtrada solo de los casos asignados al técnico actual" },
      { key: "web_preview", label: "Vista Previa Web (/inbox/web-preview)", desc: "Simulador de chat web en vivo" },
      { key: "ver_todos_casos", label: "Ver Casos de Todos los Técnicos", desc: "Permite inspeccionar chats asignados a otros agentes" },
      { key: "responder_mensajes", label: "Responder y Enviar Archivos", desc: "Escribir respuestas, enviar fotos, videos y documentos" },
      { key: "reasignar_casos", label: "Reasignar Casos", desc: "Transferir chats a otros compañeros de equipo" },
      { key: "notas_internas", label: "Notas Internas Privadas", desc: "Crear y visualizar notas amarillas internas del caso" },
      { key: "historial_cliente_drawer", label: "Historial de Cliente y Conteo de Mensajes", desc: "Abrir cajón lateral con histórico de casos y métricas del cliente" },
      { key: "cerrar_casos", label: "Cerrar / Resolver Casos", desc: "Marcar tickets como resueltos o cerrados definitivamente" },
    ],
  },
  {
    key: "inventory",
    label: "Inventario de Equipos",
    icon: Package,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    desc: "Catálogo de marcas, modelos, series y compatibilidad técnica",
    subcategories: [
      { key: "view_inventory", label: "Consultar Catálogo (/admin/inventario)", desc: "Búsqueda y visualización de modelos y marcas" },
      { key: "create_edit_models", label: "Crear y Editar Modelos", desc: "Agregar o modificar información de equipos en el catálogo" },
      { key: "bulk_upload", label: "Carga Masiva de Archivos", desc: "Importar inventario desde planillas Excel / CSV" },
      { key: "delete_models", label: "Eliminar Equipos del Catálogo", desc: "Borrar registros de inventario" },
    ],
  },
  {
    key: "manuals",
    label: "Manuales & Base de Conocimiento",
    icon: BookOpen,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    desc: "Guías técnicas, esquemáticos y documentos de soporte",
    subcategories: [
      { key: "view_manuals", label: "Consultar y Descargar Manuales (/admin/manuales)", desc: "Acceso a la biblioteca de documentos técnicos" },
      { key: "upload_manuals", label: "Subir Nuevos Documentos PDF", desc: "Cargar manuales al repositorio y procesamiento RAG" },
      { key: "delete_manuals", label: "Eliminar Documentos", desc: "Borrar manuales de la base de conocimiento" },
    ],
  },
  {
    key: "ai",
    label: "Agente IA, Flujos & Automatizaciones",
    icon: Bot,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    desc: "Configuración del bot, entrenamiento, simulador y árboles de decisión",
    subcategories: [
      { key: "view_ai_panel", label: "Panel Agente IA (/admin/agente-ia)", desc: "Monitor de actividad y estado del asistente virtual" },
      { key: "flujos_bot", label: "Flujos del Bot (/admin/flujos-bot)", desc: "Árboles de decisión y respuestas automáticas del bot" },
      { key: "toggle_ai_modes", label: "Modo IA & Modo No Atendido", desc: "Encender/Apagar el bot y configurar horario nocturno" },
      { key: "train_prompt", label: "Entrenamiento del Prompt y Reglas", desc: "Modificar instrucciones y directrices del asistente" },
      { key: "restore_prompt_versions", label: "Historial y Restauración de Prompt", desc: "Revertir a versiones anteriores del sistema" },
      { key: "ai_models_config", label: "Proveedores y Modelos de IA", desc: "Configuración de Gemini, OpenAI y API keys" },
    ],
  },
  {
    key: "settings",
    label: "Configuración & Plataforma",
    icon: Settings,
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    desc: "Canales de mensajería, WhatsApp QR, Evolution API y base de datos",
    subcategories: [
      { key: "view_settings", label: "Configuración General (/admin/settings)", desc: "Ajustes de la aplicación y perfil personal" },
      { key: "manage_channels", label: "Canales de Atención (/admin/canales)", desc: "Parametrizar WhatsApp, Web Widget, etc." },
      { key: "whatsapp_qr_connect", label: "Conexión WhatsApp QR", desc: "Escanear QR de Evolution API en tiempo real" },
      { key: "evolution_api_config", label: "Configuración de Servidor Evolution API", desc: "Instancia, URL base y API keys de WhatsApp" },
      { key: "danger_zone", label: "Zona de Peligro (Reset de Base de Datos)", desc: "Reinicio operacional de datos (Exclusivo Superadmin)" },
    ],
  },
];

export function GroupPermissionsManager({ isSuperadmin }: { isSuperadmin?: boolean }) {
  const [groups, setGroups] = React.useState<PermissionGroup[]>([]);
  const [agents, setAgents] = React.useState<AgentItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>("admin");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [assigningAgent, setAssigningAgent] = React.useState<string>("");
  const [expandedModules, setExpandedModules] = React.useState<Record<string, boolean>>({});

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

  function toggleAccordion(moduleKey: string) {
    setExpandedModules(prev => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  }

  function togglePerm(moduleKey: keyof PermissionGroup["permissions"], actionKey: "view" | "edit" | "create" | "delete") {
    if (!selectedGroup) return;
    if (selectedGroup.id === "superadmin") {
      toast.warning("El grupo Superadmin cuenta con acceso total fijo.");
      return;
    }

    setGroups(prev => prev.map(g => {
      if (g.id !== selectedGroup.id) return g;
      const currentModule = { ...(g.permissions[moduleKey] || { view: false, edit: false, create: false, delete: false, subcategories: {} }) };
      currentModule[actionKey] = !currentModule[actionKey];

      if (actionKey === "view") {
        if (!currentModule.view) {
          currentModule.edit = false;
          currentModule.create = false;
          currentModule.delete = false;
          const subs = { ...(currentModule.subcategories || {}) };
          Object.keys(subs).forEach(k => subs[k] = false);
          currentModule.subcategories = subs;
        } else {
          const modDef = COMPLETE_MODULE_DEFINITIONS.find(m => m.key === moduleKey);
          const subs = { ...(currentModule.subcategories || {}) };
          modDef?.subcategories.forEach(s => subs[s.key] = true);
          currentModule.subcategories = subs;
        }
      }

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

  function toggleSubcategory(moduleKey: keyof PermissionGroup["permissions"], subKey: string) {
    if (!selectedGroup) return;
    if (selectedGroup.id === "superadmin") {
      toast.warning("El grupo Superadmin cuenta con acceso total fijo.");
      return;
    }

    setGroups(prev => prev.map(g => {
      if (g.id !== selectedGroup.id) return g;
      const currentModule = { ...(g.permissions[moduleKey] || { view: false, edit: false, create: false, delete: false, subcategories: {} }) };
      const currentSubs = { ...(currentModule.subcategories || {}) };
      
      currentSubs[subKey] = !currentSubs[subKey];
      currentModule.subcategories = currentSubs;

      const hasAnySub = Object.values(currentSubs).some(Boolean);
      if (hasAnySub) {
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
      toast.success("Matriz completa de categorías y subcategorías guardada con éxito");
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
    
    // Plantilla inicial para nuevo grupo
    const initialPermissions: any = {};
    COMPLETE_MODULE_DEFINITIONS.forEach(m => {
      const subs: Record<string, boolean> = {};
      m.subcategories.forEach(s => subs[s.key] = false);
      initialPermissions[m.key] = {
        view: false,
        edit: false,
        create: false,
        delete: false,
        subcategories: subs,
      };
    });

    const newGroup: PermissionGroup = {
      id: newId,
      name: newGroupName.trim(),
      description: newGroupDesc.trim() || "Grupo personalizado",
      isSystem: false,
      permissions: initialPermissions,
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
        <p className="text-xs font-semibold">Cargando todas las categorías y subcategorías...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in-50 duration-150">
      {/* Header con botón Guardar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base font-black text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-500" /> Matriz Completa de Categorías y Subcategorías
          </h3>
          <p className="text-xs text-muted-foreground">
            Gestione grupos, asigne técnicos y controle la visibilidad y permisos de cada sección y subsección.
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
                placeholder="Nombre del grupo (ej: Facturación / Supervisión)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <input
                type="text"
                placeholder="Descripción del grupo"
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

        {/* ── COLUMNA DERECHA: GESTIÓN DE MIEMBROS Y MATRIZ CON SUBCATEGORÍAS ── */}
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

              {/* ── SECCIÓN 2: TABLA MATRIZ CON TODAS LAS CATEGORÍAS Y SUBCATEGORÍAS ── */}
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="p-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                      Matriz Completa de Accesos y Subcategorías
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Toque la flecha (▼) en cualquier módulo para ajustar subfunciones individuales
                    </p>
                  </div>
                  {selectedGroup.id === "superadmin" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Superadmin: Acceso Total Fijo
                    </span>
                  )}
                </div>

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
                      {COMPLETE_MODULE_DEFINITIONS.map((mod) => {
                        const perms = selectedGroup.permissions[mod.key] || { view: false, edit: false, create: false, delete: false, subcategories: {} };
                        const isExpanded = !!expandedModules[mod.key];
                        const subcategories = mod.subcategories;

                        return (
                          <React.Fragment key={mod.key}>
                            {/* Fila Principal del Módulo */}
                            <tr className={cn("transition-colors", isExpanded ? "bg-muted/30" : "hover:bg-muted/20")}>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleAccordion(mod.key)}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    title="Desplegar subcategorías"
                                  >
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </button>

                                  <div className={cn("h-8 w-8 rounded-lg border grid place-items-center shrink-0", mod.color)}>
                                    <mod.icon className="h-4 w-4" />
                                  </div>
                                  <div className="cursor-pointer" onClick={() => toggleAccordion(mod.key)}>
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-foreground text-xs">{mod.label}</p>
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-semibold">
                                        {subcategories.length} subfunciones
                                      </span>
                                    </div>
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

                            {/* Desglose de Subcategorías (Acordeón) */}
                            {isExpanded && (
                              <tr className="bg-muted/15">
                                <td colSpan={5} className="p-0 border-b border-border/40">
                                  <div className="p-4 pl-14 space-y-2 border-l-2 border-brand-500/40 bg-background/50 m-2 rounded-xl">
                                    <div className="flex items-center justify-between pb-2 border-b border-border/30">
                                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Sliders className="h-3 w-3 text-brand-400" /> Subcategorías de {mod.label}
                                      </p>
                                      <span className="text-[10px] text-muted-foreground">
                                        Active o desactive visibilidad individual
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                      {subcategories.map((sub) => {
                                        const isSubActive = perms.subcategories?.[sub.key] ?? perms.view;

                                        return (
                                          <div
                                            key={sub.key}
                                            onClick={() => toggleSubcategory(mod.key, sub.key)}
                                            className={cn(
                                              "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all",
                                              isSubActive
                                                ? "bg-brand-500/10 border-brand-500/30"
                                                : "bg-background/60 border-border/40 hover:bg-muted/40"
                                            )}
                                          >
                                            <div className="min-w-0 pr-2">
                                              <p className={cn("text-xs font-bold", isSubActive ? "text-brand-400" : "text-foreground")}>
                                                {sub.label}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                                {sub.desc}
                                              </p>
                                            </div>

                                            <input
                                              type="checkbox"
                                              checked={isSubActive}
                                              onChange={() => {}}
                                              disabled={selectedGroup.id === "superadmin"}
                                              className="h-4 w-4 rounded accent-brand-500 pointer-events-none shrink-0 disabled:opacity-50"
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
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