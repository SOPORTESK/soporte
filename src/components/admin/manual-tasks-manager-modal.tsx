"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  Hammer,
  Cpu,
  HardDrive,
  Laptop,
  Monitor,
  Zap,
  BatteryCharging,
  Stethoscope,
  Package,
  Boxes,
  Truck,
  Archive,
  Tag,
  ClipboardList,
  Layers,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  FileText,
  FolderTree,
  Briefcase,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  Users,
  UserPlus,
  Phone,
  Headphones,
  MessageSquare,
  Mail,
  Video,
  Sparkles,
  Brush,
  Trash2,
  Sandwich,
  Coffee,
  Bath,
  GraduationCap,
  Clock,
  Timer,
  Check,
  Edit2,
  X,
  Plus,
  LayoutGrid,
  Info,
  Camera,
  Wifi,
  Router,
  Cable,
  Plug,
  Thermometer,
  Gauge,
  Ruler,
  Scissors,
  Printer,
  ScanLine,
  QrCode,
  KeyRound,
  Lock,
  Unlock,
  Eye,
  Settings,
  Cog,
  Wrench as Tool,
  Construction,
  HardHat,
  Flame,
  Droplets,
  Wind,
  Sun,
  Lightbulb,
  RadioTower,
  Antenna,
  Signal,
  Globe,
  MapPin,
  Navigation,
  Car,
  Bike,
  CircuitBoard,
  Microchip,
  MemoryStick,
  Usb,
  Bluetooth,
  Nfc,
  Warehouse,
  Store,
  ShoppingCart,
  ShoppingBag,
  Receipt,
  CreditCard,
  DollarSign,
  BarChart3,
  PieChart,
  TrendingUp,
  FileSpreadsheet,
  FileBadge,
  FileCheck,
  Clipboard,
  ClipboardCheck,
  ListChecks,
  CalendarDays,
  AlarmClock,
  Hourglass,
  Footprints,
  HandMetal,
  Megaphone,
  Bell,
  BellRing,
  Heart,
  ThumbsUp,
  Star,
  Award,
  Trophy,
  Target,
  Crosshair,
  Focus,
  ScanEye,
  TestTube2,
  Microscope,
  Siren,
  ShieldAlert,
  BadgeCheck,
  Stamp,
  BookOpen,
  NotebookPen,
  Presentation,
  Fan,
  Power,
  PowerOff,
  Battery,
  BatteryFull,
  BatteryLow,
  Disc,
  Server,
  Tablet,
  Tv,
  Speaker,
  Radio,
  Webcam,
  Mouse,
  Keyboard,
  Smartphone,
  Paintbrush,
  Cctv,
  Cast,
  Network,
  ServerCog,
  ServerCrash,
  Satellite,
  Radar,
  Cloud,
  CloudUpload,
  CloudDownload,
  Rss,
  Binary,
  Database,
  Box,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  Compass,
  Send,
  Plane,
  Signpost,
  Map,
  ShieldQuestion,
  ShieldX,
  Fingerprint,
  Key,
  Shield,
  AlertOctagon,
  Ban,
  Medal,
  Activity,
  LineChart,
  Calculator,
  FileCode,
  FolderSync,
  GitBranch,
  History,
  Terminal,
  Workflow,
  Coins,
  Banknote,
  Landmark,
  Percent,
  BadgePercent,
  BadgeDollarSign,
  Wallet,
  PiggyBank,
  HandCoins,
  ReceiptText,
  ArrowUpRight,
  MessageCircle,
  MessagesSquare,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  UserCheck,
  AtSign,
  Contact,
  Mic,
  Volume2,
  CupSoda,
  Utensils,
  UtensilsCrossed,
  Apple,
  Moon,
  Bed,
  Smile,
  Music,
  Dumbbell,
  GlassWater,
  DoorClosed,
} from "lucide-react";
import { toast } from "sonner";

// Ícono SVG de Inodoro / Sanitario (WC) acorde al estilo Lucide
export function Toilet({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M5 2h5a1 1 0 0 1 1 1v8H5V3a1 1 0 0 1 1-1Z" />
      <path d="M4 2h7" />
      <path d="M7 5h1.5" />
      <path d="M5 11h11a1 1 0 0 1 1 1c0 3.5-2.5 6-6 6H8.5c-2 0-3.5-1.2-3.5-3.5V11Z" />
      <path d="M8 18v3h5v-3" />
      <path d="M6 21h9" />
    </svg>
  );
}

// Ícono SVG de Papel Higiénico / Sanitario
export function ToiletPaper({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="8" cy="10" r="6" />
      <circle cx="8" cy="10" r="2" />
      <path d="M8 4h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8" />
      <path d="M18 16v6h-8" />
    </svg>
  );
}

export interface ManualTaskItem {
  id: string;
  label: string;
  category: string;
  subcategory?: string | null;
  iconName?: string;
  color?: string;
}

export interface AvailableIconDef {
  name: string;
  label: string;
  category: "taller" | "logistica" | "gestion" | "comunicacion" | "pausas" | "seguridad" | "redes" | "comercial";
  keywords: string;
  icon: any;
  color: string;
}

