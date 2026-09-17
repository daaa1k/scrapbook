import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Textarea } from '~/components/ui/textarea'
import { shouldSaveMemo } from '~/domain/memo-save'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { userFacingError } from '~/lib/utils'
import { runOrganizationCommand } from '~/server/functions/organization'
import { getSource } from '~/server/functions/sources'

const MEMO_DEBOUNCE_MS = 600

export type MemoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

type SourceMemoPaneProps = {
  sourceId: string
  registerFlush: (flush: () => Promise<void>) => void
}

export function SourceMemoPane({ sourceId, registerFlush }: SourceMemoPaneProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState<MemoSaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef('')
  const draftRef = useRef(draft)
  const savePromise = useRef<Promise<void> | null>(null)
  draftRef.current = draft

  const query = useQuery({
    queryKey: sourceKeys.detail(sourceId),
    queryFn: () => getSource({ data: { sourceId } }),
  })

  const serverMemo = query.data?.organization.memo ?? ''

  useEffect(() => {
    setDraft(serverMemo)
    lastSaved.current = serverMemo
    setSaveState('idle')
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

  function saveIfDirty(): Promise<void> {
    const next = draftRef.current
    if (!shouldSaveMemo(next, lastSaved.current)) return Promise.resolve()
    if (savePromise.current) return savePromise.current
    savePromise.current = save
      .mutateAsync(next)
      .then(() => undefined)
      .finally(() => {
        savePromise.current = null
      })
    return savePromise.current
  }

  useEffect(() => {
    registerFlush(() => saveIfDirty())
  })

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

  if (!query.data) {
    return <p className="text-sm text-zinc-500">メモを読み込み中…</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-500">メモ</h2>
        {statusLabel ? (
          <p className={saveState === 'error' ? 'text-sm text-red-600' : 'text-sm text-zinc-500'} aria-live="polite">
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
        maxLength={20_000}
      />
      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" className="text-sm underline" onClick={() => void saveIfDirty()}>
            再試行
          </button>
        </div>
      ) : null}
    </div>
  )
}
