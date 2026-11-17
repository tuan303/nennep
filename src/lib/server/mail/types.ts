/**
 * Server-side mail building blocks shared by the transport (Microsoft Graph), the outbox drain and the job builders
 * (GVCN notices, report emails, test messages).
 */
import type { MailJob } from "../../types";

export interface MailAttachment {
  name: string; // file name shown to the recipient
  contentType: string; // e.g. "application/pdf"
  contentBase64: string;
}

export interface OutgoingMail {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  /** false → `send` always throws a non-retryable MailSendError (missing environment variables). */
  readonly configured: boolean;
  /** Sending mailbox (MAIL_SENDER). */
  readonly sender?: string;
  /** Sends one message; throws MailSendError. */
  send(mail: OutgoingMail, opts?: SendOptions): Promise<void>;
}

export interface SendOptions {
  /** Epoch ms by which the send must be over (DrainContext.deadline): request timeouts are shortened to fit. */
  deadline?: number;
}

/** Settings of the Microsoft Graph transport, read from the environment by `mailTransport()`. */
export interface GraphTransportConfig {
  tenantId: string; // MS_GRAPH_TENANT_ID
  clientId: string; // MS_GRAPH_CLIENT_ID
  clientSecret: string; // MS_GRAPH_CLIENT_SECRET
  sender: string; // MAIL_SENDER (normalised)
  senderName: string; // MAIL_SENDER_NAME or MAIL_DEFAULT_SENDER_NAME
}

/** A failed send. `message` is Vietnamese (stored as MailJob.lastError and shown to admins). */
export class MailSendError extends Error {
  constructor(
    message: string,
    /** true → the job goes back to PENDING with a backoff (429, 5xx, network); false → FAILED. */
    readonly retryable: boolean,
    /** Server-requested wait (Retry-After), when longer than the policy backoff. */
    readonly retryAfterMs?: number,
    /** HTTP status of the provider response, when there was one. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "MailSendError";
  }
}

/**
 * Not enough time left in this drain to start a step (PDF render, send). Not a failure: the drain puts the claimed job
 * back to PENDING without counting the attempt and stops; the next drain does it.
 */
export class OutOfTimeError extends Error {
  constructor(message = "not enough time left before the drain deadline") {
    super(message);
    this.name = "OutOfTimeError";
  }
}

/** Result of a job builder: the message to send, or why the job is SKIPPED (Vietnamese). */
export type BuiltMail = { mail: OutgoingMail } | { skip: string };

/** Builds the message of one claimed job (registered per MailJobKind in DrainOptions.builders). */
export type JobBuilder = (job: MailJob, ctx: DrainContext) => Promise<BuiltMail>;

export interface DrainContext {
  /** Base URL of links (appBaseUrl, no trailing slash). */
  baseUrl: string;
  transport: MailTransport;
  /**
   * Epoch ms by which the drain's work must be over, anchored at the start of the invocation (DrainOptions.startedAt):
   * no claim, PDF step or send is started without enough time left before it (OutOfTimeError otherwise).
   */
  deadline: number;
  /** Per-drain cache bag for builders (e.g. a shared headless browser, recipients per class). */
  cache: Map<string, unknown>;
  /** Registers a cleanup run once at the end of the drain (e.g. close the browser). */
  onFinish: (fn: () => Promise<void>) => void;
}
