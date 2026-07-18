"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LAYERS, type FocusTarget, type LayerVisibility } from "@/components/globe/GlobeView";
import { LayerControls } from "@/components/globe/LayerControls";
import { IssLiveCard } from "@/components/iss/IssLiveCard";
import { Header } from "@/components/layout/Header";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { LocationMenu } from "@/components/location/LocationMenu";
import { AlertSettings } from "@/components/notifications/AlertSettings";
import { PassList } from "@/components/passes/PassList";
import { SatelliteExplorer } from "@/components/satellites/SatelliteExplorer";
import { StationSelector } from "@/components/satellites/StationSelector";
import { StationStatsPanel } from "@/components/satellites/StationStatsPanel";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { CurrentWeatherCard } from "@/components/weather/CurrentWeatherCard";
import { useAlerts } from "@/hooks/useAlerts";
import { useCurrentWeather } from "@/hooks/useCurrentWeather";
import { usePasses } from "@/hooks/usePasses";
import { useSatellitesAbove } from "@/hooks/useSatellitesAbove";
import { useStations } from "@/hooks/useStations";
import { useUserLocation } from "@/hooks/useUserLocation";
import { SAT_CATEGORIES, SAT_CATEGORY_IDS } from "@/lib/satellites";
import { notificationService } from "@/services/notificationService";
import { formatCoords } from "@/lib/geo";
import { formatDateTime } from "@/lib/time";
import { storageGet, storageSet, STORAGE_KEYS } from "@/services/storage";
import type { AboveSatellite, SatCategoryId, StationId } from "@/types";

// El globo (Three.js/WebGL) solo existe en el cliente y es pesado: lazy + sin SSR
const GlobeView = dynamic(() => import("@/components/globe/GlobeView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-space-950" aria-hidden="true" />,
});

type TabId = "iss" | "passes" | "sats" | "alerts" | "live";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "iss", label: "Ahora" },
  { id: "passes", label: "Pasadas" },
  { id: "sats", label: "Satélites" },
  { id: "live", label: "ISS Live" },
  { id: "alerts", label: "Alertas" },
];

const DEFAULT_STATIONS: Record<StationId, boolean> = { iss: true, tiangong: false };

const DEFAULT_SAT_FILTERS = Object.fromEntries(
  SAT_CATEGORY_IDS.map((id) => [id, false]),
) as Record<SatCategoryId, boolean>;

/** colores por categoría para la capa de satélites del globo */
const SAT_COLORS = Object.fromEntries(
  SAT_CATEGORY_IDS.map((id) => [id, SAT_CATEGORIES[id].color]),
) as Record<string, string>;

/** espera máxima de datos de APIs en la pantalla de carga: pasado este
 *  tiempo se avanza igual para no bloquear la app si algo falla */
const API_GRACE_MS = 5_000;

