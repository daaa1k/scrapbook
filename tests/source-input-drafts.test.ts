import { describe, expect, it } from 'vitest'
import {
  acceptedPasteDraft,
  acceptedQuestionDraft,
  EMPTY_SOURCE_INPUT_DRAFT,
} from '../src/domain/source-input-drafts'

describe('accepted source input drafts', () => {
  it('clears only an accepted question snapshot', () => {
    const draft = { ...EMPTY_SOURCE_INPUT_DRAFT, question: 'first', pasteBody: 'other input' }
    expect(acceptedQuestionDraft(draft, 'first')).toEqual({ ...draft, question: '' })
    expect(acceptedQuestionDraft({ ...draft, question: 'first plus more' }, 'first')).toEqual({ ...draft, question: 'first plus more' })
  })

  it('clears a saved paste only when its title and body still match', () => {
    const draft = { ...EMPTY_SOURCE_INPUT_DRAFT, pasteTitle: 'title', pasteBody: 'body', pasteRequested: true, question: 'other question' }
    const input = { title: 'title', body: 'body' }
    expect(acceptedPasteDraft(draft, input)).toEqual({ ...draft, pasteBody: '', pasteRequested: false })
    expect(acceptedPasteDraft({ ...draft, pasteBody: 'body plus more' }, input)).toEqual({ ...draft, pasteBody: 'body plus more' })
    expect(acceptedPasteDraft({ ...draft, pasteTitle: 'revised title' }, input)).toEqual({ ...draft, pasteTitle: 'revised title' })
  })
})
