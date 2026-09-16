import { Data, Effect } from 'effect'
import { sourceKindFromUrl } from '~/domain/url'
import {
  createAgentResponseSchema,
  createFollowUpResponseSchema,
  cursorAgentSchema,
  cursorRunSchema,
  type CreateAgentResponse,
  type CursorAgent,
  type CursorRun,
} from './schemas'

export class CursorNotConfigured extends Data.TaggedError('CursorNotConfigured')<{
  readonly message: string
}> {}

export class CursorApiError extends Data.TaggedError('CursorApiError')<{
  readonly status: number
  readonly message: string
}> {}

export type CursorFailure = CursorNotConfigured | CursorApiError

export type CursorClient = {
  createAgent: (promptText: string) => Effect.Effect<CreateAgentResponse, CursorFailure>
  createFollowUp: (agentId: string, promptText: string) => Effect.Effect<{ run: CursorRun }, CursorFailure>
  getAgent: (id: string) => Effect.Effect<CursorAgent, CursorFailure>
  getRun: (agentId: string, runId: string) => Effect.Effect<CursorRun, CursorFailure>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type CursorClientOptions = {
  apiKey: string
  fetch?: FetchLike
  baseUrl?: string
}

function missingKey(): CursorNotConfigured {
  return new CursorNotConfigured({ message: 'CURSOR_API_KEY is not configured' })
}

function parseJson(response: Response, context: string): Effect.Effect<unknown, CursorApiError> {
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => new CursorApiError({ status: response.status, message: `${context} failed to read body` }),
    })
    if (!response.ok) {
      return yield* Effect.fail(
        new CursorApiError({ status: response.status, message: `${context} failed (${response.status})` }),
      )
    }
    return yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => new CursorApiError({ status: response.status, message: `${context} returned non-JSON` }),
    })
  })
}

function parseWithZod<T>(schema: { parse: (value: unknown) => T }, body: unknown): Effect.Effect<T, CursorApiError> {
  return Effect.try({
    try: () => schema.parse(body),
    catch: (cause) =>
      new CursorApiError({
        status: 200,
        message: cause instanceof Error ? cause.message : 'invalid cursor response',
      }),
  })
}

export function createCursorClient(options: CursorClientOptions): CursorClient {
  if (!options.apiKey) {
    const fail = Effect.fail(missingKey())
    return {
      createAgent: () => fail,
      createFollowUp: () => fail,
      getAgent: () => fail,
      getRun: () => fail,
    }
  }

  const apiKey = options.apiKey
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = (options.baseUrl ?? 'https://api.cursor.com').replace(/\/$/, '')

  const request = (path: string, init?: RequestInit): Effect.Effect<unknown, CursorApiError> =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetchImpl(`${baseUrl}${path}`, {
            ...init,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              ...(init?.headers ?? {}),
            },
          }),
        catch: (cause) =>
          new CursorApiError({
            status: 0,
            message: cause instanceof Error ? cause.message : 'cursor request failed',
          }),
      })
      return yield* parseJson(response, `${init?.method ?? 'GET'} ${path}`)
    })

  return {
    createAgent(promptText: string) {
      return Effect.gen(function* () {
        const body = yield* request('/v1/agents', {
          method: 'POST',
          body: JSON.stringify({ prompt: { text: promptText } }),
        })
        return yield* parseWithZod(createAgentResponseSchema, body)
      })
    },
    createFollowUp(agentId: string, promptText: string) {
      return Effect.gen(function* () {
        const body = yield* request(`/v1/agents/${agentId}/runs`, {
          method: 'POST',
          body: JSON.stringify({ prompt: { text: promptText } }),
        })
        return yield* parseWithZod(createFollowUpResponseSchema, body)
      })
    },
    getAgent(id: string) {
      return Effect.gen(function* () {
        const body = yield* request(`/v1/agents/${id}`, { method: 'GET' })
        return yield* parseWithZod(cursorAgentSchema, body)
      })
    },
    getRun(agentId: string, runId: string) {
      return Effect.gen(function* () {
        const body = yield* request(`/v1/agents/${agentId}/runs/${runId}`, { method: 'GET' })
        return yield* parseWithZod(cursorRunSchema, body)
      })
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
    createAgent() {
      return Effect.succeed({
        agent: {
          id: agentId,
          name: 'ingest',
          status: 'ACTIVE' as const,
          createdAt: now,
          updatedAt: now,
          latestRunId: runId,
        },
        run: {
          id: runId,
          agentId,
          status: 'CREATING' as const,
          createdAt: now,
          updatedAt: now,
        },
      })
    },
    createFollowUp() {
      return Effect.succeed({
        run: {
          id: `${runId}-followup`,
          agentId,
          status: 'CREATING' as const,
          createdAt: now,
          updatedAt: now,
        },
      })
    },
    getAgent() {
      return Effect.succeed({
        id: agentId,
        name: 'ingest',
        status: 'IDLE' as const,
        createdAt: now,
        updatedAt: now,
        latestRunId: runId,
      })
    },
    getRun() {
      return Effect.succeed({
        id: runId,
        agentId,
        status,
        createdAt: now,
        updatedAt: now,
        result: status === 'FINISHED' ? result : undefined,
      })
    },
  }
}

export function ingestPromptForUrl(url: string): string {
  const lines = [
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
  ]
  if (sourceKindFromUrl(url) === 'x') {
    lines.push(
      'This is an X/Twitter URL. Fetch it without login. If the page is gated or empty, set fetchStatus to failed and say authenticated X fetch is not implemented.',
    )
  }
  return lines.join('\n')
}
