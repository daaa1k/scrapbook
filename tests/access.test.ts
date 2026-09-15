import { generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import {
  authenticateAccessRequest,
  isInsecureAuthBypassEnabled,
  verifyAccessJwt,
} from '../src/server/auth/access'

const issuer = 'https://example.cloudflareaccess.com'
const audience = 'test-aud'
const email = 'you@example.com'

async function sign(claims: Record<string, unknown>, extra?: { exp?: string | number; aud?: string; iss?: string }) {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(extra?.iss ?? issuer)
    .setAudience(extra?.aud ?? audience)
    .setExpirationTime(extra?.exp ?? '2h')
    .sign(privateKey)
  return { token, publicKey }
}

function unsignedToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.`
}

describe('Access JWT', () => {
  it('accepts a signature-verified token with allowlisted email', async () => {
    const { token, publicKey } = await sign({ email })
    const identity = await verifyAccessJwt({
      token,
      key: publicKey,
      issuer,
      audience,
      allowedEmails: [email],
    })
    expect(identity.email).toBe(email)
  })

  it('rejects unsigned / decode-only tokens', async () => {
    const { publicKey } = await generateKeyPair('RS256')
    const token = unsignedToken({
      email,
      iss: issuer,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    await expect(
      verifyAccessJwt({
        token,
        key: publicKey,
        issuer,
        audience,
        allowedEmails: [email],
      }),
    ).rejects.toThrow()
  })

  it('rejects wrong iss, aud, exp, and email', async () => {
    const wrongIss = await sign({ email }, { iss: 'https://other.example' })
    await expect(
      verifyAccessJwt({
        token: wrongIss.token,
        key: wrongIss.publicKey,
        issuer,
        audience,
        allowedEmails: [email],
      }),
    ).rejects.toThrow()

    const wrongAud = await sign({ email }, { aud: 'other-aud' })
    await expect(
      verifyAccessJwt({
        token: wrongAud.token,
        key: wrongAud.publicKey,
        issuer,
        audience,
        allowedEmails: [email],
      }),
    ).rejects.toThrow()

    const expired = await sign({ email }, { exp: Math.floor(Date.now() / 1000) - 60 })
    await expect(
      verifyAccessJwt({
        token: expired.token,
        key: expired.publicKey,
        issuer,
        audience,
        allowedEmails: [email],
      }),
    ).rejects.toThrow()

    const { token, publicKey } = await sign({ email: 'other@example.com' })
    await expect(
      verifyAccessJwt({
        token,
        key: publicKey,
        issuer,
        audience,
        allowedEmails: [email],
      }),
    ).rejects.toThrow(/allowlisted/)
  })

  it('refuses bypass when ENVIRONMENT=production', async () => {
    expect(
      isInsecureAuthBypassEnabled({
        ENVIRONMENT: 'production',
        ALLOW_INSECURE_AUTH_BYPASS: 'true',
      }),
    ).toBe(false)

    await expect(
      authenticateAccessRequest(
        new Request('https://scrapbook.example/'),
        {
          ENVIRONMENT: 'production',
          ALLOW_INSECURE_AUTH_BYPASS: 'true',
          ACCESS_TEAM_DOMAIN: issuer,
          ACCESS_AUD: audience,
          ACCESS_ALLOWED_EMAILS: email,
        },
      ),
    ).rejects.toMatchObject({ code: 'missing_token' })
  })

  it('allows bypass only in non-production when the flag is the string true', () => {
    expect(
      isInsecureAuthBypassEnabled({
        ENVIRONMENT: 'development',
        ALLOW_INSECURE_AUTH_BYPASS: 'true',
      }),
    ).toBe(true)
    expect(
      isInsecureAuthBypassEnabled({
        ENVIRONMENT: 'development',
        ALLOW_INSECURE_AUTH_BYPASS: 'yes',
      }),
    ).toBe(false)
  })
})
