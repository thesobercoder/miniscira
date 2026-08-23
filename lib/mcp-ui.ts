export function authActionFor(server: {
  authorized: boolean
  hasOAuthClient: boolean
  offersOAuth: boolean
}): "connect" | "disconnect" | null {
  if (server.authorized) return "disconnect"
  if (server.hasOAuthClient || server.offersOAuth) return "connect"
  return null
}
