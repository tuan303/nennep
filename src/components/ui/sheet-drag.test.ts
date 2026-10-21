import { describe, expect, it } from "vitest";
import { sheetDragOutcome } from "./sheet-drag";

describe("sheetDragOutcome (bottom sheet drag-to-close)", () => {
  it("closes after a long drag or a quick flick, snaps back otherwise", () => {
    expect(sheetDragOutcome(130, 600)).toBe("close");
    expect(sheetDragOutcome(60, 50)).toBe("close"); // 1.2 px/ms flick
    expect(sheetDragOutcome(60, 400)).toBe("snap");
    expect(sheetDragOutcome(20, 10)).toBe("snap");
  });

  it("never closes a non-dismissible sheet (unsaved edits, running import)", () => {
    expect(sheetDragOutcome(400, 300, false)).toBe("snap");
    expect(sheetDragOutcome(60, 50, false)).toBe("snap");
  });
});
