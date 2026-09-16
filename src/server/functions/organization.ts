import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '~/db/client'
import { organizationCommandSchema } from '~/domain/organization'
import { authMiddleware } from '~/server/auth/middleware'
import { applyOrganizationCommand, readOrganizationCatalog } from '~/server/organization'

export const getOrganizationCatalog = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const db = createDb(env.DB)
    return readOrganizationCatalog(db)
  })

export const runOrganizationCommand = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(organizationCommandSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return applyOrganizationCommand(db, data)
  })
