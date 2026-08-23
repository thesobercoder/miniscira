import nodemailer from "nodemailer"

/** Whether Fastmail/SMTP delivery is fully configured. */
export function emailConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  )
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

async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPassword = process.env.SMTP_PASSWORD
  if (!smtpHost || !smtpUser || !smtpPassword) return

  const port = Number.parseInt(process.env.SMTP_PORT || "465", 10)
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(port) ? port : 465,
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user: smtpUser, pass: smtpPassword },
  })
  await transport.sendMail({
    from: process.env.LOOKOUT_EMAIL_FROM || smtpUser,
    ...input,
  })
}

export async function sendLookoutEmail(input: {
  to: string
  name?: string | null
  lookoutName: string
  answer: string
  chatUrl: string
}): Promise<void> {
  if (!emailConfigured()) return

  const body = input.answer
    ? `<p>${mdToHtml(input.answer)}</p>`
    : "<p>No notable updates this run.</p>"
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:14px">
      <h1 style="font-size:18px;margin:0 0 2px">🔭 ${input.lookoutName}</h1>
      <p style="color:#666;font-size:12px;margin:0 0 16px">Your scheduled research from MiniScira.</p>
      ${body}
      <p style="margin:24px 0 0">
        <a href="${input.chatUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600">Open in MiniScira →</a>
      </p>
    </div>`

  await sendEmail({
    to: input.to,
    subject: `🔭 ${input.lookoutName}`,
    html,
  })
}
