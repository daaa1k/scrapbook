export type ConfirmCopy = {
  title: string
  description: string
  bullets?: readonly string[]
}

export function notebookDeleteConfirm(title: string): ConfirmCopy {
  return {
    title: `「${title}」を削除します`,
    description: 'この操作は取り消せません。次のデータが完全に削除されます。',
    bullets: ['ソース', '要約', 'Q&A', 'メモ', 'PDF原本'],
  }
}

export function sourceDeleteConfirm(label: string): ConfirmCopy {
  return {
    title: `「${label}」を削除します`,
    description: '関連する要約、質問、メモも削除されます。この操作は取り消せません。',
  }
}

export function qaDeleteConfirm(question: string): ConfirmCopy {
  const clipped = question.length > 40 ? `${question.slice(0, 40)}…` : question
  return {
    title: 'この質問と回答を削除します',
    description: `「${clipped}」とその回答が削除されます。この操作は取り消せません。`,
  }
}
