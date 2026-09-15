import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  CursorNotConfigured,
  createCursorClient,
  createMockCursorClient,
  ingestPromptForUrl,
} from '../src/server/cursor/client'
import { runPromiseFail } from '../src/lib/effect-run'

const createFixture = {
  agent: {
    id: 'bc-00000000-0000-0000-0000-000000000001',
    name: 'Add README',
    status: 'ACTIVE',
    createdAt: '2026-04-13T18:30:00.000Z',
    updatedAt: '2026-04-13T18:30:00.000Z',
    latestRunId: 'run-00000000-0000-0000-0000-000000000001',
  },
  run: {
    id: 'run-00000000-0000-0000-0000-000000000001',
    agentId: 'bc-00000000-0000-0000-0000-000000000001',
    status: 'CREATING',
    createdAt: '2026-04-13T18:30:00.000Z',
    updatedAt: '2026-04-13T18:30:00.000Z',
  },
}

const runFixture = {
  id: 'run-00000000-0000-0000-0000-000000000001',
  agentId: 'bc-00000000-0000-0000-0000-000000000001',
  status: 'FINISHED',
  createdAt: '2026-04-13T18:30:00.000Z',
  updatedAt: '2026-04-13T18:45:00.000Z',
  durationMs: 12357,
  result: 'Added README.md',
}

describe('Cursor client', () => {
  it('fails with CursorNotConfigured when apiKey is empty', async () => {
    const client = createCursorClient({ apiKey: '' })
    const exit = await Effect.runPromiseExit(client.createAgent('hello'))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit) && exit.cause._tag === 'Fail') {
      expect(exit.cause.error).toBeInstanceOf(CursorNotConfigured)
      expect(exit.cause.error._tag).toBe('CursorNotConfigured')
    }
  })

  it('parses create and get-run fixtures via mock fetch', async () => {
    const calls: Array<{ url: string; auth: string | null }> = []
    const client = createCursorClient({
      apiKey: 'test-key',
      fetch: async (input, init) => {
        const url = String(input)
        const headers = new Headers(init?.headers)
        calls.push({ url, auth: headers.get('Authorization') })
        if (url.endsWith('/v1/agents') && init?.method === 'POST') {
          return new Response(JSON.stringify(createFixture), { status: 200 })
        }
        if (url.includes('/runs/')) {
          return new Response(JSON.stringify(runFixture), { status: 200 })
        }
        return new Response('nope', { status: 404 })
      },
    })

    const created = await Effect.runPromise(client.createAgent('hello'))
    expect(created.agent.id).toBe(createFixture.agent.id)
    expect(created.run.status).toBe('CREATING')

    const run = await Effect.runPromise(client.getRun(created.agent.id, created.run.id))
    expect(run.status).toBe('FINISHED')
    expect(run.result).toBe('Added README.md')
    expect(calls.every((call) => call.auth === 'Bearer test-key')).toBe(true)
  })

  it('rejects malformed JSON with a typed error', async () => {
    const client = createCursorClient({
      apiKey: 'test-key',
      fetch: async () => new Response('{not json', { status: 200 }),
    })
    await expect(runPromiseFail(client.getAgent('bc-x'))).rejects.toThrow(/non-JSON/)
  })

  it('mock client returns FINISHED canned JSON', async () => {
    const mock = createMockCursorClient()
    const created = await Effect.runPromise(mock.createAgent('x'))
    const run = await Effect.runPromise(mock.getRun(created.agent.id, created.run.id))
    expect(run.status).toBe('FINISHED')
    expect(run.result).toContain('モック')
  })

  it('adds an unauthenticated X note for twitter hosts', () => {
    const prompt = ingestPromptForUrl('https://x.com/foo/status/1')
    expect(prompt).toContain('authenticated X fetch is not implemented')
    expect(ingestPromptForUrl('https://example.com/a')).not.toContain('authenticated X fetch is not implemented')
  })
})
