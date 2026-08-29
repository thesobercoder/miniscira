import "server-only"

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties, ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

export type LookoutEmailContent = {
  lookoutName: string
  answer: string
  chatUrl: string
}

const colors = {
  background: "#f3f5f3",
  card: "#ffffff",
  text: "#17201a",
  muted: "#606b63",
  border: "#d9dfda",
  accent: "#137a38",
  code: "#edf1ee",
}

const paragraphStyle: CSSProperties = {
  color: colors.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
}

function safeReportUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString()
    }
  } catch {}
  return undefined
}

function headingStyle(fontSize: string, lineHeight: string): CSSProperties {
  return {
    ...paragraphStyle,
    fontSize,
    fontWeight: "700",
    lineHeight,
    margin: "24px 0 10px",
  }
}

function UnsafeLinkText({ children }: { children: ReactNode }) {
  return <span style={{ color: colors.text }}>{children}</span>
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 style={headingStyle("24px", "31px")}>{children}</h1>,
  h2: ({ children }) => <h2 style={headingStyle("20px", "27px")}>{children}</h2>,
  h3: ({ children }) => <h3 style={headingStyle("17px", "24px")}>{children}</h3>,
  h4: ({ children }) => <h4 style={headingStyle("15px", "22px")}>{children}</h4>,
  h5: ({ children }) => <h5 style={headingStyle("14px", "21px")}>{children}</h5>,
  h6: ({ children }) => <h6 style={headingStyle("13px", "20px")}>{children}</h6>,
  p: ({ children }) => <p style={paragraphStyle}>{children}</p>,
  a: ({ href, children }) => {
    const safeHref = href ? safeReportUrl(href) : undefined
    return safeHref ? (
      <a
        href={safeHref}
        rel="noopener noreferrer"
        style={{ color: colors.accent, overflowWrap: "anywhere", textDecoration: "underline" }}
        target="_blank"
      >
        {children}
      </a>
    ) : (
      <UnsafeLinkText>{children}</UnsafeLinkText>
    )
  },
  img: ({ alt }) => <span style={{ color: colors.muted }}>[Image: {alt || "image"}]</span>,
  ul: ({ children }) => (
    <ul style={{ ...paragraphStyle, marginTop: "0", paddingLeft: "24px" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ ...paragraphStyle, marginTop: "0", paddingLeft: "24px" }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: "6px" }}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: `4px solid ${colors.border}`,
        color: colors.muted,
        margin: "0 0 16px",
        padding: "2px 0 2px 16px",
      }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      style={{
        backgroundColor: colors.code,
        borderRadius: className ? "6px" : "4px",
        color: colors.text,
        display: className ? "block" : "inline",
        fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: className ? "13px" : "0.9em",
        lineHeight: className ? "20px" : undefined,
        overflowWrap: "anywhere",
        padding: className ? "12px" : "2px 5px",
        whiteSpace: className ? "pre-wrap" : undefined,
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre style={{ margin: "0 0 16px", maxWidth: "100%", whiteSpace: "pre-wrap" }}>
      {children}
    </pre>
  ),
  hr: () => (
    <hr style={{ border: "0", borderTop: `1px solid ${colors.border}`, margin: "24px 0" }} />
  ),
  table: ({ children }) => (
    <table
      cellPadding="0"
      cellSpacing="0"
      style={{
        borderCollapse: "collapse",
        fontSize: "13px",
        margin: "0 0 16px",
        tableLayout: "fixed",
        width: "100%",
      }}
    >
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th
      style={{
        backgroundColor: colors.code,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        overflowWrap: "anywhere",
        padding: "8px",
        textAlign: "left",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        border: `1px solid ${colors.border}`,
        color: colors.text,
        overflowWrap: "anywhere",
        padding: "8px",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  ),
}

function LookoutEmail({ lookoutName, answer, chatUrl }: LookoutEmailContent) {
  const preview = `${lookoutName}. Your scheduled research from MiniScira.`
  const report = answer.trim()
  const safeChatUrl = safeReportUrl(chatUrl)

  return (
    <Html dir="ltr" lang="en">
      <Head>
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />
        <style>{`
          :root { color-scheme: light dark; supported-color-schemes: light dark; }
          @media (prefers-color-scheme: dark) {
            .email-body { background-color: #101411 !important; }
            .email-card { background-color: #18201a !important; border-color: #344037 !important; }
            .email-title, .email-content, .email-content p, .email-content li, .email-content h1, .email-content h2, .email-content h3, .email-content h4, .email-content h5, .email-content h6, .email-content strong, .email-content em { color: #f1f5f2 !important; }
            .email-muted { color: #abb5ae !important; }
            .email-content a { color: #75d497 !important; }
            .email-content code, .email-content th { background-color: #29332c !important; color: #f1f5f2 !important; }
            .email-content td, .email-content th { border-color: #465149 !important; }
          }
          @media only screen and (max-width: 620px) {
            .email-body { padding: 0 !important; }
            .email-card { border-left: 0 !important; border-right: 0 !important; border-radius: 0 !important; padding-left: 20px !important; padding-right: 20px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="email-body"
        style={{
          backgroundColor: colors.background,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          margin: "0",
          padding: "32px 12px",
        }}
      >
        <Container
          className="email-card"
          style={{
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            boxSizing: "border-box",
            margin: "0 auto",
            maxWidth: "600px",
            padding: "32px",
            width: "100%",
          }}
        >
          <Heading
            as="h1"
            className="email-title"
            style={{ color: colors.text, fontSize: "22px", lineHeight: "29px", margin: "0 0 4px" }}
          >
            {lookoutName}
          </Heading>
          <Text
            className="email-muted"
            style={{ color: colors.muted, fontSize: "13px", lineHeight: "20px", margin: "0" }}
          >
            Your scheduled research from MiniScira.
          </Text>

          <Hr style={{ borderColor: colors.border, margin: "24px 0" }} />

          <Section className="email-content">
            {report ? (
              <ReactMarkdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm]}
                skipHtml
                urlTransform={(url) => safeReportUrl(url)}
              >
                {report}
              </ReactMarkdown>
            ) : (
              <Text className="email-muted" style={{ ...paragraphStyle, color: colors.muted }}>
                No notable updates this run.
              </Text>
            )}
          </Section>

          <Section style={{ marginTop: "28px" }}>
            {safeChatUrl ? (
              <Button
                href={safeChatUrl}
                style={{
                  backgroundColor: colors.accent,
                  border: `1px solid ${colors.accent}`,
                  borderRadius: "8px",
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: "14px",
                  fontWeight: "600",
                  lineHeight: "20px",
                  padding: "10px 16px",
                  textDecoration: "underline",
                }}
              >
                Open in MiniScira
              </Button>
            ) : (
              <Text style={{ ...paragraphStyle, marginBottom: "0" }}>Open in MiniScira</Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderLookoutEmail(content: LookoutEmailContent): Promise<string> {
  return render(<LookoutEmail {...content} />)
}
