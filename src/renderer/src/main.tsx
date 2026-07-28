import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

async function bootstrap(): Promise<void> {
  // Plain-browser preview (no Electron preload): install the demo-data mock
  // so every screen renders for visual review. Never runs inside Electron.
  if (!('api' in window)) {
    const { installBrowserMock } = await import('./dev/browser-mock')
    installBrowserMock()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
