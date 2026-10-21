import { cn } from "./cn";
import { foldVN } from "./search";

const COLORS = [
  "bg-brand-100 text-brand-800",
  "bg-star-100 text-star-800",
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
] as const;

/** "Nguyễn Văn An" → "NA"; "An" → "A"; "" → "?" (family-name initial + given-name initial). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  if (words.length === 1) return first.toLocaleUpperCase("vi");
  const last = words[words.length - 1][0] ?? "";
  return `${first}${last}`.toLocaleUpperCase("vi");
}

/** Stable palette index for a name (accent-insensitive, so "Đức" and "Duc" match). */
export function avatarColorIndex(name: string): number {
  const s = foldVN(name);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % COLORS.length;
}

export interface AvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  /** Optional photo URL. */
  src?: string;
  className?: string;
}

const SIZES = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base" };

/** Round avatar with initials and a deterministic colour per name. */
export function Avatar({ name, size = "sm", src, className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name || "Người dùng"}
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold ring-2 ring-surface",
        SIZES[size],
        COLORS[avatarColorIndex(name)],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
}
