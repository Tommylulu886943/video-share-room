// Platform brand. Per-club branding (name/logo/colour) is separate (see Tenant).

/**
 * Text colour to put on top of a club's brand colour. Brand colours are only
 * validated as #RRGGBB, so a light pick (e.g. yellow) would otherwise get
 * unreadable white text in the header, buttons and chips. Uses the WCAG
 * relative-luminance contrast against white; below 3:1 we switch to slate-900.
 */
export function brandForeground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = Number.parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  const contrastWithWhite = 1.05 / (l + 0.05);
  return contrastWithWhite >= 3 ? "#ffffff" : "#0f172a";
}

export const BRAND = {
  zh: "場邊",
  en: "Courtside",
  full: "場邊 Courtside",
  monogram: "場",
  tagline: "最好的視角，留住每一球。",
};
