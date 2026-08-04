import { Resend } from "resend"

/**
 * Whether outbound email is configured at all.
 *
 * @public Callers can use this to skip or soften email-dependent flows (lookout
 * delivery, invites) when no key is set.
 */
export function emailConfigured() {
  return !!process.env.RESEND_API_KEY
}

// Minimal, safe Markdown → HTML for the email body (links, bold, headings, breaks).
function mdToHtml(md: string): string {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return esc
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" style="color:#16a34a">$1</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /^### (.*)$/gm,
      '<h3 style="font-size:15px;margin:16px 0 4px">$1</h3>'
    )
    .replace(
      /^## (.*)$/gm,
      '<h2 style="font-size:16px;margin:18px 0 4px">$1</h2>'
    )
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
}

export async function sendLookoutEmail(input: {
  to: string
  name?: string | null
  lookoutName: string
  answer: string
  chatUrl: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return // email not configured — skip silently
  const from =
    process.env.LOOKOUT_EMAIL_FROM ||
    "MiniScira Lookout <onboarding@resend.dev>"

  const body = input.answer
    ? `<p>${mdToHtml(input.answer)}</p>`
    : "<p>No notable updates this run.</p>"
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:14px">
      <h1 style="font-size:18px;margin:0 0 2px">🔭 ${input.lookoutName}</h1>
      <p style="color:#666;font-size:12px;margin:0 0 16px">Your scheduled research from MiniScira Lookout.</p>
      ${body}
      <p style="margin:24px 0 0">
        <a href="${input.chatUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600">Open in MiniScira →</a>
      </p>
    </div>`

  await new Resend(key).emails.send({
    from,
    to: input.to,
    subject: `🔭 ${input.lookoutName}`,
    html,
  })
}
