import { ResearchChat } from "@/components/research-chat"

// New research session. The chat row is created lazily on the first message,
// then the URL is rewritten to /chat/:id.
export default function NewChatPage() {
  return <ResearchChat />
}
