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
  background: "#f7f9f6",
  card: "#fdfefc",
  text: "#10130d",
  muted: "#63685f",
  border: "#dfe3db",
  primary: "#9ae600",
  primaryStrong: "#497d00",
  icon: "#0d100e",
  iconMark: "#80d900",
  code: "#f0f3ed",
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
        style={{ color: colors.primaryStrong, overflowWrap: "anywhere", textDecoration: "underline" }}
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
        borderLeft: `3px solid ${colors.primary}`,
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
        border: `1px solid ${colors.border}`,
        borderRadius: className ? "6px" : "4px",
        boxSizing: "border-box",
        color: colors.text,
        display: className ? "block" : "inline",
        fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: className ? "13px" : "0.9em",
        lineHeight: className ? "20px" : undefined,
        overflowWrap: "anywhere",
        padding: className ? "12px" : "2px 5px",
        whiteSpace: className ? "pre-wrap" : undefined,
        width: className ? "100%" : undefined,
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

function BrandMark() {
  const dot: CSSProperties = {
    backgroundColor: colors.iconMark,
    borderRadius: "999px",
    display: "block",
    height: "6px",
    position: "absolute",
    width: "6px",
  }

  return (
    <span
      className="brand-icon"
      style={{
        backgroundColor: colors.icon,
        borderRadius: "7px",
        display: "inline-block",
        height: "30px",
        position: "relative",
        verticalAlign: "middle",
        width: "30px",
      }}
    >
      <span style={{ ...dot, left: "12px", top: "5px" }} />
      <span style={{ ...dot, left: "19px", top: "12px" }} />
      <span style={{ ...dot, left: "8px", top: "20px" }} />
      <span
        style={{
          backgroundColor: colors.iconMark,
          display: "block",
          height: "3px",
          left: "10px",
          position: "absolute",
          top: "12px",
          transform: "rotate(42deg)",
          width: "12px",
        }}
      />
      <span
        style={{
          backgroundColor: colors.iconMark,
          display: "block",
          height: "3px",
          left: "7px",
          position: "absolute",
          top: "15px",
          transform: "rotate(-78deg)",
          width: "13px",
        }}
      />
    </span>
  )
}

function LookoutEmail({ lookoutName, answer, chatUrl }: LookoutEmailContent) {
  const preview = `${lookoutName}. Scheduled research from MiniScira.`
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
            .email-body { background-color: #0f110e !important; }
            .email-card { background-color: #1a1d18 !important; border-color: #343a31 !important; }
            .email-title, .email-content, .email-content p, .email-content li, .email-content h1, .email-content h2, .email-content h3, .email-content h4, .email-content h5, .email-content h6, .email-content strong, .email-content em { color: #f2f5ef !important; }
            .brand-wordmark { color: #f2f5ef !important; }
            .email-muted, .email-content blockquote, .email-content blockquote p { color: #aeb5aa !important; }
            .email-content a { color: #9ae600 !important; }
            .email-content code, .email-content th { background-color: #242921 !important; color: #f2f5ef !important; }
            .email-content code, .email-content td, .email-content th { border-color: #3b4238 !important; }
            .email-content blockquote { border-left-color: #7ccf00 !important; }
            .email-rule { border-color: #7ccf00 !important; }
            .email-action { background-color: #7ccf00 !important; border-color: #7ccf00 !important; color: #10130d !important; }
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
          padding: "28px 12px",
        }}
      >
        <Container
          className="email-card"
          style={{
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: "10px",
            boxSizing: "border-box",
            margin: "0 auto",
            maxWidth: "600px",
            padding: "28px 32px 32px",
            width: "100%",
          }}
        >
          <Section style={{ marginBottom: "26px" }}>
            <BrandMark />
            <Text
              className="brand-wordmark"
              style={{
                color: colors.text,
                display: "inline-block",
                fontSize: "19px",
                fontWeight: "700",
                letterSpacing: "-0.03em",
                lineHeight: "30px",
                margin: "0 0 0 10px",
                verticalAlign: "middle",
              }}
            >
              miniscira
            </Text>
          </Section>

          <Hr
            className="email-rule"
            style={{ borderColor: colors.primary, borderWidth: "2px", margin: "0 0 24px" }}
          />

          <Heading
            as="h1"
            className="email-title"
            style={{ color: colors.text, fontSize: "24px", lineHeight: "31px", margin: "0 0 6px" }}
          >
            {lookoutName}
          </Heading>
          <Text
            className="email-muted"
            style={{ color: colors.muted, fontSize: "13px", lineHeight: "20px", margin: "0 0 24px" }}
          >
            Scheduled research · Lookout
          </Text>

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
                className="email-action"
                href={safeChatUrl}
                style={{
                  backgroundColor: colors.primary,
                  border: `1px solid ${colors.primary}`,
                  borderRadius: "8px",
                  color: colors.text,
                  display: "inline-block",
                  fontSize: "14px",
                  fontWeight: "700",
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
