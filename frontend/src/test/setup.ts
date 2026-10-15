import { afterEach, vi } from 'vitest';

const isBrowserEnv = typeof window !== 'undefined';

if (isBrowserEnv) {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}

// jsdom has no layout engine: give charts a stable width, and report reduced motion
// so animated values (the gauge) land on their final state immediately.
class ResizeObserverMock {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb([{ target: el, contentRect: { width: 600, height: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
if (isBrowserEnv) vi.stubGlobal('ResizeObserver', ResizeObserverMock);
if (isBrowserEnv) {
Element.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, toJSON() {} } as DOMRect;
};
Element.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
window.matchMedia = ((query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
}
