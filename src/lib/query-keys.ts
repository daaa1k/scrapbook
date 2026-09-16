import type { SourceListFilter } from '~/domain/organization'

export const sourceKeys = {
  all: ['sources'] as const,
  list: (filter: SourceListFilter) => ['sources', 'list', filter] as const,
  detail: (sourceId: string) => ['sources', 'detail', sourceId] as const,
}

export const organizationKeys = {
  all: ['organization'] as const,
  catalog: ['organization', 'catalog'] as const,
}
