import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

type MailPayload = {
  from: string
  to: string
  subject: string
  html: string
}

const sentMessages: MailPayload[] = []
const sendMail = mock(async (payload: MailPayload) => {
  sentMessages.push(payload)
})
const createTransport = mock(() => ({ sendMail }))

mock.module("server-only", () => ({}))
mock.module("nodemailer", () => ({
  default: { createTransport },
}))

const { emailConfigured, sendLookoutEmail } = await import("./email")
const { renderLookoutEmail } = await import("./lookout-email")

const KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "LOOKOUT_EMAIL_FROM",
] as const
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

beforeEach(() => {
  sentMessages.length = 0
  createTransport.mockClear()
  sendMail.mockClear()
})

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("emailConfigured", () => {
  test("is enabled by a complete Fastmail SMTP configuration", () => {
    process.env.SMTP_HOST = "smtp.fastmail.com"
    process.env.SMTP_USER = "sender@example.com"
    process.env.SMTP_PASSWORD = "app-password"
    expect(emailConfigured()).toBe(true)
  })

  test("is disabled with partial SMTP credentials", () => {
    process.env.SMTP_HOST = "smtp.fastmail.com"
    process.env.SMTP_USER = "sender@example.com"
    delete process.env.SMTP_PASSWORD
    expect(emailConfigured()).toBe(false)
  })

  test("is disabled when SMTP is absent", () => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASSWORD
    expect(emailConfigured()).toBe(false)
  })
})

describe("renderLookoutEmail", () => {
  test("renders the MiniScira brand, report hierarchy, and supported Markdown", async () => {
    const html = await renderLookoutEmail({
      lookoutName: "Weekly research",
      chatUrl: "https://miniscira.example/chat/123",
      answer: `# Findings

A **strong** and *careful* [source](https://example.com/report).

- one
- two

> quoted

\`inline\`

\`\`\`ts
const result = true
\`\`\`

---

| Item | State |
| --- | --- |
| Report | Ready |`,
    })

    expect(html).toContain("<!DOCTYPE html")
    expect(html).toContain('<html dir="ltr" lang="en">')
    expect(html).toContain('content="light dark" name="color-scheme"')
    expect(html).toContain("prefers-color-scheme: dark")
    expect(html).toContain("max-width: 620px")
    expect(html).toContain("miniscira")
    expect(html.indexOf('class="brand-wordmark"')).toBeLessThan(
      html.indexOf('class="email-title"')
    )
    expect(html).toContain("Scheduled research · Lookout")
    expect(html).toContain("background-color:#0d100e")
    expect(html).toContain("background-color:#80d900")
    expect(html).toContain("background-color:#f7f9f6")
    expect(html).toContain("background-color:#fdfefc")
    expect(html).toContain("color:#10130d")
    expect(html).toContain("color:#63685f")
    expect(html).toContain("border:1px solid #dfe3db")
    expect(html).toContain("background-color:#9ae600")
    expect(html).toContain("color:#497d00")
    expect(html).toContain("Weekly research")
    expect(html).toContain("Findings")
    expect(html).toContain("<strong>strong</strong>")
    expect(html).toContain("<em>careful</em>")
    expect(html).toContain('href="https://example.com/report"')
    expect(html).toContain("<ul")
    expect(html).toContain("<blockquote")
    expect(html).toContain("<code")
    expect(html).toContain("<table")
    expect(html).toContain('href="https://miniscira.example/chat/123"')
    expect(html).toContain("Open in MiniScira")
    expect(html).toContain("text-decoration:underline")
    expect(html).toContain(
      ".email-body { background-color: #0f110e !important; }"
    )
    expect(html).toContain(
      ".email-card { background-color: #1a1d18 !important;"
    )
    expect(html).toContain(
      ".brand-wordmark { color: #f2f5ef !important; }"
    )
    expect(html).toContain(".email-rule { border-color: #7ccf00 !important; }")
    expect(html).toContain(".email-muted, .email-content blockquote")
    expect(html).toContain(
      ".email-content code, .email-content th { background-color: #242921"
    )
    expect(html).toContain(
      ".email-content code, .email-content td, .email-content th { border-color: #3b4238"
    )
    expect(html).toContain(".email-action { background-color: #7ccf00 !important;")
    expect(html).not.toContain("#137a38")
    expect(html).not.toContain("@font-face")
    expect(html).not.toContain("data:image")
    expect(html).not.toContain("base64")
    expect(html).not.toContain("<svg")
    expect(html).not.toContain("<img")
    expect(html).not.toMatch(/\ssrc=/)
  })

  test("escapes raw HTML, blocks remote images, and does not link unsafe URLs", async () => {
    const html = await renderLookoutEmail({
      lookoutName: '<img src=x onerror="alert(1)">',
      chatUrl: "javascript:alert(2)",
      answer: `<script>alert(3)</script>

![tracking pixel](https://tracker.example/pixel.png)

[unsafe](javascript:alert(4))

[relative](/private)

[safe](http://example.com)`,
    })

    expect(html).not.toContain("<script>alert(3)</script>")
    expect(html).not.toContain("<img src=x")
    expect(html).not.toContain("tracker.example")
    expect(html).not.toContain("<img")
    expect(html).toContain("tracking pixel")
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('href="/private"')
    expect(html).toContain("unsafe")
    expect(html).toContain("relative")
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('href="http://example.com/"')
  })

  test("renders the empty state", async () => {
    const html = await renderLookoutEmail({
      lookoutName: "Quiet lookout",
      chatUrl: "https://miniscira.example/chat/quiet",
      answer: "  \n ",
    })

    expect(html).toContain("No notable updates this run.")
  })

  test("wraps long Unicode content", async () => {
    const longWord = "超".repeat(400)
    const html = await renderLookoutEmail({
      lookoutName: "Unicode scan",
      chatUrl: "https://miniscira.example/chat/unicode",
      answer: longWord,
    })

    expect(html).toContain(longWord)
    expect(html).toContain("overflow-wrap:anywhere")
  })
})

