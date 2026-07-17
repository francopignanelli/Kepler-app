/**
 * Conversión y formateo de horarios en la zona horaria del observador.
 * Se usa Intl nativo: no hace falta ninguna librería de timezones.
 */

const FALLBACK_TZ = "UTC";

function safeTz(tzId: string | undefined | null): string {
  if (!tzId) return FALLBACK_TZ;
  try {
    // valida el identificador IANA
    new Intl.DateTimeFormat("es-AR", { timeZone: tzId });
    return tzId;
  } catch {
    return FALLBACK_TZ;
  }
}

/** "20:43" en la zona indicada */
export function formatTime(date: Date | string | number, tzId?: string | null): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: safeTz(tzId),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "lun 7 jul, 20:43" en la zona indicada */
export function formatDateTime(date: Date | string | number, tzId?: string | null): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: safeTz(tzId),
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "hoy", "mañana" o "lun 7 jul" relativo a la zona del observador */
export function formatRelativeDay(
  date: Date | string | number,
  tzId?: string | null,
  now: Date = new Date(),
): string {
  const tz = safeTz(tzId);
  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const target = dayFmt.format(new Date(date));
  const today = dayFmt.format(now);
  const tomorrow = dayFmt.format(new Date(now.getTime() + 24 * 3600 * 1000));
  if (target === today) return "hoy";
  if (target === tomorrow) return "mañana";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

/** 340 segundos -> "5 min 40 s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return `${sec} s`;
  if (sec === 0) return `${min} min`;
  return `${min} min ${sec} s`;
}

/** "en 2 h 15 min" / "en 45 min" / "ahora" */
export function formatCountdown(target: Date | string | number, now: Date = new Date()): string {
  const diffMs = new Date(target).getTime() - now.getTime();
  if (diffMs <= 0) return "ahora";
  const totalMin = Math.round(diffMs / 60000);
  if (totalMin < 1) return "en menos de 1 min";
  if (totalMin < 60) return `en ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const days = Math.floor(h / 24);
  if (days >= 1) {
    const remH = h % 24;
    return remH > 0 ? `en ${days} d ${remH} h` : `en ${days} d`;
  }
  return m > 0 ? `en ${h} h ${m} min` : `en ${h} h`;
}

/** Epoch (segundos) de una fecha dada, útil para comparar con hour.time_epoch */
export function toEpochSeconds(date: Date | string | number): number {
  return Math.floor(new Date(date).getTime() / 1000);
}
