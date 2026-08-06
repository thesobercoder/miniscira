import { NextResponse } from "next/server"

import { authed } from "@/lib/api-auth"
import { gatewayCredentialFor } from "@/lib/gateway-credentials"
import { fetchGatewayModels } from "@/lib/gateway-models"
import {
  decorateCatalog,
  orderWithMetadata,
  warnIfDefaultMissing,
} from "@/lib/model-metadata"
import { PROVIDER_ORDER } from "@/lib/models"

// GET /api/models — the selectable model catalog (tool-capable language models
// from the AI Gateway), sorted: featured providers first, then alphabetically;
// newest models first within a provider. AI_MODELS_JSON metadata (labels,
// order, visibility, capability hints) decorates the LIVE gateway catalog —
// availability always comes from the gateway, never from configuration.
export const GET = authed(async (_request, { userId }) => {
  // The caller's own key: with BYOK the deployment may hold none, and reading
  // the environment here is what left the picker empty for users who had just
  // saved a working key.
  const credential = await gatewayCredentialFor(userId).catch(() => null)
  const models = await fetchGatewayModels(credential?.apiKey)
  warnIfDefaultMissing(models)
  const rank = (p: string) => {
    const i = PROVIDER_ORDER.indexOf(p)
    return i === -1 ? PROVIDER_ORDER.length : i
  }
  const decorated = decorateCatalog(models)
  const sorted = orderWithMetadata(decorated, rank)

  return NextResponse.json(
    { models: sorted },
    { headers: { "cache-control": "private, max-age=300" } }
  )
})
