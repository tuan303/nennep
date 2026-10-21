/**
 * Shared look of text-like controls: Input, Select, DateInput, Combobox trigger.
 * 16px text on phones avoids iOS zoom. Plain module (no "use client"), safe to import anywhere.
 */
export const controlBase =
  "w-full min-w-0 rounded-control border border-border-strong bg-surface text-base text-slate-900 shadow-xs outline-none sm:text-sm " +
  "transition-[border-color,box-shadow,background-color] duration-150 ease-soft placeholder:text-slate-400 " +
  "hover:border-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus-visible:border-brand-500 " +
  "disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-slate-400 disabled:shadow-none " +
  "aria-invalid:border-bad aria-invalid:focus:ring-bad/15";

export const controlHeight = { md: "h-11 sm:h-10 pointer-coarse:h-11", lg: "h-12" } as const;
