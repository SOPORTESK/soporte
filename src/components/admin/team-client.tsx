"use client";

import { useState } from "react";
import { Edit2, Trash2, Save, X, Shield, UserCheck, Activity, UserPlus, Key, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/avatar";

interface Agent {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  telefono: string | null;
  last_login: string | null;
}

interface TeamClientProps {
  humanAgents: Agent[];
  sekaAgent: Agent | undefined;
  isSuperadmin: boolean;
}

export function TeamClient({ humanAgents, sekaAgent, isSuperadmin }: TeamClientProps) {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [resettingAgent, setResettingAgent] = useState<Agent | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Agent & { password?: string }>>({});

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormData(agent);
  };

  const handleSaveRole = async () => {
    if (!formData.email || !formData.rol) return;
    
    try {
      const res = await fetch("/api/admin/agentes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, rol: formData.rol })
      });
      
      if (res.ok) {
        alert("Rol actualizado");
        window.location.reload();
      } else {
        alert("Error al actualizar rol");
      }
    } catch (error) {
      alert("Error de conexión");
    }
    setEditingAgent(null);
  };

  const handleDelete = async (email: string) => {
    if (!confirm("¿Estás seguro de eliminar este agente?")) return;
    
    try {
      const res = await fetch(`/api/admin/agentes?email=${email}`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        alert("Agente eliminado");
        window.location.reload();
      } else {
        alert("Error al eliminar agente");
      }
    } catch (error) {
      alert("Error de conexión");
    }
  };

  const handleInvite = async () => {
    if (!formData.email || !formData.password || !formData.nombre) {
      alert("Email, contraseña y nombre son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agentes/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        alert("Agente invitado exitosamente");
        window.location.reload();
      } else {
        const d = await res.json();
        alert("Error: " + d.error);
      }
    } catch (e) { alert("Error de conexión"); }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!resettingAgent || !formData.password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agentes/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resettingAgent.email, newPassword: formData.password })
      });
      if (res.ok) {
        alert("Contraseña actualizada");
        setResettingAgent(null);
      } else {
        const d = await res.json();
        alert("Error: " + d.error);
      }
    } catch (e) { alert("Error de conexión"); }
    setLoading(false);
  };

  const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
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

  return (
    <>
      {/* Toolbar */}
      {isSuperadmin && (
        <div className="p-4 bg-muted/20 border-b border-border flex justify-end">
          <button
            onClick={() => { setIsInviting(true); setFormData({ rol: "tecnico" }); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-all"
          >
            <UserPlus className="h-4 w-4" /> Agregar Agente
          </button>
        </div>
      )}

      {/* Lista de agentes con botones de gestión */}
      <ul className="divide-y divide-border">
        {humanAgents.map((a) => {
          const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
          const variant = a.rol === "superadmin" ? "danger" : a.rol === "admin" ? "warning" : "default";
          const roleIcon = a.rol === "superadmin" ? <Shield className="h-3 w-3" /> : 
                          a.rol === "admin" ? <UserCheck className="h-3 w-3" /> : 
                          <Activity className="h-3 w-3" />;
          
          return (
            <li key={a.email} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
              <div className="h-11 w-11 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center text-sm font-bold shrink-0">
                {fullName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{fullName}</p>
                  {a.last_login && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(a.last_login).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{a.email}</p>
                {a.telefono && (
                  <p className="text-xs text-muted-foreground">📞 {a.telefono}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={variant} className="capitalize flex items-center gap-1">
                  {roleIcon} {a.rol === "tecnico" ? "Soporte Avanzado" : a.rol}
                </Badge>
                
                {isSuperadmin && (
                  <div className="flex items-center gap-1 ml-2">
                    <button 
                      onClick={() => handleEdit(a)}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Cambiar rol"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => { setResettingAgent(a); setFormData({ password: "" }); }}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-amber-600"
                      title="Resetear contraseña"
                    >
                      <Key className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(a.email)}
                      className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-muted-foreground hover:text-red-600"
                      title="Eliminar agente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Modal para Invitar */}
      {isInviting && (
        <Modal title="Agregar Nuevo Agente" onClose={() => setIsInviting(false)}>
          <div className="space-y-3">
            <input 
              type="text" placeholder="Nombre" 
              className="w-full p-2 rounded-lg border bg-background"
              onChange={e => setFormData({...formData, nombre: e.target.value})}
            />
            <input 
              type="email" placeholder="Correo electrónico" 
              className="w-full p-2 rounded-lg border bg-background"
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
            <input 
              type="password" placeholder="Contraseña inicial" 
              className="w-full p-2 rounded-lg border bg-background"
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
            <select
              value={formData.rol || "tecnico"}
              onChange={(e) => setFormData({...formData, rol: e.target.value})}
              className="w-full p-2 rounded-lg border bg-background"
            >
              <option value="tecnico">Soporte Avanzado</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <button
              onClick={handleInvite} disabled={loading}
              className="w-full py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Crear Agente
            </button>
          </div>
        </Modal>
      )}

      {/* Modal para Reset Password */}
      {resettingAgent && (
        <Modal title="Resetear Contraseña" onClose={() => setResettingAgent(null)}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Nueva clave para: <strong>{resettingAgent.email}</strong></p>
            <input 
              type="password" placeholder="Nueva contraseña" 
              className="w-full p-2 rounded-lg border bg-background"
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
            <button
              onClick={handleResetPassword} disabled={loading}
              className="w-full py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              Actualizar Contraseña
            </button>
          </div>
        </Modal>
      )}

      {/* Modal para cambiar rol */}
      {editingAgent && (
        <Modal 
          title="Cambiar Rol"
          onClose={() => setEditingAgent(null)}
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Agente: <strong>{editingAgent.email}</strong></p>
              <label className="block text-sm font-medium mb-1">Nuevo Rol</label>
              <select
                value={formData.rol || ""}
                onChange={(e) => setFormData({...formData, rol: e.target.value})}
                className="w-full p-2 rounded-lg border border-border bg-background"
              >
                <option value="tecnico">Soporte Avanzado</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSaveRole}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
              >
                <Save className="h-4 w-4" /> Guardar
              </button>
              <button
                onClick={() => setEditingAgent(null)}
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
