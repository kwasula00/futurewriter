import { z } from "zod";

/**
 * The page a draft is laid out on. A format is a real trim size in millimetres,
 * so the draft can be shown at the size the book will be printed at instead of
 * filling whatever width the window happens to have. The list holds the sizes a
 * book is actually printed at: the ISO A and B series used across Europe and
 * much of the world, the metric book sizes used in the UK, and the ANSI and
 * trade sizes used in America.
 */
export const PAGE_FORMATS = [
  "a4",
  "a5",
  "a6",
  "b5",
  "135x200",
  "150x225",
  "letter",
  "legal",
  "digest",
  "trade",
] as const;

export const PageFormatSchema = z.enum(PAGE_FORMATS);
export type PageFormat = z.infer<typeof PageFormatSchema>;

/** The four margins of a page, in millimetres. */
export const PageMarginsSchema = z.object({
  top: z.number().min(0).max(100),
  right: z.number().min(0).max(100),
  bottom: z.number().min(0).max(100),
  left: z.number().min(0).max(100),
});

export type PageMargins = z.infer<typeof PageMarginsSchema>;

/** Trim size in millimetres, with the margins a book of that size is set with. */
export const PAGE_FORMAT_META: Record<
  PageFormat,
  { label: string; width: number; height: number; margins: PageMargins }
> = {
  a4: {
    label: "A4 · 210 × 297 mm",
    width: 210,
    height: 297,
    margins: { top: 25, right: 25, bottom: 25, left: 25 },
  },
  a5: {
    label: "A5 · 148 × 210 mm",
    width: 148,
    height: 210,
    margins: { top: 20, right: 18, bottom: 20, left: 18 },
  },
  a6: {
    label: "A6 · 105 × 148 mm",
    width: 105,
    height: 148,
    margins: { top: 15, right: 13, bottom: 15, left: 13 },
  },
  b5: {
    label: "B5 · 176 × 250 mm",
    width: 176,
    height: 250,
    margins: { top: 22, right: 20, bottom: 22, left: 20 },
  },
  "135x200": {
    label: "135 × 200 mm",
    width: 135,
    height: 200,
    margins: { top: 16, right: 14, bottom: 16, left: 14 },
  },
  "150x225": {
    label: "150 × 225 mm",
    width: 150,
    height: 225,
    margins: { top: 18, right: 15, bottom: 18, left: 15 },
  },
  letter: {
    label: "Letter · 8.5 × 11 in",
    width: 215.9,
    height: 279.4,
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  },
  legal: {
    label: "Legal · 8.5 × 14 in",
    width: 215.9,
    height: 355.6,
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  },
  digest: {
    label: "Digest · 5.5 × 8.5 in",
    width: 139.7,
    height: 215.9,
    margins: { top: 16, right: 14, bottom: 16, left: 14 },
  },
  trade: {
    label: "Trade · 6 × 9 in",
    width: 152.4,
    height: 228.6,
    margins: { top: 18, right: 15, bottom: 18, left: 15 },
  },
};

/** The page of a project: which trim size, and the margins it is set with. */
export const PageSettingsSchema = z.object({
  format: PageFormatSchema,
  margins: PageMarginsSchema,
});

export type PageSettings = z.infer<typeof PageSettingsSchema>;

/** The page a project starts on when it has never had one chosen. */
export const defaultPage: PageSettings = {
  format: "a5",
  margins: { ...PAGE_FORMAT_META.a5.margins },
};

/** The margins a format is set with, so a page can always be put back to them. */
export function standardMargins(format: PageFormat): PageMargins {
  return { ...PAGE_FORMAT_META[format].margins };
}

/**
 * A millimetre is a real length, so the page is simulated at the 96 dpi CSS
 * assumes, and a 148 mm wide page measures 148 mm on screen.
 */
const CSS_DPI = 96;
const MM_PER_INCH = 25.4;

export function mmToPx(mm: number): number {
  return (mm * CSS_DPI) / MM_PER_INCH;
}

/** The trim size of a format in CSS pixels. */
export function formatSize(format: PageFormat): { width: number; height: number } {
  const { width, height } = PAGE_FORMAT_META[format];
  return { width: mmToPx(width), height: mmToPx(height) };
}
