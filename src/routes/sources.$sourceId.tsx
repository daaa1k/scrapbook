import { createFileRoute, isRedirect, redirect } from '@tanstack/react-router'
import { redirectFromSourceDetail } from '~/domain/organization'
import { getSource } from '~/server/functions/sources'

export const Route = createFileRoute('/sources/$sourceId')({
  beforeLoad: async ({ params }) => {
    try {
      const source = await getSource({ data: { sourceId: params.sourceId } })
      throw redirect(redirectFromSourceDetail(source.organization.notebook.id, params.sourceId))
    } catch (error) {
      if (isRedirect(error)) throw error
      throw redirect({ to: '/' })
    }
  },
})
