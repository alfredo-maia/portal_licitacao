import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://mock:mock@localhost:5432/mock";

// Mock temporal-polyfill/global to avoid ESM require issue in @carbon/utilities date-picker
vi.mock("temporal-polyfill/global", () => ({}));

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  if (typeof window.ResizeObserver === "undefined") {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverMock;
  }
}
