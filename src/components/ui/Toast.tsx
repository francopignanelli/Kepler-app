"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: "info" | "success" | "alert";
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ pushToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_MS = 8000;

const toneStyles: Record<ToastItem["tone"], string> = {
  info: "border-orbit-400/40",
  success: "border-ok-400/40",
  alert: "border-alert-400/60",
};

/** Notificaciones visuales dentro de la app (fallback cuando no hay permiso del sistema). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_MS);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`panel pointer-events-auto border-2 p-3 shadow-lg fade-up ${toneStyles[toast.tone]}`}
          >
            <p className="text-sm font-semibold text-star-100">{toast.title}</p>
            {toast.body && <p className="mt-0.5 text-xs text-star-300">{toast.body}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
