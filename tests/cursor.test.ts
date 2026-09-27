import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  CursorNotConfigured,
  askPromptForBody,
  createCursorClient,
  ingestPromptForUrl,
  summarizePromptForBody,
} from '../src/server/cursor/client'
import { MAX_CURSOR_BODY_CHARS } from '../src/domain/ingest-result'
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
    const calls: Array<{ url: string; auth: string | null; body: string | null }> = []
    const client = createCursorClient({
      apiKey: 'test-key',
      fetch: async (input, init) => {
        const url = String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          auth: headers.get('Authorization'),
          body: typeof init?.body === 'string' ? init.body : null,
        })
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
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({
      prompt: { text: 'hello' },
      model: {
        id: 'composer-2.5',
        params: [{ id: 'fast', value: 'true' }],
      },
    })

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

  it('keeps body prompts local and forwards the question and body', () => {
    const question = '要点は？'
    const body = '手入力の本文です。'
    const summarize = summarizePromptForBody(body)
    const ask = askPromptForBody(question, body)

    expect(summarize).toContain(body)
    expect(ask).toContain(`Question: ${question}`)
    expect(ask).toContain(body)
    for (const prompt of [summarize, ask]) {
      expect(prompt).toMatch(/do not fetch/i)
    }

    expect(ingestPromptForUrl('https://x.com/foo/status/1')).toContain('https://x.com/foo/status/1')
  })

  it('truncates long bodies in summarize and ask prompts', () => {
    const longBody = `${'あ'.repeat(MAX_CURSOR_BODY_CHARS)}ZZZ`
    const summarize = summarizePromptForBody(longBody)
    expect(summarize).toContain(`first ${MAX_CURSOR_BODY_CHARS} characters`)
    expect(summarize).toContain('あ'.repeat(MAX_CURSOR_BODY_CHARS))
    expect(summarize).not.toContain('ZZZ')

    const ask = askPromptForBody('何？', longBody)
    expect(ask).toContain(`first ${MAX_CURSOR_BODY_CHARS} characters`)
    expect(ask).toContain('あ'.repeat(MAX_CURSOR_BODY_CHARS))
    expect(ask).not.toContain('ZZZ')

    const short = summarizePromptForBody('短い本文')
    expect(short).not.toContain('truncated')
    expect(short).toContain('短い本文')
  })
})
