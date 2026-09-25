import { describe, expect, it } from 'vitest'
import {
  cursorBodyBudgetCopy,
  jobCompletionAnnouncement,
  jobCopyInputFromSource,
  jobProgressView,
  jobStatusAlertText,
  qaTurnView,
  studyScopeLabel,
  type JobCopyInput,
} from '../src/domain/job-status-copy'
import { jobStatusLabel } from '../src/lib/utils'

function copy(partial: Partial<JobCopyInput> & Pick<JobCopyInput, 'status'>): JobCopyInput {
  return {
    kind: 'fetch',
    errorCode: null,
    errorMessage: null,
    hasBody: false,
    hasUrl: true,
    ...partial,
  }
}

describe('jobProgressView', () => {
  it('maps queued to a Japanese preparation label with a spinner tone', () => {
    expect(jobProgressView(copy({ status: 'queued', kind: 'fetch' }))).toEqual({
      label: '本文の取得を準備しています',
      pending: true,
      tone: 'pending',
    })
    expect(jobProgressView(copy({ status: 'queued', kind: 'summarize_body', hasBody: true }))).toEqual({
      label: '要約を準備しています',
      pending: true,
      tone: 'pending',
    })
    expect(jobProgressView(copy({ status: 'queued', kind: 'ask_source', hasBody: true }))).toEqual({
      label: '回答を準備しています',
      pending: true,
      tone: 'pending',
    })
  })

  it('keeps later in-flight statuses user-facing', () => {
    expect(jobProgressView(copy({ status: 'starting_agent' })).label).toBe('処理を始めています')
    expect(jobProgressView(copy({ status: 'waiting_agent', kind: 'fetch' })).label).toBe(
      '本文を取得しています',
    )
    expect(jobProgressView(copy({ status: 'waiting_agent', kind: 'summarize_body', hasBody: true })).label).toBe(
      '要約しています',
    )
    expect(jobProgressView(copy({ status: 'waiting_agent', kind: 'ask_source', hasBody: true })).label).toBe(
      '回答しています',
    )
    expect(jobProgressView(copy({ status: 'persisting' })).label).toBe('結果を保存しています')
  })

  it('tells the user to paste when URL fetch fails', () => {
    const view = jobProgressView(
      copy({
        status: 'failed',
        kind: 'fetch',
        errorCode: 'cursor_run_failed',
        errorMessage: 'Cursor run ended: ERROR',
        hasUrl: true,
      }),
    )
    expect(view).toEqual({
      label: '本文を取得できませんでした',
      detail:
        'Cursor による取得が失敗しました: Cursor run ended: ERROR。要約と質問には本文が必要です。ページからコピーして貼り付けてください。',
      recovery: [
        { id: 'paste-body', label: '本文を貼り付ける' },
        { id: 'retry', label: '再取得' },
      ],
      pending: false,
      tone: 'failure',
    })
  })

  it('keeps a saved body usable after a failed refetch', () => {
    const view = jobProgressView(copy({ status: 'failed', errorCode: 'fetch_result_failed',
      errorMessage: 'HTTP 503', hasBody: true }))
    expect(view.label).toBe('本文を取得できませんでした')
    expect(view.detail).toContain('保存済みの本文、要約、引用はそのまま利用できます')
    expect(view.detail).toContain('HTTP 503')
    expect(view.recovery).toContainEqual({ id: 'retry', label: '再取得' })
    expect(view.tone).toBe('failure')
  })

  it('points a missing API key at an admin, with no retry', () => {
    const view = jobProgressView(
      copy({
        status: 'failed',
        kind: 'fetch',
        errorCode: 'cursor_not_configured',
      }),
    )
    expect(view).toEqual({
      label: '本文を取得できませんでした',
      detail:
        'Cursor APIキーが設定されていません。このアプリの管理者に設定を依頼してください。設定後に再試行できます。',
      pending: false,
      tone: 'failure',
    })
    expect(view.recovery).toBeUndefined()
  })

  it('offers retry after a timeout, and paste when the failed job was a fetch', () => {
    expect(
      jobProgressView(
        copy({
          status: 'failed',
          kind: 'fetch',
          errorCode: 'timeout',
          hasUrl: true,
        }),
      ),
    ).toEqual({
      label: '本文を取得できませんでした',
      detail:
        '取得が時間切れになりました。要約と質問は本文が揃ってから使えます。もう一度取得するか、本文を貼り付けてください。',
      recovery: [
        { id: 'retry', label: '再試行' },
        { id: 'paste-body', label: '本文を貼り付ける' },
      ],
      pending: false,
      tone: 'failure',
    })
    expect(
      jobProgressView(
        copy({
          status: 'failed',
          kind: 'fetch',
          errorCode: 'timeout',
          hasUrl: false,
        }),
      ),
    ).toEqual({
      label: '本文を取得できませんでした',
      detail: '取得が時間切れになりました。要約と質問は本文が揃ってから使えます。本文を貼り付けて続けてください。',
      recovery: [{ id: 'paste-body', label: '本文を貼り付ける' }],
      pending: false,
      tone: 'failure',
    })
    expect(
      jobProgressView(
        copy({
          status: 'failed',
          kind: 'summarize_body',
          errorCode: 'timeout',
          hasBody: true,
        }),
      ),
    ).toEqual({
      label: '要約できませんでした',
      detail: '要約が時間切れになりました。もう一度試せます。',
      recovery: [{ id: 'retry', label: '再試行' }],
      pending: false,
      tone: 'failure',
    })
    expect(
      jobProgressView(
        copy({
          status: 'failed',
          kind: 'ask_source',
          errorCode: 'timeout',
          hasBody: true,
        }),
      ),
    ).toEqual({
      label: '回答できませんでした',
      detail: '質問が時間切れになりました。もう一度試せます。',
      recovery: [{ id: 'retry', label: '再試行' }],
      pending: false,
      tone: 'failure',
    })
  })

  it('offers paste when there is no body and no job', () => {
    expect(jobProgressView(copy({ status: null, hasBody: false, hasUrl: false }))).toEqual({
      label: '本文がありません',
      detail: '要約と質問には本文が必要です。ページからコピーして貼り付けてください。',
      recovery: [{ id: 'paste-body', label: '本文を貼り付ける' }],
      pending: false,
      tone: 'idle',
    })
    expect(jobProgressView(copy({ status: 'succeeded', hasBody: false, hasUrl: true }))).toEqual({
      label: '本文がありません',
      detail: '要約と質問には本文が必要です。ページからコピーして貼り付けてください。',
      recovery: [{ id: 'paste-body', label: '本文を貼り付ける' }],
      pending: false,
      tone: 'idle',
    })
  })
})

