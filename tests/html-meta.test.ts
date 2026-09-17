import { describe, expect, it } from 'vitest'
import { extractHtmlDocumentTitle } from '../src/domain/html-meta'

describe('extractHtmlDocumentTitle', () => {
  it('prefers og:title, then twitter:title, then the document title', () => {
    expect(
      extractHtmlDocumentTitle(
        '<meta name="twitter:title" content="Tw題"><meta property="og:title" content="OG題"><title>文書題</title>',
      ),
    ).toBe('OG題')
    expect(
      extractHtmlDocumentTitle(
        '<meta property="og:title" content="OG題"><meta name="twitter:title" content="Tw題"><title>文書題</title>',
      ),
    ).toBe('OG題')
    expect(
      extractHtmlDocumentTitle('<meta name="twitter:title" content="Tw題"><title>文書題</title>'),
    ).toBe('Tw題')
    expect(extractHtmlDocumentTitle('<title>文書題</title>')).toBe('文書題')
  })

  it('matches tags and attributes case-insensitively and either attribute order', () => {
    expect(extractHtmlDocumentTitle('<META PROPERTY="OG:TITLE" CONTENT="Og">')).toBe('Og')
    expect(extractHtmlDocumentTitle(`<meta content='First' property='og:title'>`)).toBe('First')
    expect(extractHtmlDocumentTitle('<META NAME="TWITTER:TITLE" CONTENT="Tw">')).toBe('Tw')
  })

  it('decodes common entities, trims, and returns null when empty', () => {
    expect(
      extractHtmlDocumentTitle('<title>A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39; X&nbsp;Y</title>'),
    ).toBe('A & B <C> "D" \'E\' X Y')
    expect(extractHtmlDocumentTitle('<title>  題  </title>')).toBe('題')
    expect(extractHtmlDocumentTitle('<html></html>')).toBeNull()
    expect(extractHtmlDocumentTitle('<title>   </title>')).toBeNull()
    expect(extractHtmlDocumentTitle('<meta property="og:title" content="  ">')).toBeNull()
    expect(
      extractHtmlDocumentTitle('<meta property="og:title" content="  "><title>文書題</title>'),
    ).toBe('文書題')
  })

  it('caps a long og:title before the notebook schema limit', () => {
    const title = 'あ'.repeat(600)
    expect(extractHtmlDocumentTitle(`<meta property="og:title" content="${title}">`)).toBe(
      'あ'.repeat(512),
    )
  })
})
