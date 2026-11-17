/**
 * One sender / allowed-domain computation (no emulators): mailStatus (Cài đặt → Email, report dialog) and the GVCN
 * recipient lists (coverage, class rows, notices) agree – also while mail is only partly configured. Fake values only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { allowedDomainsOf } from "../mail/recipients";
import { mailSenderAddress, mailStatus, setMailTransportForTests } from "../mail/transport";
import type { MailTransport } from "../mail/types";

const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;

afterEach(() => setMailTransportForTests(null));

describe("sender and allowed domains", () => {
  it("MAIL_SENDER set but another variable missing: both report the sender's domain", () => {
    const partial = env({ MAIL_SENDER: "NoReply@Example.edu.vn", MS_GRAPH_TENANT_ID: "tenant-test" });
    const status = mailStatus(undefined, [], partial);
    expect(status.configured).toBe(false);
    expect(mailSenderAddress(partial)).toBe("noreply@example.edu.vn");
    expect(status.allowedDomains).toEqual(["example.edu.vn"]);
    expect(allowedDomainsOf({ allowedDomains: [] }, partial)).toEqual(status.allowedDomains);
  });

  it("saved domains win; nothing known at all → [] on both sides", () => {
    const partial = env({ MAIL_SENDER: "noreply@example.edu.vn" });
    expect(allowedDomainsOf({ allowedDomains: ["other.edu.vn"] }, partial)).toEqual(mailStatus(undefined, ["other.edu.vn"], partial).allowedDomains);
    expect(mailSenderAddress(env({}))).toBeUndefined();
    expect(mailStatus(undefined, [], env({})).allowedDomains).toEqual([]);
    expect(allowedDomainsOf({ allowedDomains: [] }, env({}))).toEqual([]);
  });

  it("a configured transport's sender is used by both", () => {
    const fake: MailTransport = { configured: true, sender: "nennep@school.example.vn", async send() {} };
    setMailTransportForTests(fake);
    const anything = env({ MAIL_SENDER: "noreply@example.edu.vn" });
    expect(mailSenderAddress(anything)).toBe("nennep@school.example.vn");
    expect(allowedDomainsOf({ allowedDomains: [] }, anything)).toEqual(["school.example.vn"]);
    expect(mailStatus(undefined, [], anything).allowedDomains).toEqual(["school.example.vn"]);
  });
});