describe('qaTurnView', () => {
  it('keeps a finished answer as ready', () => {
    expect(
      qaTurnView(
        { answer: '要点はこれです', canDelete: true },
        copy({ status: 'succeeded', kind: 'ask_source', hasBody: true }),
      ),
    ).toEqual({ phase: 'ready' })
  })

  it('shows per-question progress while the ask job is in flight', () => {
    expect(
      qaTurnView(
        { answer: null, canDelete: false },
        copy({ status: 'waiting_agent', kind: 'ask_source', hasBody: true }),
      ),
    ).toEqual({
      phase: 'pending',
      progress: {
        label: '回答しています',
        pending: true,
        tone: 'pending',
      },
    })
  })

  it('labels a terminal empty answer as failed, not waiting', () => {
    expect(
      qaTurnView(
        { answer: null, canDelete: true },
        copy({ status: 'failed', kind: 'ask_source', errorCode: 'timeout', hasBody: true }),
      ),
    ).toEqual({
      phase: 'failed',
      progress: {
        label: '回答できませんでした',
        detail: '質問が時間切れになりました。もう一度試せます。',
        recovery: [{ id: 'retry', label: '再試行' }],
        pending: false,
        tone: 'failure',
      },
    })
    expect(
      qaTurnView(
        { answer: null, canDelete: true },
        copy({ status: 'succeeded', kind: 'summarize_body', hasBody: true }),
      ),
    ).toEqual({
      phase: 'failed',
      progress: {
        label: '回答できませんでした',
        detail: 'この質問への回答は残っていません。同じ内容をもう一度送れます。',
        pending: false,
        tone: 'failure',
      },
    })
  })
})

describe('jobCompletionAnnouncement', () => {
  it('announces only the transition into success, not the first paint of a finished job', () => {
    expect(
      jobCompletionAnnouncement('waiting_agent', { status: 'succeeded', kind: 'summarize_body' }),
    ).toBe('要約が完了しました')
    expect(jobCompletionAnnouncement('queued', { status: 'succeeded', kind: 'ask_source' })).toBe(
      '回答が完了しました',
    )
    expect(jobCompletionAnnouncement('persisting', { status: 'succeeded', kind: 'fetch' })).toBe(
      '本文の取得が完了しました',
    )
    expect(jobCompletionAnnouncement(null, { status: 'succeeded', kind: 'summarize_body' })).toBeNull()
    expect(jobCompletionAnnouncement('succeeded', { status: 'succeeded', kind: 'ask_source' })).toBeNull()
    expect(jobCompletionAnnouncement('queued', { status: 'waiting_agent', kind: 'ask_source' })).toBeNull()
    expect(jobCompletionAnnouncement('waiting_agent', { status: 'failed', kind: 'ask_source' })).toBeNull()
  })
})

describe('job copy helpers', () => {
  it('builds input from a source row and names the study scope', () => {
    expect(
      jobCopyInputFromSource({
        body: '  残す本文  ',
        url: 'https://example.com/a',
        job: {
          status: 'failed',
          kind: 'fetch',
          errorCode: 'timeout',
          errorMessage: null,
        },
      }),
    ).toEqual({
      status: 'failed',
      kind: 'fetch',
      errorCode: 'timeout',
      errorMessage: null,
      hasBody: true,
      hasUrl: true,
    })
    expect(studyScopeLabel('研究ノート')).toBe('回答元: 研究ノート')
    expect(cursorBodyBudgetCopy(false)).toBeNull()
    expect(cursorBodyBudgetCopy(true)).toEqual({
      label: '本文を切り詰めました',
      detail:
        '先頭100,000文字だけを使います。それ以降は要約や回答に含まれません。長いソースは分けて登録してください。',
    })
  })

  it('exposes the same pending labels through jobStatusLabel', () => {
    expect(jobStatusLabel('queued', 'fetch')).toBe('本文の取得を準備しています')
    expect(jobStatusLabel('waiting_agent', 'fetch')).toBe('本文を取得しています')
    expect(jobStatusLabel('waiting_agent', 'summarize_body')).toBe('要約しています')
    expect(jobStatusLabel('waiting_agent', 'ask_source')).toBe('回答しています')
    expect(
      jobStatusAlertText({
        label: '本文を取得できませんでした',
        detail: '取得が時間切れになりました。本文を貼り付けて続けてください。',
      }),
    ).toBe('本文を取得できませんでした。取得が時間切れになりました。本文を貼り付けて続けてください。')
  })
})
