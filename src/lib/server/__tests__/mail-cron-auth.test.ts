/**
 * GET /api/cron/mail authorisation (no emulators: refused requests never touch Firestore): Bearer CRON_SECRET only,
 * 401 when CRON_SECRET is not set or the token differs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET as cronGET } from "@/app/api/cron/mail/route";
import type { ApiErrorBody } from "../../contract";
import { CRON_MSG, isCronAuthorized } from "../mail/cron";
import { callRoute } from "./helpers";

const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;
const req = (authorization?: string) => new Request("http://localhost:3000/api/cron/mail", { headers: authorization ? { authorization } : {} });
const saved = process.env.CRON_SECRET;

afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

describe("isCronAuthorized", () => {
  it("accepts exactly `Bearer <CRON_SECRET>`", () => {
    const e = env({ CRON_SECRET: "cron-secret-test" });
    expect(isCronAuthorized(req("Bearer cron-secret-test"), e)).toBe(true);
    expect(isCronAuthorized(req("bearer  cron-secret-test "), e)).toBe(true);
    expect(isCronAuthorized(req("Bearer cron-secret-tes"), e)).toBe(false);
    expect(isCronAuthorized(req("Bearer cron-secret-test-x"), e)).toBe(false);
    expect(isCronAuthorized(req("cron-secret-test"), e)).toBe(false);
    expect(isCronAuthorized(req(), e)).toBe(false);
  });

  it("refuses everything when CRON_SECRET is missing or blank", () => {
    expect(isCronAuthorized(req("Bearer "), env({}))).toBe(false);
    expect(isCronAuthorized(req("Bearer x"), env({ CRON_SECRET: "  " }))).toBe(false);
    expect(isCronAuthorized(req("Bearer undefined"), env({}))).toBe(false);
  });
});

describe("GET /api/cron/mail", () => {
  it("401 without CRON_SECRET on the server, with a wrong token, or without a token", async () => {
    delete process.env.CRON_SECRET;
    const missing = await callRoute<ApiErrorBody>(cronGET, { url: "/api/cron/mail", headers: { authorization: "Bearer anything" } });
    expect(missing.status).toBe(401);
    expect(missing.body.error).toEqual({ code: "UNAUTHENTICATED", message: CRON_MSG.unauthorized });

    process.env.CRON_SECRET = "cron-secret-test";
    expect((await callRoute(cronGET, { url: "/api/cron/mail", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await callRoute(cronGET, { url: "/api/cron/mail" })).status).toBe(401);
  });
});