export const AVAILABLE_ICONS: AvailableIconDef[] = [
  // ── 🔧 Taller & Hardware ──
  { name: "Wrench", label: "Herramienta / Llave", category: "taller", keywords: "llave inglesa reparacion taller tecnico mecanico", icon: Wrench, color: "text-orange-400" },
  { name: "Hammer", label: "Martillo / Golpe", category: "taller", keywords: "herramienta golpe construccion ensamblaje", icon: Hammer, color: "text-amber-400" },
  { name: "Cpu", label: "Procesador / CPU", category: "taller", keywords: "chip cpu placa madre micro electronica", icon: Cpu, color: "text-cyan-400" },
  { name: "CircuitBoard", label: "Circuito / PCB", category: "taller", keywords: "placa circuito electronica pcb tarjeta", icon: CircuitBoard, color: "text-emerald-400" },
  { name: "Microchip", label: "Microchip / IC", category: "taller", keywords: "chip integrado micro procesador ic componente", icon: Microchip, color: "text-violet-400" },
  { name: "MemoryStick", label: "Memoria RAM", category: "taller", keywords: "ram memoria modulo dimm stick almacenamiento", icon: MemoryStick, color: "text-sky-400" },
  { name: "HardDrive", label: "Disco Duro / SSD", category: "taller", keywords: "almacenamiento ssd hdd disco memoria nvme", icon: HardDrive, color: "text-blue-400" },
  { name: "Disc", label: "Unidad Óptica / Disco", category: "taller", keywords: "cd dvd bluray disco optico grabador", icon: Disc, color: "text-purple-300" },
  { name: "Laptop", label: "Portátil / Laptop", category: "taller", keywords: "pc portatil equipo computador notebook macbook", icon: Laptop, color: "text-slate-300" },
  { name: "Monitor", label: "Pantalla / Monitor", category: "taller", keywords: "display pantalla video monitor hdmi vga", icon: Monitor, color: "text-indigo-400" },
  { name: "Tablet", label: "Tablet / iPad", category: "taller", keywords: "tablet ipad pantalla tactil surface android", icon: Tablet, color: "text-teal-300" },
  { name: "Smartphone", label: "Celular / Móvil", category: "taller", keywords: "celular telefono smartphone movil iphone android", icon: Smartphone, color: "text-emerald-400" },
  { name: "Tv", label: "Televisor / Smart TV", category: "taller", keywords: "tv tele television pantalla monitor grande", icon: Tv, color: "text-sky-400" },
  { name: "Speaker", label: "Parlante / Audio", category: "taller", keywords: "altavoz bocina parlante corneta audio sonido", icon: Speaker, color: "text-orange-400" },
  { name: "Radio", label: "Radio / Transmisor", category: "taller", keywords: "radio walkie talkie emisor comunicador", icon: Radio, color: "text-yellow-400" },
  { name: "Webcam", label: "Cámara Web", category: "taller", keywords: "webcam camara video llamada streaming", icon: Webcam, color: "text-rose-400" },
  { name: "Mouse", label: "Mouse / Ratón", category: "taller", keywords: "mouse raton periferico puntero usb", icon: Mouse, color: "text-slate-300" },
  { name: "Keyboard", label: "Teclado", category: "taller", keywords: "teclado mecanico usb periferico digitacion", icon: Keyboard, color: "text-slate-400" },
  { name: "Server", label: "Servidor / Rack", category: "taller", keywords: "servidor server rack datacenter nodo blade", icon: Server, color: "text-blue-500" },
  { name: "Zap", label: "Energía / Soldadura", category: "taller", keywords: "voltaje corriente soldar electronica rayo corto", icon: Zap, color: "text-yellow-400" },
  { name: "BatteryCharging", label: "Carga de Batería", category: "taller", keywords: "bateria carga cargador pila energia", icon: BatteryCharging, color: "text-green-400" },
  { name: "Battery", label: "Batería / Pila", category: "taller", keywords: "pila bateria ups respaldo acumulador", icon: Battery, color: "text-emerald-400" },
  { name: "BatteryLow", label: "Batería Baja", category: "taller", keywords: "bateria baja agotada descarga cambio pila", icon: BatteryLow, color: "text-red-400" },
  { name: "BatteryFull", label: "Batería Completa", category: "taller", keywords: "bateria llena 100% carga probada", icon: BatteryFull, color: "text-green-500" },
  { name: "Power", label: "Encendido / Fuente", category: "taller", keywords: "fuente alimentacion poder encendido boton switch", icon: Power, color: "text-emerald-400" },
  { name: "PowerOff", label: "Apagado / Desconexión", category: "taller", keywords: "apagar corte desconectar desenchufar", icon: PowerOff, color: "text-rose-400" },
  { name: "Fan", label: "Cooler / Ventilador", category: "taller", keywords: "cooler ventilador disipador pasta termica calor", icon: Fan, color: "text-cyan-300" },
  { name: "Usb", label: "Puerto USB", category: "taller", keywords: "usb puerto conector pendrive memoria cable", icon: Usb, color: "text-blue-300" },
  { name: "Plug", label: "Enchufe / Corriente", category: "taller", keywords: "enchufe cable corriente toma electricidad 110v 220v", icon: Plug, color: "text-amber-300" },
  { name: "Cable", label: "Cableado / Patchcord", category: "taller", keywords: "cable red utp fibra ethernet ponchado rj45", icon: Cable, color: "text-gray-400" },
  { name: "Printer", label: "Impresora", category: "taller", keywords: "impresion imprimir papel toner cartucho termica", icon: Printer, color: "text-slate-400" },
  { name: "Scissors", label: "Corte / Pelacables", category: "taller", keywords: "cortar tijera precision pelacables crimpadora", icon: Scissors, color: "text-rose-400" },
  { name: "Flame", label: "Pistola de Calor", category: "taller", keywords: "calor fuego soldar termocontractil pistola smd", icon: Flame, color: "text-red-500" },
  { name: "Lightbulb", label: "Iluminación / Foco", category: "taller", keywords: "foco lampara led iluminar luz inspeccion", icon: Lightbulb, color: "text-yellow-300" },
  { name: "Paintbrush", label: "Mantenimiento / Brocha", category: "taller", keywords: "brocha limpiar polvo sopletear cepillo alcohol", icon: Paintbrush, color: "text-pink-400" },

  // ── 📡 Redes & CCTV ──
  { name: "Cctv", label: "Cámara CCTV Domo", category: "redes", keywords: "cctv camara domo hikvision dahua seguridad vigilancia nvr", icon: Cctv, color: "text-red-400" },
  { name: "Camera", label: "Cámara Bullet / IP", category: "redes", keywords: "camara bala bullet cctv vigilancia lente sensor dvr", icon: Camera, color: "text-rose-400" },
  { name: "Router", label: "Router / Mikrotik", category: "redes", keywords: "router switch mikrotik red gateway firewall core", icon: Router, color: "text-cyan-400" },
  { name: "Wifi", label: "WiFi / Access Point", category: "redes", keywords: "wifi wireless inalambrico señal access point ubiquiti", icon: Wifi, color: "text-sky-400" },
  { name: "Network", label: "Red Local / LAN", category: "redes", keywords: "red local lan switches cableado conexion ethernet", icon: Network, color: "text-emerald-400" },
  { name: "RadioTower", label: "Torre / Antena Punto a Punto", category: "redes", keywords: "antena torre repetidora enlace ptp ptmp mikrotik", icon: RadioTower, color: "text-purple-400" },
  { name: "Antenna", label: "Antena Receptora", category: "redes", keywords: "antena wireless plato plato sxt lhg airmax", icon: Antenna, color: "text-violet-400" },
  { name: "Signal", label: "Señal / Intensidad", category: "redes", keywords: "señal cobertura alcance intensidad barra dbm rssi", icon: Signal, color: "text-green-400" },
  { name: "Globe", label: "Internet / WAN", category: "redes", keywords: "internet web wan navegacion global enlace troncal", icon: Globe, color: "text-blue-400" },
  { name: "Bluetooth", label: "Bluetooth", category: "redes", keywords: "bluetooth inalambrico emparejamiento dispositivo ble", icon: Bluetooth, color: "text-blue-500" },
  { name: "Nfc", label: "NFC / Proximidad", category: "redes", keywords: "nfc proximidad contacto tarjeta lector rfid", icon: Nfc, color: "text-indigo-300" },
  { name: "ServerCog", label: "Servidor Config / Proxy", category: "redes", keywords: "servidor configuracion dns dhcp radius proxy vpn", icon: ServerCog, color: "text-teal-400" },
  { name: "ServerCrash", label: "Falla de Servidor / Caída", category: "redes", keywords: "servidor caido timeout desconectado alerta caida", icon: ServerCrash, color: "text-red-500" },
  { name: "Satellite", label: "Enlace Satelital", category: "redes", keywords: "satelite starlink conexion remota antena espacio", icon: Satellite, color: "text-sky-300" },
  { name: "Radar", label: "Escaneo de Red / Radar", category: "redes", keywords: "radar escaner ip ips arp broadcast descubrimiento", icon: Radar, color: "text-lime-400" },
  { name: "Cloud", label: "Nube / Cloud", category: "redes", keywords: "nube cloud remoto hosting backup online", icon: Cloud, color: "text-blue-300" },
  { name: "CloudUpload", label: "Subir a la Nube", category: "redes", keywords: "upload subir respaldo backup envio sinc", icon: CloudUpload, color: "text-cyan-400" },
  { name: "CloudDownload", label: "Descarga de Nube", category: "redes", keywords: "download descargar backup firmware imagen restore", icon: CloudDownload, color: "text-indigo-400" },
  { name: "Database", label: "Base de Datos", category: "redes", keywords: "base datos sql db postgres storage data", icon: Database, color: "text-amber-400" },
  { name: "Binary", label: "Tráfico de Datos / Binario", category: "redes", keywords: "trafico ancho banda bits bytes paquetes ping", icon: Binary, color: "text-emerald-300" },
  { name: "Cast", label: "Transmisión / Streaming", category: "redes", keywords: "cast streaming transmitir pantalla rtsp stream nvr", icon: Cast, color: "text-orange-400" },
  { name: "Rss", label: "Feed / Monitoreo", category: "redes", keywords: "rss feed canal transmision eventos traps snmp", icon: Rss, color: "text-amber-500" },

  // ── 📦 Logística & Bodega ──
  { name: "Package", label: "Paquete / Repuestos", category: "logistica", keywords: "bodega repuesto caja paquete envio pedido", icon: Package, color: "text-amber-400" },
  { name: "Boxes", label: "Stock / Estantería", category: "logistica", keywords: "cajas bodega inventario stock mercaderia", icon: Boxes, color: "text-orange-400" },
  { name: "Box", label: "Caja Individual", category: "logistica", keywords: "caja embalaje pieza unidad repuesto", icon: Box, color: "text-yellow-500" },
  { name: "PackageCheck", label: "Paquete Verificado / Entregado", category: "logistica", keywords: "paquete recibido ok entregado verificado ingresado", icon: PackageCheck, color: "text-green-400" },
  { name: "PackagePlus", label: "Ingreso a Bodega", category: "logistica", keywords: "nuevo ingreso recepcion compra entrada repuesto", icon: PackagePlus, color: "text-emerald-400" },
  { name: "PackageSearch", label: "Búsqueda en Bodega", category: "logistica", keywords: "buscar repuesto localizar ubicar consultar stock", icon: PackageSearch, color: "text-sky-400" },
  { name: "Warehouse", label: "Bodega Central / Galpón", category: "logistica", keywords: "bodega nave almacen central deposito distribucion", icon: Warehouse, color: "text-amber-500" },
  { name: "Truck", label: "Transporte / Camión", category: "logistica", keywords: "camion flete despacho envio logistica furgon", icon: Truck, color: "text-blue-400" },
  { name: "Car", label: "Vehículo / Visita Técnica", category: "logistica", keywords: "carro vehiculo auto visita instalacion entrega terreno", icon: Car, color: "text-slate-300" },
  { name: "Bike", label: "Moto / Mensajería Rápida", category: "logistica", keywords: "moto mensajero express envio rapido ruta", icon: Bike, color: "text-teal-400" },
  { name: "Plane", label: "Envío Aéreo / Importación", category: "logistica", keywords: "avion importacion miami courier dhl fedex aereo", icon: Plane, color: "text-indigo-400" },
  { name: "Archive", label: "Archivo / Gavetas", category: "logistica", keywords: "gaveta archivo almacenamiento cajon historico", icon: Archive, color: "text-stone-400" },
  { name: "Tag", label: "Etiqueta / SKU", category: "logistica", keywords: "etiquetado codigo precio garantia tag sku marbete", icon: Tag, color: "text-pink-400" },
  { name: "ScanLine", label: "Escáner / Código de Barras", category: "logistica", keywords: "escaner barcode codigo barras lector pistola lectora", icon: ScanLine, color: "text-lime-400" },
  { name: "QrCode", label: "Código QR", category: "logistica", keywords: "qr codigo escanear enlace etiqueta identificador", icon: QrCode, color: "text-gray-300" },
  { name: "ClipboardList", label: "Inventario / Planilla", category: "logistica", keywords: "conteo inventario lista planilla control auditoria", icon: ClipboardList, color: "text-emerald-400" },
  { name: "Layers", label: "Niveles / Pallets", category: "logistica", keywords: "estantes niveles organizacion capas pallets", icon: Layers, color: "text-teal-400" },
  { name: "MapPin", label: "Ubicación en Bodega", category: "logistica", keywords: "ubicacion zona estante posicion mapa pasillo", icon: MapPin, color: "text-red-400" },
  { name: "Map", label: "Mapa / Ruta de Envíos", category: "logistica", keywords: "mapa ruta logistica recorrido sectores zonas", icon: Map, color: "text-emerald-400" },
  { name: "Signpost", label: "Dirección / Despacho", category: "logistica", keywords: "senalamiento direccion destino despacho", icon: Signpost, color: "text-amber-400" },
  { name: "Navigation", label: "En Tránsito / GPS", category: "logistica", keywords: "transito gps navegacion ruta viaje desplazamiento", icon: Navigation, color: "text-blue-400" },
  { name: "Send", label: "Despachado / Enviado", category: "logistica", keywords: "despachar enviar salida envio paquete remision", icon: Send, color: "text-sky-400" },
  { name: "ShoppingBag", label: "Bolsa de Entrega", category: "logistica", keywords: "bolsa empaque mostrador entrega cliente", icon: ShoppingBag, color: "text-violet-400" },

  // ── 🛡️ Seguridad & Calidad ──
  { name: "ShieldCheck", label: "Garantía Validada", category: "seguridad", keywords: "garantia escudo seguro validado ok aprobado respaldo", icon: ShieldCheck, color: "text-green-400" },
  { name: "ShieldAlert", label: "Alerta de Seguridad", category: "seguridad", keywords: "alerta escudo peligro warning seguridad riesgo", icon: ShieldAlert, color: "text-red-400" },
  { name: "ShieldQuestion", label: "Revisión de Garantía", category: "seguridad", keywords: "duda garantia consulta estado reclamo evaluar", icon: ShieldQuestion, color: "text-amber-400" },
  { name: "ShieldX", label: "Garantía Anulada / Rechazo", category: "seguridad", keywords: "anulada rechazada dano fisico garantia no aplica", icon: ShieldX, color: "text-rose-500" },
  { name: "Shield", label: "Protección / Blindaje", category: "seguridad", keywords: "escudo proteccion blindaje defensa resguardo", icon: Shield, color: "text-cyan-400" },
  { name: "CheckCircle2", label: "Control de Calidad (QC)", category: "seguridad", keywords: "aprobado calidad chequeo ok verificacion qc passed", icon: CheckCircle2, color: "text-emerald-400" },
  { name: "BadgeCheck", label: "Certificación Oficial", category: "seguridad", keywords: "certificado badge validado marca aprobado norma", icon: BadgeCheck, color: "text-blue-400" },
  { name: "HardHat", label: "Casco / Seguridad Ocupacional", category: "seguridad", keywords: "casco proteccion epp seguridad industrial taller obra", icon: HardHat, color: "text-yellow-500" },
  { name: "Siren", label: "Alarma / Emergencia", category: "seguridad", keywords: "sirena alarma emergencia policia alerta robo conato", icon: Siren, color: "text-red-500" },
  { name: "Lock", label: "Cerrado / Candado", category: "seguridad", keywords: "candado bloqueo seguridad cerrado proteccion seguro", icon: Lock, color: "text-yellow-400" },
  { name: "Unlock", label: "Desbloqueo de Equipo", category: "seguridad", keywords: "abrir desbloqueo unlock clave acceso liberar", icon: Unlock, color: "text-green-300" },
  { name: "KeyRound", label: "Llave de Acceso", category: "seguridad", keywords: "llave clave acceso contrasena password token", icon: KeyRound, color: "text-amber-300" },
  { name: "Key", label: "Llave Maestra", category: "seguridad", keywords: "llave master fisica candado puerta taller", icon: Key, color: "text-yellow-400" },
  { name: "Fingerprint", label: "Huella Digital / Biometría", category: "seguridad", keywords: "huella biometrico acceso dsc zkteco cerradura", icon: Fingerprint, color: "text-teal-400" },
  { name: "ScanEye", label: "Escáner Biométrico", category: "seguridad", keywords: "biometrico iris escaneo identificacion facial", icon: ScanEye, color: "text-cyan-300" },
  { name: "Eye", label: "Supervisión / Monitoreo", category: "seguridad", keywords: "ojo supervisar vigilar monitorear revision guardia", icon: Eye, color: "text-violet-400" },
  { name: "AlertOctagon", label: "Parada de Emergencia", category: "seguridad", keywords: "alto stop emergencia peligro detencion critica", icon: AlertOctagon, color: "text-red-600" },
  { name: "Ban", label: "Prohibido / Bloqueado", category: "seguridad", keywords: "prohibido no pase denegado bloqueado restringido", icon: Ban, color: "text-rose-400" },
  { name: "Award", label: "Sello de Calidad / Premio", category: "seguridad", keywords: "premio sello calificado nivel superior distincion", icon: Award, color: "text-amber-400" },
  { name: "Medal", label: "Medalla / Estándar", category: "seguridad", keywords: "medalla estandar cumplimiento 100% excelencia", icon: Medal, color: "text-yellow-400" },

  // ── 📋 Gestión, Medición & Software ──
  { name: "RefreshCw", label: "Reset / Reinstalación", category: "gestion", keywords: "firmware actualizar reinicio reset mikrotik flasheo", icon: RefreshCw, color: "text-sky-400" },
  { name: "Settings", label: "Configuración / Setup", category: "gestion", keywords: "engranaje config ajuste setup sistema parametros", icon: Settings, color: "text-gray-400" },
  { name: "SlidersHorizontal", label: "Calibración Fina", category: "gestion", keywords: "ajuste configuracion nivel calibrar precision ajuste", icon: SlidersHorizontal, color: "text-purple-400" },
  { name: "FileText", label: "Informe Técnico / Guía", category: "gestion", keywords: "reporte papel factura documento orden reporte servicio", icon: FileText, color: "text-slate-300" },
  { name: "FileSpreadsheet", label: "Excel / Hoja de Cálculo", category: "gestion", keywords: "excel hoja calculo tabla spreadsheet datos registro", icon: FileSpreadsheet, color: "text-green-500" },
  { name: "FileCode", label: "Script / Terminal Code", category: "gestion", keywords: "codigo script terminal comando config routeros", icon: FileCode, color: "text-emerald-400" },
  { name: "Terminal", label: "Consola de Comandos", category: "gestion", keywords: "consola ssh telnet terminal cli routeros mikrotik", icon: Terminal, color: "text-green-400" },
  { name: "Workflow", label: "Flujo de Procesos", category: "gestion", keywords: "flujo proceso diagrama workflow pasos etapas", icon: Workflow, color: "text-cyan-400" },
  { name: "FolderTree", label: "Clasificación / Estructura", category: "gestion", keywords: "arbol carpetas gestion proceso estructura jerarquia", icon: FolderTree, color: "text-amber-400" },
  { name: "FolderSync", label: "Sincronización de Archivos", category: "gestion", keywords: "sincronizar backup respaldo copia carpetas", icon: FolderSync, color: "text-blue-400" },
  { name: "Briefcase", label: "Gestión Administrativa", category: "gestion", keywords: "maletin oficina administracion tramite gerencia", icon: Briefcase, color: "text-indigo-400" },
  { name: "Search", label: "Inspección / Peritaje", category: "gestion", keywords: "lupa buscar inspeccionar revisar peritaje buscar", icon: Search, color: "text-blue-300" },
  { name: "Stethoscope", label: "Diagnóstico Profundo", category: "gestion", keywords: "revision diagnostico chequeo prueba estetoscopio", icon: Stethoscope, color: "text-teal-400" },
  { name: "Thermometer", label: "Medición de Temperatura", category: "gestion", keywords: "temperatura calor frio termico sensor grados termocupla", icon: Thermometer, color: "text-red-400" },
  { name: "Gauge", label: "Medición / Multímetro", category: "gestion", keywords: "medidor velocimetro presion voltaje amperaje multimetro", icon: Gauge, color: "text-teal-400" },
  { name: "Ruler", label: "Medición / Medidas Físicas", category: "gestion", keywords: "regla medir distancia largo ancho metro calipre", icon: Ruler, color: "text-yellow-300" },
  { name: "TestTube2", label: "Ensayo / Test Bench", category: "gestion", keywords: "prueba test laboratorio ensayo banco prueba", icon: TestTube2, color: "text-violet-400" },
  { name: "Microscope", label: "Microscopio / Soldadura SMD", category: "gestion", keywords: "microscopio detalle analisis precision aumento smd", icon: Microscope, color: "text-indigo-300" },
  { name: "Target", label: "Meta / KPI Operativo", category: "gestion", keywords: "objetivo meta kpi indicador cumplimiento blanco", icon: Target, color: "text-red-400" },
  { name: "BarChart3", label: "Estadísticas / Métricas", category: "gestion", keywords: "grafico estadistica reporte metricas barras productividad", icon: BarChart3, color: "text-blue-400" },
  { name: "LineChart", label: "Tendencias / Gráficos", category: "gestion", keywords: "linea tendencia grafica curvas analisis historico", icon: LineChart, color: "text-emerald-400" },
  { name: "Activity", label: "Monitoreo en Vivo", category: "gestion", keywords: "actividad pulso en vivo monitor tiempo real estado", icon: Activity, color: "text-emerald-400" },
  { name: "ListChecks", label: "Checklist de Tareas", category: "gestion", keywords: "lista verificacion checklist pasos pendientes completado", icon: ListChecks, color: "text-green-400" },
  { name: "CalendarDays", label: "Agenda / Programación", category: "gestion", keywords: "calendario fecha agenda programar cita dia visita", icon: CalendarDays, color: "text-blue-300" },
  { name: "Calculator", label: "Cálculo / Presupuestos", category: "gestion", keywords: "calculadora cuentas numeros costos calculo sumar", icon: Calculator, color: "text-slate-300" },
  { name: "Stamp", label: "Sello de Autorización", category: "gestion", keywords: "sello estampa aprobacion firma autorizado sellado", icon: Stamp, color: "text-purple-400" },
  { name: "GitBranch", label: "Versiones / Sucursales", category: "gestion", keywords: "ramas version control sucursales bifurcacion", icon: GitBranch, color: "text-orange-400" },
  { name: "History", label: "Historial de Registros", category: "gestion", keywords: "historial log auditoria tiempo pasado cambios", icon: History, color: "text-amber-400" },

  // ── 💰 Comercial & Ventas ──
  { name: "Store", label: "Tienda / Sala de Ventas", category: "comercial", keywords: "tienda local sucursal punto venta mostrador vitrina", icon: Store, color: "text-violet-400" },
  { name: "ShoppingCart", label: "Ventas / Carrito", category: "comercial", keywords: "compra venta carrito pedido orden despacho", icon: ShoppingCart, color: "text-sky-400" },
  { name: "Receipt", label: "Factura / Boleta", category: "comercial", keywords: "factura recibo boleta comprobante ticket venta ccf", icon: Receipt, color: "text-slate-300" },
  { name: "ReceiptText", label: "Cotización Detallada", category: "comercial", keywords: "cotizacion proforma detalle precios presupuesto cliente", icon: ReceiptText, color: "text-cyan-300" },
  { name: "CreditCard", label: "Cobro con Tarjeta", category: "comercial", keywords: "tarjeta cobro pago credito debito datafono pos terminal", icon: CreditCard, color: "text-indigo-400" },
  { name: "DollarSign", label: "Precio / Dólares", category: "comercial", keywords: "dolar precio cotizacion presupuesto dinero costo", icon: DollarSign, color: "text-green-400" },
  { name: "Coins", label: "Efectivo / Monedas", category: "comercial", keywords: "monedas cambio vuelto efectivo caja chica dinero", icon: Coins, color: "text-amber-400" },
  { name: "Banknote", label: "Billetes / Caja", category: "comercial", keywords: "billetes pago efectivo arqueo cierre de caja", icon: Banknote, color: "text-emerald-400" },
  { name: "Wallet", label: "Billetera / Cobros", category: "comercial", keywords: "cartera billetera cobros recaudacion pagos wallet", icon: Wallet, color: "text-orange-400" },
  { name: "HandCoins", label: "Comisión / Descuento", category: "comercial", keywords: "comision propina descuento bono incentivo entrega dinero", icon: HandCoins, color: "text-yellow-400" },
  { name: "PiggyBank", label: "Ahorro / Presupuesto", category: "comercial", keywords: "alcancia ahorro fondo provision reserva financiera", icon: PiggyBank, color: "text-pink-400" },
  { name: "Landmark", label: "Transferencia Bancaria", category: "comercial", keywords: "banco transferencia deposito cuenta cheque sinpe", icon: Landmark, color: "text-blue-400" },
  { name: "Percent", label: "Oferta / Descuento %", category: "comercial", keywords: "porcentaje descuento rebaja promocion liquidacion", icon: Percent, color: "text-rose-400" },
  { name: "BadgePercent", label: "Promoción Especial", category: "comercial", keywords: "promo promocion descuento insignia oferta especial", icon: BadgePercent, color: "text-amber-500" },
  { name: "BadgeDollarSign", label: "Lista de Precios Oficial", category: "comercial", keywords: "precios lista oficial tarifa costo mayoreo", icon: BadgeDollarSign, color: "text-emerald-500" },
  { name: "TrendingUp", label: "Crecimiento de Ventas", category: "comercial", keywords: "crecimiento tendencia kpi ventas rendimiento ganancia", icon: TrendingUp, color: "text-emerald-400" },
  { name: "ArrowUpRight", label: "Incremento / Facturación", category: "comercial", keywords: "subida facturacion meta superada exito incremento", icon: ArrowUpRight, color: "text-green-400" },

  // ── 💬 Comunicación & Atención ──
  { name: "Users", label: "Reunión de Taller", category: "comunicacion", keywords: "equipo reunion junta personas charla personal staff", icon: Users, color: "text-blue-400" },
  { name: "UserPlus", label: "Atención en Mostrador", category: "comunicacion", keywords: "cliente atencion mostrador ventanilla recepcion cliente nuevo", icon: UserPlus, color: "text-green-400" },
  { name: "UserCheck", label: "Cliente Satisfecho", category: "comunicacion", keywords: "cliente verificado listo conformidad entrega conforme", icon: UserCheck, color: "text-emerald-400" },
  { name: "Phone", label: "Llamada Telefónica", category: "comunicacion", keywords: "llamada telefono soporte auricular marcar voz", icon: Phone, color: "text-emerald-400" },
  { name: "PhoneCall", label: "Llamada Entrante / Saliente", category: "comunicacion", keywords: "llamando celular comunicar marcar atender", icon: PhoneCall, color: "text-green-500" },
  { name: "PhoneIncoming", label: "Llamada de Cliente", category: "comunicacion", keywords: "entrante recepcion contestar soporte cliente", icon: PhoneIncoming, color: "text-sky-400" },
  { name: "PhoneForwarded", label: "Transferir Llamada", category: "comunicacion", keywords: "desviar transferir pasar llamada derivar interno", icon: PhoneForwarded, color: "text-amber-400" },
  { name: "Headphones", label: "Soporte con Diadema", category: "comunicacion", keywords: "diadema headset ayuda soporte callcenter audifonos", icon: Headphones, color: "text-violet-400" },
  { name: "MessageSquare", label: "Chat / Mensajes", category: "comunicacion", keywords: "chat whatsapp mensaje respuesta texto conversacion", icon: MessageSquare, color: "text-green-500" },
  { name: "MessageCircle", label: "WhatsApp Directo", category: "comunicacion", keywords: "whatsapp mensaje directo globo charla cliente", icon: MessageCircle, color: "text-emerald-400" },
  { name: "MessagesSquare", label: "Canal Interno / Grupo", category: "comunicacion", keywords: "chat grupal soporte equipo canal interno discusion", icon: MessagesSquare, color: "text-teal-400" },
  { name: "Mail", label: "Correo Electrónico", category: "comunicacion", keywords: "email correo mensaje carta bandeja outlook gmail", icon: Mail, color: "text-sky-400" },
  { name: "AtSign", label: "Mención / Contacto Directo", category: "comunicacion", keywords: "arroba mencion usuario contacto etiquetar", icon: AtSign, color: "text-blue-300" },
  { name: "Video", label: "Videollamada / Teams", category: "comunicacion", keywords: "camara teams zoom video reunion pantalla remota", icon: Video, color: "text-blue-500" },
  { name: "Megaphone", label: "Aviso / Comunicado", category: "comunicacion", keywords: "megafono anuncio aviso comunicado informar circular", icon: Megaphone, color: "text-amber-400" },
  { name: "Bell", label: "Notificación / Recordatorio", category: "comunicacion", keywords: "campana notificacion alerta aviso recordatorio sonar", icon: Bell, color: "text-yellow-400" },
  { name: "Presentation", label: "Capacitación a Clientes", category: "comunicacion", keywords: "presentacion slides diapositivas exposicion charla demo", icon: Presentation, color: "text-indigo-400" },
  { name: "Contact", label: "Libreta de Contactos", category: "comunicacion", keywords: "contactos agenda directorio proveedores clientes telefonos", icon: Contact, color: "text-purple-400" },
  { name: "Mic", label: "Nota de Voz / Micrófono", category: "comunicacion", keywords: "microfono voz audio grabar dictado mensaje de voz", icon: Mic, color: "text-rose-400" },
  { name: "Volume2", label: "Perifoneo / Audio Taller", category: "comunicacion", keywords: "volumen parlante altavoz aviso sonoro llamado", icon: Volume2, color: "text-cyan-400" },

  // ── ☕ Pausas & Bienestar ──
  { name: "Sparkles", label: "Limpieza y Orden", category: "pausas", keywords: "limpieza orden brillar polvo aseo pulcro acomodar", icon: Sparkles, color: "text-yellow-300" },
  { name: "Brush", label: "Detallado y Acabado", category: "pausas", keywords: "brocha mantenimiento pulido acabado pincel detalle", icon: Brush, color: "text-pink-400" },
  { name: "Trash2", label: "Desechos y Chatarra", category: "pausas", keywords: "basura residuos reciclaje descartar chatarra bote", icon: Trash2, color: "text-red-400" },
  { name: "Droplets", label: "Aseo Húmedo / Trapeado", category: "pausas", keywords: "agua limpieza mojado humedo lavado sanitizacion", icon: Droplets, color: "text-blue-400" },
  { name: "Sandwich", label: "Almuerzo / Comida", category: "pausas", keywords: "almuerzo comer sandwich alimento pausa comida mediodia", icon: Sandwich, color: "text-orange-400" },
  { name: "Utensils", label: "Hora de Almuerzo", category: "pausas", keywords: "cubiertos tenedor cuchillo comedor almuerzo restaurante", icon: Utensils, color: "text-amber-500" },
  { name: "UtensilsCrossed", label: "Refrigerio / Cena", category: "pausas", keywords: "cena merienda comida alimentos refrigerio descanso", icon: UtensilsCrossed, color: "text-orange-500" },
  { name: "Coffee", label: "Café / Break Corto", category: "pausas", keywords: "cafe descanso break merienda relax cafecito manana", icon: Coffee, color: "text-amber-500" },
  { name: "CupSoda", label: "Bebida / Refresco", category: "pausas", keywords: "refresco soda jugo gaseosa hidratacion tomar", icon: CupSoda, color: "text-rose-400" },
  { name: "GlassWater", label: "Agua / Hidratación", category: "pausas", keywords: "vaso agua hidratacion sed salud dispensador", icon: GlassWater, color: "text-cyan-400" },
  { name: "Apple", label: "Snack Saludable / Fruta", category: "pausas", keywords: "manzana fruta saludable merienda snack dieta", icon: Apple, color: "text-red-400" },
  { name: "Toilet", label: "Sanitario / Inodoro (WC)", category: "pausas", keywords: "sanitario inodoro wc bano cagar miar orinar defecar pipi popo taza servicio", icon: Toilet, color: "text-cyan-400" },
  { name: "ToiletPaper", label: "Papel Higiénico / Baño", category: "pausas", keywords: "papel higienico rollo bano sanitario servicio aseo", icon: ToiletPaper, color: "text-slate-300" },
  { name: "DoorClosed", label: "Privado / Puerta Sanitario", category: "pausas", keywords: "puerta bano privado ocupado cerrado sanitario wc", icon: DoorClosed, color: "text-amber-400" },
  { name: "GraduationCap", label: "Capacitación / OJT", category: "pausas", keywords: "estudio clase entrenamiento ojt birrete curso aprender", icon: GraduationCap, color: "text-indigo-400" },
  { name: "BookOpen", label: "Lectura de Manual", category: "pausas", keywords: "libro manual lectura guia estudio datasheet documentacion", icon: BookOpen, color: "text-blue-300" },
  { name: "Clock", label: "Tiempo de Espera", category: "pausas", keywords: "espera tiempo reloj parada demora cliente", icon: Clock, color: "text-slate-400" },
  { name: "Timer", label: "Cronómetro / Timer", category: "pausas", keywords: "cronometro tiempo medir intervalo duracion", icon: Timer, color: "text-gray-400" },
  { name: "Hourglass", label: "Espera Prolongada", category: "pausas", keywords: "reloj arena espera demora pendiente secado pegado", icon: Hourglass, color: "text-amber-300" },
  { name: "Sun", label: "Aire Libre / Exteriores", category: "pausas", keywords: "sol exterior campo planta aire libre sol patio", icon: Sun, color: "text-yellow-400" },
  { name: "Heart", label: "Salud y Bienestar", category: "pausas", keywords: "salud bienestar corazon cuidado medico primeros auxilios", icon: Heart, color: "text-rose-400" },
  { name: "Footprints", label: "Pausa Activa / Caminar", category: "pausas", keywords: "caminar mover desplazar ir venir recorrido pausa activa estiramiento", icon: Footprints, color: "text-stone-400" },
  { name: "Smile", label: "Recreación / Clima Laboral", category: "pausas", keywords: "sonrisa motivacion alegria integracion equipo compartir", icon: Smile, color: "text-yellow-400" },
  { name: "Music", label: "Música / Relajación", category: "pausas", keywords: "musica sonido ambientacion relajacion descanso", icon: Music, color: "text-purple-400" },
  { name: "Dumbbell", label: "Ejercicio / Pausa Física", category: "pausas", keywords: "pesas gimnasio ejercicio ergonomia estiramiento", icon: Dumbbell, color: "text-blue-400" },
];

