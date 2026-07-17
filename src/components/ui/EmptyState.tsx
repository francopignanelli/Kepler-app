export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-6 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-star-700">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="12" cy="12" rx="12" ry="4" stroke="currentColor" strokeWidth="1.2" transform="rotate(-18 12 12)" />
      </svg>
      <p className="text-sm font-medium text-star-300">{title}</p>
      {detail && <p className="text-xs text-star-500">{detail}</p>}
    </div>
  );
}
