/**
 * "Unsaved input" protection for the record forms (Nhập liệu, Điểm thưởng) and Cài đặt. Pure – no React – unit-tested.
 *
 * - `leavingHref`: does a click on a link navigate this tab to another page of the app? (the App Router has no
 *   navigation-blocking API, so `useLeaveGuard` intercepts such clicks in the capture phase and asks first).
 * - `requestLeave`: lets any other control that would drop the page (e.g. the level switcher of the shell) ask the
 *   page with unsaved input before it proceeds; without an active guard it proceeds at once.
 * - `createDraftMemory`: per-tab, in-memory copies of unfinished forms (never written to disk – the forms hold minors'
 *   personal data) so a form unmounted without a prompt (level switch, browser back gesture) comes back intact.
 */

export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface AnchorLike {
  /** Resolved URL of the link (HTMLAnchorElement.href). */
  href: string;
  target: string;
  hasDownload: boolean;
}

/** Whether navigating from `from` to `to` keeps the page (and its form) mounted. */
export type SamePage = (to: URL, from: URL) => boolean;

/** Default: only a link to the very same path and query (e.g. a hash link, the tab of the current page). */
export const SAME_PATH_AND_QUERY: SamePage = (to, from) => to.pathname === from.pathname && to.search === from.search;

/** The page keeps its form whatever the query (filters, tabs…). */
export const SAME_PATH: SamePage = (to, from) => to.pathname === from.pathname;

/** The page keeps its form unless the query parameter `name` changes (e.g. `?edit=` swaps the entry form). */
export function sameParam(name: string): SamePage {
  return (to, from) => to.pathname === from.pathname && (to.searchParams.get(name) ?? "") === (from.searchParams.get(name) ?? "");
}

/**
 * In-app destination ("/path?query#hash") of a plain click that would replace the current page in this tab, or null
 * when the click opens a new tab/window, downloads, leaves the app (the browser's beforeunload prompt covers that)
 * or stays on the same page (`samePage`).
 */
export function leavingHref(e: ClickLike, a: AnchorLike, currentUrl: string, samePage: SamePage = SAME_PATH_AND_QUERY): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (a.hasDownload || (a.target !== "" && a.target !== "_self")) return null;
  let to: URL;
  let from: URL;
  try {
    from = new URL(currentUrl);
    to = new URL(a.href, from);
  } catch {
    return null;
  }
  if (to.protocol !== "http:" && to.protocol !== "https:") return null;
  if (to.origin !== from.origin) return null;
  if (samePage(to, from)) return null;
  return `${to.pathname}${to.search}${to.hash}`;
}

/* ------------------------------ leave requests ----------------------------- */

/** A mounted guard: asks the user, then calls `proceed` if they agree to drop the unsaved input. */
export type LeaveHandler = (proceed: () => void) => void;

const handlers: LeaveHandler[] = [];

/** Registers the guard of a page with unsaved input (latest wins); returns the unregister function. */
export function registerLeaveHandler(handler: LeaveHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.lastIndexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

/**
 * Run `proceed` once nothing unsaved would be lost: immediately without an active guard, otherwise after the user
 * confirms in the guard's dialog (never when they choose to stay). For actions that drop the page without a link
 * click, e.g. `requestLeave(() => setLevelId(next))` in the level switcher.
 */
export function requestLeave(proceed: () => void): void {
  const handler = handlers[handlers.length - 1];
  if (handler) handler(proceed);
  else proceed();
}

/** True while a page has unsaved input (a guard is mounted and active). */
export function hasUnsavedInput(): boolean {
  return handlers.length > 0;
}

/* ------------------------------- draft memory ------------------------------ */

export interface DraftMemory<T> {
  read(key: string): T | undefined;
  write(key: string, value: T): void;
  clear(key: string): void;
  /** Some draft is kept under a key starting with `prefix`. */
  hasPrefix(prefix: string): boolean;
}

/**
 * In-memory draft store (module scope = one browser tab; gone on reload, which the beforeunload prompt covers).
 * Keys start with the user id, and writing for one user forgets every other user's drafts (shared computers).
 */
export function createDraftMemory<T>(): DraftMemory<T> {
  const drafts = new Map<string, T>();
  const ownerOf = (key: string) => key.slice(0, key.indexOf("|") + 1);
  return {
    read: (key) => drafts.get(key),
    write: (key, value) => {
      const owner = ownerOf(key);
      for (const k of [...drafts.keys()]) if (!k.startsWith(owner)) drafts.delete(k);
      drafts.set(key, value);
    },
    clear: (key) => {
      drafts.delete(key);
    },
    hasPrefix: (prefix) => [...drafts.keys()].some((k) => k.startsWith(prefix)),
  };
}

/** "uid|levelId|" – prefix of every draft of a user in a level. */
export function draftPrefix(uid: string, levelId: string): string {
  return `${uid}|${levelId}|`;
}

/** Shallow list equality (ids, links). */
export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Evidence link inputs that carry text (empty drafts do not count as input). */
export function typedLinks(links: readonly string[]): string[] {
  return links.map((l) => l.trim()).filter(Boolean);
}
