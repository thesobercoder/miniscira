import { afterEach, describe, expect, test } from "bun:test"

import { emailConfigured } from "./email"

const KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

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
