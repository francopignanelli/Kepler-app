/**
 * Service Worker de Kepler.
 * MVP: muestra notificaciones programadas desde la app y maneja el click.
 * Punto de extensión: listener de "push" para Web Push real (VAPID).
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    }),
  );
});

// Futuro Web Push:
// self.addEventListener("push", (event) => {
//   const data = event.data?.json() ?? {};
//   event.waitUntil(self.registration.showNotification(data.title, data));
// });
