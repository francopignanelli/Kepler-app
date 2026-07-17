"use client";

import { KeplerLogo } from "@/components/layout/KeplerLogo";

/** Pantalla de carga con la identidad de Kepler, mostrada hasta que el globo está listo. */
export function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-space-950 bg-grid transition-opacity duration-700 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="relative">
        <KeplerLogo size={96} className="text-orbit-500" />
        <svg
          width="180"
          height="180"
          viewBox="0 0 180 180"
          fill="none"
          className="orbit-loader absolute -left-[42px] -top-[42px]"
          aria-hidden="true"
        >
          <ellipse
            cx="90"
            cy="90"
            rx="82"
            ry="82"
            stroke="rgba(111,155,255,0.25)"
            strokeWidth="1"
            strokeDasharray="3 6"
          />
          <circle cx="172" cy="90" r="3" fill="#5eead4" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="font-brand text-xl font-light uppercase tracking-[0.55em] text-orbit-400">
          Kepler
        </span>
        <span className="telemetry text-xs text-star-500">Inicializando telemetría orbital…</span>
      </div>
    </div>
  );
}