export function getTaskIconComponent(iconName?: string) {
  if (!iconName) return Wrench;
  const lower = iconName.toLowerCase().trim();
  // Mapeo expreso de Sanitario / Inodoro (WC)
  if (lower === "bath" || lower.includes("baño") || lower.includes("bano") || lower.includes("sanitari") || lower.includes("inodoro") || lower.includes("wc") || lower.includes("miar") || lower.includes("cagar")) {
    return Toilet;
  }
  // 1. Coincidencia exacta por nombre de ícono
  const directMatch = AVAILABLE_ICONS.find(
    (i) => i.name.toLowerCase() === lower
  );
  if (directMatch) return directMatch.icon;

  // 2. Coincidencia por etiqueta
  const labelMatch = AVAILABLE_ICONS.find(
    (i) => i.label.toLowerCase() === lower
  );
  if (labelMatch) return labelMatch.icon;

  // 3. Coincidencia por palabras clave o inclusión
  const keywordMatch = AVAILABLE_ICONS.find(
    (i) =>
      lower.includes(i.name.toLowerCase()) ||
      i.keywords.split(" ").some((k) => k.length >= 4 && lower.includes(k)) ||
      lower.includes(i.label.toLowerCase())
  );
  return keywordMatch ? keywordMatch.icon : Wrench;
}

