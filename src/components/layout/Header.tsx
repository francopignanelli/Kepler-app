import { KeplerWordmark } from "@/components/layout/KeplerLogo";

/**
 * Header principal: marca + zona de acciones (búsqueda de ciudad,
 * geolocalización) que el dashboard inyecta como children.
 */
export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="panel z-20 m-3 mb-0 flex flex-wrap items-center gap-3 px-4 py-2.5">
      <KeplerWordmark />
      <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
        {children}
      </div>
    </header>
  );
}
