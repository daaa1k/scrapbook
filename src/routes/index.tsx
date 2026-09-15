import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { jobStatusLabel } from '~/lib/utils'
import { listSources, registerSource, stubPdfUpload } from '~/server/functions/sources'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['sources'],
      queryFn: () => listSources(),
    }),
  component: HomePage,
})

function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const sourcesQuery = useQuery({
    queryKey: ['sources'],
    queryFn: () => listSources(),
  })

  const register = useMutation({
    mutationFn: (value: string) => registerSource({ data: { url: value } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
      await navigate({ to: '/sources/$sourceId', params: { sourceId: result.sourceId } })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : '登録に失敗しました')
    },
  })

  const pdfStub = useMutation({
    mutationFn: () => stubPdfUpload(),
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
        <p className="mt-3 text-sm text-zinc-500">
          PDFアップロードは未実装です。スタブとして R2 に空ファイルを書けます。
        </p>
        <Button
          className="mt-2 bg-zinc-600"
          disabled={pdfStub.isPending}
          onClick={() => pdfStub.mutate()}
        >
          PDFスタブを書く
        </Button>
        {pdfStub.data ? (
          <p className="mt-2 text-sm text-zinc-500">R2 キー: {pdfStub.data.key}</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">ソース一覧</h2>
        {sources.length === 0 ? (
          <Card>
            <p>まだソースがありません。URLを登録してください。</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {sources.map((source) => (
              <li key={source.id}>
                <Link to="/sources/$sourceId" params={{ sourceId: source.id }}>
                  <Card className="hover:border-zinc-400">
                    <p className="font-medium">{source.title ?? source.url ?? source.id}</p>
                    <p className="text-sm text-zinc-500">{source.url}</p>
                    <p className="mt-1 text-sm">処理状況: {jobStatusLabel(source.jobStatus)}</p>
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
