export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-star-500" role="status">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="orbit-loader"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="21" cy="12" r="1.8" fill="currentColor" />
      </svg>
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Cargando</span>}
    </span>
  );
}
