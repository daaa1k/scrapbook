import { createStart, createCsrfMiddleware } from '@tanstack/react-start'
import { accessRequestMiddleware } from '~/server/auth/middleware'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, accessRequestMiddleware],
}))
