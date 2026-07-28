import { Notification, app } from 'electron'
import fs from 'fs'
import path from 'path'

function resolveNotificationIcon(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'app-icon.png'),
    path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'resources', 'app-icon.png'),
    path.join(process.resourcesPath, 'app-icon.png'),
    path.join(process.resourcesPath, 'resources', 'app-icon.png'),
    path.join(process.cwd(), 'resources', 'app-icon.png'),
    path.join(process.cwd(), 'resources', 'icon.png'),
    path.join(app.getAppPath(), 'resources', 'icon.png')
  ]

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // Try next candidate.
    }
  }
  return undefined
}

export class NotificationService {
  show(title: string, body: string): { shown: boolean; reason?: string } {
    if (!Notification.isSupported()) {
      return { shown: false, reason: 'Notifications are not supported on this system.' }
    }

    const icon = resolveNotificationIcon()
    try {
      const notification = new Notification({
        title,
        body,
        ...(icon ? { icon } : {})
      })
      notification.show()
      return { shown: true }
    } catch (error) {
      return {
        shown: false,
        reason: error instanceof Error ? error.message : 'Could not display notification.'
      }
    }
  }
}

export const notificationService = new NotificationService()
