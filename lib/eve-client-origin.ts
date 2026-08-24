const DEFAULT_EVE_PRODUCTION_PORT = "4274"

function productionPort(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_EVE_PRODUCTION_PORT
  }

  const trimmed = value.trim()
  const port = Number.parseInt(trimmed, 10)
  if (String(port) !== trimmed || port < 1 || port > 65_535) {
    throw new Error(
      "EVE_NEXT_PRODUCTION_PORT must be an integer between 1 and 65535."
    )
  }

  return trimmed
}

type EveClientEnvironment = {
  appOrigin: string
  nodeEnv: string | undefined
  productionOrigin: string | undefined
  productionPort: string | undefined
  vercel: string | undefined
}

export function eveClientOrigin(environment: EveClientEnvironment): string {
  if (environment.nodeEnv !== "production" || environment.vercel) {
    return environment.appOrigin
  }

  const productionOrigin = environment.productionOrigin?.trim()
  if (productionOrigin) return new URL(productionOrigin).origin

  return `http://127.0.0.1:${productionPort(environment.productionPort)}`
}
