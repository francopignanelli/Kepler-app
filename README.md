# Kepler 🛰️

**Kepler** es un explorador espacial en tiempo real: trackea estaciones espaciales (ISS y Tiangong), descubre los satélites que pasan sobre tu cabeza (Starlink, GPS, meteorológicos y más) y predice cuándo vas a poder ver la ISS a simple vista desde tu ubicación, cruzando cada pasada con el clima.

- 🌍 Globo terráqueo 3D interactivo (textura Blue Marble + tiles satelitales Esri al acercar).
- 🛰️ **ISS y Tiangong** en tiempo real, con trayectoria pasada y futura por estación.
- 📡 **Explorador de satélites**: Starlink, GPS, meteorológicos, radioaficionados y observación terrestre sobre tu horizonte, con clustering de constelaciones y ficha por satélite (N2YO).
- 📍 Ubicación por geolocalización (con radio de precisión) o búsqueda de ciudad, con favoritos.
- 🔭 Próximas **pasadas visibles de la ISS** calculadas con SGP4 (o N2YO si hay key).
- ⛅ Cruce con **clima y astronomía**: % de cielo visible y score de observación.
- 🔔 **Alertas** configurables antes de cada pasada (5/10/15 min, umbrales de cielo y altura).
- 📺 **ISS Live**: el stream de la NASA embebido, reproducible dentro de la app.
- 🌌 Ambientación: Sol y Luna integrados a la Vía Láctea de fondo (ESO), Luna a distancia real.
- 🔒 API keys solo en el servidor, validación Zod, rate limiting, CSP y headers de seguridad.

---

## Stack y justificación

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 16 + TypeScript estricto** | App Router + API routes: un solo deploy con backend proxy para proteger keys. |
| UI | **React 19 + Tailwind CSS 4** | Iteración rápida con design system propio (tokens en `@theme`). |
| Globo 3D | **globe.gl (Three.js)** | Liviano frente a Cesium, API declarativa para paths/markers/objetos y capas custom. |
| Órbitas | **satellite.js 7 (SGP4)** | Propagación local desde TLE: posición, ground track, look angles (az/el) y **predicción de pasadas sin depender de APIs con registro**. |
| Validación | **Zod 4** | Todo parámetro de query se valida en el borde. |
| Persistencia | **localStorage** (preferencias, favoritos, alertas, filtros) | El MVP no requiere cuenta: privacidad por diseño. |
| Tests | **Vitest + Testing Library** | Rápido, compatible con TS paths y jsdom por archivo. |

## Fuentes de datos

| Fuente | Uso | Key | Cache servidor |
|---|---|---|---|
| **CelesTrak** | TLE de ISS y Tiangong por NORAD ID (primario) | No | 6 h (stale hasta 7 días) |
| **WhereTheISS.at** | Posición en vivo de la ISS, TLE de respaldo, timezone | No | 3 s / 24 h |
| **SGP4 local** | Ground track, posición de Tiangong, az/el, pasadas | — | track 5 min, pasadas 30 min |
| **N2YO** | **Explorador de satélites** (`/above` por categoría) y pasadas visuales | Sí | 30 s (stale 20 min) / 30 min |
| **WeatherAPI.com** *(opcional)* | Clima + astronomía completa (incluye Luna) | Sí | 2–15 min / 1 h / 12 h |
| **Open-Meteo** | Clima actual y forecast **sin key** (fallback automático) | No | 5–15 min |
| **OpenWeatherMap** *(opcional)* | Clima actual (íconos, descripción en es) y forecast 3 h | Sí | 5–15 min |
| **Nominatim (OSM)** | Búsqueda de lugares con barrios, sesgada a tu zona | No | 1 h |
| **Esri World Imagery** | Tiles satelitales de alta resolución al acercar el globo | No | cache del navegador |

> Sin ninguna key configurada, Kepler funciona con: posición y trayectorias de estaciones, pasadas (SGP4), clima (Open-Meteo) y búsqueda (Nominatim). `N2YO_API_KEY` habilita el explorador de satélites; `WEATHER_API_KEY` agrega fase lunar al análisis.

### Límites de las APIs externas y estrategia

- **N2YO**: 100 req/h en `/above` → cache de 30 s por celda de coordenadas + categoría, polling del cliente cada 2 min solo para categorías activas, y stale-while-error de 20 min.
- **WhereTheISS.at**: ~1 req/s por IP → cache de 3 s + deduplicación de requests concurrentes.
- **WeatherAPI free**: 1M llamadas/mes → forecast cacheado 15 min, clima actual 5 min.
- Todos los fetch tienen timeout (9 s) y **stale-while-error**: si la fuente cae, se sirve el último dato válido.

## Cómo correr localmente