export function getTaskIconColor(iconName?: string): string {
  if (!iconName) return "text-orange-400";
  const lower = iconName.toLowerCase().trim();
  // Color expreso de Sanitario / Inodoro (WC)
  if (lower === "bath" || lower.includes("baño") || lower.includes("bano") || lower.includes("sanitari") || lower.includes("inodoro") || lower.includes("wc") || lower.includes("miar") || lower.includes("cagar")) {
    return "text-cyan-400";
  }
  // 1. Coincidencia directa por nombre de ícono
  const directMatch = AVAILABLE_ICONS.find(
    (i) => i.name.toLowerCase() === lower
  );
  if (directMatch) return directMatch.color;

  // 2. Coincidencia por etiqueta
  const labelMatch = AVAILABLE_ICONS.find(
    (i) => i.label.toLowerCase() === lower
  );
  if (labelMatch) return labelMatch.color;

  // 3. Coincidencia por palabras clave o inclusión
  const keywordMatch = AVAILABLE_ICONS.find(
    (i) =>
      lower.includes(i.name.toLowerCase()) ||
      i.keywords.split(" ").some((k) => k.length >= 4 && lower.includes(k)) ||
      lower.includes(i.label.toLowerCase())
  );
  return keywordMatch?.color || "text-orange-400";
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categoriesConfig?: any[];
  onTasksUpdated?: (tasks: ManualTaskItem[]) => void;
}

