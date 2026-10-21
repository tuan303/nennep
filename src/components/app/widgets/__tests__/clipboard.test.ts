import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, execCopy } from "../lib/clipboard";
import { manualCopyStore } from "../lib/manual-copy";
import { copyWithFallback } from "../manual-copy";

/** Just enough DOM for the execCommand fallback: elements record where they were appended and what got focus. */
function fakeDom(opts: { inDialog: boolean }) {
  const log: string[] = [];
  let active: FakeEl | null = null;
  class FakeEl {
    children: FakeEl[] = [];
    parent: FakeEl | null = null;
    style: Record<string, string> = {};
    value = "";
    tabIndex = 0;
    constructor(
      readonly name: string,
      readonly role?: string,
    ) {}
    setAttribute() {}
    appendChild(c: FakeEl) {
      c.parent = this;
      this.children.push(c);
      log.push(`append ${c.name} → ${this.name}`);
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
      log.push(`remove ${this.name}`);
    }
    closest(sel: string): FakeEl | null {
      for (let e: FakeEl | null = this; e; e = e.parent) if (e.role && sel.includes(`"${e.role}"`)) return e;
      return null;
    }
    focus() {
      active = this;
      log.push(`focus ${this.name}`);
    }
    select() {
      log.push(`select ${this.name}`);
    }
    setSelectionRange() {}
  }
  const body = new FakeEl("body");
  const dialog = new FakeEl("dialog", "dialog");
  body.appendChild(dialog);
  const button = new FakeEl("button");
  (opts.inDialog ? dialog : body).appendChild(button);
  active = button;
  log.length = 0;
  const doc = {
    body,
    get activeElement() {
      return active;
    },
    createElement: () => new FakeEl("textarea"),
    execCommand: (cmd: string) => {
      log.push(`exec ${cmd} (focus: ${active?.name})`);
      return true;
    },
  };
  return { doc: doc as unknown as Document, log, dialog, body };
}

describe("execCopy (clipboard fallback)", () => {
  it("selects inside the open Radix dialog/sheet – a textarea outside loses focus to the focus trap", () => {
    const { doc, log } = fakeDom({ inDialog: true });
    expect(execCopy(doc, "Lịch sử học sinh")).toBe(true);
    expect(log).toEqual([
      "append textarea → dialog",
      "focus textarea",
      "select textarea",
      "exec copy (focus: textarea)",
      "remove textarea",
      "focus button", // focus back on the clicked "Sao chép"
    ]);
  });

  it("uses <body> when no modal is open", () => {
    const { doc, log } = fakeDom({ inDialog: false });
    expect(execCopy(doc, "x")).toBe(true);
    expect(log[0]).toBe("append textarea → body");
  });

  it("reports failure without a DOM", async () => {
    expect(await copyText("x")).toBe(false); // node: no clipboard, no document
  });
});

describe("copyWithFallback (manual copy when the clipboard is blocked)", () => {
  afterEach(() => manualCopyStore.close());

  it("opens the manual-copy dialog with the text instead of only a toast", async () => {
    const unregister = manualCopyStore.registerHost();
    try {
      expect(await copyWithFallback("Báo cáo GVCN 6A01", { title: "Sao chép báo cáo" })).toBe(false);
      expect(manualCopyStore.get()).toMatchObject({ title: "Sao chép báo cáo", text: "Báo cáo GVCN 6A01" });
    } finally {
      unregister();
    }
    expect(manualCopyStore.get()).toBeNull(); // host gone → request dropped
  });

  it("cannot open the dialog without a mounted host (falls back to a toast)", async () => {
    const listener = vi.fn();
    const unsubscribe = manualCopyStore.subscribe(listener);
    expect(manualCopyStore.open("x", "t")).toBe(false);
    expect(await copyWithFallback("x")).toBe(false);
    expect(manualCopyStore.get()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
