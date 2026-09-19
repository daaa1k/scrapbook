import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../src/lib/clipboard'

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects empty text', async () => {
    expect(await copyText('   ')).toBe('fail')
  })

  it('uses the clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('要約本文')).toBe('ok')
    expect(writeText).toHaveBeenCalledWith('要約本文')
  })
})
