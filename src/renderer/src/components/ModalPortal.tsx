import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a full-screen overlay into document.body.
 *
 * `position: fixed` is resolved against the nearest ancestor that has a
 * transform, filter, or will-change — not the viewport. Page containers use
 * the `page-enter` animation, so a modal rendered inline collapses onto the
 * page container's box instead of covering the screen (visible as a backdrop
 * that only dims the first viewport of a scrolled page). Portaling to
 * document.body removes that dependency entirely.
 */
export function ModalPortal({ children }: { children: ReactNode }): React.JSX.Element | null {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
