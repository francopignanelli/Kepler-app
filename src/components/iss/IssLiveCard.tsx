"use client";

import { useEffect, useState } from "react";

/** Stream oficial en vivo desde la ISS (NASA, canal afiliado). */
const VIDEO_ID = "awQzjn72bI0";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
/** youtube-nocookie: player sin cookies de tracking hasta que se reproduce */
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`;

/** La miniatura del vivo se refresca cada minuto (cache-buster por minuto). */
const REFRESH_MS = 60_000;

/**
 * Vista "lo que está viendo la ISS": miniatura del stream en vivo que al
 * tocarla carga el player de YouTube embebido y reproduce ahí mismo
 * (patrón "lite embed": el iframe no se carga hasta el click).
 */
export function IssLiveCard() {
  const [tick, setTick] = useState(() => Math.floor(Date.now() / REFRESH_MS));
  const [fallback, setFallback] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (playing) return;
    const interval = setInterval(() => {
      setTick(Math.floor(Date.now() / REFRESH_MS));
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [playing]);

  // hqdefault_live.jpg es la captura actual del directo; si no está disponible
  // se cae a la miniatura estándar del video
  const thumbnail = fallback
    ? `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
    : `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault_live.jpg?kepler=${tick}`;

  return (
    <section className="panel overflow-hidden" aria-label="Vista en vivo desde la ISS">
      <div className="p-4 pb-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-star-100">
          Lo que ve la ISS ahora
        </h2>
        <p className="mt-1 text-xs text-star-500">
          Cámaras externas de la Estación Espacial Internacional, transmitidas en vivo por la NASA.
        </p>
      </div>

      {playing ? (
        <div className="aspect-video w-full bg-space-950">
          <iframe
            src={EMBED_URL}
            title="Transmisión en vivo desde la ISS (NASA)"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative block w-full"
          aria-label="Reproducir la transmisión en vivo de la ISS"
        >
          {/* miniatura externa del directo: no aplica next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt="Captura actual de la transmisión en vivo desde la ISS"
            width={480}
            height={360}
            className="aspect-video w-full object-cover"
            onError={() => setFallback(true)}
          />
          <span className="absolute inset-0 flex items-center justify-center bg-space-950/20 transition-colors group-hover:bg-space-950/0">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-space-950/70 backdrop-blur-sm transition-transform group-hover:scale-110">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="#f2f6ff" />
              </svg>
            </span>
          </span>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-space-950/80 px-2 py-0.5 text-[11px] font-medium text-danger-400 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
            EN VIVO
          </span>
        </button>
      )}

      <div className="flex items-start justify-between gap-3 p-4 pt-3">
        <p className="text-[11px] leading-relaxed text-star-500">
          {playing
            ? "Reproduciendo el directo acá mismo. Cuando la ISS cruza la zona nocturna, la imagen puede verse oscura."
            : "La captura se actualiza cada minuto. Tocá la imagen para reproducir el directo acá mismo."}
        </p>
        <a
          href={VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[11px] text-orbit-400 underline-offset-2 hover:underline"
        >
          Ver en YouTube ↗
        </a>
      </div>
    </section>
  );
}
