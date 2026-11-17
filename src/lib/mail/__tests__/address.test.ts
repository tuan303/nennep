/** Email address helpers: normalisation, syntax, pasted lists, domains and the effective allowed domains (fake addresses only). */
import { describe, expect, it } from "vitest";
import {
  dedupeEmails,
  domainOf,
  effectiveAllowedDomains,
  isAllowedDomain,
  isDomain,
  isEmail,
  normalizeDomain,
  normalizeEmail,
  parseEmailList,
  partitionByDomain,
} from "../address";

describe("normalizeEmail / normalizeDomain", () => {
  it("trims, lower-cases and drops mailto: / <…> / quotes", () => {
    expect(normalizeEmail("  GV.6A01@Example.EDU.vn ")).toBe("gv.6a01@example.edu.vn");
    expect(normalizeEmail("mailto:BGH@example.edu.vn")).toBe("bgh@example.edu.vn");
    expect(normalizeEmail("<gv.6a01@example.edu.vn>")).toBe("gv.6a01@example.edu.vn");
    expect(normalizeEmail('"gv.6a01@example.edu.vn"')).toBe("gv.6a01@example.edu.vn");
    expect(normalizeEmail("   ")).toBe("");
  });

  it("normalises domains typed with @, wildcard or trailing dot", () => {
    expect(normalizeDomain(" @Example.EDU.vn. ")).toBe("example.edu.vn");
    expect(normalizeDomain("*.example.edu.vn")).toBe("example.edu.vn");
  });
});

describe("isEmail / isDomain", () => {
  it("accepts ordinary school addresses (any case)", () => {
    for (const e of ["gv.6a01@example.edu.vn", "to-khoi.6+bao-cao@example.edu.vn", "BGH@Example.Edu.Vn", "a_b@sub.example.com"]) {
      expect(isEmail(e), e).toBe(true);
    }
  });

  it("rejects malformed addresses", () => {
    for (const e of ["", "gv", "gv@", "@example.edu.vn", "gv@example", "gv@@example.edu.vn", "g v@example.edu.vn", " gv@example.edu.vn", "gv.@example.edu.vn", ".gv@example.edu.vn", "gv..a@example.edu.vn", "gv@-example.edu.vn", "gv@example.edu.v", "gv@example.edu.vn.", "gv@exa_mple.edu.vn"]) {
      expect(isEmail(e), e).toBe(false);
    }
    expect(isEmail(`${"a".repeat(65)}@example.edu.vn`)).toBe(false);
    expect(isEmail(`a@${"b".repeat(250)}.vn`)).toBe(false);
  });

  it("checks domains", () => {
    expect(isDomain("example.edu.vn")).toBe(true);
    expect(isDomain("Example.COM")).toBe(true);
    expect(isDomain("example")).toBe(false);
    expect(isDomain("@example.edu.vn")).toBe(false);
    expect(isDomain("https://example.edu.vn")).toBe(false);
    expect(isDomain("exa mple.vn")).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits on comma, semicolon, whitespace and new lines; lower-cases and deduplicates", () => {
    const text = "GV.6A01@example.edu.vn, gv.6a02@example.edu.vn;gv.6a03@example.edu.vn\n gv.6a01@EXAMPLE.edu.vn\tgv.6a04@example.edu.vn\r\n";
    expect(parseEmailList(text)).toEqual({
      valid: ["gv.6a01@example.edu.vn", "gv.6a02@example.edu.vn", "gv.6a03@example.edu.vn", "gv.6a04@example.edu.vn"],
      invalid: [],
    });
  });

  it("keeps the invalid entries as typed (deduplicated)", () => {
    expect(parseEmailList("gv.6a01@example.edu.vn, khong-hop-le, Khong-Hop-Le; @example.edu.vn")).toEqual({
      valid: ["gv.6a01@example.edu.vn"],
      invalid: ["khong-hop-le", "@example.edu.vn"],
    });
  });

  it("takes the address of Outlook style entries 'Tên <địa chỉ>'", () => {
    expect(parseEmailList("Giáo viên A <gv.6a01@example.edu.vn>; Tổ khối 6 <to.khoi6@example.edu.vn>")).toEqual({
      valid: ["gv.6a01@example.edu.vn", "to.khoi6@example.edu.vn"],
      invalid: [],
    });
  });

  it("returns empty lists for blank input", () => {
    expect(parseEmailList("")).toEqual({ valid: [], invalid: [] });
    expect(parseEmailList(" ,; \n ")).toEqual({ valid: [], invalid: [] });
  });
});

describe("domains", () => {
  it("domainOf / dedupeEmails", () => {
    expect(domainOf("GV.6A01@Example.edu.vn")).toBe("example.edu.vn");
    expect(domainOf("khong-co-a-cong")).toBe("");
    expect(dedupeEmails(["A@example.edu.vn", "a@example.edu.vn ", "", "b@example.edu.vn"])).toEqual(["a@example.edu.vn", "b@example.edu.vn"]);
  });

  it("isAllowedDomain matches the domain exactly (no subdomains, case-insensitive)", () => {
    const domains = ["Example.edu.vn", "@partner.example.com"];
    expect(isAllowedDomain("gv@example.edu.vn", domains)).toBe(true);
    expect(isAllowedDomain("GV@EXAMPLE.EDU.VN", domains)).toBe(true);
    expect(isAllowedDomain("gv@partner.example.com", domains)).toBe(true);
    expect(isAllowedDomain("gv@mail.example.edu.vn", domains)).toBe(false);
    expect(isAllowedDomain("gv@example.com", domains)).toBe(false);
    expect(isAllowedDomain("gv@example.edu.vn", [])).toBe(false);
    expect(isAllowedDomain("khong-co-a-cong", domains)).toBe(false);
  });

  it("effectiveAllowedDomains: the configured list, else the sender's domain, else nothing", () => {
    expect(effectiveAllowedDomains(["Example.edu.vn", "example.edu.vn", "x", "partner.example.com"], "noreply@other.example.org")).toEqual([
      "example.edu.vn",
      "partner.example.com",
    ]);
    expect(effectiveAllowedDomains([], "NenNep@Example.edu.vn")).toEqual(["example.edu.vn"]);
    expect(effectiveAllowedDomains(["khong hop le"], "nennep@example.edu.vn")).toEqual(["example.edu.vn"]);
    expect(effectiveAllowedDomains([])).toEqual([]);
    expect(effectiveAllowedDomains([], "khong-co-a-cong")).toEqual([]);
  });

  it("partitionByDomain splits normalised, deduplicated addresses", () => {
    expect(partitionByDomain(["GV@example.edu.vn", "gv@example.edu.vn", "ca-nhan@example.com"], ["example.edu.vn"])).toEqual({
      allowed: ["gv@example.edu.vn"],
      blocked: ["ca-nhan@example.com"],
    });
  });
});
