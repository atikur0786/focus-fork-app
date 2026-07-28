export type IssueSortMode = 'best' | 'updated' | 'comments' | 'newest'

export type IssueDifficultyFilter = 'all' | 'good-first' | 'help-wanted' | 'any-labeled'

export interface IssueSearchQueryInput {
  keywords: string
  language: string
  difficulty: IssueDifficultyFilter
  onlyGoodFirst: boolean
}

export interface IssueSearchSortParams {
  sort?: 'comments' | 'created' | 'updated'
  order: 'asc' | 'desc'
}

const GITHUB_QUALIFIER_PATTERN =
  /\b(is|label|language|repo|org|user|in|state|archived|author|assignee|mentions|team|milestone|project|topic|type|review|draft|status|no|linked):/i

export const DISCOVER_LANGUAGE_OPTIONS = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'Java',
  'Ruby',
  'C++',
  'C#',
  'Swift',
  'Kotlin',
  'PHP'
]

export function buildIssueSearchQuery(input: IssueSearchQueryInput): string {
  const qualifiers = ['is:issue', 'is:open', 'archived:false']
  const keywords = input.keywords.trim()

  if (keywords) {
    qualifiers.push(keywords)
  } else if (input.difficulty !== 'help-wanted' && input.difficulty !== 'any-labeled' && !input.onlyGoodFirst) {
    qualifiers.push('label:"good first issue"')
  }

  if (input.difficulty === 'good-first' || input.onlyGoodFirst) {
    qualifiers.push('label:"good first issue"')
  }
  if (input.difficulty === 'help-wanted') {
    qualifiers.push('label:"help wanted"')
  }
  if (input.language !== 'all') {
    qualifiers.push(`language:${input.language}`)
  }

  return qualifiers.join(' ')
}

export function getIssueSearchSortParams(sortMode: IssueSortMode): IssueSearchSortParams {
  switch (sortMode) {
    case 'comments':
      return { sort: 'comments', order: 'desc' }
    case 'newest':
      return { sort: 'created', order: 'desc' }
    case 'updated':
      return { sort: 'updated', order: 'desc' }
    default:
      return { order: 'desc' }
  }
}

export function formatIssueDate(iso?: string | null): string {
  if (!iso) return 'Unknown date'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

export function hasAdvancedGitHubSyntax(query: string): boolean {
  return GITHUB_QUALIFIER_PATTERN.test(query.trim())
}
