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
        <a href="#main-content" className="skip-link">
          メインコンテンツへ移動
        </a>
        <div className="mx-auto max-w-7xl px-4 py-8">
          <header className="mb-8">
            <nav aria-label="サイト">
              <Link to="/" className="text-xl font-semibold tracking-tight">
                Scrapbook
              </Link>
            </nav>
          </header>
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
