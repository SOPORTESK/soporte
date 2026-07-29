import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/test-bot
// Body: { action: "start" | "send", message?: string, case_id?: string, mediaType?: string, start_from?: string }
// "start" crea un caso de prueba nuevo. Si start_from viene, pre-llena el historial.
// "send" envía un mensaje al bot y devuelve la respuesta

// Presets de historial ficticio para empezar desde un paso específico
const STEP_PRESETS: Record<string, {
  histcliente: any[];
  histtecnico: any[];
  cliente: any;
  label: string;
}> = {
  "pedir_nombre": {
    label: "Pedir nombre",
    histcliente: [{ role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" }],
    histtecnico: [],
    cliente: { telefono: "+50600000000", nombre: null, whatsapp_name: "Usuario de Prueba" },
  },
  "pedir_correo": {
    label: "Pedir correo",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", whatsapp_name: "Usuario de Prueba" },
  },
  "pedir_cuenta": {
    label: "Pedir cuenta/empresa",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", whatsapp_name: "Usuario de Prueba" },
  },
  "menu_temas": {
    label: "Menú de temas",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba" },
  },
  "t1_marca": {
    label: "Pedir marca (Configuraciones)",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "1" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, indíquenos la marca del equipo." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba" },
  },
  "t1_modelo": {
    label: "Pedir modelo (Configuraciones)",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "1" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:05.000Z", content: "Hikvision" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.500Z", content: "Por favor, indíquenos la marca del equipo." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:06.000Z", content: "¿Podría indicarnos el modelo del equipo?" },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", equipo: { marca: "Hikvision" } },
  },
  "t1_desc": {
    label: "Pedir descripción (Configuraciones)",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "1" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:05.000Z", content: "Hikvision" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:06.000Z", content: "DS-2CD2143G2-I" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.500Z", content: "Por favor, indíquenos la marca del equipo." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:06.500Z", content: "¿Podría indicarnos el modelo del equipo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:07.000Z", content: "Por favor, describa brevemente el problema o consulta que tiene." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", equipo: { marca: "Hikvision", modelo: "DS-2CD2143G2-I" } },
  },
  "t2_reset": {
    label: "Reset — pedir marca",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "2" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, indíquenos la marca del equipo." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", tema: "Reset" },
  },
  "t3_desvinc": {
    label: "Desvinculación — pedir marca",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "3" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, indíquenos la marca del equipo." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", tema: "Desvinculación" },
  },
  "t4_firmware": {
    label: "Firmware — pedir marca",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "4" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, indíquenos la marca del equipo." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", tema: "Firmware" },
  },
  "t5_software": {
    label: "Software — pedir marca",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "5" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, indíquenos la marca del equipo." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", tema: "Software" },
  },
  "t6_licencias": {
    label: "Licencias — pedir marca",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "6" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, indíquenos la marca del equipo." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", tema: "Licencias" },
  },
  "t7_otro": {
    label: "Otro — pedir descripción",
    histcliente: [
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:00.000Z", content: "Hola" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:01.000Z", content: "Juan Pérez" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:02.000Z", content: "juan.perez@gmail.com" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:03.000Z", content: "Sekunet CR" },
      { role: "user", author: "Cliente", time: "2025-01-01T00:00:04.000Z", content: "7" },
    ],
    histtecnico: [
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.500Z", content: "Hola\nBienvenido al soporte técnico de Sekunet. Soy el Asistente Virtual y con gusto le brindaré asistencia. Antes de comenzar, necesito registrar algunos datos para atender su solicitud." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:00.510Z", content: "Para comenzar, ¿me podría indicar su nombre completo?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:01.500Z", content: "Gracias. ¿Me podría indicar su correo electrónico?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:02.500Z", content: "¿Podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet?" },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:03.500Z", content: "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema." },
      { role: "ia", author: "Asistente Sekunet", time: "2025-01-01T00:00:05.000Z", content: "Por favor, describa brevemente el problema o consulta que tiene." },
    ],
    cliente: { telefono: "+50600000000", nombre: "Juan Pérez", correo: "juan.perez@gmail.com", cuenta: "Sekunet CR", whatsapp_name: "Usuario de Prueba", tema: "Otro" },
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, message, case_id, mediaType, start_from } = body;

    const supabase = createServiceClient();
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (action === "start") {
      const testPhone = "+50600000000";
      const now = new Date().toISOString();

      // Limpiar casos de prueba anteriores
      await supabase.from("sek_cases").delete().eq("es_test", true).eq("customer_phone", testPhone);

      // Si viene start_from, pre-llenar historial
      const preset = start_from ? STEP_PRESETS[start_from] : null;

      const insertData: any = {
        canal: "whatsapp",
        estado: "ia_atendiendo",
        prioridad: "media",
        customer_phone: testPhone,
        cliente: preset?.cliente || {
          telefono: testPhone,
          nombre: null,
          whatsapp_name: "Usuario de Prueba",
        },
        histcliente: preset?.histcliente || [{ role: "user", author: "Cliente", time: new Date().toISOString(), content: "Hola" }],
        histtecnico: preset?.histtecnico || [],
        title: preset ? `PRUEBA — ${preset.label}` : "PRUEBA — Bot Test",
        last_message_at: now,
        last_message_preview: "",
        es_test: true,
      };

      const { data: newCase, error } = await supabase
        .from("sek_cases")
        .insert(insertData)
        .select("id")
        .single();

      if (error || !newCase) {
        return NextResponse.json({ error: "Error creando caso de prueba" }, { status: 500 });
      }

      // Si hay preset, NO invocar seka-whatsapp (el bot ya "está esperando" el dato)
      // Si no hay preset, invocar para que envíe la bienvenida
      let iaData: any = {};
      if (!preset) {
        const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/seka-whatsapp`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ case_id: newCase.id, test_mode: true }),
        });
        iaData = await iaRes.json().catch(() => ({}));
      }

      // Leer el historial actualizado
      const { data: updatedCase } = await supabase
        .from("sek_cases")
        .select("histtecnico, histcliente, estado, cliente")
        .eq("id", newCase.id)
        .maybeSingle();

      return NextResponse.json({
        case_id: newCase.id,
        reply: iaData.reply || (preset ? preset.histtecnico[preset.histtecnico.length - 1]?.content : null),
        estado: updatedCase?.estado || "ia_atendiendo",
        histtecnico: updatedCase?.histtecnico || [],
        histcliente: updatedCase?.histcliente || [],
        cliente: updatedCase?.cliente || {},
        start_from: start_from || null,
      });
    }

    if (action === "close_and_rate") {
      // Simular cierre por técnico + enviar encuesta de calificación
      if (!case_id) return NextResponse.json({ error: "case_id requerido" }, { status: 400 });
      const now = new Date().toISOString();

      // Leer flow config para obtener mensajes de encuesta
      const { data: flowRow } = await supabase
        .from("sek_flow_configs")
        .select("flow_data")
        .eq("activo", true)
        .maybeSingle();

      const nodes = flowRow?.flow_data?.nodes || [];
      const findMsg = (nodeId: string, fallback: string) => {
        const node = nodes.find((n: any) => n.id === nodeId);
        return node?.data?.message || fallback;
      };

      const rateMsg = findMsg("pedir_calificacion", "¿Cómo calificaría la atención recibida? Responda con un número del 1 al 5, donde 1 es muy mala y 5 es excelente.");

      // Agregar mensaje de encuesta al historial
      const { data: caso } = await supabase
        .from("sek_cases")
        .select("histtecnico")
        .eq("id", case_id)
        .maybeSingle();

      const histtecnico = Array.isArray(caso?.histtecnico) ? caso.histtecnico : [];
      const rateMsgEntry = { role: "ia", author: "Asistente Sekunet", time: now, content: rateMsg };

      await supabase.from("sek_cases").update({
        histtecnico: [...histtecnico, rateMsgEntry],
        estado: "calificacion_pendiente",
      }).eq("id", case_id);

      return NextResponse.json({
        reply: rateMsg,
        estado: "calificacion_pendiente",
        rating_mode: true,
      });
    }

    if (action === "send") {
      if (!case_id) {
        return NextResponse.json({ error: "case_id requerido" }, { status: 400 });
      }

      const now = new Date().toISOString();
      const entry: any = {
        role: "user",
        author: "Cliente",
        time: now,
        content: message || "",
      };

      if (mediaType && mediaType !== "text") {
        entry.mediaType = mediaType;
        entry.mediaUrl = "test://media";
        entry.content = message || `[Archivo ${mediaType}]`;
      }

      // Verificar si estamos en modo encuesta
      const { data: casoCheck } = await supabase
        .from("sek_cases")
        .select("estado, histcliente, histtecnico")
        .eq("id", case_id)
        .maybeSingle();

      if (casoCheck?.estado === "calificacion_pendiente") {
        // Simular respuesta de encuesta sin llamar a seka-whatsapp
        const hc = Array.isArray(casoCheck.histcliente) ? casoCheck.histcliente : [];
        const ht = Array.isArray(casoCheck.histtecnico) ? casoCheck.histtecnico : [];
        const newHc = [...hc, entry];

        // Leer mensajes del flow config
        const { data: flowRow2 } = await supabase
          .from("sek_flow_configs")
          .select("flow_data")
          .eq("activo", true)
          .maybeSingle();
        const nodes2 = flowRow2?.flow_data?.nodes || [];
        const findMsg2 = (nodeId: string, fallback: string) => {
          const node = nodes2.find((n: any) => n.id === nodeId);
          return node?.data?.message || fallback;
        };

        const rating = parseInt(entry.content.trim());
        let reply: string;
        let newEstado: string;

        if (rating >= 1 && rating <= 5) {
          reply = findMsg2("agradecer_calificacion", "Gracias por su calificación. Que tenga un excelente día.");
          newEstado = "cerrado";
        } else {
          reply = findMsg2("calificacion_invalida", "No reconocí una calificación válida. Por favor, responda con un número del 1 al 5.");
          newEstado = "calificacion_pendiente";
        }

        const replyEntry = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: reply };
        const updates: any = {
          histcliente: newHc,
          histtecnico: [...ht, replyEntry],
          estado: newEstado,
          last_message_at: now,
        };

        // Si válido, guardar la calificación
        if (rating >= 1 && rating <= 5) {
          const { data: casoData } = await supabase.from("sek_cases").select("cliente").eq("id", case_id).maybeSingle();
          const cli = casoData?.cliente || {};
          updates.cliente = { ...cli, calificacion: rating };
        }

        await supabase.from("sek_cases").update(updates).eq("id", case_id);

        return NextResponse.json({
          reply,
          estado: newEstado,
          histcliente: newHc,
          histtecnico: [...ht, replyEntry],
          cliente: updates.cliente || casoCheck,
          rating_saved: rating >= 1 && rating <= 5 ? rating : null,
        });
      }

      // Flujo normal — no es encuesta
      const { data: caso } = await supabase
        .from("sek_cases")
        .select("histcliente")
        .eq("id", case_id)
        .maybeSingle();

      const histcliente = Array.isArray(caso?.histcliente) ? caso.histcliente : [];
      await supabase
        .from("sek_cases")
        .update({
          histcliente: [...histcliente, entry],
          last_message_at: now,
          last_message_preview: (message || "").slice(0, 200),
        })
        .eq("id", case_id);

      const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/seka-whatsapp`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ case_id, test_mode: true }),
      });

      const iaData = await iaRes.json().catch(() => ({}));

      const { data: updatedCase } = await supabase
        .from("sek_cases")
        .select("histtecnico, histcliente, estado, cliente")
        .eq("id", case_id)
        .maybeSingle();

      return NextResponse.json({
        reply: iaData.reply || null,
        estado: updatedCase?.estado || "ia_atendiendo",
        histtecnico: updatedCase?.histtecnico || [],
        histcliente: updatedCase?.histcliente || [],
        cliente: updatedCase?.cliente || {},
      });
    }

    if (action === "reset") {
      if (case_id) {
        await supabase.from("sek_cases").delete().eq("id", case_id);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "status") {
      if (!case_id) {
        return NextResponse.json({ error: "case_id requerido" }, { status: 400 });
      }
      const { data: caso } = await supabase
        .from("sek_cases")
        .select("histtecnico, histcliente, estado, cliente")
        .eq("id", case_id)
        .maybeSingle();

      return NextResponse.json({
        estado: caso?.estado || "ia_atendiendo",
        histtecnico: caso?.histtecnico || [],
        histcliente: caso?.histcliente || [],
        cliente: caso?.cliente || {},
      });
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  } catch (e: any) {
    console.error("[test-bot] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
