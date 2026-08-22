import { afterEach, describe, expect, test } from "bun:test"

import { emailConfigured } from "./email"

const KEYS = [
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
] as const
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("emailConfigured", () => {
  test("is enabled by a complete SMTP configuration", () => {
    delete process.env.RESEND_API_KEY
    process.env.SMTP_HOST = "smtp.fastmail.com"
    process.env.SMTP_USER = "sender@example.com"
    process.env.SMTP_PASSWORD = "app-password"
    expect(emailConfigured()).toBe(true)
  })

  test("does not enable SMTP with partial credentials", () => {
    delete process.env.RESEND_API_KEY
    process.env.SMTP_HOST = "smtp.fastmail.com"
    process.env.SMTP_USER = "sender@example.com"
    delete process.env.SMTP_PASSWORD
    expect(emailConfigured()).toBe(false)
  })

  test("keeps Resend as a fallback transport", () => {
    process.env.RESEND_API_KEY = "configured"
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASSWORD
    expect(emailConfigured()).toBe(true)
  })
})
