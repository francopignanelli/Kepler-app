export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel flex flex-col items-start gap-3 p-4" role="alert">
      <div className="flex items-center gap-2 text-danger-400">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm font-medium">Algo falló</span>
      </div>
      <p className="text-sm text-star-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border panel-line px-3 py-1.5 text-sm text-star-100 transition-colors hover:bg-space-700"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
