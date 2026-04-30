"use client";
import * as React from "react";
import { X, History, ChevronDown, ChevronUp, Calendar, FolderOpen, MessageSquare, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatTime, asText, clienteInfo, customerKey } from "@/lib/utils";
import { Badge } from "@/components/ui/avatar";
import type { SekCase, SekHistEntry } from "@/lib/types";

interface CaseHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase: SekCase;
}

interface CaseWithDetails extends SekCase {
  _expanded?: boolean;
}

export function CaseHistoryDrawer({ isOpen, onClose, currentCase }: CaseHistoryDrawerProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const [cases, setCases] = React.useState<CaseWithDetails[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const PAGE_SIZE = 5;

  const ci = clienteInfo(currentCase.cliente);
  const customerKeyValue = customerKey(currentCase);

  React.useEffect(() => {
    if (!isOpen) return;
    loadCases();
  }, [isOpen, currentCase.id]);

  async function loadCases() {
    setLoading(true);
    try {
      // Buscar todos los casos del mismo cliente por correo o teléfono
      // Luego filtraremos los que ya están en el grupo actual
      console.log(`[History] Buscando historial para: ${ci.nombre || ci.correo || ci.telefono}`);

      // Primero obtenemos todos los casos del cliente
      let query;
      if (ci.correo) {
        query = supabase.from("sek_cases").select("*").filter("cliente->>correo", "eq", ci.correo);
      } else if (ci.telefono || currentCase.customer_phone) {
        query = supabase.from("sek_cases").select("*").eq("customer_phone", ci.telefono || currentCase.customer_phone);
      } else {
        query = supabase.from("sek_cases").select("*").filter("cliente->>nombre", "eq", ci.nombre);
      }

      const { data, error } = await query.order("created_at", { ascending: false }).limit(50);

      if (error) throw error;
      
      // Solo excluir el caso actual (no todos los del grupo)
      const currentId = String(currentCase.id);
      console.log(`[History] Excluyendo caso actual: ${currentId}`);
      
      // Filtrar: quedarnos solo con casos que no son el actual
      const otherCases = (data || []).filter(c => String(c.id) !== currentId);
      
      console.log(`[History] Total casos del cliente: ${(data || []).length}, Otros casos: ${otherCases.length}`);
      otherCases.forEach(c => console.log(`[History]  - Caso historico #${c.id}: ${c.title}`));
      
      setCases(otherCases as CaseWithDetails[]);
      setHasMore(otherCases.length === PAGE_SIZE * page);
    } catch (err) {
      console.error("Error loading case history:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(caseId: string | number) {
    setCases(prev => prev.map(c => 
      c.id === caseId ? { ...c, _expanded: !c._expanded } : c
    ));
  }

  function renderMessage(e: SekHistEntry, idx: number, isCliente: boolean) {
    const isNota = e.role === "nota";
    const isSeparator = (e as any)._separator;
    
    if (isSeparator) {
      return (
        <div key={idx} className="flex items-center gap-2 py-2 my-2 text-xs text-muted-foreground border-y border-border/50">
          <div className="flex-1 h-px bg-border/50" />
          <span>{e.content}</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
      );
    }

    return (
      <div
        key={idx}
        className={cn(
          "flex mb-2",
          isCliente ? "justify-start" : "justify-end"
        )}
      >
        <div
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm",
            isNota 
              ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 w-full text-center"
              : isCliente 
                ? "bg-muted border border-border"
                : "bg-brand-700 text-white"
          )}
        >
          {isNota && (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block mb-1">
              📝 Nota interna · {e.author || "Agente"}
            </span>
          )}
          {!isNota && !isCliente && (
            <span className="text-xs opacity-80 block mb-0.5">
              {e.author || "Agente"}
            </span>
          )}
          <p className="whitespace-pre-wrap break-words">{asText(e.content)}</p>
          {(e as any).mediaUrl && (
            <a 
              href={(e as any).mediaUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs underline opacity-80 mt-1 block"
            >
              📎 {(e as any).fileName || "Archivo adjunto"}
            </a>
          )}
          <span className="text-[10px] opacity-60 block mt-1 text-right">
            {formatTime(e.time)}
          </span>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/40 z-40" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <aside className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Historial de conversaciones</h2>
              <p className="text-xs text-muted-foreground">
                {ci.nombre || ci.telefono || "Cliente"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Cerrar historial"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && cases.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Cargando historial...
            </div>
          )}

          {cases.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No hay conversaciones anteriores</p>
              <p className="text-sm mt-1">
                Este es el primer caso de este cliente
              </p>
            </div>
          )}

          {cases.map((c, idx) => {
            const isExpanded = c._expanded;
            const estadoLower = String(c.estado || "").toLowerCase();
            const isClosed = estadoLower === "cerrado" || estadoLower === "resuelto";
            const totalMsgs = (c.histcliente?.length || 0) + (c.histtecnico?.length || 0);
            
            return (
              <div 
                key={c.id} 
                className={cn(
                  "border rounded-xl overflow-hidden transition-colors",
                  isClosed ? "bg-muted/30 border-muted" : "bg-card border-border"
                )}
              >
                {/* Case Header */}
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={cn(
                    "mt-0.5 w-2 h-2 rounded-full shrink-0",
                    isClosed ? "bg-green-500" : "bg-amber-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {asText(c.title) || `Caso #${c.id}`}
                      </span>
                      <Badge variant={isClosed ? "success" : "warning"} className="text-[10px]">
                        {c.estado || "Sin estado"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(c.created_at).toLocaleDateString("es-CR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric"
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {totalMsgs} mensajes
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    {/* Messages */}
                    <div className="py-3 space-y-1 max-h-[400px] overflow-y-auto">
                      {(() => {
                        const allMsgs: (SekHistEntry & { _isCliente: boolean })[] = [];
                        (c.histcliente || []).forEach(e => {
                          allMsgs.push({ ...e, _isCliente: true });
                        });
                        (c.histtecnico || []).forEach(e => {
                          allMsgs.push({ ...e, _isCliente: false });
                        });
                        allMsgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                        
                        if (allMsgs.length === 0) {
                          return (
                            <p className="text-center text-sm text-muted-foreground py-4">
                              Sin mensajes en este caso
                            </p>
                          );
                        }

                        return allMsgs.map((e, idx) => renderMessage(e, idx, e._isCliente));
                      })()}
                    </div>

                    {/* Files Summary */}
                    {(() => {
                      const files: { url: string; name: string; type?: string }[] = [];
                      [...(c.histcliente || []), ...(c.histtecnico || [])].forEach(e => {
                        if ((e as any).mediaUrl) {
                          files.push({
                            url: (e as any).mediaUrl,
                            name: (e as any).fileName || "Archivo",
                            type: (e as any).mediaType
                          });
                        }
                      });
                      
                      if (files.length > 0) {
                        return (
                          <div className="border-t border-border pt-3 mt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Archivos ({files.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {files.map((f, idx) => (
                                <a
                                  key={idx}
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 bg-muted rounded border border-border hover:bg-muted/80 transition-colors"
                                >
                                  📎 {f.name}
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load More */}
          {hasMore && cases.length > 0 && (
            <button
              onClick={() => { setPage(p => p + 1); loadCases(); }}
              disabled={loading}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              {loading ? "Cargando..." : "Cargar más conversaciones"}
            </button>
          )}
        </div>

        {/* Footer */}
        <footer className="px-4 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground text-center">
          Las conversaciones se ordenan de más reciente a más antigua
        </footer>
      </aside>
    </>
  );
}
