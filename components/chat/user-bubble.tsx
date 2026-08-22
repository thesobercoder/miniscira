"use client"

import {
  RiCheckLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiFileTextLine,
  RiImageLine,
  RiPencilLine,
  RiRestartLine,
} from "@remixicon/react"
import { memo, useState } from "react"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Message, MessageContent } from "@/components/ui/message"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { UploadedDoc } from "@/hooks/use-chat-attachments"
import { useCopyFeedback } from "@/hooks/use-copy-feedback"

// A sent attachment reads as a distinct bordered chip (icon + filename) so the
// user can tell at a glance it's what they attached. Clicking anywhere opens
// the preview dialog; a hover-only external-link action opens it in a new tab.
function SentAttachmentChip({
  doc,
  onPreview,
}: {
  doc: UploadedDoc
  onPreview: () => void
}) {
  const isImage = doc.kind === "image" && doc.url
  return (
    <Attachment
      size="xs"
      className="group/sent-chip max-w-56 transition-[background-color,scale] hover:bg-muted/50 active:scale-[0.96]"
    >
      <AttachmentTrigger
        onClick={onPreview}
        aria-label={`Preview ${doc.filename}`}
      />
      <AttachmentMedia variant={isImage ? "image" : "icon"}>
        {isImage ? (
          // biome-ignore lint/performance/noImgElement: uploaded document image on Blob
          <img src={doc.url} alt={doc.filename} />
        ) : doc.mimeType === "application/pdf" ? (
          <RiFileTextLine />
        ) : (
          <RiImageLine />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={doc.filename}>{doc.filename}</AttachmentTitle>
      </AttachmentContent>
      {doc.url && (
        <AttachmentActions className="pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-focus-within/sent-chip:opacity-100 group-hover/sent-chip:opacity-100">
          <AttachmentAction
            nativeButton={false}
            render={
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              />
            }
            aria-label={`Open ${doc.filename} in a new tab`}
          >
            <RiExternalLinkLine />
          </AttachmentAction>
        </AttachmentActions>
      )}
    </Attachment>
  )
}

function AttachmentPreviewDialog({
  doc,
  onOpenChange,
}: {
  doc: UploadedDoc | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={doc != null} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        {/* Header bar: filename + Open together on the left, image flush below. */}
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-background px-5 py-3.5">
          <DialogTitle className="min-w-0 truncate font-medium text-sm">
            {doc?.filename}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview of {doc?.filename}
          </DialogDescription>
          {doc?.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
            >
              Open <RiExternalLinkLine className="size-3.5" />
            </a>
          )}
        </DialogHeader>
        {doc?.url &&
          (doc.kind === "image" ? (
            // biome-ignore lint/performance/noImgElement: uploaded document image on Blob
            <img
              src={doc.url}
              alt={doc.filename}
              className="max-h-[75vh] w-full bg-muted object-contain"
            />
          ) : doc.mimeType === "application/pdf" ? (
            <iframe
              src={doc.url}
              title={doc.filename}
              className="h-[75vh] w-full"
            />
          ) : (
            <p className="p-5 text-muted-foreground text-sm">
              Preview isn&apos;t available for this file type.{" "}
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-2"
              >
                Open it
              </a>{" "}
              instead.
            </p>
          ))}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Inline editor for a question already sent. Enter submits, Escape cancels —
 * Shift+Enter still breaks the line, matching the composer.
 */
function QuestionEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const trimmed = draft.trim()
  const save = () => {
    if (trimmed && trimmed !== initial.trim()) onSave(trimmed)
    else onCancel()
  }
  return (
    <div className="w-full max-w-full rounded-2xl border bg-card p-2">
      <Textarea
        autoFocus
        aria-label="Edit your question"
        className="min-h-16 resize-none border-0 bg-transparent px-1.5 text-base shadow-none focus-visible:ring-0 md:text-[15px]"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel()
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            save()
          }
        }}
        value={draft}
      />
      <div className="flex justify-end gap-1.5 pt-1">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={!trimmed} onClick={save} size="sm" type="button">
          Send
        </Button>
      </div>
    </div>
  )
}

type UserBubbleProps = {
  text: string
  attachments?: UploadedDoc[]
  /** Present while no turn is streaming. Rewinds from this question forward. */
  onRetry?: () => void
  onEdit?: (text: string) => void
}

export const UserBubble = memo(function UserBubble({
  text,
  attachments,
  onRetry,
  onEdit,
}: UserBubbleProps) {
  const [previewDoc, setPreviewDoc] = useState<UploadedDoc | null>(null)
  const [editing, setEditing] = useState(false)
  const { copied, copy } = useCopyFeedback("Couldn't copy that question")

  if (editing && onEdit) {
    return (
      <Message align="end">
        <MessageContent className="w-full items-end">
          <QuestionEditor
            initial={text}
            onCancel={() => setEditing(false)}
            onSave={(next) => {
              setEditing(false)
              onEdit(next)
            }}
          />
        </MessageContent>
      </Message>
    )
  }

  return (
    <Message align="end">
      <MessageContent className="group/question items-end">
        {attachments && attachments.length > 0 && (
          <div className="mb-1 flex flex-col items-end gap-0.5">
            {attachments.map((d) => (
              <SentAttachmentChip
                key={d.id}
                doc={d}
                onPreview={() => setPreviewDoc(d)}
              />
            ))}
          </div>
        )}
        {/* Full-width row so the bubble's percentage max-width resolves against
            the available space, not its own shrink-to-fit content width. */}
        <div className="flex w-full justify-end">
          <Bubble variant="tinted" align="end">
            <BubbleContent className="text-pretty">{text}</BubbleContent>
          </Bubble>
        </div>
        <div className="flex items-center justify-end gap-0.5 pr-1">
          {onRetry && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Retry from this message"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={onRetry}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <RiRestartLine className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Retry from here</TooltipContent>
            </Tooltip>
          )}
          {onEdit && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Edit question"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <RiPencilLine className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Edit question</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={copied ? "Copied question" : "Copy question"}
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => void copy(text)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                />
              }
            >
              {copied ? (
                <RiCheckLine className="size-3.5" />
              ) : (
                <RiFileCopyLine className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Copied" : "Copy question"}
            </TooltipContent>
          </Tooltip>
        </div>
      </MessageContent>
      <AttachmentPreviewDialog
        doc={previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
      />
    </Message>
  )
}, userBubblePropsEqual)

function userBubblePropsEqual(prev: UserBubbleProps, next: UserBubbleProps) {
  return (
    prev.text === next.text &&
    prev.attachments === next.attachments &&
    Boolean(prev.onRetry) === Boolean(next.onRetry) &&
    Boolean(prev.onEdit) === Boolean(next.onEdit)
  )
}
