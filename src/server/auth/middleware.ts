import { createMiddleware } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { AccessAuthError, authenticateAccessRequest, type AccessIdentity } from './access'

function accessEnv() {
  return {
    ENVIRONMENT: env.ENVIRONMENT,
    ALLOW_INSECURE_AUTH_BYPASS: env.ALLOW_INSECURE_AUTH_BYPASS,
    ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
    ACCESS_AUD: env.ACCESS_AUD,
    ACCESS_ALLOWED_EMAILS: env.ACCESS_ALLOWED_EMAILS,
  }
}

async function requireIdentity(request: Request): Promise<AccessIdentity> {
  return authenticateAccessRequest(request, accessEnv())
}

function unauthorized(error: unknown): Response {
  const message = error instanceof AccessAuthError ? error.message : 'unauthorized'
  return new Response(message, { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export const accessRequestMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    try {
      const identity = await requireIdentity(request)
      return next({
        context: { identity },
      })
    } catch (error) {
      return unauthorized(error)
    }
  },
)

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const identity = await requireIdentity(getRequest())
    return next({
      context: { identity },
    })
  },
)
