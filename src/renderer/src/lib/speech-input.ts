interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionResult {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResult>
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: Event) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const globalWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition || null
}

export function isSpeechInputSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

export interface SpeechInputController {
  stop: () => void
}

export function startSpeechInput(handlers: {
  onPartial?: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
}): SpeechInputController | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    handlers.onError('Voice input is not supported in this environment.')
    return null
  }

  const recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onresult = (event) => {
    let interim = ''
    let finalText = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const chunk = event.results[i][0]?.transcript || ''
      if (event.results[i].isFinal) {
        finalText += chunk
      } else {
        interim += chunk
      }
    }
    if (interim.trim()) handlers.onPartial?.(interim.trim())
    if (finalText.trim()) handlers.onFinal(finalText.trim())
  }

  recognition.onerror = () => {
    handlers.onError('Could not capture voice input. Check microphone permissions and try again.')
  }

  try {
    recognition.start()
  } catch {
    handlers.onError('Microphone is already in use or unavailable.')
    return null
  }

  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        // ignore stop races
      }
    }
  }
}
