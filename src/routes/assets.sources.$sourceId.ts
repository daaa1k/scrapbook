import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { createDb } from '~/db/client'
import { respondWithPdfOriginal, workerAssets } from '~/server/ingest/pdf'

export const Route = createFileRoute('/assets/sources/$sourceId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const download = new URL(request.url).searchParams.get('download') === '1'
        return respondWithPdfOriginal({
          sourceId: params.sourceId,
          request,
          env: {
            ENVIRONMENT: env.ENVIRONMENT,
            ALLOW_INSECURE_AUTH_BYPASS: env.ALLOW_INSECURE_AUTH_BYPASS,
            ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
            ACCESS_AUD: env.ACCESS_AUD,
            ACCESS_ALLOWED_EMAILS: env.ACCESS_ALLOWED_EMAILS,
          },
          db: createDb(env.DB),
          assets: workerAssets(env.ASSETS),
          download,
        })
      },
    },
  },
})
