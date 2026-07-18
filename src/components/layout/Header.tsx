import { KeplerWordmark } from "@/components/layout/KeplerLogo";

/**
 * Header principal: marca + zona de acciones (búsqueda de ciudad,
 * geolocalización) que el dashboard inyecta como children.
 */
export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="panel z-20 m-2 mb-0 flex items-center justify-between gap-3 px-3 py-2 sm:m-3 sm:px-4 sm:py-2.5">
      <KeplerWordmark />
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
