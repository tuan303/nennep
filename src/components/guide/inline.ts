/**
 * Inline markup of the guide content (pure – unit-tested in __tests__/inline.test.ts):
 *   **bold** · `code` · [[Tên nút]] (UI label chip) · [text](/route) (internal link).
 * Bold may contain the other three; code, chips and link texts are literal. Unmatched markers stay as text.
 */

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "chip"; text: string }
  | { type: "link"; text: string; href: string };

// Alternation order matters when two patterns start at the same index: "[[" is a chip before it is a link.
const CHIP = String.raw`\[\[([^\[\]\n]+?)\]\]`;
const LINK = String.raw`\[([^\[\]\n]+?)\]\(([^()\s]+)\)`;
const BOLD = String.raw`\*\*(.+?)\*\*`;
const CODE = "`([^`\\n]+?)`";

function pattern(withBold: boolean): RegExp {
  return new RegExp([CHIP, LINK, ...(withBold ? [BOLD] : []), CODE].join("|"), "g");
}

/** Internal destinations only: an app path ("/xep-hang", "/huong-dan#muc") or an anchor ("#muc"). */
export function isInternalHref(href: string): boolean {
  return (href.startsWith("/") && !href.startsWith("//")) || (href.startsWith("#") && href.length > 1);
}

function pushText(out: InlineNode[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === "text") last.text += text;
  else out.push({ type: "text", text });
}

function parse(text: string, withBold: boolean): InlineNode[] {
  const out: InlineNode[] = [];
  const re = pattern(withBold);
  let pos = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    pushText(out, text.slice(pos, m.index));
    const [whole, chip, linkText, linkHref, ...rest] = m;
    const bold = withBold ? rest[0] : undefined;
    const code = withBold ? rest[1] : rest[0];
    if (chip !== undefined) out.push({ type: "chip", text: chip.trim() });
    else if (linkText !== undefined && linkHref !== undefined) {
      // External or malformed destinations are not rendered as links: keep the readable label only.
      if (isInternalHref(linkHref)) out.push({ type: "link", text: linkText, href: linkHref });
      else pushText(out, linkText);
    } else if (bold !== undefined) out.push({ type: "bold", children: parse(bold, false) });
    else if (code !== undefined) out.push({ type: "code", text: code });
    else pushText(out, whole);
    pos = m.index + whole.length;
  }
  pushText(out, text.slice(pos));
  return out;
}

/** Parse one paragraph / list item of guide text into inline nodes. */
export function parseInline(text: string): InlineNode[] {
  return parse(text ?? "", true);
}

function nodesToPlain(nodes: readonly InlineNode[]): string {
  return nodes.map((n) => (n.type === "bold" ? nodesToPlain(n.children) : n.text)).join("");
}

/** Text without markup (search index, aria labels): "Bấm [[Lưu]] ở **Nhập liệu**" → "Bấm Lưu ở Nhập liệu". */
export function inlineToPlain(text: string): string {
  return nodesToPlain(parseInline(text));
}
