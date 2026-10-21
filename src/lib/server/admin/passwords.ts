/** Readable temporary passwords such as "Nshm-7Kq4-2026" (shown once to the admin). */
import { randomInt } from "node:crypto";

/** No look-alike characters (0/O, 1/l/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const DIGITS = "23456789";

function pick(chars: string, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += chars[randomInt(chars.length)];
  return out;
}

/** "Nshm-" + 4 mixed characters (at least one digit, one upper, one lower) + "-" + 4 digits → 14 characters. */
export function generateTempPassword(): string {
  for (;;) {
    const middle = pick(ALPHABET, 4);
    if (/\d/.test(middle) && /[A-Z]/.test(middle) && /[a-z]/.test(middle)) return `Nshm-${middle}-${pick(DIGITS, 4)}`;
  }
}
