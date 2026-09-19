import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext, useRouterState } from '@tanstack/react-router'
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

function isNotebookWorkspacePath(pathname: string) {
  return /^\/notebooks\/[^/]+/.test(pathname)
}

function RootDocument({ children }: { children: ReactNode }) {
  const notebookWorkspace = useRouterState({
    select: (state) => isNotebookWorkspacePath(state.location.pathname),
  })

  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body className={notebookWorkspace ? 'h-dvh overflow-hidden' : undefined}>
        <a href="#main-content" className="skip-link">
          メインコンテンツへ移動
        </a>
        <div
          className={
            notebookWorkspace
              ? 'mx-auto flex h-dvh max-w-[90rem] flex-col px-4 py-3'
              : 'mx-auto max-w-7xl px-4 py-8'
          }
        >
          <header className={notebookWorkspace ? 'mb-3 shrink-0' : 'mb-8'}>
            <nav aria-label="サイト">
              <Link to="/" className="text-xl font-semibold tracking-tight">
                Scrapbook
              </Link>
            </nav>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className={notebookWorkspace ? 'flex min-h-0 flex-1 flex-col' : undefined}
          >
            {children}
          </main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
