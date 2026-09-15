import {
  createAgentResponseSchema,
  createFollowUpResponseSchema,
  cursorAgentSchema,
  cursorRunSchema,
  type CreateAgentResponse,
  type CursorAgent,
  type CursorRun,
} from './schemas'

export class CursorNotConfigured extends Error {
  readonly code = 'cursor_not_configured' as const

  constructor() {
    super('CURSOR_API_KEY is not configured')
    this.name = 'CursorNotConfigured'
  }
}

export class CursorApiError extends Error {
  readonly code = 'cursor_api_error' as const

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'CursorApiError'
  }
}

export type CursorClient = {
  createAgent: (promptText: string) => Promise<CreateAgentResponse>
  createFollowUp: (agentId: string, promptText: string) => Promise<{ run: CursorRun }>
  getAgent: (id: string) => Promise<CursorAgent>
  getRun: (agentId: string, runId: string) => Promise<CursorRun>
}

type FetchLike = typeof fetch

export type CursorClientOptions = {
  apiKey: string
  fetch?: FetchLike
  baseUrl?: string
}

function assertKey(apiKey: string): string {
  if (!apiKey) {
    throw new CursorNotConfigured()
  }
  return apiKey
}

async function parseJson(response: Response, context: string): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) {
    throw new CursorApiError(response.status, `${context} failed (${response.status})`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new CursorApiError(response.status, `${context} returned non-JSON`)
  }
}

export function createCursorClient(options: CursorClientOptions): CursorClient {
  const apiKey = assertKey(options.apiKey)
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = (options.baseUrl ?? 'https://api.cursor.com').replace(/\/$/, '')

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    return parseJson(response, `${init?.method ?? 'GET'} ${path}`)
  }

  return {
    async createAgent(promptText: string) {
      const body = await request('/v1/agents', {
        method: 'POST',
        body: JSON.stringify({ prompt: { text: promptText } }),
      })
      return createAgentResponseSchema.parse(body)
    },
    async createFollowUp(agentId: string, promptText: string) {
      const body = await request(`/v1/agents/${agentId}/runs`, {
        method: 'POST',
        body: JSON.stringify({ prompt: { text: promptText } }),
      })
      return createFollowUpResponseSchema.parse(body)
    },
    async getAgent(id: string) {
      const body = await request(`/v1/agents/${id}`, { method: 'GET' })
      return cursorAgentSchema.parse(body)
    },
    async getRun(agentId: string, runId: string) {
      const body = await request(`/v1/agents/${agentId}/runs/${runId}`, { method: 'GET' })
      return cursorRunSchema.parse(body)
    },
  }
}

export const MOCK_INGEST_JSON = {
  title: 'モック記事',
  author: 'Ada',
  publishedAt: null,
  body: 'これはモックの本文です。',
  summary: 'モック要約',
  fetchStatus: 'full' as const,
  failureReason: null,
}

export function createMockCursorClient(options?: {
  runStatus?: CursorRun['status']
  result?: string
}): CursorClient {
  const now = '2026-09-15T00:00:00.000Z'
  const agentId = 'bc-mock-00000000-0000-0000-0000-000000000001'
  const runId = 'run-mock-00000000-0000-0000-0000-000000000001'
  const result = options?.result ?? JSON.stringify(MOCK_INGEST_JSON)
  const status = options?.runStatus ?? 'FINISHED'

  return {
    async createAgent() {
      return {
        agent: {
          id: agentId,
          name: 'ingest',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          latestRunId: runId,
        },
        run: {
          id: runId,
          agentId,
          status: 'CREATING',
          createdAt: now,
          updatedAt: now,
        },
      }
    },
    async createFollowUp() {
      return {
        run: {
          id: `${runId}-followup`,
          agentId,
          status: 'CREATING',
          createdAt: now,
          updatedAt: now,
        },
      }
    },
    async getAgent() {
      return {
        id: agentId,
        name: 'ingest',
        status: 'IDLE',
        createdAt: now,
        updatedAt: now,
        latestRunId: runId,
      }
    },
    async getRun() {
      return {
        id: runId,
        agentId,
        status,
        createdAt: now,
        updatedAt: now,
        result: status === 'FINISHED' ? result : undefined,
      }
    },
  }
}

export function ingestPromptForUrl(url: string): string {
  return [
    `Fetch the URL (curl or equivalent): ${url}`,
    'Reply with ONLY JSON, no markdown commentary. Shape:',
    JSON.stringify({
      title: 'string',
      author: 'string | null',
      publishedAt: 'ISO-8601 string | null',
      body: 'string',
      summary: 'string',
      fetchStatus: 'full | partial | failed',
      failureReason: 'string | null',
    }),
  ].join('\n')
}
