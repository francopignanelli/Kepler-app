// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, notificationService } from "@/services/notificationService";
import type { EnrichedPass, NotificationPreferences } from "@/types";

function makePass(overrides: {
  passId?: string;
  startInMinutes?: number;
  maxElevation?: number;
  skyVisibility?: number | null;
  isDay?: number;
}): EnrichedPass {
  const start = new Date(Date.now() + (overrides.startInMinutes ?? 60) * 60_000);
  const end = new Date(start.getTime() + 6 * 60_000);
  return {
    passId: overrides.passId ?? "25544-test",
    pass: {
      startTime: start.toISOString(),
      peakTime: new Date(start.getTime() + 3 * 60_000).toISOString(),
      endTime: end.toISOString(),
      durationMinutes: 6,
      maxElevation: overrides.maxElevation ?? 60,
      startAzimuth: 225,
      endAzimuth: 45,
      startDirection: "SO",
      endDirection: "NE",
      magnitude: -2.5,
      isVisible: true,
    },
    weather: {
      condition: "Despejado",
      icon: "",
      code: 1000,
      tempC: 12,
      feelsLikeC: 11,
      cloud: 10,
      visibilityKm: 10,
      humidity: 50,
      precipMm: 0,
      chanceOfRain: 0,
      windKph: 10,
      gustKph: 15,
      isDay: overrides.isDay ?? 0,
    },
    astronomy: null,
    scores: {
      skyVisibility: overrides.skyVisibility === undefined ? 85 : overrides.skyVisibility,
      issObservation: 80,
      label: "Muy buena",
    },
    recommendation: "Muy buena oportunidad para observar.",
  };
}

const strictPrefs: NotificationPreferences = {
  enabled: true,
  minutesBefore: 10,
  minimumSkyVisibility: 70,
  minimumElevation: 30,
  nightOnly: true,
};

describe("notificationService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("passMatchesPreferences", () => {
    it("acepta una pasada que cumple todos los filtros", () => {
      expect(notificationService.passMatchesPreferences(makePass({}), strictPrefs)).toBe(true);
    });

    it("rechaza por altura insuficiente", () => {
      expect(
        notificationService.passMatchesPreferences(makePass({ maxElevation: 20 }), strictPrefs),
      ).toBe(false);
    });

    it("rechaza por cielo por debajo del umbral", () => {
      expect(
        notificationService.passMatchesPreferences(makePass({ skyVisibility: 50 }), strictPrefs),
      ).toBe(false);
    });

    it("rechaza si se exige umbral de cielo y no hay datos de clima", () => {
      expect(
        notificationService.passMatchesPreferences(makePass({ skyVisibility: null }), strictPrefs),
      ).toBe(false);
    });

    it("rechaza pasadas diurnas con nightOnly", () => {
      expect(
        notificationService.passMatchesPreferences(makePass({ isDay: 1 }), strictPrefs),
      ).toBe(false);
    });
  });

  describe("schedulePassAlert / cancelAlert", () => {
    it("programa la alerta con la anticipación configurada", () => {
      const pass = makePass({ startInMinutes: 60 });
      const alert = notificationService.schedulePassAlert(pass, strictPrefs);
      expect(alert).not.toBeNull();
      const expectedTrigger = new Date(pass.pass.startTime).getTime() - 10 * 60_000;
      expect(alert!.triggerAt).toBe(expectedTrigger);
      expect(notificationService.hasAlertForPass(pass.passId)).toBe(true);
    });

    it("no duplica alertas para la misma pasada", () => {
      const pass = makePass({});
      notificationService.schedulePassAlert(pass, strictPrefs);
      expect(notificationService.schedulePassAlert(pass, strictPrefs)).toBeNull();
      expect(notificationService.getAlerts()).toHaveLength(1);
    });

    it("no programa alertas para pasadas demasiado próximas", () => {
      const pass = makePass({ startInMinutes: 5 }); // aviso saldría en el pasado
      expect(notificationService.schedulePassAlert(pass, strictPrefs)).toBeNull();
    });

    it("force programa aunque no cumpla los filtros (pedido explícito)", () => {
      const pass = makePass({ maxElevation: 15 });
      expect(notificationService.schedulePassAlert(pass, strictPrefs)).toBeNull();
      expect(
        notificationService.schedulePassAlert(pass, strictPrefs, undefined, { force: true }),
      ).not.toBeNull();
    });

    it("cancela una alerta programada", () => {
      const pass = makePass({});
      const alert = notificationService.schedulePassAlert(pass, strictPrefs)!;
      notificationService.cancelAlert(alert.id);
      expect(notificationService.hasAlertForPass(pass.passId)).toBe(false);
    });
  });

  describe("collectDueAlerts", () => {
    it("devuelve y marca las alertas vencidas una sola vez", () => {
      const pass = makePass({ startInMinutes: 11 });
      notificationService.schedulePassAlert(pass, strictPrefs);

      // 2 minutos después el aviso (T-10) ya venció
      const later = Date.now() + 2 * 60_000;
      const due = notificationService.collectDueAlerts(later);
      expect(due).toHaveLength(1);

      // no vuelve a dispararse
      expect(notificationService.collectDueAlerts(later + 1000)).toHaveLength(0);
    });

    it("no dispara alertas cuya pasada ya terminó hace rato", () => {
      const pass = makePass({ startInMinutes: 20 });
      notificationService.schedulePassAlert(pass, strictPrefs);
      const muchLater = Date.now() + 3 * 3600_000;
      expect(notificationService.collectDueAlerts(muchLater)).toHaveLength(0);
    });
  });

  describe("preferencias", () => {
    it("persiste y recupera preferencias válidas", () => {
      notificationService.savePreferences(strictPrefs);
      expect(notificationService.getPreferences()).toEqual(strictPrefs);
    });

    it("cae a defaults ante datos corruptos en storage", () => {
      window.localStorage.setItem("kepler:notification-preferences", '{"minutesBefore":99}');
      expect(notificationService.getPreferences()).toEqual(DEFAULT_PREFERENCES);
    });
  });
});
