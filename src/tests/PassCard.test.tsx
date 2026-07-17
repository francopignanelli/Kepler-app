// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PassCard } from "@/components/passes/PassCard";
import { PassList } from "@/components/passes/PassList";
import type { EnrichedPass, PassesResponse } from "@/types";

const TZ = "America/Argentina/Buenos_Aires";

const visiblePass: EnrichedPass = {
  passId: "25544-1",
  pass: {
    startTime: new Date(Date.now() + 3 * 3600_000).toISOString(),
    peakTime: new Date(Date.now() + 3 * 3600_000 + 3 * 60_000).toISOString(),
    endTime: new Date(Date.now() + 3 * 3600_000 + 6 * 60_000).toISOString(),
    durationMinutes: 6,
    maxElevation: 62,
    startAzimuth: 225,
    endAzimuth: 45,
    startDirection: "SO",
    endDirection: "NE",
    magnitude: -2.8,
    isVisible: true,
  },
  weather: {
    condition: "Despejado",
    icon: "https://cdn.weatherapi.com/weather/64x64/night/113.png",
    code: 1000,
    tempC: 12,
    feelsLikeC: 10,
    cloud: 12,
    visibilityKm: 10,
    humidity: 55,
    precipMm: 0,
    chanceOfRain: 5,
    windKph: 10,
    gustKph: 14,
    isDay: 0,
  },
  astronomy: {
    sunrise: "07:58 AM",
    sunset: "05:51 PM",
    moonrise: "10:00 PM",
    moonset: "09:00 AM",
    moonPhase: "Waxing Crescent",
    moonIllumination: 18,
    isMoonUp: 0,
    isSunUp: 0,
  },
  scores: { skyVisibility: 82, issObservation: 78, label: "Muy buena" },
  recommendation: "Salí 5 minutos antes y buscá un lugar con horizonte despejado.",
};

function makeResponse(passes: EnrichedPass[]): PassesResponse {
  return {
    location: { lat: -34.6, lon: -58.38, name: "Buenos Aires", timezone: TZ },
    passes,
    source: "sgp4",
    weatherAvailable: true,
    generatedAt: Date.now(),
  };
}

describe("PassCard", () => {
  it("muestra los datos clave de la pasada", () => {
    render(
      <PassCard
        pass={visiblePass}
        tzId={TZ}
        hasAlert={false}
        onToggleAlert={vi.fn()}
        notificationsAllowed
      />,
    );

    expect(screen.getByText("62°")).toBeInTheDocument();
    expect(screen.getByText("Suroeste → Noreste")).toBeInTheDocument();
    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument(); // nubosidad
    expect(screen.getByText(/Creciente · 18%/)).toBeInTheDocument(); // luna en español
    expect(screen.getByText(/Salí 5 minutos antes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear alerta/i })).toBeEnabled();
    // ambos scores como medidores accesibles
    expect(screen.getByRole("meter", { name: "Cielo" })).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByRole("meter", { name: "Observación" })).toHaveAttribute(
      "aria-valuenow",
      "78",
    );
  });

  it("deshabilita la alerta y marca la pasada como no visible", () => {
    const notVisible: EnrichedPass = {
      ...visiblePass,
      passId: "25544-2",
      pass: { ...visiblePass.pass, isVisible: false, magnitude: null },
      scores: { skyVisibility: 82, issObservation: 30, label: "Mala" },
      recommendation: "Esta pasada no será visible a simple vista.",
    };
    render(
      <PassCard
        pass={notVisible}
        tzId={TZ}
        hasAlert={false}
        onToggleAlert={vi.fn()}
        notificationsAllowed
      />,
    );
    expect(screen.getByText("No visible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear alerta/i })).toBeDisabled();
  });
});

describe("PassList — estados", () => {
  const noop = vi.fn();
  const baseProps = {
    error: null,
    isLoading: false,
    onRetry: noop,
    hasAlert: () => false,
    onToggleAlert: noop,
    notificationsAllowed: true,
  };

  it("pide ubicación cuando no hay ninguna elegida", () => {
    render(<PassList {...baseProps} data={null} hasLocation={false} />);
    expect(screen.getByText(/elegí una ubicación/i)).toBeInTheDocument();
  });

  it("muestra estado vacío cuando no hay pasadas visibles", () => {
    render(<PassList {...baseProps} data={makeResponse([])} hasLocation />);
    expect(screen.getByText(/no hay pasadas/i)).toBeInTheDocument();
  });

  it("muestra el error con opción de reintentar cuando falla la API", () => {
    render(
      <PassList
        {...baseProps}
        data={null}
        error="La fuente de datos externa (celestrak) no está disponible"
        hasLocation
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("lista las pasadas como tarjetas", () => {
    render(<PassList {...baseProps} data={makeResponse([visiblePass])} hasLocation />);
    expect(screen.getAllByTestId("pass-card")).toHaveLength(1);
    expect(screen.getByText(/cálculo orbital propio/i)).toBeInTheDocument();
  });
});
