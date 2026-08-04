"use client"

import { GatewayKeyForm, GatewayKeyHint } from "@/components/gateway-key-form"

/**
 * The settings-page home for the AI Gateway key.
 *
 * Thin on purpose: the form itself is shared with the in-chat dialog
 * (`components/connect-gateway-note.tsx`) so both surfaces agree on the
 * endpoint contract and the write-only rules.
 */
export function SettingsGatewayKey() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground text-sm">
          AI Gateway key
        </h2>
        <p className="text-pretty text-muted-foreground text-sm">
          <GatewayKeyHint />
        </p>
      </div>
      <GatewayKeyForm />
    </section>
  )
}
