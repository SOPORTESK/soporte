"use client";

import { X } from "lucide-react";
import { AgendaView } from "@/components/agenda/agenda-view";

interface ModalAgendaProps {
  isOpen: boolean;
  onClose: () => void;
  currentAgent: {
    email: string;
    nombre?: string | null;
    apellido?: string | null;
    rol?: string | null;
    avatar_url?: string | null;
  };
}

export function ModalAgenda({ isOpen, onClose, currentAgent }: ModalAgendaProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl h-[92vh] bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border shadow-sm transition-colors cursor-pointer"
          title="Cerrar calendario"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <AgendaView currentAgent={currentAgent} />
        </div>
      </div>
    </div>
  );
}
