import type { SummaryContent } from './schema'

export function summaryToMarkdown(title: string, templateLabel: string, content: SummaryContent): string {
  return [
    `# ${title}`,
    `_${templateLabel} summary_`,
    '',
    ...content.sections.flatMap((section) => [
      `## ${section.heading}`,
      ...section.bullets.map((bullet) => `- ${bullet}`),
      '',
    ]),
  ].join('\n').trimEnd() + '\n'
}

export function actionItemsToMarkdown(items: { owner: string; task: string; due: string | null }[]): string {
  if (items.length === 0) return ''
  return items.map((item) =>
    `- [ ] ${item.owner}: ${item.task}${item.due ? ` (due ${item.due})` : ''}`,
  ).join('\n') + '\n'
}
