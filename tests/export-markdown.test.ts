import { describe, expect, it } from 'vitest'
import { sourceDetailToMarkdown, sourceExportFilename } from '../src/domain/export-markdown'
import { notebookIdSchema, notebookTitleSchema, tagNameSchema } from '../src/domain/organization'
import type { SourceDetail } from '../src/domain/source-views'

const base: SourceDetail = {
  id: 'source-1',
  kind: 'url',
  url: 'https://example.com/a',
  title: '題名/危険:文字',
  author: 'Ada',
  fetchStatus: 'full',
  acquiredVia: 'paste',
  summary: null,
  body: null,
  job: null,
  organization: {
    notebook: {
      id: notebookIdSchema.parse('11111111-1111-4111-8111-111111111111'),
      title: notebookTitleSchema.parse('受信箱'),
      isInbox: true,
    },
    tags: [tagNameSchema.parse('メモ')],
    memo: null,
  },
  citations: [],
  qaAnswers: [],
}

describe('source markdown export', () => {
  it('exports summary and Q&A when present', () => {
    const markdown = sourceDetailToMarkdown({
      ...base,
      summary: '短い要約',
      body: '本文です。',
      organization: { ...base.organization, memo: '自分用' },
      citations: [{ id: 'c1', excerpt: '引用A', bodySpan: null }],
      qaAnswers: [
        {
          id: 'q1',
          question: '要点は？',
          answer: 'これです。',
          canDelete: true,
          citations: [{ id: 'qc1', excerpt: '根拠', bodySpan: { start: 0, end: 2 } }],
        },
      ],
    })
    expect(markdown).toContain('# 題名/危険:文字')
    expect(markdown).toContain('https://example.com/a')
    expect(markdown).toContain('## 要約')
    expect(markdown).toContain('短い要約')
    expect(markdown).toContain('## 自分のメモ')
    expect(markdown).toContain('自分用')
    expect(markdown).toContain('> 引用A')
    expect(markdown).toContain('要点は？')
    expect(markdown).toContain('これです。')
    expect(markdown).toContain('> 根拠')
    expect(markdown).toContain('## 本文')
    expect(markdown).toContain('本文です。')
  })

  it('still downloads when body and summary are empty', () => {
    const markdown = sourceDetailToMarkdown(base)
    expect(markdown).toContain('（なし）')
    expect(markdown).toContain('## 本文')
    expect(sourceExportFilename(base)).toBe('題名_危険_文字.md')
    expect(sourceExportFilename({ id: 'abc', title: null })).toBe('abc.md')
  })
})
