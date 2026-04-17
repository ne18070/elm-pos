// Client-side helper — calls the /api/email Next.js route (server-side Resend)

export type EmailType =
  | 'subscription_received'
  | 'subscription_approved'
  | 'subscription_rejected'
  | 'marketing';

interface SendEmailOpts {
  type:    EmailType;
  to:      string;
  subject: string;
  data:    Record<string, unknown>;
}

export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const res = await fetch('/api/email', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(opts),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Email send failed (${res.status})`);
  }
}
