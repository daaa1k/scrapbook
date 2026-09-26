export type SourceInputDraft = {
  question: string
  pasteTitle: string | null
  pasteBody: string
  pasteRequested: boolean
}

export const EMPTY_SOURCE_INPUT_DRAFT: SourceInputDraft = {
  question: '',
  pasteTitle: null,
  pasteBody: '',
  pasteRequested: false,
}

export function acceptedQuestionDraft(draft: SourceInputDraft, question: string): SourceInputDraft {
  return draft.question === question ? { ...draft, question: '' } : draft
}

export function acceptedPasteDraft(
  draft: SourceInputDraft,
  input: { title: string; body: string },
): SourceInputDraft {
  return draft.pasteTitle === input.title && draft.pasteBody === input.body
    ? { ...draft, pasteTitle: input.title, pasteBody: '', pasteRequested: false }
    : draft
}
