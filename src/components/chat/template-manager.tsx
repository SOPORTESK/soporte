"use client";

import * as React from "react";
import { X, Plus, Save, Trash2, Globe, User, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

interface Template {
  id: string;
  nombre: string;
  texto: string;
  cat?: string;
  isGlobal?: boolean;
}

interface TemplateManagerProps {
  supabase: SupabaseClient;
  agentEmail: string;
  agentRole: string;
  globalTemplates: Template[];
  onGlobalTemplatesChange: (templates: Template[]) => void;
  personalTemplates: Template[];
  onPersonalTemplatesChange: (templates: Template[]) => void;
  onClose: () => void;
}

export function TemplateManager({
  supabase,
  agentEmail,
  agentRole,
  globalTemplates,
  onGlobalTemplatesChange,
  personalTemplates,
  onPersonalTemplatesChange,
  onClose,
}: TemplateManagerProps) {
  const [tab, setTab] = React.useState<"personal" | "global">("personal");
  const [editingTemplate, setEditingTemplate] = React.useState<Template | null>(null);
  const [saving, setSaving] = React.useState(false);
  const isAdmin = agentRole === "admin" || agentRole === "superadmin";

  const templates = tab === "personal" ? personalTemplates : globalTemplates;

  function handleAdd() {
    setEditingTemplate({
      id: "new_" + Date.now(),
      nombre: "Nueva plantilla",
      texto: "",
      isGlobal: tab === "global",
    });
  }

  async function handleSave() {
    if (!editingTemplate || !editingTemplate.nombre || !editingTemplate.texto) {
      toast.error("El nombre y texto son obligatorios");
      return;
    }
    setSaving(true);
    try {
      if (tab === "personal") {
        const isNew = editingTemplate.id.startsWith("new_");
        const newId = isNew ? "p_" + Date.now() : editingTemplate.id;
        const updatedTemplate = { ...editingTemplate, id: newId };
        
        let newTemplates;
        if (isNew) {
          newTemplates = [...personalTemplates, updatedTemplate];
        } else {
          newTemplates = personalTemplates.map(t => t.id === updatedTemplate.id ? updatedTemplate : t);
        }
        
        localStorage.setItem(`sek_plantillas_${agentEmail}`, JSON.stringify(newTemplates));
        onPersonalTemplatesChange(newTemplates);
        toast.success("Plantilla personal guardada");
        setEditingTemplate(null);
      } else {
        if (!isAdmin) {
          toast.error("No tienes permisos para editar plantillas globales");
          return;
        }
        const isNew = editingTemplate.id.startsWith("new_");
        const payload = {
          nombre: editingTemplate.nombre,
          texto: editingTemplate.texto,
          cat: editingTemplate.cat || "general"
        };

        if (isNew) {
          const { data, error } = await supabase.from("sek_plantillas").insert([payload]).select().single();
          if (error) throw error;
          onGlobalTemplatesChange([...globalTemplates, data]);
        } else {
          const { error } = await supabase.from("sek_plantillas").update(payload).eq("id", editingTemplate.id);
          if (error) throw error;
          onGlobalTemplatesChange(globalTemplates.map(t => t.id === editingTemplate.id ? { ...t, ...payload } : t));
        }
        toast.success("Plantilla global guardada");
        setEditingTemplate(null);
      }
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`¿Eliminar plantilla "${t.nombre}"?`)) return;
    
    if (tab === "personal") {
      const newTemplates = personalTemplates.filter(pt => pt.id !== t.id);
      localStorage.setItem(`sek_plantillas_${agentEmail}`, JSON.stringify(newTemplates));
      onPersonalTemplatesChange(newTemplates);
      toast.success("Plantilla personal eliminada");
    } else {
      if (!isAdmin) return;
      try {
        const { error } = await supabase.from("sek_plantillas").delete().eq("id", t.id);
        if (error) throw error;
        onGlobalTemplatesChange(globalTemplates.filter(gt => gt.id !== t.id));
        toast.success("Plantilla global eliminada");
      } catch (e: any) {
        toast.error("Error al eliminar", { description: e.message });
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            Gestionar Plantillas
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-3 gap-4 border-b border-border">
          <button
            onClick={() => { setTab("personal"); setEditingTemplate(null); }}
            className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === "personal" ? "border-brand-500 text-brand-500" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="h-4 w-4" />
            Mis Plantillas
          </button>
          <button
            onClick={() => { setTab("global"); setEditingTemplate(null); }}
            className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === "global" ? "border-brand-500 text-brand-500" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="h-4 w-4" />
            Plantillas Globales
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Editor Panel (if editing) */}
          {editingTemplate && (
            <div className="md:w-1/2 p-4 border-b md:border-b-0 md:border-r border-border bg-muted/10 flex flex-col gap-3">
              <h3 className="text-sm font-bold">{editingTemplate.id.startsWith("new_") ? "Nueva plantilla" : "Editar plantilla"}</h3>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={editingTemplate.nombre}
                  onChange={e => setEditingTemplate({ ...editingTemplate, nombre: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                  placeholder="Ej: Saludo"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Texto del mensaje
                </label>
                <textarea
                  value={editingTemplate.texto}
                  onChange={e => setEditingTemplate({ ...editingTemplate, texto: e.target.value })}
                  className="w-full flex-1 min-h-[120px] bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500 transition-colors resize-none"
                  placeholder="Escribe el contenido de la plantilla..."
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Puedes usar [corchetes] para campos que requieran rellenarse manualmente.
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" /> {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}

          {/* List Panel */}
          <div className={`flex-1 overflow-y-auto p-4 ${editingTemplate ? "hidden md:block" : ""}`}>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">
                {tab === "personal" 
                  ? "Estas plantillas solo son visibles para ti."
                  : "Estas plantillas son visibles para todo el equipo."}
              </p>
              {(tab === "personal" || isAdmin) && (
                <Button size="sm" onClick={handleAdd} className="gap-2 h-8">
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              )}
            </div>

            {templates.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">No hay plantillas {tab === "personal" ? "personales" : "globales"} creadas.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className="p-3 border border-border rounded-xl bg-card hover:bg-muted/30 transition-colors group flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{t.nombre}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.texto}</p>
                    </div>
                    {(tab === "personal" || isAdmin) && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => setEditingTemplate(t)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(t)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
