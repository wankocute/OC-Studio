import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { scrollProgress } from "@/hooks/use-scroll-progress";
import { messages } from "@/i18n";

import { FIELD_DRAG_ATTRIBUTE, ScrollToTop } from "./scroll-to-top";

function setPage(scrollY: number, scrollHeight: number, clientHeight = 800) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
}

beforeAll(() => {
  // jsdom has no layout: content size changes are covered by the browser check.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  document.body.removeAttribute(FIELD_DRAG_ATTRIBUTE);
  setPage(0, 800);
});

describe("scrollProgress", () => {
  it("is scrollTop / (scrollHeight - clientHeight), clamped to 0–1", () => {
    expect(scrollProgress(0, 2000, 1000)).toBe(0);
    expect(scrollProgress(500, 2000, 1000)).toBe(0.5);
    expect(scrollProgress(1200, 2000, 1000)).toBe(1);
    expect(scrollProgress(-40, 2000, 1000)).toBe(0);
    expect(scrollProgress(0, 600, 1000)).toBe(0);
  });
});

describe("ScrollToTop", () => {
  const button = () => screen.queryByRole("button", { name: messages.nav.scrollToTop });

  it("stays hidden at the top and on pages too short to scroll", async () => {
    setPage(0, 4000);
    render(<ScrollToTop />);
    setPage(150, 900);
    act(() => void window.dispatchEvent(new Event("scroll")));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(button()).not.toBeInTheDocument();
  });

  it("appears once scrolled away and steps aside while a field is dragged", async () => {
    setPage(0, 4000);
    render(<ScrollToTop />);
    setPage(600, 4000);
    act(() => void window.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(button()).toBeInTheDocument());

    act(() => document.body.setAttribute(FIELD_DRAG_ATTRIBUTE, ""));
    await waitFor(() => expect(button()).not.toBeInTheDocument());
    act(() => document.body.removeAttribute(FIELD_DRAG_ATTRIBUTE));
    await waitFor(() => expect(button()).toBeInTheDocument());
  });
});
