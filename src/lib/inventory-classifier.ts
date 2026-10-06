// src/lib/inventory-classifier.ts
// Motor determinista de normalización y clasificación inteligente para el catálogo de inventario

export function inferBrand(
  marca?: string | null,
  modelo?: string | null,
  nombre?: string | null
): string {
  const m = (marca || "").trim();
  const mod = (modelo || "").toUpperCase().trim();
  const nom = (nombre || "").toUpperCase().trim();

  if (!m || m === "—" || m === "-" || m.toLowerCase() === "sin marca") {
    if (mod.startsWith("HIK-") || mod.startsWith("DS-") || nom.includes("HIKVISION")) return "HIKVISION";
    if (mod.startsWith("SPL-") || nom.includes("SIMPLEX")) return "SIMPLEX";
    if (mod.startsWith("IFL-") || nom.includes("IFLUX")) return "IFLUX";
    if (mod.startsWith("ZKT-") || mod.startsWith("ZK-") || nom.includes("ZKTECO")) return "ZKTECO";
    if (mod.startsWith("EVI-") || mod.startsWith("CS-") || nom.includes("EZVIZ")) return "EZVIZ";
    if (mod.startsWith("CBL-") || nom.includes("CABLIX")) return "CABLIX";
    if (mod.startsWith("ENT-") || nom.includes("ENTREMATIC")) return "ENTREMATIC";
    if (mod.startsWith("MIK-") || mod.startsWith("CCR") || mod.startsWith("CRS") || nom.includes("MIKROTIK")) return "MIKROTIK";
    if (mod.startsWith("UBNT-") || mod.startsWith("UBI-") || nom.includes("UBIQUITI") || mod.startsWith("UACC-")) return "UBIQUITI";
    if (mod.startsWith("CDP-") || nom.includes("CDP")) return "CDP";
    if (mod.startsWith("FAN-") || nom.includes("FANVIL")) return "FANVIL";
    if (mod.startsWith("ANS-") || nom.includes("ANSUL")) return "ANSUL";
    if (mod.startsWith("EDW-") || nom.includes("EDWARDS")) return "EDWARDS";
    if (mod.startsWith("KID-") || nom.includes("KIDDE")) return "KIDDE";
    if (mod.startsWith("MAC-") || nom.includes("MACURCO")) return "MACURCO";
    if (mod.startsWith("SEC-") || nom.includes("SECO-LARM")) return "SECO-LARM";
    if (mod.startsWith("WIT-") || nom.includes("WITEK")) return "WITEK";
    if (mod.startsWith("HUA-") || nom.includes("HUAWEI")) return "HUAWEI";
    if (mod.startsWith("ALT-") || nom.includes("ALTRONIX")) return "ALTRONIX";
    if (nom.includes("CAMBIUM")) return "CAMBIUM NETWORKS";
    if (nom.includes("GRANDSTREAM")) return "GRANDSTREAM";
    if (nom.includes("WESTERN DIGITAL") || nom.includes("WD ")) return "WESTERN DIGITAL";
    if (nom.includes("SEAGATE")) return "SEAGATE";
    if (nom.includes("KINGSTON")) return "KINGSTON";
    return "GENÉRICO";
  }

  // Normalizar mayúsculas y canonicalizar nombres conocidos
  const upper = m.toUpperCase().trim();
  if (upper === "HUAWEI") return "HUAWEI";
  if (upper === "CAMBIUM NETWORKS" || upper === "CAMBIUM") return "CAMBIUM NETWORKS";
  if (upper === "GRANDSTREAM") return "GRANDSTREAM";
  if (upper === "TRENDNET") return "TRENDNET";
  if (upper === "VBET") return "VBET";
  return upper;
}

