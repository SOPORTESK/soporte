import crypto from "crypto";

export interface HikvisionInspectionResult {
  recognized: boolean;
  fileType: "HIKVISION_CONFIG" | "SADP_RESET_XML" | "UNKNOWN";
  fileName?: string;
  fileSizeBytes?: number;
  metadata?: {
    model?: string;
    serialFull?: string;
    serialNumber?: string;
    manufactureDate?: string;
    deviceTypeCategory?: string; // NVR, DVR, Cámara IP, etc.
    headerVersion?: number;
    payloadLength?: number;
    hasChecksum?: boolean;
    checksumHex?: string;
    requiresPassword?: boolean;
    extractedTextCount?: number;
  };
  details: {
    title: string;
    description: string;
    recommendation: string;
    technicalSummary?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * Normaliza y clasifica modelos Hikvision comunes
 */
export function classifyDeviceModel(modelOrSerial: string): string {
  const upper = modelOrSerial.toUpperCase();
  if (upper.includes("DS-7108NI") || upper.includes("DS-7608NI") || upper.includes("DS-7616NI") || upper.includes("DS-77")) {
    return "NVR (Grabador de Red Hikvision)";
  }
  if (upper.includes("HQHI") || upper.includes("HUHI") || upper.includes("HGHI") || upper.includes("HIK-DVR")) {
    return "DVR / TurboHD (Grabador Analógico/IP)";
  }
  if (upper.includes("2CD7") || upper.includes("7A46G") || upper.includes("ANPR") || upper.includes("LPR")) {
    return "Cámara IP Inteligente LPR / DeepinView (Reconocimiento de Placas / IA)";
  }
  if (upper.includes("2CD1") || upper.includes("2CD2") || upper.includes("2CD3")) {
    return "Cámara IP Domo / Bullet Hikvision";
  }
  return "Dispositivo Hikvision";
}

/**
 * Analiza un archivo XML generado por SADP (Solicitud de Reseteo de Contraseña)
 */
export function inspectHikvisionSADPXml(content: string, fileName?: string): HikvisionInspectionResult | null {
  const trimmed = content.trim();
  // SADP Reset XML tiene un token Base64 y termina con el Serial del dispositivo (ej. DS-2CD..., iDS-..., etc.)
  const match = trimmed.match(/((?:DS-|iDS-|HIK-|AE-)[A-Za-z0-9\-\_\/]+)$/i);
  if (!match) return null;

  const fullSerial = match[1];
  // El serial usualmente contiene la fecha YYYYMMDD (2015 a 2035)
  const dateMatch = fullSerial.match(/(20[123]\d[01]\d[0-3]\d)/);
  let model = fullSerial;
  let sn = "";
  let manufactureDate = "Desconocida";

  if (dateMatch) {
    const rawDate = dateMatch[1];
    const idx = fullSerial.indexOf(rawDate);
    // Extraer modelo antes de la fecha y remover dígitos finales de canales si existen (ej. /8P08 -> /8P)
    model = fullSerial.substring(0, idx).replace(/[0-9]{2}$/, "").replace(/[_\-\/]+$/, "");
    manufactureDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
    sn = fullSerial.substring(idx);
  }

  const category = classifyDeviceModel(model);

  return {
    recognized: true,
    fileType: "SADP_RESET_XML",
    fileName,
    metadata: {
      model,
      serialFull: fullSerial,
      serialNumber: sn || fullSerial,
      manufactureDate,
      deviceTypeCategory: category,
      requiresPassword: false,
    },
    details: {
      title: `Archivo de Reseteo SADP (${model})`,
      description: `Este archivo es un token criptográfico generado por la herramienta Hikvision SADP para restablecimiento seguro de contraseña del equipo ${model}.`,
      recommendation: `No modifique este archivo. Para generar la clave de desbloqueo, este archivo debe enviarse a la plataforma de soporte de Hikvision o usar el portal de autoservicio de distribuidores para obtener el archivo 'Encrypt.xml' de respuesta.`,
      parameters: {
        "Modelo Identificado": model,
        "Número de Serie": sn || fullSerial,
        "Fecha de Fabricación / Lote": manufactureDate,
        "Tipo de Equipo": category,
        "Longitud del Token": trimmed.length - fullSerial.length,
      },
    },
  };
}

/**
 * Analiza un archivo binario de configuración Hikvision (configurationData)
 */
export function inspectHikvisionConfigFile(buffer: Buffer, fileName?: string): HikvisionInspectionResult {
  const size = buffer.length;

  // Verificar si es un XML de SADP en texto
  try {
    const textSample = buffer.subarray(0, 1024).toString("utf8");
    if (textSample.startsWith("AwAA") || textSample.includes("DS-") || textSample.includes("iDS-")) {
      const sadpResult = inspectHikvisionSADPXml(buffer.toString("utf8"), fileName);
      if (sadpResult) {
        sadpResult.fileSizeBytes = size;
        return sadpResult;
      }
    }
  } catch {}

  // Analizar cabecera Hikvision
  // Offset 0..3: uint32 little endian (1)
  // Offset 4..7: uint32 little endian (tamaño del payload)
  let headerVersion = 0;
  let payloadLength = 0;
  let isHikBinary = false;

  if (size >= 8) {
    headerVersion = buffer.readUInt32LE(0);
    payloadLength = buffer.readUInt32LE(4);

    // En backups modernos de Hikvision, headerVersion == 1 y payloadLength se aproxima a size - 24
    if (headerVersion === 1 && Math.abs(size - (8 + payloadLength)) <= 32) {
      isHikBinary = true;
    }
  }

  // Comprobar trailer de 16 bytes
  const trailerHex = size >= 24 ? buffer.subarray(size - 16).toString("hex") : "";

  // Intentar descifrado opcional si el usuario proporcionó una clave, o intentar claves universales legacy
  // Clave conocida Hikvision CVE-2017-7921:
  let decryptedText: string | null = null;
  const legacyKey = Buffer.from("279977f62f6cfd2d91cd75b889ce0c9a", "hex");
  const xorKey = [0x73, 0x8b, 0x55, 0x44];

  if (isHikBinary && payloadLength > 16) {
    try {
      const testChunk = buffer.subarray(8, Math.min(8 + 1024, buffer.length - 16));
      if (testChunk.length >= 16) {
        const xorBuf = Buffer.alloc(testChunk.length);
        for (let i = 0; i < testChunk.length; i++) xorBuf[i] = testChunk[i] ^ xorKey[i % 4];
        const decipher = crypto.createDecipheriv("aes-128-ecb", legacyKey, null);
        decipher.setAutoPadding(false);
        const dec = decipher.update(xorBuf);
        const decStr = dec.toString("latin1");
        if (decStr.includes("<") && decStr.includes("xml")) {
          decryptedText = decStr;
        }
      }
    } catch {}
  }

  // Extraer cadenas legibles de texto
  const extractedStrings: string[] = [];
  let curStr = "";
  for (let i = 0; i < Math.min(size, 200000); i++) {
    const b = buffer[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
      curStr += String.fromCharCode(b);
    } else {
      if (curStr.length >= 6 && /[a-zA-Z0-9]/.test(curStr)) {
        extractedStrings.push(curStr);
      }
      curStr = "";
    }
  }

  const detectedIps = extractedStrings.filter(s => /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(s));

  if (isHikBinary) {
    return {
      recognized: true,
      fileType: "HIKVISION_CONFIG",
      fileName: fileName || "configurationData",
      fileSizeBytes: size,
      metadata: {
        headerVersion,
        payloadLength,
        hasChecksum: true,
        checksumHex: trailerHex,
        requiresPassword: true,
        extractedTextCount: extractedStrings.length,
      },
      details: {
        title: "Respaldo de Configuración Hikvision (configurationData)",
        description: `Archivo oficial de exportación de parámetros de cámara/NVR Hikvision (${(size / (1024 * 1024)).toFixed(2)} MB). Estructura nativa Hikvision v${headerVersion} con firma criptográfica de integridad de 128 bits.`,
        recommendation: `Este archivo está cifrado con la contraseña maestra definida por el instalador al momento de exportar. Para restaurar las configuraciones en el equipo físico (o en un reemplazo idéntico), debe cargarse desde la interfaz web del dispositivo en 'Mantenimiento > Importar Configuración' ingresando la contraseña original.`,
        technicalSummary: `Formato binario Hikvision Type-1. Payload empaquetado de ${payloadLength.toLocaleString()} bytes. Hash de integridad: ${trailerHex.substring(0, 16)}...`,
        parameters: {
          "Formato": "Hikvision Configuration Backup v" + headerVersion,
          "Tamaño del Archivo": `${(size / 1024).toFixed(1)} KB`,
          "Tamaño del Bloque": `${(payloadLength / 1024).toFixed(1)} KB`,
          "Protección Criptográfica": "Cifrado AES por contraseña de usuario",
          "Checksum de Integridad": trailerHex,
          "IPs detectadas en texto plano": detectedIps.slice(0, 5).join(", ") || "Ninguna (Payload 100% cifrado)",
        },
      },
    };
  }

  // Fallback si no coincide con cabecera estándar
  return {
    recognized: false,
    fileType: "UNKNOWN",
    fileName,
    fileSizeBytes: size,
    details: {
      title: "Archivo Binario Desconocido",
      description: `El archivo tiene un tamaño de ${(size / 1024).toFixed(1)} KB pero no coincide con la cabecera estándar de Hikvision.`,
      recommendation: "Verifique si el archivo fue renombrado o si corresponde a otra marca de CCTV.",
    },
  };
}
