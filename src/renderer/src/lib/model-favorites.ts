const STORAGE_KEY = 'focusfork-favorite-models'

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  } catch {
    return []
  }
}

export function getFavoriteModelIds(): string[] {
  return readIds()
}

export function isFavoriteModel(modelId: string): boolean {
  return readIds().includes(modelId)
}

export function toggleFavoriteModel(modelId: string): string[] {
  const current = readIds()
  const next = current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
