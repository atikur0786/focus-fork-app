const STORAGE_KEY = 'focusfork-favorite-models'

function parseIds(raw: string | null): string[] {
  try {
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  } catch {
    return []
  }
}

export async function getFavoriteModelIds(): Promise<string[]> {
  return parseIds(await window.api.appStorage.getItem(STORAGE_KEY))
}

export function isFavoriteModel(modelId: string, favoriteIds: string[]): boolean {
  return favoriteIds.includes(modelId)
}

export async function toggleFavoriteModel(modelId: string): Promise<string[]> {
  const current = await getFavoriteModelIds()
  const next = current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]
  await window.api.appStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
