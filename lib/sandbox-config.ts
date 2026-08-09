export type SandboxEnvironment = Readonly<Record<string, string | undefined>>

export interface DockerSandboxConfig {
  env: Readonly<Record<string, string>>
  image: string
  networkPolicy: "deny-all"
  pullPolicy: "never"
}

export function resolveDockerSandboxConfig(
  env: SandboxEnvironment = process.env
): DockerSandboxConfig {
  const image =
    env.SANDBOX_DOCKER_IMAGE?.trim() ||
    env.MINISCIRA_IMAGE?.trim() ||
    "miniscira:local"

  return {
    env: {
      HTTP_PROXY:
        env.SANDBOX_EGRESS_PROXY_URL?.trim() ||
        "http://sandbox-egress-proxy:3128",
      HTTPS_PROXY:
        env.SANDBOX_EGRESS_PROXY_URL?.trim() ||
        "http://sandbox-egress-proxy:3128",
      NO_PROXY: "localhost,127.0.0.1,::1",
      http_proxy:
        env.SANDBOX_EGRESS_PROXY_URL?.trim() ||
        "http://sandbox-egress-proxy:3128",
      https_proxy:
        env.SANDBOX_EGRESS_PROXY_URL?.trim() ||
        "http://sandbox-egress-proxy:3128",
      no_proxy: "localhost,127.0.0.1,::1",
    },
    image,
    networkPolicy: "deny-all",
    pullPolicy: "never",
  }
}
