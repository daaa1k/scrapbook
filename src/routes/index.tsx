import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input, controlClassName } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import {
  EMPTY_SOURCE_LIST_FILTER,
  sourceListFilterSchema,
  type SourceListFilter,
} from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { acquiredViaLabel, isTerminalJobStatus, jobStatusLabel, sourceKindLabel, userFacingError } from '~/lib/utils'
import { getOrganizationCatalog } from '~/server/functions/organization'
import { deleteRegisteredSource, listSources, pasteSource, registerPdf, registerSource } from '~/server/functions/sources'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: sourceKeys.list(EMPTY_SOURCE_LIST_FILTER),
        queryFn: () => listSources({ data: EMPTY_SOURCE_LIST_FILTER }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: organizationKeys.catalog,
        queryFn: () => getOrganizationCatalog(),
      }),
    ]),
  component: HomePage,
})

function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [notebookDraft, setNotebookDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [submitted, setSubmitted] = useState<SourceListFilter>(EMPTY_SOURCE_LIST_FILTER)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

  const sourcesQuery = useQuery({
    queryKey: sourceKeys.list(submitted),
    queryFn: () => listSources({ data: submitted }),
  })

  async function invalidateAfterIngest() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
    ])
  }

  const register = useMutation({
    mutationFn: (value: string) => registerSource({ data: { url: value } }),
    onSuccess: async (result) => {
      await invalidateAfterIngest()
      await navigate({ to: '/sources/$sourceId', params: { sourceId: result.sourceId } })
    },
    onError: (error) => {
      setFormError(userFacingError(error))
    },
  })

  const paste = useMutation({
    mutationFn: () =>
      pasteSource({
        data: {
          title: pasteTitle,
          body: pasteBody,
          url: pasteUrl.trim() ? pasteUrl : undefined,
        },
      }),
    onSuccess: async (result) => {
      await invalidateAfterIngest()
      await navigate({ to: '/sources/$sourceId', params: { sourceId: result.sourceId } })
    },
    onError: (error) => {
      setPasteError(userFacingError(error))
    },
  })

  const uploadPdf = useMutation({
    mutationFn: (file: File) => {
      const data = new FormData()
      data.set('file', file)
      return registerPdf({ data })
    },
    onSuccess: async (result) => {
      await invalidateAfterIngest()
      await navigate({ to: '/sources/$sourceId', params: { sourceId: result.sourceId } })
    },
    onError: (error) => {
      setPdfError(userFacingError(error))
    },
  })

  const removeSource = useMutation({
    mutationFn: (sourceId: string) => deleteRegisteredSource({ data: { sourceId } }),
    onSuccess: async () => {
      setListError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
      ])
    },
    onError: (error) => {
      setListError(userFacingError(error))
    },
  })

  const sources = sourcesQuery.data ?? []
  const filterActive = submitted.q !== '' || submitted.notebookId !== null || submitted.tagName !== null

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">URLを登録</h1>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            setFormError(null)
            register.mutate(url)
          }}
        >
          <Input
            name="url"
            type="url"
            required
            placeholder="https://example.com/article"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="URL"
          />
          <Button type="submit" disabled={register.isPending}>
            URLを登録
          </Button>
        </form>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">PDFを登録</h2>
        <p className="mb-3 text-sm text-zinc-500">
          原本は非公開のまま保存します。テキスト層があるPDFは本文を抽出します。Cursorは起動しません。8MBまでです。
        </p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            setPdfError(null)
            if (!pdfFile) {
              setPdfError('PDFファイルを選んでください')
              return
            }
            uploadPdf.mutate(pdfFile)
          }}
        >
          <Input
            name="pdf"
            type="file"
            accept="application/pdf,.pdf"
            aria-label="PDFファイル"
            onChange={(event) => {
              setPdfFile(event.target.files?.[0] ?? null)
            }}
          />
          <Button type="submit" disabled={uploadPdf.isPending}>
            PDFを登録
          </Button>
        </form>
        {pdfError ? <p className="mt-2 text-sm text-red-600">{pdfError}</p> : null}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">本文を手動で貼り付け</h2>
        <p className="mb-3 text-sm text-zinc-500">
          取得に失敗したとき、または最初から本文を入れるときに使います。Cursor は起動しません。
        </p>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            setPasteError(null)
            paste.mutate()
          }}
        >
          <Input
            name="paste-title"
            required
            placeholder="タイトル"
            value={pasteTitle}
            onChange={(event) => setPasteTitle(event.target.value)}
            aria-label="タイトル"
          />
          <Input
            name="paste-url"
            type="url"
            placeholder="URL（任意）"
            value={pasteUrl}
            onChange={(event) => setPasteUrl(event.target.value)}
            aria-label="URL（任意）"
          />
          <Textarea
            name="paste-body"
            required
            placeholder="本文"
            value={pasteBody}
            onChange={(event) => setPasteBody(event.target.value)}
            aria-label="本文"
          />
          <Button type="submit" disabled={paste.isPending}>
            本文を保存
          </Button>
        </form>
        {pasteError ? <p className="mt-2 text-sm text-red-600">{pasteError}</p> : null}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">ソース一覧</h2>
        <form
          className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(
              sourceListFilterSchema.parse({
                q: search,
                notebookId: notebookDraft === '' ? null : notebookDraft,
                tagName: tagDraft === '' ? null : tagDraft,
              }),
            )
          }}
        >
          <Input
            name="q"
            type="search"
            placeholder="タイトルまたは本文で検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="ソースを検索"
          />
          <select
            className={controlClassName}
            value={notebookDraft}
            onChange={(event) => setNotebookDraft(event.target.value)}
            aria-label="ノートブック"
          >
            <option value="">すべてのノートブック</option>
            {catalog.data?.notebooks.map((notebook) => (
              <option key={notebook.id} value={notebook.id}>
                {notebook.title}
              </option>
            ))}
          </select>
          <select
            className={controlClassName}
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            aria-label="タグ"
          >
            <option value="">すべてのタグ</option>
            {catalog.data?.tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <Button type="submit">検索</Button>
        </form>
        {listError ? <p className="mb-3 text-sm text-red-600">{listError}</p> : null}
        {sources.length === 0 ? (
          <Card>
            <p>
              {filterActive
                ? '一致するソースがありません。'
                : 'まだソースがありません。URLを登録するか、PDFをアップロードするか、本文を貼り付けてください。'}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {sources.map((source) => {
              const canDelete =
                source.jobStatus === null || isTerminalJobStatus(source.jobStatus)
              return (
                <li key={source.id}>
                  <Card className="hover:border-zinc-400">
                    <div className="flex items-start gap-3">
                      <Link
                        to="/sources/$sourceId"
                        params={{ sourceId: source.id }}
                        className="min-w-0 flex-1"
                      >
                        <p className="font-medium">{source.title ?? source.url ?? source.id}</p>
                        <p className="text-sm text-zinc-500">
                          {source.kind === 'pdf' ? 'PDF' : source.url}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">{source.notebook.title}</p>
                        {source.tags.length > 0 ? (
                          <p className="text-sm text-zinc-500">{source.tags.join(' · ')}</p>
                        ) : null}
                        <p className="mt-1 text-sm">
                          種類: {sourceKindLabel(source.kind)}
                          {source.kind === 'pdf' && source.jobStatus === null
                            ? null
                            : ` / 処理状況: ${jobStatusLabel(source.jobStatus, source.jobKind)}`}
                          {' / 取得経路: '}
                          {acquiredViaLabel(source.acquiredVia)}
                        </p>
                      </Link>
                      <Button
                        disabled={!canDelete || removeSource.isPending}
                        onClick={() => removeSource.mutate(source.id)}
                      >
                        削除
                      </Button>
                    </div>
                    {!canDelete ? (
                      <p className="mt-2 text-sm text-zinc-500">処理中のため削除できません。</p>
                    ) : null}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
