const DEFAULT_EVE_PRODUCTION_PORT = "4274"

type EveClientEnvironment = {
  appOrigin: string
  nodeEnv: string | undefined
  productionPort: string | undefined
  vercel: string | undefined
}

export function eveClientOrigin(environment: EveClientEnvironment): string {
  if (environment.nodeEnv !== "production" || environment.vercel) {
    return environment.appOrigin
  }

  const port = environment.productionPort?.trim() || DEFAULT_EVE_PRODUCTION_PORT
  return `http://127.0.0.1:${port}`
}
