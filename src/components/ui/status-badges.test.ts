import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Top90Badge } from "./status-badges";

(globalThis as { React?: typeof React }).React = React;

describe("Top90Badge", () => {
  it("defaults to the spec ratio (Top 90%)", () => {
    expect(renderToStaticMarkup(createElement(Top90Badge, { inTop90: true }))).toContain(">Top 90%<");
    expect(renderToStaticMarkup(createElement(Top90Badge, { inTop90: false }))).toContain(">Ngoài Top 90%<");
  });

  it("follows the configured ratio instead of a hard-coded 90%", () => {
    const inside = renderToStaticMarkup(createElement(Top90Badge, { inTop90: true, ratio: 0.8 }));
    expect(inside).toContain(">Top 80%<");
    expect(inside).toContain('aria-label="Thuộc Top 80%"');
    expect(inside).not.toContain("90%");
    const outside = renderToStaticMarkup(createElement(Top90Badge, { inTop90: false, ratio: 0.85 }));
    expect(outside).toContain(">Ngoài Top 85%<");
    expect(outside).not.toContain("90%");
  });
});
