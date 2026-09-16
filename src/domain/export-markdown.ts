import type { SourceDetail } from '~/domain/source-views'

function section(title: string, body: string | null | undefined): string[] {
  return ['', `## ${title}`, '', body?.trim() ? body : '（なし）']
}

export function sourceDetailToMarkdown(source: SourceDetail): string {
  const lines = [`# ${source.title?.trim() || '無題のソース'}`]
  if (source.url) {
    lines.push('', source.url)
  }
  lines.push(
    '',
    `- ノートブック: ${source.organization.notebook.title}`,
    `- 種類: ${source.kind}`,
    `- 取得: ${source.fetchStatus}`,
    `- 取得経路: ${source.acquiredVia}`,
  )
  if (source.organization.tags.length > 0) {
    lines.push(`- タグ: ${source.organization.tags.join(', ')}`)
  }
  if (source.author) {
    lines.push(`- 著者: ${source.author}`)
  }

  lines.push(...section('自分のメモ', source.organization.memo))
  lines.push(...section('要約', source.summary))

  lines.push('', '## 引用', '')
  if (source.citations.length === 0) {
    lines.push('（なし）')
  } else {
    for (const citation of source.citations) {
      lines.push(`> ${citation.excerpt.replace(/\n/g, '\n> ')}`, '')
    }
  }

  lines.push('', '## 質問', '')
  if (source.qaAnswers.length === 0) {
    lines.push('（なし）')
  } else {
    for (const turn of source.qaAnswers) {
      lines.push(`### 質問`, '', turn.question, '', `### 回答`, '', turn.answer?.trim() || '（回答待ち）', '')
      if (turn.citations.length > 0) {
        lines.push('引用:', '')
        for (const citation of turn.citations) {
          lines.push(`> ${citation.excerpt.replace(/\n/g, '\n> ')}`, '')
        }
      }
    }
  }

  lines.push(...section('本文', source.body))
  lines.push('')
  return lines.join('\n')
}

export function sourceExportFilename(source: Pick<SourceDetail, 'id' | 'title'>): string {
  const raw = source.title?.trim() || source.id
  const safe = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim()
  const base = (safe || source.id).slice(0, 80)
  return `${base}.md`
}
