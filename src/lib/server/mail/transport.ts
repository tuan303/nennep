/**
 * The mail transport of this server instance, from the environment (server-only, all optional):
 * MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MAIL_SENDER (+ MAIL_SENDER_NAME).
 * All four required values set → Microsoft Graph (./graph, imported lazily on the first send so routes that only
 * queue mail never load it); otherwise an unconfigured transport whose `send` throws a non-retryable MailSendError.
 * Tests replace it with `setMailTransportForTests`.
 */
import { MAIL_DEFAULT_SENDER_NAME } from "../../constants";
import type { MailStatus } from "../../contract";
import { effectiveAllowedDomains, isEmail, normalizeEmail } from "../../mail/address";
import { appBaseUrl } from "./base-url";
import { PRINT_KEY_WARNING, isEmulatorEnv, printKeyProblem } from "./print-key";
import { MailSendError, type GraphTransportConfig, type MailTransport, type OutgoingMail, type SendOptions } from "./types";

/** Environment variables without which nothing can be sent (names only; values are secrets). */
export const MAIL_REQUIRED_ENV = ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "MAIL_SENDER"] as const;

let testTransport: MailTransport | null = null;
let graphCache: { config: GraphTransportConfig; transport: Promise<MailTransport> } | undefined;

interface MailEnv {
  config?: GraphTransportConfig;
  /** MAIL_SENDER when set and valid (even if other variables are missing). */
  sender?: string;
  senderName: string;
  /** Required variables that are empty – or, for MAIL_SENDER, not a valid address. */
  missing: string[];
}

function readMailEnv(env: NodeJS.ProcessEnv): MailEnv {
  const value = (name: string) => env[name]?.trim() ?? "";
  const rawSender = normalizeEmail(value("MAIL_SENDER"));
  const sender = isEmail(rawSender) ? rawSender : undefined;
  const missing = MAIL_REQUIRED_ENV.filter((name) => (name === "MAIL_SENDER" ? !sender : value(name) === ""));
  const senderName = value("MAIL_SENDER_NAME") || MAIL_DEFAULT_SENDER_NAME;
  if (missing.length > 0 || !sender) return { sender, senderName, missing };
  const config: GraphTransportConfig = {
    tenantId: value("MS_GRAPH_TENANT_ID"),
    clientId: value("MS_GRAPH_CLIENT_ID"),
    clientSecret: value("MS_GRAPH_CLIENT_SECRET"),
    sender,
    senderName,
  };
  return { config, sender, senderName, missing };
}

/** Vietnamese reason shown when nothing can be sent (409 of the send / test routes, error of the unconfigured transport). */
export function mailNotConfiguredMessage(missing: readonly string[]): string {
  const vars = missing.length > 0 ? missing.join(", ") : MAIL_REQUIRED_ENV.join(", ");
  return `Chưa cấu hình gửi email: cần đặt biến môi trường ${vars} trên máy chủ.`;
}

function unconfiguredTransport(missing: readonly string[]): MailTransport {
  const message = mailNotConfiguredMessage(missing);
  return {
    configured: false,
    async send(): Promise<void> {
      throw new MailSendError(message, false);
    },
  };
}

const sameConfig = (a: GraphTransportConfig, b: GraphTransportConfig): boolean =>
  a.tenantId === b.tenantId && a.clientId === b.clientId && a.clientSecret === b.clientSecret && a.sender === b.sender && a.senderName === b.senderName;

/** One Graph transport per configuration (keeps its token cache across sends of this instance). */
function graphTransport(config: GraphTransportConfig): Promise<MailTransport> {
  if (!graphCache || !sameConfig(graphCache.config, config)) {
    const transport = import("./graph").then((m) => m.createGraphTransport(config));
    const entry = { config, transport };
    graphCache = entry;
    transport.catch(() => {
      if (graphCache === entry) graphCache = undefined;
    });
  }
  return graphCache.transport;
}

function lazyGraphTransport(config: GraphTransportConfig): MailTransport {
  return {
    configured: true,
    sender: config.sender,
    async send(mail: OutgoingMail, opts?: SendOptions): Promise<void> {
      const transport = await graphTransport(config);
      await transport.send(mail, opts);
    },
  };
}

/** The transport to send with (cheap: reads the environment on every call). */
export function mailTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
  if (testTransport) return testTransport;
  const { config, missing } = readMailEnv(env);
  return config ? lazyGraphTransport(config) : unconfiguredTransport(missing);
}

/** TESTS ONLY: replace the transport of every caller (null restores the environment transport). */
export function setMailTransportForTests(transport: MailTransport | null): void {
  testTransport = transport;
}

/**
 * The sending mailbox: the transport's, else MAIL_SENDER even while other variables are missing (undefined when
 * neither). The one source of the sender's domain – mailStatus and the GVCN recipient lists both use it.
 */
export function mailSenderAddress(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return mailTransport(env).sender ?? readMailEnv(env).sender;
}

/**
 * Sending configuration for Cài đặt → Email and the report dialog. `allowedDomains` = MailSettings.allowedDomains of
 * the level (the effective list falls back to the sender's domain); `pdfWarning` when report PDFs cannot be created
 * (no print-job key in `env`). Never contains a secret.
 */
export function mailStatus(origin?: string, allowedDomains: readonly string[] = [], env: NodeJS.ProcessEnv = process.env): MailStatus {
  const fromEnv = readMailEnv(env);
  const transport = mailTransport(env);
  const sender = mailSenderAddress(env);
  const status: MailStatus = {
    configured: transport.configured,
    senderName: fromEnv.senderName,
    allowedDomains: effectiveAllowedDomains(allowedDomains, sender),
    baseUrl: appBaseUrl(origin, env),
    missing: transport === testTransport && transport.configured ? [] : fromEnv.missing,
  };
  if (sender) status.sender = sender;
  const keyProblem = printKeyProblem(env, isEmulatorEnv(env));
  if (keyProblem) status.pdfWarning = PRINT_KEY_WARNING[keyProblem];
  return status;
}
