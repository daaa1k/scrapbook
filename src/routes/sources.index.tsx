import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseSourcesPageSearch, redirectFromSourcesIndex } from '~/domain/organization'

export const Route = createFileRoute('/sources/')({
  validateSearch: parseSourcesPageSearch,
  beforeLoad: ({ search }) => {
    throw redirect(redirectFromSourcesIndex(search))
  },
})
