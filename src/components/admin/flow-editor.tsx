"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type OnConnect,
  BackgroundVariant,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Workflow,
  Save,
  Play,
  Plus,
  Trash2,
  MessageSquare,
  HelpCircle,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Settings2,
  ListOrdered,
  Loader2,
  ArrowLeft,
} from "lucide-react";

// ─── Tipos de nodos del flujo ────────────────────────────────────────────────
type FlowNodeData = {
  label: string;
  nodeType: "start" | "message" | "ask_data" | "condition" | "menu" | "validate" | "escalate" | "close" | "llm";
  message?: string;
  dataType?: "nombre" | "correo" | "cuenta" | "marca" | "modelo" | "tema" | "descripcion" | "etiqueta" | "libre";
  validationType?: "texto" | "email" | "nombre_propio" | "inventario_marca" | "inventario_modelo" | "libre";
  errorMessage?: string;
  maxRetries?: number;
  onMaxRetries?: "close" | "escalate";
  menuOptions?: string[];
  conditionField?: string;
  conditionOperator?: "equals" | "contains" | "not_equals" | "is_empty" | "is_not_empty";
  conditionValue?: string;
  systemPrompt?: string;
  [key: string]: unknown;
};

// ─── Nodo personalizado ──────────────────────────────────────────────────────
function FlowNode({ id, data, selected }: { id: string; data: FlowNodeData; selected?: boolean }) {
  const iconMap: Record<string, React.ReactNode> = {
    start: <Play className="h-4 w-4" />,
    message: <MessageSquare className="h-4 w-4" />,
    ask_data: <HelpCircle className="h-4 w-4" />,
    condition: <GitBranch className="h-4 w-4" />,
    menu: <ListOrdered className="h-4 w-4" />,
    validate: <CheckCircle2 className="h-4 w-4" />,
    escalate: <AlertTriangle className="h-4 w-4" />,
    close: <XCircle className="h-4 w-4" />,
    llm: <Settings2 className="h-4 w-4" />,
  };

  const colorMap: Record<string, string> = {
    start: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
    message: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
    ask_data: "border-violet-500 bg-violet-50 dark:bg-violet-950/30",
    condition: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
    menu: "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30",
    validate: "border-teal-500 bg-teal-50 dark:bg-teal-950/30",
    escalate: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
    close: "border-red-500 bg-red-50 dark:bg-red-950/30",
    llm: "border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/30",
  };

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-xl border-2 px-3 py-2.5 shadow-sm transition-all ${
        colorMap[data.nodeType] || "border-gray-300 bg-white dark:bg-gray-900"
      } ${selected ? "ring-2 ring-brand-500 ring-offset-2 shadow-md" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted-foreground">{iconMap[data.nodeType]}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {data.nodeType.replace("_", " ")}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2">
        {data.label}
      </p>
      {data.message && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
          &ldquo;{data.message}&rdquo;
        </p>
      )}
      {data.dataType && (
        <p className="text-xs text-muted-foreground mt-1 font-medium">
          Dato: {data.dataType}
        </p>
      )}
      {data.menuOptions && data.menuOptions.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          {data.menuOptions.length} opciones
        </p>
      )}
      {/* Handle source */}
      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gray-400 border-2 border-white dark:border-gray-800"
        style={{ position: "absolute", bottom: "-6px" }}
      />
      {/* Handle target */}
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gray-400 border-2 border-white dark:border-gray-800"
        style={{ position: "absolute", top: "-6px" }}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  flowNode: FlowNode,
};