function DashboardInner() {
  const { pushToast } = useToast();

  const {
    location,
    favorites,
    geoError,
    isLocating,
    useBrowserLocation,
    selectCity,
    applyLocation,
    addFavorite,
    removeFavorite,
    isFavorite,
  } = useUserLocation();

  // -- estaciones espaciales (ISS / Tiangong / ambas) -------------------------
  const [enabledStations, setEnabledStations] = useState<Record<StationId, boolean>>(DEFAULT_STATIONS);
  const toggleStation = useCallback((id: StationId) => {
    setEnabledStations((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      storageSet(STORAGE_KEYS.stationSelection, next);
      return next;
    });
  }, []);
  const { stations } = useStations(enabledStations, location);

  // -- explorador de satélites (N2YO) ------------------------------------------
  const [satFilters, setSatFilters] = useState<Record<SatCategoryId, boolean>>(DEFAULT_SAT_FILTERS);
  const toggleSatFilter = useCallback((category: SatCategoryId) => {
    setSatFilters((prev) => {
      const next = { ...prev, [category]: !prev[category] };
      storageSet(STORAGE_KEYS.satelliteFilters, next);
      return next;
    });
  }, []);
  const activeCategories = useMemo(
    () => SAT_CATEGORY_IDS.filter((id) => satFilters[id]),
    [satFilters],
  );
  const above = useSatellitesAbove(location, activeCategories);
  const [selectedSat, setSelectedSat] = useState<AboveSatellite | null>(null);

  const passes = usePasses(location);
  const weather = useCurrentWeather(location);
  const alerts = useAlerts(passes.data);

  // -- pantalla de carga --------------------------------------------------------
  // se libera cuando el globo (con fondo HD) está listo Y llegó la primera
  // posición de estación; si las APIs tardan más de API_GRACE_MS se avanza igual
  const [globeReady, setGlobeReady] = useState(false);
  const [apiGraceOver, setApiGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setApiGraceOver(true), API_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  const hasStationData = stations.some((s) => s.position !== null);
  const appReady = globeReady && (hasStationData || apiGraceOver);

  const [activeTab, setActiveTab] = useState<TabId>("iss");
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  // capas: menú desplegable (cerrado en mobile, abierto en desktop)
  const [showLayers, setShowLayers] = useState(false);
  // panel lateral: drawer en mobile, columna fija en desktop
  const [panelOpen, setPanelOpen] = useState(false);

  // hidratar preferencias persistidas al montar: el SSR renderiza defaults y
  // leer localStorage en el inicializador causaría un mismatch de hidratación
  useEffect(() => {
    setEnabledStations((prev) => ({
      ...prev,
      ...storageGet<Partial<Record<StationId, boolean>>>(STORAGE_KEYS.stationSelection, {}),
    }));
    setSatFilters((prev) => ({
      ...prev,
      ...storageGet<Partial<Record<SatCategoryId, boolean>>>(STORAGE_KEYS.satelliteFilters, {}),
    }));
    // merge con defaults: capas nuevas quedan activas aunque haya estado viejo guardado
    setLayers((prev) => ({
      ...prev,
      ...storageGet<Partial<LayerVisibility>>(STORAGE_KEYS.layerVisibility, {}),
    }));
    // en desktop el menú de capas arranca desplegado
    if (window.matchMedia("(min-width: 1024px)").matches) setShowLayers(true);
  }, []);

  const onLayersChange = useCallback((next: LayerVisibility) => {
    setLayers(next);
    storageSet(STORAGE_KEYS.layerVisibility, next);
  }, []);

  const onGlobeReady = useCallback(() => setGlobeReady(true), []);

  // errores de geolocalización como toast
  useEffect(() => {
    if (geoError) pushToast({ title: "Ubicación", body: geoError, tone: "info" });
  }, [geoError, pushToast]);

  // enfocar el globo al cambiar de ubicación
  useEffect(() => {
    if (location) {
      setFocusTarget((prev) => ({ lat: location.lat, lon: location.lon, seq: (prev?.seq ?? 0) + 1 }));
    }
  }, [location]);

  const focus = useCallback((lat: number, lon: number) => {
    setFocusTarget((prev) => ({ lat, lon, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const focusStationById = useCallback(
    (id: StationId) => {
      const pos = stations.find((s) => s.info.id === id)?.position;
      if (pos) focus(pos.lat, pos.lon);
    },
    [stations, focus],
  );

  const focusUser = useMemo(() => {
    if (!location) return null;
    return () => focus(location.lat, location.lon);
  }, [location, focus]);

  // seleccionar un satélite desde el globo abre su ficha en el tab Satélites
  const onSelectSatellite = useCallback((sat: AboveSatellite) => {
    setSelectedSat(sat);
    setActiveTab("sats");
    setPanelOpen(true);
  }, []);

  const focusSatellite = useCallback(
    (sat: AboveSatellite) => focus(sat.lat, sat.lon),
    [focus],
  );

  const nextVisiblePass = useMemo(
    () => passes.data?.passes.find((p) => p.pass.isVisible) ?? null,
    [passes.data],
  );

  const notificationsAllowed = notificationService.getPermission() === "granted";

  // contenido del panel lateral (columna en desktop, drawer en mobile)
  const sidePanel = (
    <>
      {/* ubicación seleccionada + favoritos */}
      <div className="panel flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          {location ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-star-100">
                {location.name}
                {location.country ? `, ${location.country}` : ""}
              </p>
              <p className="telemetry text-[11px] text-star-500">
                {formatCoords(location.lat, location.lon, 3)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-star-500">
              Sin ubicación: usá el botón de ubicación de arriba.
            </p>
          )}
          {location && (
            <button
              type="button"
              onClick={() => (isFavorite(location) ? removeFavorite(location) : addFavorite(location))}
              className="shrink-0 rounded-md border panel-line p-1.5 text-alert-400 transition-colors hover:bg-space-700"
              title={isFavorite(location) ? "Quitar de favoritos" : "Guardar en favoritos"}
              aria-pressed={isFavorite(location)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7L12 3Z"
                  fill={isFavorite(location) ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="sr-only">
                {isFavorite(location) ? "Quitar de favoritos" : "Guardar en favoritos"}
              </span>
            </button>
          )}
        </div>
        {favorites.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Ubicaciones favoritas">
            {favorites.map((fav) => (
              <button
                key={`${fav.lat}-${fav.lon}`}
                type="button"
                onClick={() => applyLocation(fav)}
                className="rounded-full border panel-line px-2.5 py-0.5 text-xs text-star-300 transition-colors hover:bg-space-700"
              >
                {fav.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="panel flex gap-1 p-1" role="tablist" aria-label="Paneles de información">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-1.5 py-1.5 text-[13px] transition-colors sm:px-2 sm:text-sm ${
              activeTab === tab.id
                ? "bg-space-700 font-medium text-star-100"
                : "text-star-500 hover:text-star-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* contenido del tab activo */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "iss" && (
          <>
            <StationSelector enabled={enabledStations} onToggle={toggleStation} />
            {stations.length === 0 && (
              <div className="panel p-4">
                <p className="text-sm text-star-500">
                  Activá al menos una estación para ver su telemetría.
                </p>
              </div>
            )}
            {stations.map((station) => (
              <StationStatsPanel key={station.info.id} station={station} />
            ))}
            {nextVisiblePass && (
              <div className="panel p-4">
                <p className="text-[11px] uppercase tracking-widest text-star-500">
                  Próxima pasada visible (ISS)
                </p>
                <p className="mt-1 font-display text-base font-semibold text-star-100">
                  {formatDateTime(nextVisiblePass.pass.startTime, passes.data?.location.timezone)}
                </p>
                <p className="mt-0.5 text-xs text-star-300">
                  Altura máx {nextVisiblePass.pass.maxElevation}° ·{" "}
                  {nextVisiblePass.pass.startDirection} → {nextVisiblePass.pass.endDirection}
                  {nextVisiblePass.scores.skyVisibility !== null &&
                    ` · Cielo visible ${nextVisiblePass.scores.skyVisibility}%`}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("passes")}
                  className="mt-2 text-xs text-orbit-400 underline-offset-2 hover:underline"
                >
                  Ver todas las pasadas →
                </button>
              </div>
            )}
            <CurrentWeatherCard
              weather={weather.weather}
              error={weather.error}
              unavailable={weather.unavailable}
              isLoading={weather.isLoading}
              hasLocation={location !== null}
            />
          </>
        )}

        {activeTab === "passes" && (
          <PassList
            data={passes.data}
            error={passes.error}
            isLoading={passes.isLoading}
            hasLocation={location !== null}
            onRetry={passes.reload}
            hasAlert={alerts.hasAlert}
            onToggleAlert={alerts.toggleAlert}
            notificationsAllowed={notificationsAllowed}
          />
        )}

        {activeTab === "sats" && (
          <SatelliteExplorer
            filters={satFilters}
            onToggleFilter={toggleSatFilter}
            state={above}
            hasLocation={location !== null}
            selected={selectedSat}
            onSelect={setSelectedSat}
            onFocus={focusSatellite}
          />
        )}

        {activeTab === "live" && <IssLiveCard />}

        {activeTab === "alerts" && (
          <AlertSettings
            preferences={alerts.preferences}
            onPreferencesChange={alerts.updatePreferences}
            alerts={alerts.alerts}
            onCancelAlert={alerts.cancelAlert}
            tzId={passes.data?.location.timezone}
          />
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-dvh flex-col bg-grid">
      <LoadingScreen visible={!appReady} />

      <Header>
        <LocationMenu
          location={location}
          onSelect={selectCity}
          onUseMyLocation={useBrowserLocation}
          isLocating={isLocating}
        />
      </Header>

      <main className="relative flex min-h-0 flex-1 flex-col gap-3 p-2 sm:p-3 lg:flex-row">
        {/* ------------------------------------------------ globo */}
        <section
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl border panel-line bg-space-950"
          aria-label="Visualización del planeta Tierra"
        >
          <GlobeView
            stations={stations}
            satellites={above.satellites}
            satelliteColors={SAT_COLORS}
            selectedSatellite={selectedSat}
            onSelectSatellite={onSelectSatellite}
            userLocation={location}
            layers={layers}
            focusTarget={focusTarget}
            onReady={onGlobeReady}
          />

          {/* capas: botón que despliega/oculta su menú (izquierda) */}
          <div className="absolute left-2 top-2 z-10 sm:left-3 sm:top-3">
            <button
              type="button"
              onClick={() => setShowLayers((v) => !v)}
              aria-expanded={showLayers}
              className="panel px-2.5 py-1 text-xs text-star-300 transition-colors hover:text-star-100"
            >
              {showLayers ? "✕ Capas" : "☰ Capas"}
            </button>
            {showLayers && (
              <div className="mt-1.5 w-48">
                <LayerControls
                  layers={layers}
                  onChange={onLayersChange}
                  stations={enabledStations}
                  onToggleStation={toggleStation}
                  onFocusStation={focusStationById}
                  onFocusUser={focusUser}
                />
              </div>
            )}
          </div>

          {nextVisiblePass && (
            <div className="panel absolute bottom-3 left-3 z-10 hidden max-w-xs p-3 lg:block">
              <p className="text-[11px] uppercase tracking-widest text-star-500">
                Próxima pasada visible
              </p>
              <p className="telemetry mt-1 text-sm text-iss-400">
                {formatDateTime(nextVisiblePass.pass.startTime, passes.data?.location.timezone)} ·{" "}
                {nextVisiblePass.pass.maxElevation}° máx
              </p>
            </div>
          )}

          {/* abrir el panel en mobile (derecha, sin tapar el globo hasta abrirse) */}
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="panel absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-star-100 shadow-lg lg:hidden"
            aria-label="Abrir panel de información"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-orbit-400">
              <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Panel
          </button>
        </section>

        {/* ------------------------------------------------ panel lateral desktop */}
        <aside className="hidden min-h-0 w-[410px] flex-col gap-3 lg:flex">{sidePanel}</aside>

        {/* ------------------------------------------------ drawer mobile */}
        {panelOpen && (
          <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-label="Panel de información">
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={() => setPanelOpen(false)}
              className="absolute inset-0 bg-space-950/60 backdrop-blur-[2px]"
            />
            <div className="absolute inset-y-0 right-0 flex w-[88%] max-w-[400px] flex-col gap-3 border-l panel-line bg-space-900/95 p-3 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-widest text-star-500">Kepler</p>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-md border panel-line px-2 py-1 text-xs text-star-300 transition-colors hover:bg-space-700"
                >
                  ✕ Cerrar
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3">{sidePanel}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ToastProvider>
      <DashboardInner />
    </ToastProvider>
  );
}
