import { ResearchChat } from "@/components/research-chat"
import { initialQuery } from "@/lib/urls"

// New research session. The chat row is created lazily on the first message,
// then the URL is rewritten to /chat/:id.
export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const initialPrompt = initialQuery((await searchParams).q)
  return <ResearchChat initialPrompt={initialPrompt} />
}
