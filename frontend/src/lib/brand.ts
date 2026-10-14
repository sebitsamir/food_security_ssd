/** Simplified country outline (800 x 585 viewBox). Used by the logo and the PDF header. */
export const BRAND_PATH =
  'M43 236L68 180L155 180L217 174L279 186L341 180L403 167L471 161L527 124L558 56L601 19L626 68L651 112L670 143L657 186L651 254L645 291L682 353L732 434L769 490L676 490L651 515L589 539L539 552L496 546L459 552L403 515L372 496L304 508L242 465L167 397L105 304L56 267Z';
export const BRAND_VIEWBOX = { width: 800, height: 585 } as const;

/** Parses the M/L/Z outline above into points (for drawing it in a PDF). */
export function brandPoints(): [number, number][] {
  return [...BRAND_PATH.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
}
