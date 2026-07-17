import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Node ≥22 expone un localStorage global experimental que, sin el flag
// --localstorage-file, devuelve undefined y pisa el localStorage de jsdom.
// Polyfill mínimo en memoria para los tests que lo usan.
function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(String(key), String(value)),
  } as Storage;
}

if (typeof window !== "undefined" && !window.localStorage) {
  Object.defineProperty(window, "localStorage", {
    value: createStorageStub(),
    configurable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: createStorageStub(),
    configurable: true,
  });
}

// sin `globals: true`, Testing Library no registra su auto-cleanup
afterEach(() => {
  cleanup();
});
