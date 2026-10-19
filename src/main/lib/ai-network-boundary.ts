export const AI_REQUEST_TIMEOUT_MS = 45000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export async function fetchAI(input: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS) })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    throw new Error(name === 'AbortError' || name === 'TimeoutError'
      ? 'AI provider request timed out. Please retry.'
      : 'AI provider could not be reached. Check your connection and retry.')
  }
}

/** Read a bounded HTTP body, including interrupted/chunked responses. */
export async function readAIJSON(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('AI provider returned an empty response. Please retry.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('AI provider response was too large. Request a smaller answer and retry.')
      }
      chunks.push(value)
    }
    const buffer = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
    try { return JSON.parse(new TextDecoder().decode(buffer)) }
    catch { throw new Error('AI provider returned an invalid response. Please retry.') }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AI provider')) throw error
    throw new Error('AI provider response was interrupted. Please retry; your local work is saved.')
  } finally {
    reader.releaseLock()
  }
}
