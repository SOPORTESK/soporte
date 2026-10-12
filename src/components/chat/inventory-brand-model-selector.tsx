"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

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

let cachedBrands: string[] | null = null;

interface DropdownRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function computeRect(el: HTMLElement | null, minWidth = 200): DropdownRect | null {
  if (!el || typeof window === "undefined") return null;
  const r = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom - 16;
  const maxHeight = Math.min(220, Math.max(140, spaceBelow));
  const width = Math.max(r.width, minWidth);
  const left = Math.min(r.left, window.innerWidth - width - 16);

  return {
    top: r.bottom + 6,
    left: Math.max(12, left),
    width,
    maxHeight,
  };
}

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
  const [brandRect, setBrandRect] = useState<DropdownRect | null>(null);

  const [modelItems, setModelItems] = useState<InventoryLookupItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelRect, setModelRect] = useState<DropdownRect | null>(null);

  const brandInputWrapRef = useRef<HTMLDivElement>(null);
  const brandMenuRef = useRef<HTMLDivElement>(null);

  const modelInputWrapRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

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

  const updatePositions = useCallback(() => {
    if (showBrandDropdown) {
      setBrandRect(computeRect(brandInputWrapRef.current, 190));
    }
    if (showModelDropdown) {
      setModelRect(computeRect(modelInputWrapRef.current, 320));
    }
  }, [showBrandDropdown, showModelDropdown]);

  useEffect(() => {
    updatePositions();
    if (!showBrandDropdown && !showModelDropdown) return;
    window.addEventListener("resize", updatePositions);
    window.addEventListener("scroll", updatePositions, true);
    return () => {
      window.removeEventListener("resize", updatePositions);
      window.removeEventListener("scroll", updatePositions, true);
    };
  }, [showBrandDropdown, showModelDropdown, updatePositions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        brandInputWrapRef.current &&
        !brandInputWrapRef.current.contains(target) &&
        (!brandMenuRef.current || !brandMenuRef.current.contains(target))
      ) {
        setShowBrandDropdown(false);
      }
      if (
        modelInputWrapRef.current &&
        !modelInputWrapRef.current.contains(target) &&
        (!modelMenuRef.current || !modelMenuRef.current.contains(target))
      ) {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBrands = React.useMemo(() => {
    const q = (marca || "").trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.toLowerCase().includes(q));
  }, [brands, marca]);

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
    }, 180);

    return () => clearTimeout(timer);
  }, [modelo, marca, showModelDropdown]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-muted/20 border border-border/50">
      {/* CAMPO 1: MARCA */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          Marca
        </label>
        <div className="relative mt-1" ref={brandInputWrapRef}>
          <input
            type="text"
            value={marca}
            onFocus={() => {
              setShowBrandDropdown(true);
              setShowModelDropdown(false);
            }}
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
            onClick={() => {
              setShowBrandDropdown((prev) => !prev);
              setShowModelDropdown(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${showBrandDropdown ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showBrandDropdown &&
          brandRect &&
          filteredBrands.length > 0 &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={brandMenuRef}
              style={{
                position: "fixed",
                top: brandRect.top,
                left: brandRect.left,
                width: brandRect.width,
                maxHeight: brandRect.maxHeight,
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
              }}
              className="z-[9999] border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-y-auto p-1.5 space-y-0.5"
            >
              {filteredBrands.map((b) => {
                const isSelected = (marca || "").trim().toUpperCase() === b.toUpperCase();
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      onChangeMarca(b);
                      setShowBrandDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between text-xs ${
                      isSelected
                        ? "bg-blue-600/25 text-blue-300 font-bold"
                        : "text-slate-100 hover:bg-slate-800/90 font-medium"
                    }`}
                  >
                    <span className="truncate">{b}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                  </button>
                );
              })}
            </div>,
            document.body
          )}
      </div>

      {/* CAMPO 2: MODELO */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          Modelo
        </label>
        <div className="relative mt-1" ref={modelInputWrapRef}>
          <input
            type="text"
            value={modelo}
            onFocus={() => {
              setShowModelDropdown(true);
              setShowBrandDropdown(false);
            }}
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
            onClick={() => {
              setShowModelDropdown((prev) => !prev);
              setShowBrandDropdown(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${showModelDropdown ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showModelDropdown &&
          modelRect &&
          (loadingModels || modelItems.length > 0) &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={modelMenuRef}
              style={{
                position: "fixed",
                top: modelRect.top,
                left: modelRect.left,
                width: modelRect.width,
                maxHeight: modelRect.maxHeight,
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
              }}
              className="z-[9999] border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-y-auto p-1.5 space-y-0.5"
            >
              {loadingModels && modelItems.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-slate-400 text-center">
                  Buscando en catálogo...
                </div>
              ) : (
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
                    className="w-full text-left px-3 py-2 hover:bg-slate-800/90 rounded-lg transition-colors flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-100 font-mono truncate">
                        {item.modelo}
                      </span>
                      {item.marca && (
                        <span className="text-[10px] font-semibold text-blue-300 px-1.5 py-0.5 rounded bg-blue-500/20 shrink-0">
                          {item.marca}
                        </span>
                      )}
                    </div>
                    {item.descripcion && (
                      <span className="text-[11px] text-slate-400 line-clamp-1">
                        {item.descripcion}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>,
            document.body
          )}
      </div>

      {/* CAMPO 3: N° DE SERIE */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
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