export function inferCategory(
  marca?: string | null,
  modelo?: string | null,
  nombre?: string | null
): string {
  const text = `${marca || ""} ${modelo || ""} ${nombre || ""}`.toUpperCase();

  // 1. Videovigilancia & CCTV
  if (
    text.includes("CÁMARA") || text.includes("CAMARA") || text.includes("BULLET") ||
    text.includes("DOMO") || text.includes("TURRET") || text.includes("TORRETA") ||
    text.includes("PTZ") || text.includes("NVR") || text.includes("DVR") ||
    text.includes("XVR") || text.includes("CCTV") || text.includes("LENTE") ||
    text.includes("VIDEOVIGILANCIA") || text.includes("HIK-DS-2C") || text.includes("HIK-DS-2D") ||
    text.includes("EZVIZ") || text.includes("EVI-CS-") || text.includes("ARECONT") || text.includes("AVIGILON")
  ) {
    return "Videovigilancia & CCTV";
  }

  // 2. Detección & Alarmas de Incendio
  if (
    text.includes("INCENDIO") || text.includes("HUMO") || text.includes("FUEGO") ||
    text.includes("SIMPLEX") || text.includes("ANSUL") || text.includes("KIDDE") ||
    text.includes("EDWARDS") || text.includes("ESTROBOSC") || text.includes("SIRENA") ||
    text.includes("PULL STATION") || text.includes("ESTACIÓN MANUAL") || text.includes("ESTACION MANUAL") ||
    text.includes("DETECTOR PIR") || text.includes("SENSOR DE HUMO") || text.includes("PIR") ||
    text.includes("DIFUSOR") || text.includes("MACURCO") || text.includes("GAS") ||
    text.includes("SPL-4098") || text.includes("SPL-4100") || text.includes("DITEK")
  ) {
    return "Detección de Incendio & Alarmas";
  }

  // 3. Control de Acceso & Asistencia
  if (
    text.includes("ACCESO") || text.includes("ASISTENCIA") || text.includes("BIOMÉTRIC") ||
    text.includes("BIOMETRIC") || text.includes("HUELLA") || text.includes("FACIAL") ||
    text.includes("TARJETA") || text.includes("LLAVERO") || text.includes("RFID") ||
    text.includes("CHAPA") || text.includes("CERRADURA") || text.includes("ENTREMATIC") ||
    text.includes("BARRERA") || text.includes("MOTOR") || text.includes("BRAZO") ||
    text.includes("PULSADOR") || text.includes("BOTÓN DE SALIDA") || text.includes("BOTON DE SALIDA") ||
    text.includes("ZKTECO") || text.includes("ZKT-") || text.includes("SECO-LARM") ||
    text.includes("ELECTROIMÁN") || text.includes("ELECTROIMAN") || text.includes("MOLINETE")
  ) {
    return "Control de Acceso & Automatización";
  }

  // 4. Redes & Telecomunicaciones
  if (
    text.includes("ROUTER") || text.includes("SWITCH") || text.includes("ACCESS POINT") ||
    text.includes("ANTENA") || text.includes("MIKROTIK") || text.includes("UBIQUITI") ||
    text.includes("WITEK") || text.includes("CAMBIUM") || text.includes("POE") ||
    text.includes("SFP") || text.includes("TRANSCEIVER") || text.includes("ETHERNET") ||
    text.includes("GATEWAY") || text.includes("PATCH PANEL") || text.includes("WIFI") ||
    text.includes("WI-FI") || text.includes("ENLACE") || text.includes("CONMUTADOR")
  ) {
    return "Redes & Telecomunicaciones";
  }

  // 5. Energía & Respaldo Eléctrico
  if (
    text.includes("UPS") || text.includes("BATERÍA") || text.includes("BATERIA") ||
    text.includes("SUPRESOR") || text.includes("FUENTE DE PODER") || text.includes("ALIMENTACIÓN") ||
    text.includes("TRANSFORMADOR") || text.includes("CDP") || text.includes("ALTRONIX") ||
    text.includes("ADAPTADOR A,") || text.includes("INVERSOR") || text.includes("VOLTIOS") ||
    text.includes("12V") || text.includes("24V") || text.includes("52V") || text.includes("REGULADOR")
  ) {
    return "Energía & Respaldo Eléctrico";
  }

  // 6. Almacenamiento & Memorias
  if (
    text.includes("DISCO DURO") || text.includes("HARD DRIVE") || text.includes("HDD") ||
    text.includes("SSD") || text.includes("MICROSD") || text.includes("SD CARD") ||
    text.includes("MEMORIA") || text.includes("SEAGATE") || text.includes("WESTERN DIGITAL") ||
    text.includes("PURPLE") || text.includes("SKYHAWK") || text.includes("KINGSTON") ||
    text.includes("TOSHIBA") || text.includes("TERABYTE") || text.includes("1TB") || text.includes("2TB") || text.includes("4TB")
  ) {
    return "Almacenamiento & Memorias";
  }

  // 7. Audio, Intercom & Telefonía
  if (
    text.includes("ALTAVOZ") || text.includes("PARLANTE") || text.includes("AUDIO") ||
    text.includes("INTERCOM") || text.includes("CITÓFONO") || text.includes("CITOFONO") ||
    text.includes("VIDEOPORTERO") || text.includes("FANVIL") || text.includes("GRANDSTREAM") ||
    text.includes("TELEFONO") || text.includes("TELÉFONO") || text.includes("SIP") ||
    text.includes("AMPLIFICADOR") || text.includes("MICROFONO") || text.includes("MICRÓFONO")
  ) {
    return "Audio, Intercom & Telefonía";
  }

  // 8. Cableado Estructurado & Racks
  if (
    text.includes("CABLE") || text.includes("CABLIX") || text.includes("FIBRA") ||
    text.includes("BOBINA") || text.includes("UTP") || text.includes("FTP") ||
    text.includes("PATCH CORD") || text.includes("RACK") || text.includes("GABINETE") ||
    text.includes("CONECTOR") || text.includes("HERRAMIENTA") || text.includes("BANDEJA") ||
    text.includes("CANALETA") || text.includes("ABRAZADERA") || text.includes("BALUN")
  ) {
    return "Cableado Estructurado & Racks";
  }

  return "Accesorios & Repuestos Técnicos";
}