// ─── Paleta de nodos ─────────────────────────────────────────────────────────
const NODE_PALETTE: { type: FlowNodeData["nodeType"]; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: "start", label: "Inicio", icon: <Play className="h-4 w-4" />, desc: "Punto de entrada del flujo" },
  { type: "message", label: "Mensaje", icon: <MessageSquare className="h-4 w-4" />, desc: "Enviar un mensaje al cliente" },
  { type: "ask_data", label: "Pedir dato", icon: <HelpCircle className="h-4 w-4" />, desc: "Solicitar un dato específico" },
  { type: "menu", label: "Menú opciones", icon: <ListOrdered className="h-4 w-4" />, desc: "Lista de opciones seleccionables" },
  { type: "condition", label: "Condición", icon: <GitBranch className="h-4 w-4" />, desc: "Bifurcar según un campo" },
  { type: "validate", label: "Validar", icon: <CheckCircle2 className="h-4 w-4" />, desc: "Validar dato del cliente" },
  { type: "llm", label: "Supervisor LLM", icon: <Settings2 className="h-4 w-4" />, desc: "Procesar con IA" },
  { type: "escalate", label: "Escalar", icon: <AlertTriangle className="h-4 w-4" />, desc: "Pasar a agente humano" },
  { type: "close", label: "Cerrar", icon: <XCircle className="h-4 w-4" />, desc: "Cerrar conversación" },
];

