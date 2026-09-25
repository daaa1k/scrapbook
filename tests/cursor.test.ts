import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  CursorNotConfigured,
  askPromptForBody,
  createCursorClient,
  createMockCursorClient,
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

  it('mock client returns FINISHED canned JSON', async () => {
    const mock = createMockCursorClient()
    const created = await Effect.runPromise(mock.createAgent('x'))
    const run = await Effect.runPromise(mock.getRun(created.agent.id, created.run.id))
    expect(run.status).toBe('FINISHED')
    expect(run.result).toContain('モック')
  })

  it('mock client returns a completed answer for a question prompt', async () => {
    const mock = createMockCursorClient()
    const created = await Effect.runPromise(mock.createAgent(askPromptForBody('開館時間は？', '午前九時からです。')))
    const run = await Effect.runPromise(mock.getRun(created.agent.id, created.run.id))
    expect(JSON.parse(run.result ?? '')).toMatchObject({ answer: 'モック回答です。' })
  })

  it('adds an unauthenticated X note for twitter hosts', () => {
    const prompt = ingestPromptForUrl('https://x.com/foo/status/1')
    expect(prompt).toContain('authenticated X fetch is not implemented')
    expect(ingestPromptForUrl('https://example.com/a')).not.toContain('authenticated X fetch is not implemented')
  })

  it('asks Cursor to summarize the stored body instead of fetching a URL', () => {
    const prompt = summarizePromptForBody('手入力の本文です。')
    expect(prompt).toContain('手入力の本文です。')
    expect(prompt).toContain('Do not fetch any URL')
    expect(prompt).not.toContain('Fetch the URL')
  })

  it('requires Japanese for summarize and ingest summary fields', () => {
    const summarize = summarizePromptForBody('手入力の本文です。')
    expect(summarize).toContain('Write the summary field in Japanese.')
    expect(summarize).toContain('"summary":"string"')

    const ingest = ingestPromptForUrl('https://example.com/a')
    expect(ingest).toContain('Write the summary field in Japanese.')
    expect(ingest).toContain('"summary":"string"')
  })

  it('asks Cursor to answer a question from the stored body', () => {
    const prompt = askPromptForBody('要点は？', '手入力の本文です。')
    expect(prompt).toContain('Question: 要点は？')
    expect(prompt).toContain('手入力の本文です。')
    expect(prompt).toContain('"answer"')
    expect(prompt).toContain('Do not fetch any URL')
    expect(prompt).not.toContain('Fetch the URL')
  })

  it('requires Japanese for ask answers', () => {
    const prompt = askPromptForBody('要点は？', '手入力の本文です。')
    expect(prompt).toContain('Write the answer field in Japanese.')
    expect(prompt).toContain('"answer":"string"')
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
