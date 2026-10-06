// src/components/admin/data-audit-badge.tsx
// Las insignias visuales individuales fueron reemplazadas por el Vigilante de Integridad
// Centralizado en segundo plano (DataIntegrityBanner), que audita matemáticamente contra PostgreSQL
// sin saturar la interfaz de usuario.
"use client";

import React from "react";

export interface DataAuditBadgeProps {
  label?: string;
  totalEsperado?: number;
  totalCalculado?: number;
  detalle?: string;
  className?: string;
  size?: "xs" | "sm" | "md";
  tolerancia?: number;
  unidad?: string;
}

export function DataAuditBadge(_props: DataAuditBadgeProps) {
  return null;
}
