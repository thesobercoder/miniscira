const DEFAULT_EVE_PRODUCTION_PORT = "4274"

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

  const port = environment.productionPort?.trim() || DEFAULT_EVE_PRODUCTION_PORT
  return `http://127.0.0.1:${port}`
}