export function ManualTasksManagerModal({
  isOpen,
  onClose,
  categoriesConfig = [],
  onTasksUpdated,
}: Props) {
  const [tasks, setTasks] = useState<ManualTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulario de agregar / editar
  const [isEditing, setIsEditing] = useState<string | null>(null); // task ID or null
  const [formLabel, setFormLabel] = useState("");
  const [formCategory, setFormCategory] = useState("Servicio de Taller");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formIconName, setFormIconName] = useState("Wrench");

  const [iconDrawerOpen, setIconDrawerOpen] = useState(false);
  const [iconDrawerTargetTaskId, setIconDrawerTargetTaskId] = useState<string | null>(null); // si es para cambio rápido en la lista, guarda el ID
  const [iconSearchQuery, setIconSearchQuery] = useState("");
  const [iconCategoryFilter, setIconCategoryFilter] = useState<string>("todos");
  const [hoveredIcon, setHoveredIcon] = useState<AvailableIconDef | null>(null);

  const selectedIconDef = useMemo(() => {
    const targetName = iconDrawerTargetTaskId
      ? tasks.find((t) => t.id === iconDrawerTargetTaskId)?.iconName
      : formIconName;
    return AVAILABLE_ICONS.find((i) => i.name === targetName) || null;
  }, [iconDrawerTargetTaskId, tasks, formIconName]);

  const inspectedIcon = hoveredIcon || selectedIconDef;

  // Cargar lista de labores
  const loadTasks = async () => {
    setLoading(true);
    try {
      const saved = localStorage.getItem("sek_manual_tasks_list");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setTasks(parsed);
        } catch {}
      }

      const res = await fetch("/api/activity/manual-tasks", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
        onTasksUpdated?.(data.tasks);
      }
    } catch (err) {
      console.error("Error al cargar labores manuales:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTasks();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setIsEditing(null);
    setFormLabel("");
    setFormCategory(categoriesConfig[0]?.label || categoriesConfig[0]?.id || "Servicio de Taller");
    setFormSubcategory("");
    setFormIconName("Wrench");
  };

  const handleStartEdit = (task: ManualTaskItem) => {
    setIsEditing(task.id);
    setFormLabel(task.label);
    setFormCategory(task.category);
    setFormSubcategory(task.subcategory || "");
    setFormIconName(task.iconName || "Wrench");
  };

  const currentCategoryObj = categoriesConfig.find(
    (c) => (c.label || c.id || "").toLowerCase() === formCategory.toLowerCase()
  );
  const availableSubcategories: string[] = currentCategoryObj?.subcategories || [];

  // Guardar en formulario (crear o editar)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanLabel = formLabel.trim();
    if (!cleanLabel) {
      toast.error("El nombre de la labor es obligatorio");
      return;
    }

    setSaving(true);
    try {
      const taskPayload: ManualTaskItem = {
        id: isEditing || `manual_${Date.now()}`,
        label: cleanLabel,
        category: formCategory,
        subcategory: formSubcategory.trim() || null,
        iconName: formIconName,
      };

      let updatedList: ManualTaskItem[] = [];
      if (isEditing) {
        updatedList = tasks.map((t) => (t.id === isEditing ? taskPayload : t));
      } else {
        updatedList = tasks.filter((t) => t.label.toLowerCase() !== cleanLabel.toLowerCase());
        updatedList.push(taskPayload);
      }

      // Sincronización inmediata (optimista)
      setTasks(updatedList);
      localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
      window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));
      onTasksUpdated?.(updatedList);

      // Persistir en servidor / Supabase
      const res = await fetch("/api/activity/manual-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isEditing ? "update" : "add",
          task: taskPayload,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
        window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: data.tasks }));
        onTasksUpdated?.(data.tasks);
      }

      toast.success(isEditing ? "Labor manual actualizada" : "Labor manual agregada a la barra");
      resetForm();
    } catch (err: any) {
      toast.error("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Cambio directo de icono en un clic (gestión real e instantánea)
  const handleSelectIcon = async (iconName: string) => {
    if (iconDrawerTargetTaskId) {
      // Cambio rápido para una labor existente en la lista
      const targetId = iconDrawerTargetTaskId;
      const updatedList = tasks.map((t) => (t.id === targetId ? { ...t, iconName } : t));
      
      setTasks(updatedList);
      localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
      onTasksUpdated?.(updatedList);
      window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));
      setIconDrawerOpen(false);
      setIconDrawerTargetTaskId(null);

      try {
        const res = await fetch("/api/activity/manual-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-icon",
            id: targetId,
            iconName,
          }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.tasks)) {
          setTasks(data.tasks);
          localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
          onTasksUpdated?.(data.tasks);
          window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: data.tasks }));
        }
        toast.success("Ícono actualizado en la barra lateral");
      } catch {
        toast.error("Error al guardar el nuevo ícono en el servidor");
      }
    } else {
      // Selección para el formulario de alta/edición
      setFormIconName(iconName);
      setIconDrawerOpen(false);
    }
  };

  // Eliminar labor
  const handleDelete = async (taskId: string, label: string) => {
    const updatedList = tasks.filter((t) => t.id !== taskId);
    setTasks(updatedList);
    localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
    onTasksUpdated?.(updatedList);
    window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));

    try {
      const res = await fetch("/api/activity/manual-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: taskId }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
        onTasksUpdated?.(data.tasks);
        window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: data.tasks }));
      }
      toast.success(`"${label}" eliminada de la barra lateral`);
    } catch {
      toast.error("Error al eliminar del servidor");
    }
  };

  // Filtrado de iconos dentro del cajón
  const filteredIcons = useMemo(() => {
    const q = iconSearchQuery.trim().toLowerCase();
    return AVAILABLE_ICONS.filter((item) => {
      const matchCat = iconCategoryFilter === "todos" || item.category === iconCategoryFilter;
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [iconSearchQuery, iconCategoryFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-foreground">
        
        {/* Cabecera del Panel */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center border border-amber-500/30">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-foreground flex items-center gap-2">
                <span>Gestión de Labores e Íconos</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                  EN VIVO
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Configura los botones cuadrados, asigna íconos y controla lo que ve el técnico en la barra lateral.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido: Formulario superior + Lista inferior */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Formulario Agregar / Editar */}
          <form
            onSubmit={handleSave}
            className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                {isEditing ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                <span>{isEditing ? "Editar Labor Manual" : "Nueva Labor para la Barra Cuadrada"}</span>
              </span>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] text-muted-foreground hover:text-foreground font-semibold"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Nombre de la labor */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Nombre de la Labor *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Ir a Bodega, Diagnóstico, Limpieza..."
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                />
              </div>

              {/* Categoría Principal */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Categoría Principal *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => {
                    setFormCategory(e.target.value);
                    setFormSubcategory("");
                  }}
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                >
                  {categoriesConfig.map((cat) => (
                    <option key={cat.id} value={cat.label || cat.id}>
                      {cat.label || cat.id}
                    </option>
                  ))}
                  {categoriesConfig.length === 0 && (
                    <>
                      <option value="Servicio de Taller">Servicio de Taller</option>
                      <option value="Gestión del Taller">Gestión del Taller</option>
                      <option value="Control Administrativo">Control Administrativo</option>
                      <option value="Soporte">Soporte</option>
                    </>
                  )}
                </select>
              </div>

              {/* Subcategoría Opcional */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Subcategoría Operativa
                </label>
                {availableSubcategories.length > 0 ? (
                  <select
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="">-- General / Sin subcategoría --</option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Opcional: Subcategoría específica"
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                  />
                )}
              </div>

              {/* Selector de Ícono con botón para abrir Cajón */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Ícono Representativo
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIconDrawerTargetTaskId(null);
                      setIconDrawerOpen(true);
                    }}
                    className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors text-xs text-foreground cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-md bg-muted/60 ${getTaskIconColor(formIconName)} grid place-items-center border border-border/50`}>
                        {React.createElement(getTaskIconComponent(formIconName), {
                          className: "h-3.5 w-3.5",
                        })}
                      </div>
                      <span className="font-semibold">
                        {AVAILABLE_ICONS.find((i) => i.name === formIconName)?.label || formIconName}
                      </span>
                    </div>
                    <span className="text-[10px] text-violet-400 font-bold">Cambiar ícono...</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving || !formLabel.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isEditing ? "Guardar Cambios" : "Agregar a la Barra"}</span>
              </button>
            </div>
          </form>

          {/* Lista actual de labores con acceso al cajón directo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Labores Activas en la Barra ({tasks.length})
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                Haz clic en el ícono de cualquier labor para cambiarlo en un solo clic
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Cargando labores...
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl border border-dashed border-border/70 text-muted-foreground">
                <Wrench className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs font-semibold">No hay labores manuales configuradas</p>
                <p className="text-[11px] mt-0.5">
                  Agregue una labor arriba para que aparezca inmediatamente en la barra lateral.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tasks.map((task) => {
                  const Icon = getTaskIconComponent(task.iconName || task.label);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Botón de ícono que abre el cajón directo para esa labor */}
                        <button
                          type="button"
                          onClick={() => {
                            setIconDrawerTargetTaskId(task.id);
                            setIconDrawerOpen(true);
                          }}
                          title="Haz clic para cambiar el ícono en el cajón"
                          className="h-9 w-9 rounded-xl bg-muted/40 hover:bg-muted/70 grid place-items-center shrink-0 border border-border/50 hover:border-border transition-all hover:scale-105 cursor-pointer shadow-xs group"
                        >
                          <Icon className={`h-4 w-4 transition-transform group-hover:scale-110 ${getTaskIconColor(task.iconName || task.label)}`} />
                        </button>

                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-foreground break-words leading-snug">
                            {task.label}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-semibold text-violet-400">{task.category}</span>
                            {task.subcategory && (
                              <>
                                <span>•</span>
                                <span className="break-words">{task.subcategory}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(task)}
                          title="Editar nombre y categoría"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(task.id, task.label)}
                          title="Eliminar de la barra"
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 border border-border/50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MODAL / DRAWER FLOTANTE: "CAJÓN DE ÍCONOS" */}
        {iconDrawerOpen && (
          <div className="fixed inset-0 z-[9999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-card border border-border/80 shadow-2xl rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden text-foreground">
              
              {/* Cabecera del Cajón de Íconos */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 grid place-items-center border border-amber-500/30">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-tight text-foreground uppercase">
                      Cajón de Íconos
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      {iconDrawerTargetTaskId
                        ? "Selecciona el nuevo ícono para actualizar la labor en tiempo real"
                        : "Selecciona el ícono para la labor"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIconDrawerOpen(false);
                    setIconDrawerTargetTaskId(null);
                  }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Filtro y pestañas dentro del cajón */}
              <div className="p-3 border-b border-border/50 bg-background/50 space-y-2">
                {/* Buscador de íconos */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={iconSearchQuery}
                    onChange={(e) => setIconSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre o palabra clave (ej: martillo, bodega, limpieza, pc)..."
                    className="w-full text-xs pl-8 pr-8 py-1.5 rounded-lg border border-border bg-muted/30 placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  {iconSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setIconSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Filtro de Categorías */}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {[
                    { id: "todos", label: "Todos" },
                    { id: "taller", label: "🔧 Taller" },
                    { id: "redes", label: "📡 Redes" },
                    { id: "logistica", label: "📦 Logística" },
                    { id: "seguridad", label: "🛡️ Seguridad" },
                    { id: "gestion", label: "📋 Gestión" },
                    { id: "comercial", label: "💰 Comercial" },
                    { id: "comunicacion", label: "💬 Comunicación" },
                    { id: "pausas", label: "☕ Pausas" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setIconCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        iconCategoryFilter === cat.id
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuadrícula de Íconos del Cajón - Iconos cuadrados limpios sin texto apelotado ni cortado */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredIcons.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs">
                    No se encontraron íconos con "{iconSearchQuery}"
                  </div>
                ) : (
                  <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                    {filteredIcons.map((item) => {
                      const IconComponent = item.icon;
                      const isSelected =
                        (!iconDrawerTargetTaskId && formIconName === item.name) ||
                        (iconDrawerTargetTaskId &&
                          tasks.find((t) => t.id === iconDrawerTargetTaskId)?.iconName === item.name);

                      return (
                        <div key={item.name} className="relative group">
                          <button
                            type="button"
                            onClick={() => handleSelectIcon(item.name)}
                            onMouseEnter={() => setHoveredIcon(item)}
                            onMouseLeave={() => setHoveredIcon(null)}
                            onFocus={() => setHoveredIcon(item)}
                            onBlur={() => setHoveredIcon(null)}
                            aria-label={item.label}
                            className={`w-full aspect-square rounded-2xl flex items-center justify-center transition-all duration-200 border cursor-pointer ${
                              isSelected
                                ? "bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20 scale-[0.98]"
                                : "bg-muted/20 hover:bg-muted/60 border-border/60 hover:border-amber-500/50 text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95"
                            }`}
                          >
                            <IconComponent className={`h-6 w-6 transition-transform duration-200 group-hover:scale-125 ${isSelected ? "text-amber-400" : (item.color || "text-foreground")}`} />
                          </button>

                          {/* Tooltip flotante con texto 100% completo, sin recortes */}
                          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[240px] opacity-0 group-hover:opacity-100 transition-all duration-150 transform group-hover:-translate-y-1 z-50">
                            <div className="bg-popover text-popover-foreground border border-border/90 shadow-2xl px-2.5 py-1.5 rounded-xl text-center backdrop-blur-md">
                              <p className="text-xs font-bold leading-snug whitespace-normal break-words">{item.label}</p>
                              <p className="text-[10px] text-amber-500 dark:text-amber-400 font-semibold uppercase tracking-wider mt-0.5">
                                {item.category}
                              </p>
                            </div>
                            <div className="w-2 h-2 bg-popover border-r border-b border-border/90 transform rotate-45 mx-auto -mt-1" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Barra inspectora de ícono en tiempo real */}
              <div className="px-5 py-3 border-t border-border/60 bg-muted/30 flex items-center justify-between gap-4 shrink-0">
                {inspectedIcon ? (
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`h-11 w-11 rounded-xl bg-muted/50 border border-border/60 ${inspectedIcon.color || "text-amber-300"} grid place-items-center shrink-0 shadow-xs`}>
                      {React.createElement(inspectedIcon.icon, { className: "h-6 w-6" })}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-foreground break-words leading-tight">
                          {inspectedIcon.label}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
                          {inspectedIcon.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        Palabras clave: {inspectedIcon.keywords}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    <span>Pasa el cursor sobre cualquier ícono para ver su nombre completo y detalles.</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground font-medium shrink-0">
                  {filteredIcons.length} íconos disponibles
                </div>
              </div>

              {/* Pie del Cajón */}
              <div className="px-5 py-3 border-t border-border/60 bg-card flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIconDrawerOpen(false);
                    setIconDrawerTargetTaskId(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs cursor-pointer border border-border/60 transition-colors"
                >
                  Cerrar cajón
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
