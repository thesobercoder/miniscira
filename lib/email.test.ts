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
  test("preserves the old composition and formats Markdown tables", async () => {
    const html = await renderLookoutEmail({
      lookoutName: "ETF Watch",
      chatUrl: "https://miniscira.example/chat/123",
      answer: `## What's new

A **strong** and *careful* [source](https://example.com/report).

- one
- two

| ETF | NAV | 1M |
| --- | ---: | ---: |
| Gold BeES | ₹131.90 | +11.7% |

\`inline\`

\`\`\`ts
const result = true
\`\`\``,
    })

    expect(html).toContain("ETF Watch</h1>")
    expect(html).toContain("Your scheduled research from MiniScira Lookout.")
    expect(html).toContain("What&#x27;s new")
    expect(html).toContain("<strong>strong</strong>")
    expect(html).toContain("<em>careful</em>")
    expect(html).toContain('href="https://example.com/report"')
    expect(html).toContain("<ul")
    expect(html).toContain("<table")
    expect(html).toContain("<th")
    expect(html).toContain("Gold BeES")
    expect(html).toContain("₹131.90")
    expect(html).toContain("<code")
    expect(html).toContain("Open in MiniScira →")
    expect(html).toContain("background-color:#16a34a")
    expect(html).not.toContain('class="brand-icon"')
    expect(html).not.toContain('class="brand-wordmark"')
    expect(html).not.toContain('class="email-card"')
    expect(html).not.toContain('class="email-rule"')
    expect(html).not.toContain("color-scheme")
    expect(html).not.toContain("@media")
    expect(html).not.toContain("data:image")
    expect(html).not.toContain("base64")
    expect(html).not.toContain("<svg")
    expect(html).not.toContain("<img")
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
