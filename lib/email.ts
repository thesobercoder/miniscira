import nodemailer from "nodemailer"

import { renderLookoutEmail, type LookoutEmailContent } from "./lookout-email"

export function emailConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  )
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

export async function sendLookoutEmail(
  input: LookoutEmailContent & {
    to: string
    name?: string | null
  }
): Promise<void> {
  if (!emailConfigured()) return

  const html = await renderLookoutEmail(input)
  await sendEmail({
    to: input.to,
    subject: `🔭 ${input.lookoutName}`,
    html,
  })
}
