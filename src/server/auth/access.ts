import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyInput } from 'jose'
import { z } from 'zod'

export type AccessEnv = {
  ENVIRONMENT?: string
  ALLOW_INSECURE_AUTH_BYPASS?: string
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  ACCESS_ALLOWED_EMAILS: string
}

export type AccessIdentity = {
  email: string
}

export class AccessAuthError extends Error {
  readonly code: string
  readonly status = 401

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AccessAuthError'
    this.code = code
  }
}

const accessClaimsSchema = z.object({
  email: z.string().email(),
})

export function isInsecureAuthBypassEnabled(env: {
  ENVIRONMENT?: string
  ALLOW_INSECURE_AUTH_BYPASS?: string
}): boolean {
  return env.ALLOW_INSECURE_AUTH_BYPASS === 'true' && env.ENVIRONMENT !== 'production'
}

export function parseAllowedEmails(csv: string): string[] {
  return csv
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function readAccessJwt(request: Request): string | null {
  return (
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    request.headers.get('CF-Access-Jwt-Assertion')
  )
}

export async function verifyAccessJwt(options: {
  token: string
  key: KeyInput | JWTVerifyGetKey
  issuer: string
  audience: string
  allowedEmails: readonly string[]
}): Promise<AccessIdentity> {
  const { payload } = await jwtVerify(options.token, options.key, {
    issuer: options.issuer,
    audience: options.audience,
  })
  const claims = accessClaimsSchema.safeParse(payload)
  if (!claims.success) {
    throw new AccessAuthError('missing_email', 'Access token is missing a valid email claim')
  }
  if (!options.allowedEmails.includes(claims.data.email)) {
    throw new AccessAuthError('email_not_allowlisted', 'email is not allowlisted')
  }
  return { email: claims.data.email }
}

export function remoteAccessJwks(teamDomain: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`))
}

export async function authenticateAccessRequest(
  request: Request,
  env: AccessEnv,
  key?: KeyInput | JWTVerifyGetKey,
): Promise<AccessIdentity> {
  if (isInsecureAuthBypassEnabled(env)) {
    return { email: parseAllowedEmails(env.ACCESS_ALLOWED_EMAILS)[0] ?? 'dev@localhost' }
  }

  const token = readAccessJwt(request)
  if (!token) {
    throw new AccessAuthError('missing_token', 'missing Access JWT')
  }

  const verifier = key ?? remoteAccessJwks(env.ACCESS_TEAM_DOMAIN)
  try {
    return await verifyAccessJwt({
      token,
      key: verifier,
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      allowedEmails: parseAllowedEmails(env.ACCESS_ALLOWED_EMAILS),
    })
  } catch (error) {
    if (error instanceof AccessAuthError) throw error
    throw new AccessAuthError('invalid_token', 'Access JWT verification failed')
  }
}
