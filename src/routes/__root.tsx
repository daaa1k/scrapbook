import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext, useRouterState } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAppViewportCssVars } from '~/hooks/use-app-viewport'
import { cn } from '~/lib/utils'
import appCss from '~/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
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
  useAppViewportCssVars(notebookWorkspace)

  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body
        className={cn(
          notebookWorkspace && 'notebook-workspace overflow-hidden',
        )}
      >
        <a href="#main-content" className="skip-link">
          メインコンテンツへ移動
        </a>
        <div
          className={
            notebookWorkspace
              ? 'mx-auto flex h-full max-w-[90rem] flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]'
              : 'mx-auto max-w-7xl px-4 py-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]'
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
