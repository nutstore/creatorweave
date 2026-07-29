export interface TestNotificationParams {
  title: string
  body: string
}

interface TestNotificationOptions extends NotificationOptions {
  renotify?: boolean
}

const testNotificationOptions = (body: string): TestNotificationOptions => ({
  body,
  // Use /favicon.svg — /icons/icon-192.png does NOT exist in public/.
  // A broken icon URL causes Chrome to silently drop the notification.
  icon: '/favicon.svg',
  // Unique tag + no renotify — Chrome's renotify is buggy on macOS and
  // silently drops notifications when the same tag already exists.
  tag: `agent-notification-test-${Date.now()}`,
})

/**
 * Send the Settings test notification.
 *
 * Uses navigator.serviceWorker.ready (the officially recommended way to get
 * a usable registration). This resolves once a SW controls the page and
 * matches the working manual test case
 * (navigator.serviceWorker.ready.then(r => r.showNotification(...))).
 */
export async function showTestNotification({ title, body }: TestNotificationParams): Promise<void> {
  const options = testNotificationOptions(body)

  if (!navigator.serviceWorker) {
    // No SW support — fall back to the plain Notification API.
    new Notification(title, options)
    return
  }

  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, options)
}