// ─── Componente principal ────────────────────────────────────────────────────
export function FlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flowName, setFlowName] = useState("Flujo WhatsApp por defecto");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const nodeIdCounter = useRef(0);

  // Cargar flujo desde BD
  useEffect(() => {
    async function loadFlow() {
      try {
        const res = await fetch("/api/admin/flow-configs");
        const data = await res.json();
        if (data.flow) {
          setFlowId(data.flow.id);
          setFlowName(data.flow.nombre);
          if (data.flow.flow_data?.nodes?.length > 0) {
            setNodes(data.flow.flow_data.nodes);
            setEdges(data.flow.flow_data.edges);
          } else {
            // Crear flujo por defecto que refleja el comportamiento actual del bot
            const defaultNodes: Node[] = [
              {
                id: "start",
                type: "flowNode",
                position: { x: 400, y: 0 },
                data: { label: "Inicio", nodeType: "start", message: "¡Hola! Bienvenido a Sekunet. Para brindarle una mejor atención, necesitamos algunos datos." } as FlowNodeData,
              },
              {
                id: "pedir_nombre",
                type: "flowNode",
                position: { x: 400, y: 120 },
                data: { label: "Pedir nombre", nodeType: "ask_data", dataType: "nombre", message: "Para comenzar, ¿me podría indicar su nombre completo?", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "validar_nombre",
                type: "flowNode",
                position: { x: 400, y: 240 },
                data: { label: "Validar nombre", nodeType: "validate", validationType: "nombre_propio", errorMessage: "No reconocí un nombre completo. Por favor indíqueme su nombre y apellido (ej: María Chaves).", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "pedir_correo",
                type: "flowNode",
                position: { x: 400, y: 360 },
                data: { label: "Pedir correo", nodeType: "ask_data", dataType: "correo", message: "Por favor, indíquenos su correo electrónico para poder contactarle.", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "validar_correo",
                type: "flowNode",
                position: { x: 400, y: 480 },
                data: { label: "Validar correo", nodeType: "validate", validationType: "email", errorMessage: "El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real.", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "pedir_cuenta",
                type: "flowNode",
                position: { x: 400, y: 600 },
                data: { label: "Pedir cuenta", nodeType: "ask_data", dataType: "cuenta", message: "¿A qué empresa o cuenta afiliada a Sekunet pertenece?", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "menu_temas",
                type: "flowNode",
                position: { x: 400, y: 720 },
                data: { label: "Menú de temas", nodeType: "menu", message: "¿En relación a qué tema sería su consulta?", menuOptions: ["Configuraciones", "Consultas Técnicas", "Garantías", "Soporte de Equipos", "Ventas", "Otro"] } as FlowNodeData,
              },
              {
                id: "cond_tema",
                type: "flowNode",
                position: { x: 400, y: 840 },
                data: { label: "¿Tema es Otro?", nodeType: "condition", conditionField: "tema", conditionOperator: "equals", conditionValue: "Otro" } as FlowNodeData,
              },
              {
                id: "pedir_descripcion",
                type: "flowNode",
                position: { x: 100, y: 960 },
                data: { label: "Pedir descripción", nodeType: "ask_data", dataType: "descripcion", message: "Por favor, describa brevemente el inconveniente o consulta que tiene.", maxRetries: 2, onMaxRetries: "escalate" } as FlowNodeData,
              },
              {
                id: "pedir_marca",
                type: "flowNode",
                position: { x: 700, y: 960 },
                data: { label: "Pedir marca", nodeType: "ask_data", dataType: "marca", message: "Por favor, indíquenos la marca del equipo.", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "validar_marca",
                type: "flowNode",
                position: { x: 700, y: 1080 },
                data: { label: "Validar marca", nodeType: "validate", validationType: "inventario_marca", errorMessage: "La marca indicada no corresponde a un equipo distribuido por Sekunet. Si tiene un equipo de otra marca, indíquenosla.", maxRetries: 2, onMaxRetries: "close" } as FlowNodeData,
              },
              {
                id: "pedir_modelo",
                type: "flowNode",
                position: { x: 700, y: 1200 },
                data: { label: "Pedir modelo", nodeType: "ask_data", dataType: "modelo", message: "¿Nos podría indicar el modelo del equipo, por favor?", maxRetries: 2, onMaxRetries: "escalate" } as FlowNodeData,
              },
              {
                id: "validar_modelo",
                type: "flowNode",
                position: { x: 700, y: 1320 },
                data: { label: "Validar modelo", nodeType: "validate", validationType: "inventario_modelo", errorMessage: "No encontramos ese modelo en nuestro inventario. ¿Podría verificar el modelo del equipo?", maxRetries: 2, onMaxRetries: "escalate" } as FlowNodeData,
              },
              {
                id: "pedir_etiqueta",
                type: "flowNode",
                position: { x: 700, y: 1440 },
                data: { label: "Pedir etiqueta", nodeType: "ask_data", dataType: "etiqueta", message: "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo donde se vea el modelo y número de serie.", maxRetries: 2, onMaxRetries: "escalate" } as FlowNodeData,
              },
              {
                id: "supervisor_llm",
                type: "flowNode",
                position: { x: 400, y: 1560 },
                data: { label: "Supervisor LLM", nodeType: "llm", systemPrompt: "Eres el supervisor del bot de Sekunet. Analiza la conversación y determina si el problema puede resolverse remotamente o requiere escalamiento a un técnico." } as FlowNodeData,
              },
              {
                id: "escalar",
                type: "flowNode",
                position: { x: 200, y: 1680 },
                data: { label: "Escalar a humano", nodeType: "escalate", message: "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes." } as FlowNodeData,
              },
              {
                id: "cerrar",
                type: "flowNode",
                position: { x: 600, y: 1680 },
                data: { label: "Cerrar conversación", nodeType: "close", message: "Gracias por contactar a Sekunet. Si tiene alguna otra consulta, no dude en escribirnos. ¡Que tenga un excelente día!" } as FlowNodeData,
              },
            ];

            const defaultEdges: Edge[] = [
              { id: "e_start_nombre", source: "start", target: "pedir_nombre", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_nombre_validar", source: "pedir_nombre", target: "validar_nombre", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_validar_correo", source: "validar_nombre", target: "pedir_correo", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_correo_validar", source: "pedir_correo", target: "validar_correo", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_validar_cuenta", source: "validar_correo", target: "pedir_cuenta", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_cuenta_temas", source: "pedir_cuenta", target: "menu_temas", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_temas_cond", source: "menu_temas", target: "cond_tema", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_cond_otro", source: "cond_tema", target: "pedir_descripcion", animated: true, label: "Otro", style: { stroke: "#f59e0b", strokeWidth: 2 } },
              { id: "e_cond_marca", source: "cond_tema", target: "pedir_marca", animated: true, label: "No Otro", style: { stroke: "#10b981", strokeWidth: 2 } },
              { id: "e_marca_validar", source: "pedir_marca", target: "validar_marca", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_validar_modelo", source: "validar_marca", target: "pedir_modelo", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_modelo_validar", source: "pedir_modelo", target: "validar_modelo", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_validar_etiqueta", source: "validar_modelo", target: "pedir_etiqueta", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_etiqueta_llm", source: "pedir_etiqueta", target: "supervisor_llm", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_desc_llm", source: "pedir_descripcion", target: "supervisor_llm", animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
              { id: "e_llm_escalar", source: "supervisor_llm", target: "escalar", animated: true, label: "Escalable", style: { stroke: "#f97316", strokeWidth: 2 } },
              { id: "e_llm_cerrar", source: "supervisor_llm", target: "cerrar", animated: true, label: "Resuelto", style: { stroke: "#ef4444", strokeWidth: 2 } },
            ];

            setNodes(defaultNodes);
            setEdges(defaultEdges);
          }
        }
      } catch (e) {
        console.error("Error loading flow:", e);
      } finally {
        setLoading(false);
      }
    }
    loadFlow();
  }, [setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const addNode = (type: FlowNodeData["nodeType"]) => {
    nodeIdCounter.current += 1;
    const id = `node_${Date.now()}_${nodeIdCounter.current}`;
    const labels: Record<string, string> = {
      start: "Inicio",
      message: "Mensaje",
      ask_data: "Pedir dato",
      menu: "Menú de opciones",
      condition: "Condición",
      validate: "Validar",
      llm: "Supervisor LLM",
      escalate: "Escalar a humano",
      close: "Cerrar conversación",
    };
    const newNode: Node = {
      id,
      type: "flowNode",
      position: { x: 250 + Math.random() * 200, y: 150 + nodes.length * 100 },
      data: {
        label: labels[type] || type,
        nodeType: type,
        message: "",
        maxRetries: 2,
        onMaxRetries: "escalate",
      } as FlowNodeData,
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const deleteNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNode(null);
  };

  const updateNodeData = (id: string, key: string, value: unknown) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n
      )
    );
    if (selectedNode?.id === id) {
      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, [key]: value } });
    }
  };

  const saveFlow = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/flow-configs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: flowId,
          nombre: flowName,
          flow_data: { nodes, edges },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.flow?.id) setFlowId(data.flow.id);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error("Error saving flow:", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Workflow className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          <input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="text-lg font-bold bg-transparent border-none outline-none focus:ring-0 text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Guardado
            </span>
          )}
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Plus className="h-4 w-4" /> Nodos
          </button>
          <button
            onClick={saveFlow}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar flujo
          </button>
        </div>
      </div>

      {/* Main area: palette + canvas + inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        {showPalette && (
          <div className="w-56 border-r border-border bg-card/50 backdrop-blur-sm p-3 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/80 mb-2 px-1">
              Agregar nodo
            </p>
            <div className="space-y-1">
              {NODE_PALETTE.map((item) => (
                <button
                  key={item.type}
                  onClick={() => addNode(item.type)}
                  className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors group"
                >
                  <span className="mt-0.5 text-muted-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative bg-muted/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "#6366f1", strokeWidth: 2 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#ccc" />
            <Controls className="!bg-card !border-border !shadow-md !rounded-lg" />
            <MiniMap
              className="!bg-card !border-border !rounded-lg"
              nodeColor={(n) => {
                const colors: Record<string, string> = {
                  start: "#10b981",
                  message: "#3b82f6",
                  ask_data: "#8b5cf6",
                  condition: "#f59e0b",
                  menu: "#06b6d4",
                  validate: "#14b8a6",
                  escalate: "#f97316",
                  close: "#ef4444",
                  llm: "#d946ef",
                };
                return colors[(n.data as FlowNodeData)?.nodeType] || "#94a3b8";
              }}
            />
          </ReactFlow>
        </div>

        {/* Inspector panel */}
        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            onUpdate={(key, value) => updateNodeData(selectedNode.id, key, value)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Inspector de nodo ───────────────────────────────────────────────────────
function NodeInspector({
  node,
  onUpdate,
  onDelete,
  onClose,
}: {
  node: Node;
  onUpdate: (key: string, value: unknown) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const data = node.data as FlowNodeData;

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Configurar nodo
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Etiqueta</label>
          <input
            value={data.label || ""}
            onChange={(e) => onUpdate("label", e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Message */}
        {(data.nodeType === "start" || data.nodeType === "message" || data.nodeType === "ask_data" || data.nodeType === "escalate" || data.nodeType === "close") && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mensaje</label>
            <textarea
              value={data.message || ""}
              onChange={(e) => onUpdate("message", e.target.value)}
              rows={4}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none"
              placeholder="Texto que el bot enviará al cliente..."
            />
          </div>
        )}

        {/* Data type for ask_data */}
        {data.nodeType === "ask_data" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Dato a solicitar</label>
            <select
              value={data.dataType || "libre"}
              onChange={(e) => onUpdate("dataType", e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="nombre">Nombre completo</option>
              <option value="correo">Correo electrónico</option>
              <option value="cuenta">Empresa / Cuenta</option>
              <option value="tema">Tema de consulta</option>
              <option value="marca">Marca del equipo</option>
              <option value="modelo">Modelo del equipo</option>
              <option value="descripcion">Descripción del problema</option>
              <option value="etiqueta">Etiqueta del equipo (imagen)</option>
              <option value="libre">Texto libre</option>
            </select>
          </div>
        )}

        {/* Menu options */}
        {data.nodeType === "menu" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Opciones del menú</label>
            <div className="mt-1 space-y-1.5">
              {(data.menuOptions || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const opts = [...(data.menuOptions || [])];
                      opts[i] = e.target.value;
                      onUpdate("menuOptions", opts);
                    }}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      const opts = (data.menuOptions || []).filter((_, idx) => idx !== i);
                      onUpdate("menuOptions", opts);
                    }}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => onUpdate("menuOptions", [...(data.menuOptions || []), ""])}
                className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline mt-1"
              >
                <Plus className="h-3 w-3" /> Agregar opción
              </button>
            </div>
          </div>
        )}

        {/* Condition */}
        {data.nodeType === "condition" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Campo a evaluar</label>
              <select
                value={data.conditionField || ""}
                onChange={(e) => onUpdate("conditionField", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                <option value="nombre">Nombre</option>
                <option value="correo">Correo</option>
                <option value="cuenta">Cuenta</option>
                <option value="tema">Tema</option>
                <option value="marca">Marca</option>
                <option value="modelo">Modelo</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Operador</label>
              <select
                value={data.conditionOperator || "equals"}
                onChange={(e) => onUpdate("conditionOperator", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="equals">Es igual a</option>
                <option value="not_equals">No es igual a</option>
                <option value="contains">Contiene</option>
                <option value="is_empty">Está vacío</option>
                <option value="is_not_empty">No está vacío</option>
              </select>
            </div>
            {data.conditionOperator !== "is_empty" && data.conditionOperator !== "is_not_empty" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Valor</label>
                <input
                  value={data.conditionValue || ""}
                  onChange={(e) => onUpdate("conditionValue", e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
              Conecta la salida &ldquo;true&rdquo; al nodo si se cumple, y &ldquo;false&rdquo; al nodo si no.
            </p>
          </>
        )}

        {/* Validation */}
        {data.nodeType === "validate" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo de validación</label>
              <select
                value={data.validationType || "libre"}
                onChange={(e) => onUpdate("validationType", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="texto">Texto</option>
                <option value="email">Email</option>
                <option value="nombre_propio">Nombre propio</option>
                <option value="inventario_marca">Marca en inventario</option>
                <option value="inventario_modelo">Modelo en inventario</option>
                <option value="libre">Sin validación</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mensaje de error</label>
              <textarea
                value={data.errorMessage || ""}
                onChange={(e) => onUpdate("errorMessage", e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                placeholder="Mensaje si la validación falla..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reintentos máximos</label>
              <input
                type="number"
                value={data.maxRetries ?? 2}
                onChange={(e) => onUpdate("maxRetries", parseInt(e.target.value) || 2)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Al alcanzar reintentos</label>
              <select
                value={data.onMaxRetries || "escalate"}
                onChange={(e) => onUpdate("onMaxRetries", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="escalate">Escalar a humano</option>
                <option value="close">Cerrar conversación</option>
              </select>
            </div>
          </>
        )}

        {/* LLM Supervisor */}
        {data.nodeType === "llm" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Prompt del sistema</label>
            <textarea
              value={data.systemPrompt || ""}
              onChange={(e) => onUpdate("systemPrompt", e.target.value)}
              rows={8}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs font-mono focus:ring-2 focus:ring-brand-500 outline-none resize-none"
              placeholder="Eres el supervisor del bot de Sekunet. Tu trabajo es..."
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 className="h-4 w-4" /> Eliminar nodo
        </button>
      </div>
    </div>
  );
}
