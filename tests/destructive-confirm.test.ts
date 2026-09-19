import { describe, expect, it } from 'vitest'
import { notebookDeleteConfirm, qaDeleteConfirm, sourceDeleteConfirm } from '../src/domain/destructive-confirm'

describe('notebookDeleteConfirm', () => {
  it('names the notebook, marks the delete as irreversible, and lists cascade targets', () => {
    expect(notebookDeleteConfirm('研究')).toEqual({
      title: '「研究」を削除します',
      description: 'この操作は取り消せません。次のデータが完全に削除されます。',
      bullets: ['ソース', '要約', 'Q&A', 'メモ', 'PDF原本'],
    })
  })
})

describe('sourceDeleteConfirm', () => {
  it('names the source and states related data plus irreversibility', () => {
    expect(sourceDeleteConfirm('記事')).toEqual({
      title: '「記事」を削除します',
      description: '関連する要約、質問、メモも削除されます。この操作は取り消せません。',
    })
  })
})

describe('qaDeleteConfirm', () => {
  it('names the question and states that the answer is deleted too', () => {
    expect(qaDeleteConfirm('要点は何ですか')).toEqual({
      title: 'この質問と回答を削除します',
      description: '「要点は何ですか」とその回答が削除されます。この操作は取り消せません。',
    })
  })

  it('clips a long question to 40 characters', () => {
    const question = 'あ'.repeat(41)
    expect(qaDeleteConfirm(question)).toEqual({
      title: 'この質問と回答を削除します',
      description: `「${'あ'.repeat(40)}…」とその回答が削除されます。この操作は取り消せません。`,
    })
  })
})
