import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Alert } from '~/components/ui/alert'
import { ErrorRetry } from '~/components/ui/error-retry'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { Textarea } from '~/components/ui/textarea'
import {
  applyServerMemo,
  discardedMemoSession,
  memoNeedsLeaveGuard,
  shouldSaveMemo,
  type MemoSaveState,
  type MemoSession,
  type MemoSessionHandle,
} from '~/domain/memo-save'
import { MEMO_LOADING_LABEL } from '~/domain/note-shell'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { userFacingError } from '~/lib/utils'
import { runOrganizationCommand } from '~/server/functions/organization'
import { getSource } from '~/server/functions/sources'

const MEMO_DEBOUNCE_MS = 600

type SourceMemoPaneProps = {
  sourceId: string
  registerMemoSession: (session: MemoSessionHandle) => void
}

export function SourceMemoPane({ sourceId, registerMemoSession }: SourceMemoPaneProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState<MemoSaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef('')
  const sessionSourceId = useRef(sourceId)
  const draftRef = useRef(draft)
  const saveStateRef = useRef(saveState)
  const savePromise = useRef<Promise<void> | null>(null)
  const sessionHandle = useRef<MemoSessionHandle>({
    needsGuard: false,
    flush: async () => {},
    discard: () => {},
  })
  draftRef.current = draft
  saveStateRef.current = saveState

  const query = useQuery({
    queryKey: sourceKeys.detail(sourceId),
    queryFn: () => getSource({ data: { sourceId } }),
  })

  const serverMemo = query.data?.organization.memo ?? ''

  useEffect(() => {
    const current: MemoSession = {
      sourceId: sessionSourceId.current,
      draft: draftRef.current,
      lastSaved: lastSaved.current,
      saveState: saveStateRef.current,
    }
    const next = applyServerMemo(current, { sourceId, serverMemo })
    if (next === current) return
    sessionSourceId.current = next.sourceId
    lastSaved.current = next.lastSaved
    setDraft(next.draft)
    setSaveState(next.saveState)
    setError(null)
  }, [sourceId, serverMemo])

  const save = useMutation({
    mutationFn: (memo: string) =>
      runOrganizationCommand({
        data: { type: 'set-memo', sourceId, memo },
      }),
    onMutate: () => {
      setSaveState('saving')
      setError(null)
    },
    onSuccess: async (_ack, memo) => {
      lastSaved.current = memo
      setSaveState('saved')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
      ])
    },
    onError: (err) => {
      setSaveState('error')
      setError(userFacingError(err))
    },
  })

  async function saveIfDirty(): Promise<void> {
    const inFlight = savePromise.current
    if (inFlight) {
      try {
        await inFlight
      } catch {
        // Retry the current draft after the previous attempt fails.
      }
    }
    const next = draftRef.current
    if (!shouldSaveMemo(next, lastSaved.current)) return
    if (savePromise.current) return savePromise.current
    const pending = save
      .mutateAsync(next)
      .then(() => undefined)
      .finally(() => {
        if (savePromise.current === pending) savePromise.current = null
      })
    savePromise.current = pending
    return pending
  }

  function discardDraft() {
    const next = discardedMemoSession({
      sourceId: sessionSourceId.current,
      draft: draftRef.current,
      lastSaved: lastSaved.current,
      saveState: saveStateRef.current,
    })
    lastSaved.current = next.lastSaved
    setDraft(next.draft)
    setSaveState(next.saveState)
    setError(null)
  }

  sessionHandle.current.needsGuard = memoNeedsLeaveGuard({
    draft,
    lastSaved: lastSaved.current,
    saveState,
  })
  sessionHandle.current.flush = saveIfDirty
  sessionHandle.current.discard = discardDraft

  useEffect(() => {
    registerMemoSession(sessionHandle.current)
  }, [registerMemoSession])

  useEffect(() => {
    if (!shouldSaveMemo(draft, lastSaved.current)) return
    setSaveState('dirty')
    const timer = window.setTimeout(() => {
      void saveIfDirty()
    }, MEMO_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, sourceId])

  const statusLabel =
    saveState === 'saving'
      ? '保存中'
      : saveState === 'saved'
        ? '保存済み'
        : saveState === 'error'
          ? '保存失敗'
          : saveState === 'dirty'
            ? '未保存'
            : null

  if (query.isError && !query.data) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <h2 id="notebook-memo-heading" className="sticky top-0 z-[1] bg-inherit py-1 text-sm font-medium text-zinc-500">
          メモ
        </h2>
        <ErrorRetry onRetry={() => void query.refetch()}>{userFacingError(query.error)}</ErrorRetry>
      </div>
    )
  }

  if (!query.data) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <h2 id="notebook-memo-heading" className="sticky top-0 z-[1] bg-inherit py-1 text-sm font-medium text-zinc-500">
          メモ
        </h2>
        <LoadingSkeleton label={MEMO_LOADING_LABEL} lines={3} />
      </div>
    )
  }

  const statusId = 'memo-save-status'
  const errorId = 'memo-save-error'
  const describedBy = [statusLabel ? statusId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" aria-busy={saveState === 'saving' || undefined}>
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-inherit py-1">
        <h2 id="notebook-memo-heading" className="text-sm font-medium text-zinc-500">
          メモ
        </h2>
        {statusLabel ? (
          <p
            id={statusId}
            className={saveState === 'error' ? 'text-sm text-red-600' : 'text-sm text-zinc-500'}
            aria-live={saveState === 'error' ? undefined : 'polite'}
            aria-atomic="true"
          >
            {statusLabel}
          </p>
        ) : null}
      </div>
      <Textarea
        name="source-memo"
        className="min-h-[12rem] flex-1 resize-y"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void saveIfDirty()
        }}
        aria-label="ソースのメモ"
        aria-invalid={saveState === 'error' || undefined}
        aria-describedby={describedBy}
        aria-busy={saveState === 'saving' || undefined}
        maxLength={20_000}
      />
      {error ? (
        <div className="space-y-2">
          <Alert id={errorId}>{error}</Alert>
          <div className="flex gap-3">
            <button type="button" className="text-sm underline" onClick={() => void saveIfDirty()}>
              再試行
            </button>
            <button type="button" className="text-sm underline" onClick={discardDraft}>
              破棄
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
