import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { acquiredViaLabel, jobStatusLabel, sourceKindLabel, userFacingError } from '~/lib/utils'
import { listSources, pasteSource, registerPdf, registerSource } from '~/server/functions/sources'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['sources', ''],
      queryFn: () => listSources({ data: { q: '' } }),
    }),
  component: HomePage,
})

function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const sourcesQuery = useQuery({
    queryKey: ['sources', submittedQuery],
    queryFn: () => listSources({ data: { q: submittedQuery } }),
  })

  const register = useMutation({
    mutationFn: (value: string) => registerSource({ data: { url: value } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
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
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
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
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
      await navigate({ to: '/sources/$sourceId', params: { sourceId: result.sourceId } })
    },
    onError: (error) => {
      setPdfError(userFacingError(error))
    },
  })

  const sources = sourcesQuery.data ?? []

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
          className="mb-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmittedQuery(search)
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
          <Button type="submit">検索</Button>
        </form>
        {sources.length === 0 ? (
          <Card>
            <p>
              {submittedQuery
                ? '一致するソースがありません。'
                : 'まだソースがありません。URLを登録するか、PDFをアップロードするか、本文を貼り付けてください。'}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {sources.map((source) => (
              <li key={source.id}>
                <Link to="/sources/$sourceId" params={{ sourceId: source.id }}>
                  <Card className="hover:border-zinc-400">
                    <p className="font-medium">{source.title ?? source.url ?? source.id}</p>
                    <p className="text-sm text-zinc-500">
                      {source.kind === 'pdf' ? 'PDF' : source.url}
                    </p>
                    <p className="mt-1 text-sm">
                      種類: {sourceKindLabel(source.kind)}
                      {source.kind === 'pdf' ? null : ` / 処理状況: ${jobStatusLabel(source.jobStatus)}`}
                      {' / 取得経路: '}
                      {acquiredViaLabel(source.acquiredVia)}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