describe("sendLookoutEmail", () => {
  test("does nothing without complete SMTP configuration", async () => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASSWORD

    await sendLookoutEmail({
      to: "reader@example.com",
      lookoutName: "Daily scan",
      answer: "Nothing new.",
      chatUrl: "https://miniscira.example/chat/1",
    })

    expect(createTransport).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  test("uses SMTP configuration and sends an HTML-only payload", async () => {
    process.env.SMTP_HOST = "smtp.fastmail.com"
    process.env.SMTP_PORT = "587"
    process.env.SMTP_SECURE = "false"
    process.env.SMTP_USER = "sender@example.com"
    process.env.SMTP_PASSWORD = "app-password"
    process.env.LOOKOUT_EMAIL_FROM = "MiniScira <lookouts@example.com>"

    await sendLookoutEmail({
      to: "reader@example.com",
      name: "Reader",
      lookoutName: "Daily scan",
      answer: "A **notable** update.",
      chatUrl: "https://miniscira.example/chat/1",
    })

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.fastmail.com",
      port: 587,
      secure: false,
      auth: { user: "sender@example.com", pass: "app-password" },
    })
    expect(sendMail).toHaveBeenCalledTimes(1)
    const payload = sentMessages[0]
    expect(payload).toMatchObject({
      from: "MiniScira <lookouts@example.com>",
      to: "reader@example.com",
      subject: "🔭 Daily scan",
    })
    expect(payload?.html).toContain("<strong>notable</strong>")
    expect(payload?.html).toContain("Open in MiniScira")
    expect(payload).not.toHaveProperty("text")
  })

  test("falls back to secure port 465 and the SMTP user as sender", async () => {
    process.env.SMTP_HOST = "smtp.fastmail.com"
    process.env.SMTP_PORT = "invalid"
    delete process.env.SMTP_SECURE
    process.env.SMTP_USER = "sender@example.com"
    process.env.SMTP_PASSWORD = "app-password"
    delete process.env.LOOKOUT_EMAIL_FROM

    await sendLookoutEmail({
      to: "reader@example.com",
      lookoutName: "Daily scan",
      answer: "Update.",
      chatUrl: "https://miniscira.example/chat/1",
    })

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.fastmail.com",
      port: 465,
      secure: true,
      auth: { user: "sender@example.com", pass: "app-password" },
    })
    expect(sentMessages[0]?.from).toBe("sender@example.com")
  })
})