```bash
# 1. Instalar dependencias (Node 20+)
npm install

# 2. (Opcional) Configurar keys
cp .env.example .env.local
# editar .env.local con N2YO_API_KEY, WEATHER_API_KEY y/o OPENWEATHER_API_KEY

# 3. Levantar en desarrollo
npm run dev
# → http://localhost:3000
```

### Scripts

| Script | Acción |
|---|---|
| `npm run dev` | Desarrollo con hot reload |
| `npm run build` | Build de producción |
| `npm start` | Servir el build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Suite de Vitest |

## Arquitectura

```
src/
├── app/                  # App Router
│   ├── api/              # Backend proxy (las keys viven SOLO acá)
│   │   ├── iss/          #   position | tle | track (param ?sat=iss|tiangong)
│   │   ├── satellites/   #   above (explorador N2YO por categoría)
│   │   ├── passes/       #   pasadas enriquecidas (orbital + clima + scores)
│   │   └── weather/      #   current | forecast | astronomy | search | timezone
│   ├── layout.tsx        # metadata, fuentes, tema
│   └── page.tsx          # → Dashboard
├── components/
│   ├── globe/            # GlobeView (globe.gl), marcadores, celestial, capas
│   ├── satellites/       # explorador, selector y telemetría de estaciones
│   ├── dashboard/ iss/ passes/ weather/ location/ notifications/ layout/ ui/
├── hooks/                # useStations, useSatellitesAbove, usePasses, useAlerts, …
├── services/             # cliente: issService, satellitesService, weatherService, …
├── server/               # servidor: iss.ts, n2yo.ts, weather.ts, passes.ts, http.ts
├── lib/                  # orbital.ts (SGP4), satellites.ts (registro), geo, cache, …
├── schemas/              # Zod: validación de todos los parámetros de entrada
├── types/                # tipos de dominio compartidos
└── tests/                # Vitest (unit + API routes + componentes)
```

**Flujo de pasadas**: `GET /api/passes?lat&lon&days` → TLE (CelesTrak, cache 6 h) → SGP4 barre 3 días con paso de 10 s buscando elevación > 10° → cada pasada se marca **visible** si el observador está a oscuras (Sol < −6°) y la ISS está iluminada → se cruza con el forecast → score de observación (cielo 60% / altura 25% / duración 10% / noche 5%) → recomendación en español.

**Flujo del explorador**: `GET /api/satellites/above?lat&lon&category` → N2YO `/above` (radio 90°) → cache 30 s → el cliente dedupe por NORAD ID entre categorías activas → el globo dibuja sprites con glow por categoría, agrupando constelaciones (>40 sats) en clusters cuando la cámara está lejos.

## Seguridad

- Las keys **nunca** llegan al navegador: el frontend solo habla con `/api/*` (`connect-src 'self'`).
- Validación Zod de todos los parámetros; inputs de búsqueda sanitizados por whitelist.
- Rate limiting por IP y por endpoint (429 + `Retry-After`).
- Errores externos saneados (`scrubSecrets` redacta cualquier key antes de loguear o responder).
- Headers: `Content-Security-Policy` (frame-src solo para el player de YouTube), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`.
- Privacidad: la ubicación se pide solo ante un gesto explícito y vive únicamente en `localStorage`.

## Alertas y notificaciones

- Preferencias: anticipación (5/10/15 min), cielo visible mínimo, altura mínima, solo nocturnas, y modo automático.
- Se disparan vía **Notification API** (Service Worker `public/sw.js`) con fallback visual (toast).
- *Limitación del MVP*: sin backend de Web Push, las alertas se disparan mientras haya una pestaña abierta.

## Deploy

**Netlify** (configurado en `netlify.toml`): conectá el repo y cargá las keys en *Site settings → Environment variables* (`N2YO_API_KEY`, `WEATHER_API_KEY`, `OPENWEATHER_API_KEY`).

También funciona zero-config en **Vercel**, o en cualquier host Node (`npm run build` + `npm start`, Node 20+).

Notas para serverless multi-instancia: el cache y el rate limiting son en memoria (por instancia). Para tráfico real, reemplazar `lib/cache.ts` y `lib/rateLimit.ts` por Redis/Upstash manteniendo la misma interfaz.

## Roadmap (arquitectura ya preparada)

- Pasadas visibles para Tiangong y otros satélites (el motor SGP4 ya es genérico).
- Web Push real con VAPID + persistencia de suscripciones.
- Búsqueda por NORAD ID y seguimiento de cualquier satélite del catálogo.
- Vista 2D de mapa y capa de nubes.
- Modo AR, historial de pasadas, comunidad de observaciones.

---

Hecho con ⭐ por el equipo Kepler.
