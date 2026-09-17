const TITLE_MAX = 512

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

function cleanTitle(raw: string): string | null {
  const decoded = decodeBasicEntities(raw).replace(/\s+/g, ' ').trim()
  if (!decoded) return null
  return decoded.slice(0, TITLE_MAX)
}

function quotedAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[1] ?? match[2] ?? null) : null
}

export function extractHtmlDocumentTitle(html: string): string | null {
  let ogTitle: string | null = null
  let twitterTitle: string | null = null
  const metaRe = /<meta\b[^>]*>/gi
  for (let meta = metaRe.exec(html); meta; meta = metaRe.exec(html)) {
    const tag = meta[0]
    const content = quotedAttr(tag, 'content')
    if (content == null) continue
    const property = quotedAttr(tag, 'property')
    const name = quotedAttr(tag, 'name')
    if (!ogTitle && property?.toLowerCase() === 'og:title') {
      ogTitle = cleanTitle(content)
    } else if (!twitterTitle && name?.toLowerCase() === 'twitter:title') {
      twitterTitle = cleanTitle(content)
    }
    if (ogTitle) break
  }
  if (ogTitle) return ogTitle
  if (twitterTitle) return twitterTitle

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return title?.[1] ? cleanTitle(title[1]) : null
}
