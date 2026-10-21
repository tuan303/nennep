/** Semantic tones shared by Badge, KpiCard, ProgressBar, EmptyState… */
export type Tone = "brand" | "star" | "ok" | "warn" | "bad" | "muted";

export const TONES: readonly Tone[] = ["brand", "star", "ok", "warn", "bad", "muted"];

/** Soft chip: tinted background, strong text, hairline ring. */
export const toneSoft: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
  star: "bg-star-50 text-star-800 ring-star-500/35",
  ok: "bg-ok-soft text-ok-strong ring-ok/20",
  warn: "bg-warn-soft text-warn-strong ring-warn/25",
  bad: "bg-bad-soft text-bad-strong ring-bad/20",
  muted: "bg-muted-soft text-muted-strong ring-slate-400/25",
};

/** Solid chip: filled background, readable foreground. */
export const toneSolid: Record<Tone, string> = {
  brand: "bg-brand-600 text-white ring-brand-700/40",
  star: "bg-star-500 text-brand-950 ring-star-600/50",
  ok: "bg-ok text-white ring-ok-strong/40",
  warn: "bg-warn-fill text-brand-950 ring-warn/40",
  bad: "bg-bad text-white ring-bad-strong/40",
  muted: "bg-slate-600 text-white ring-slate-700/40",
};

/** Outline chip: white background, toned text + border. */
export const toneOutline: Record<Tone, string> = {
  brand: "bg-surface text-brand-700 ring-brand-300",
  star: "bg-surface text-star-800 ring-star-400",
  ok: "bg-surface text-ok-strong ring-ok/40",
  warn: "bg-surface text-warn-strong ring-warn/45",
  bad: "bg-surface text-bad-strong ring-bad/40",
  muted: "bg-surface text-muted-strong ring-border-strong",
};

/** Square icon tile (KPI cards, empty states, section icons). */
export const toneTile: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 ring-brand-600/10",
  star: "bg-star-100 text-star-700 ring-star-500/25",
  ok: "bg-ok-soft text-ok-strong ring-ok/15",
  warn: "bg-warn-soft text-warn-strong ring-warn/20",
  bad: "bg-bad-soft text-bad ring-bad/15",
  muted: "bg-muted-soft text-muted-strong ring-slate-400/20",
};

/** Fill colour for bars / meters. */
export const toneFill: Record<Tone, string> = {
  brand: "bg-brand-600",
  star: "bg-star-500",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-muted",
};

/** Lighter step of the same hue: the unfilled meter track. */
export const toneTrack: Record<Tone, string> = {
  brand: "bg-brand-100",
  star: "bg-star-100",
  ok: "bg-ok-soft",
  warn: "bg-warn-soft",
  bad: "bg-bad-soft",
  muted: "bg-muted-soft",
};

/** Hex values for SVG / canvas (sparklines, charts). Mirrors globals.css. */
export const toneHex: Record<Tone, string> = {
  brand: "#d21235",
  star: "#eda100",
  ok: "#16a34a",
  warn: "#d97706",
  bad: "#dc2626",
  muted: "#64748b",
};

/** Small dot used in legends / status dots. */
export const toneDot: Record<Tone, string> = {
  brand: "bg-brand-600",
  star: "bg-star-500",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-slate-400",
};
