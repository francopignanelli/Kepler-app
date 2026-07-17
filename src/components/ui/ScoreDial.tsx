interface ScoreDialProps {
  /** 0-100 */
  value: number;
  label: string;
  size?: number;
}

function scoreColor(value: number): string {
  if (value >= 70) return "var(--color-ok-400)";
  if (value >= 40) return "var(--color-alert-400)";
  return "var(--color-danger-400)";
}

/** Indicador circular de score (no depende solo del color: muestra el número). */
export function ScoreDial({ value, label, size = 64 }: ScoreDialProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = scoreColor(clamped);
  return (
    <div
      className="flex flex-col items-center gap-1"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
    >
      <div
        className="grid place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${color} ${clamped * 3.6}deg, rgba(111,155,255,0.12) 0deg)`,
        }}
      >
        <div
          className="grid place-items-center rounded-full bg-space-900"
          style={{ width: size - 10, height: size - 10 }}
        >
          <span className="telemetry text-sm font-semibold" style={{ color }}>
            {Math.round(clamped)}
          </span>
        </div>
      </div>
      <span className="text-[11px] text-star-500">{label}</span>
    </div>
  );
}
