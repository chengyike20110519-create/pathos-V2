// Tiny mailer abstraction. The default ConsoleMailer writes the
// rendered message to stdout, which is exactly what tests and local
// development need; a real SMTP / Resend implementation can be
// dropped in without changing call sites by selecting on env at
// module load.
//
// Why a thin abstraction: every external side effect (network,
// delivery receipts, retries) belongs behind an interface so a
// failing transport cannot silently drop a magic-link email.
//
// Why Resend and not SES / Postmark:
//   - Resend is the cheapest transactional provider with a single
//     `Authorization: Bearer <key>` POST; it fits in ~30 lines.
//   - It has no region pinning, so a cold start from any node works.
//   - Its HTTP API is plain JSON, no SDK lock-in.

export interface Mailer {
  send(args: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async send({ to, subject, text }: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    // Prefix keeps the line greppable in dev logs and CI output.
    console.log(`[mail] to=${to} subject="${subject}"\n${text}`);
  }
}

// Resend-backed mailer.
//
// Resend transport:
//   POST https://api.resend.com/emails
//   Authorization: Bearer <RESEND_API_KEY>
//   Content-Type: application/json
//   { from, to, subject, text, html }
//
// Failure handling:
//   - A network failure or non-2xx response MUST NOT throw from send;
//     we log and swallow so a misconfigured key never breaks the
//     caller (sign-in flow, in particular).
//   - We never log the full body to avoid leaking PII into a log
//     aggregator.
export class ResendMailer implements Mailer {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly apiUrl = "https://api.resend.com/emails";

  constructor(args: { apiKey: string; from?: string }) {
    this.apiKey = args.apiKey;
    this.from = args.from
      ?? process.env.PATHOS_MAIL_FROM
      ?? "PathOS <no-reply@pathos.app>";
  }

  async send({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    try {
      const resp = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to,
          subject,
          text,
          ...(html ? { html } : {}),
        }),
      });
      if (!resp.ok) {
        // Body is short by Resend convention; cap it to keep logs clean.
        const detail = await resp.text().catch(() => "");
        console.error(`[mail/resend] send failed status=${resp.status} detail=${detail.slice(0, 200)}`);
      }
    } catch (e) {
      console.error("[mail/resend] transport error:", e instanceof Error ? e.message : String(e));
    }
  }
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;
  // Selection order:
  //   1. PATHOS_MAIL_PROVIDER=resend (or unset) AND RESEND_API_KEY set
  //      -> ResendMailer. Useful for staging + prod once the key is in.
  //   2. PATHOS_MAIL_PROVIDER=console (or any other value) ->
  //      ConsoleMailer. Tests pin this so a stray key never escapes.
  //   3. RESEND_API_KEY missing -> ConsoleMailer. Local dev never
  //      accidentally mails a real address.
  const provider = (process.env.PATHOS_MAIL_PROVIDER ?? "resend").toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  if (provider === "resend" && apiKey && apiKey.trim()) {
    cached = new ResendMailer({ apiKey: apiKey.trim() });
  } else {
    cached = new ConsoleMailer();
  }
  return cached;
}

// Test-only hook to clear the cached instance.
export function __resetMailerForTests(): void {
  cached = null;
}
