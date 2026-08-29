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
  text: "#111111",
  muted: "#666666",
  border: "#dddddd",
  link: "#16a34a",
  code: "#f3f4f3",
}

const paragraphStyle: CSSProperties = {
  color: colors.text,
  fontSize: "14px",
  lineHeight: "1.55",
  margin: "0 0 14px",
  overflowWrap: "anywhere",
}

function safeWebUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString()
    }
  } catch {}
  return undefined
}

function UnsafeLinkText({ children }: { children: ReactNode }) {
  return <span>{children}</span>
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 style={{ color: colors.text, fontSize: "18px", lineHeight: "24px", margin: "20px 0 6px" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ color: colors.text, fontSize: "16px", lineHeight: "22px", margin: "18px 0 6px" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ color: colors.text, fontSize: "15px", lineHeight: "21px", margin: "16px 0 4px" }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => <h4 style={{ ...paragraphStyle, fontWeight: "700" }}>{children}</h4>,
  h5: ({ children }) => <h5 style={{ ...paragraphStyle, fontWeight: "700" }}>{children}</h5>,
  h6: ({ children }) => <h6 style={{ ...paragraphStyle, fontWeight: "700" }}>{children}</h6>,
  p: ({ children }) => <p style={paragraphStyle}>{children}</p>,
  a: ({ href, children }) => {
    const safeHref = href ? safeWebUrl(href) : undefined
    return safeHref ? (
      <a href={safeHref} rel="noopener noreferrer" style={{ color: colors.link, overflowWrap: "anywhere" }} target="_blank">
        {children}
      </a>
    ) : (
      <UnsafeLinkText>{children}</UnsafeLinkText>
    )
  },
  img: ({ alt }) => <span>[Image: {alt || "image"}]</span>,
  ul: ({ children }) => <ul style={{ ...paragraphStyle, paddingLeft: "22px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ ...paragraphStyle, paddingLeft: "22px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: "4px" }}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: `3px solid ${colors.border}`, color: colors.muted, margin: "0 0 14px", paddingLeft: "12px" }}>
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      style={{
        backgroundColor: colors.code,
        borderRadius: "4px",
        boxSizing: "border-box",
        color: colors.text,
        display: className ? "block" : "inline",
        fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "12px",
        lineHeight: "18px",
        overflowWrap: "anywhere",
        padding: className ? "10px" : "2px 4px",
        whiteSpace: className ? "pre-wrap" : undefined,
        width: className ? "100%" : undefined,
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => <pre style={{ margin: "0 0 14px", maxWidth: "100%", whiteSpace: "pre-wrap" }}>{children}</pre>,
  hr: () => <hr style={{ border: "0", borderTop: `1px solid ${colors.border}`, margin: "20px 0" }} />,
  table: ({ children }) => (
    <table cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse", fontSize: "13px", margin: "0 0 14px", tableLayout: "fixed", width: "100%" }}>
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th style={{ backgroundColor: colors.code, border: `1px solid ${colors.border}`, color: colors.text, overflowWrap: "anywhere", padding: "7px", textAlign: "left" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: `1px solid ${colors.border}`, color: colors.text, overflowWrap: "anywhere", padding: "7px", verticalAlign: "top" }}>
      {children}
    </td>
  ),
}

function LookoutEmail({ lookoutName, answer, chatUrl }: LookoutEmailContent) {
  const report = answer.trim()
  const safeChatUrl = safeWebUrl(chatUrl)

  return (
    <div
      style={{
        color: colors.text,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: "14px",
        lineHeight: "1.55",
        margin: "0 auto",
        maxWidth: "600px",
      }}
    >
      <h1 style={{ fontSize: "18px", lineHeight: "24px", margin: "0 0 2px" }}>🔭 {lookoutName}</h1>
      <p style={{ color: colors.muted, fontSize: "12px", margin: "0 0 16px" }}>
        Your scheduled research from MiniScira Lookout.
      </p>

      {report ? (
        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeWebUrl(url)}>
          {report}
        </ReactMarkdown>
      ) : (
        <p style={paragraphStyle}>No notable updates this run.</p>
      )}

      <p style={{ margin: "24px 0 0" }}>
        {safeChatUrl ? (
          <a
            href={safeChatUrl}
            rel="noopener noreferrer"
            style={{
              backgroundColor: colors.link,
              borderRadius: "8px",
              color: "#ffffff",
              display: "inline-block",
              fontWeight: "600",
              padding: "8px 14px",
              textDecoration: "none",
            }}
            target="_blank"
          >
            Open in MiniScira →
          </a>
        ) : (
          "Open in MiniScira →"
        )}
      </p>
    </div>
  )
}

export async function renderLookoutEmail(content: LookoutEmailContent): Promise<string> {
  return render(<LookoutEmail {...content} />)
}
