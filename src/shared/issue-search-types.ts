export const DEFAULT_DISCOVER_QUERY =
  'is:issue is:open archived:false label:"good first issue"'

export interface IssueSearchRequest {
  query: string
  page?: number
  perPage?: number
  sort?: 'comments' | 'created' | 'updated'
  order?: 'asc' | 'desc'
}

export function normalizeIssueSearchPayload(payload: unknown): IssueSearchRequest {
  if (typeof payload === 'string') {
    const query = payload.trim() || DEFAULT_DISCOVER_QUERY
    return { query, page: 1, perPage: 30, order: 'desc' }
  }

  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const query =
    typeof raw.query === 'string' && raw.query.trim() ? raw.query.trim() : DEFAULT_DISCOVER_QUERY
  const page = Math.max(1, Number(raw.page ?? 1))
  const perPage = Math.min(100, Math.max(1, Number(raw.perPage ?? 30)))
  const sort =
    raw.sort === 'comments' || raw.sort === 'created' || raw.sort === 'updated'
      ? raw.sort
      : undefined
  const order: 'asc' | 'desc' = raw.order === 'asc' ? 'asc' : 'desc'

  return { query, page, perPage, sort, order }
}

export interface IssueSearchResponse {
  items: unknown[]
  totalCount: number
  page: number
  perPage: number
  hasNextPage: boolean
}
