"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, Package, Sparkles } from "lucide-react";

interface InventoryLookupItem {
  id: string;
  modelo: string;
  codigo: string;
  marca: string;
  descripcion: string;
  categoria?: string;
}

interface InventoryBrandModelSelectorProps {
  marca: string;
  modelo: string;
  serie: string;
  onChangeMarca: (val: string) => void;
  onChangeModelo: (val: string) => void;
  onChangeSerie: (val: string) => void;
}

// Caché en memoria para no volver a pedir las marcas cada vez que se abre el modal
let cachedBrands: string[] | null = null;

export function InventoryBrandModelSelector({
  marca,
  modelo,
  serie,
  onChangeMarca,
  onChangeModelo,
  onChangeSerie,
}: InventoryBrandModelSelectorProps) {
  const [brands, setBrands] = useState<string[]>(cachedBrands || []);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);

  const [modelItems, setModelItems] = useState<InventoryLookupItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const brandContainerRef = useRef<HTMLDivElement>(null);
  const modelContainerRef = useRef<HTMLDivElement>(null);

  // Cargar marcas únicas al montar
  useEffect(() => {
    if (cachedBrands && cachedBrands.length > 0) {
      setBrands(cachedBrands);
      return;
    }
    fetch("/api/inventory/lookup?mode=brands")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.brands)) {
          cachedBrands = d.brands;
          setBrands(d.brands);
        }
      })
      .catch((err) => console.warn("[InventoryBrandModelSelector] Error cargando marcas:", err));
  }, []);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brandContainerRef.current && !brandContainerRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
      if (modelContainerRef.current && !modelContainerRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtrado predictivo local de marcas
  const filteredBrands = React.useMemo(() => {
    const q = (marca || "").trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.toLowerCase().includes(q));
  }, [brands, marca]);

  // Búsqueda predictiva de modelos (con debounce) cuando cambia modelo o marca
  useEffect(() => {
    if (!showModelDropdown) return;

    const timer = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const params = new URLSearchParams({ mode: "search" });
        if (modelo.trim()) params.set("q", modelo.trim());
        if (marca.trim()) params.set("marca", marca.trim());

        const res = await fetch(`/api/inventory/lookup?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setModelItems(data.items || []);
        }
      } catch (err) {
        console.warn("[InventoryBrandModelSelector] Error buscando modelos:", err);
      } finally {
        setLoadingModels(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [modelo, marca, showModelDropdown]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-muted/20 border border-border/50">
      {/* CAMPO 1: MARCA (Predictivo + Desplegable + Libre) */}
      <div className="relative" ref={brandContainerRef}>
        <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>Marca</span>
          <span className="text-[9px] font-normal text-brand-400/80">Catálogo / Libre</span>
        </label>
        <div className="relative mt-1">
          <input
            type="text"
            value={marca}
            onFocus={() => setShowBrandDropdown(true)}
            onChange={(e) => {
              onChangeMarca(e.target.value);
              setShowBrandDropdown(true);
            }}
            placeholder="Ej: Hikvision, Dahua"
            autoComplete="off"
            className="flex h-9 w-full rounded-lg border border-input bg-background/90 pl-2.5 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowBrandDropdown((prev) => !prev)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Ver marcas del inventario"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBrandDropdown ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Lista desplegable de Marcas */}
        {showBrandDropdown && filteredBrands.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto z-[120] p-1 divide-y divide-border/30">
            {filteredBrands.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  onChangeMarca(b);
                  setShowBrandDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-muted/80 rounded-lg transition-colors flex items-center justify-between text-xs font-semibold text-foreground"
              >
                <span>{b}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CAMPO 2: MODELO (Predictivo + Desplegable + Autocompletado de Marca + Libre) */}
      <div className="relative" ref={modelContainerRef}>
        <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>Modelo</span>
          {loadingModels ? (
            <span className="text-[9px] text-brand-400 animate-pulse">Buscando...</span>
          ) : (
            <span className="text-[9px] font-normal text-brand-400/80">Predictivo</span>
          )}
        </label>
        <div className="relative mt-1">
          <input
            type="text"
            value={modelo}
            onFocus={() => setShowModelDropdown(true)}
            onChange={(e) => {
              onChangeModelo(e.target.value);
              setShowModelDropdown(true);
            }}
            placeholder="Ej: DS-7208HQHI"
            autoComplete="off"
            className="flex h-9 w-full rounded-lg border border-input bg-background/90 pl-2.5 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowModelDropdown((prev) => !prev)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Buscar en inventario"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showModelDropdown ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Lista desplegable de Modelos / Artículos del Inventario */}
        {showModelDropdown && (
          <div className="absolute left-0 sm:-left-16 right-0 sm:-right-16 top-full mt-1 bg-popover border border-border rounded-xl shadow-2xl max-h-56 overflow-y-auto z-[120] p-1 divide-y divide-border/40">
            {loadingModels && modelItems.length === 0 ? (
              <div className="px-3 py-2.5 text-[11px] text-muted-foreground text-center">
                Consultando catálogo de inventario...
              </div>
            ) : modelItems.length > 0 ? (
              modelItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChangeModelo(item.modelo);
                    if (item.marca && item.marca.toUpperCase() !== "GENÉRICO") {
                      onChangeMarca(item.marca);
                    } else if (!marca && item.marca) {
                      onChangeMarca(item.marca);
                    }
                    setShowModelDropdown(false);
                  }}
                  className="w-full text-left p-2 hover:bg-muted/80 rounded-lg transition-colors flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground font-mono truncate">
                      {item.modelo}
                    </span>
                    {item.marca && (
                      <span className="text-[9px] font-bold text-brand-400 px-1.5 py-0.5 rounded bg-brand-500/10 shrink-0">
                        {item.marca}
                      </span>
                    )}
                  </div>
                  {item.descripcion && (
                    <span className="text-[10px] text-muted-foreground line-clamp-1">
                      {item.descripcion}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                No está en catálogo — se guardará <strong className="text-foreground">&ldquo;{modelo || "texto libre"}&rdquo;</strong> tal cual lo escribas.
              </div>
            )}
          </div>
        )}
      </div>

      {/* CAMPO 3: N° DE SERIE */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
          N° de Serie
        </label>
        <input
          type="text"
          value={serie}
          onChange={(e) => onChangeSerie(e.target.value)}
          placeholder="Ej: 123456789"
          className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background/90 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
        />
      </div>
    </div>
  );
}
