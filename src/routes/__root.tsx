import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import appCss from '~/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Scrapbook' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="mx-auto max-w-3xl px-4 py-8">
          <header className="mb-8 flex items-baseline justify-between gap-4">
            <Link to="/" className="text-xl font-semibold tracking-tight">
              Scrapbook
            </Link>
            <Link to="/notebooks" className="text-sm text-zinc-500 hover:underline">
              ノートブック
            </Link>
          </header>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
