/**
 * Compatibility hooks around native-disk synchronization.
 *
 * Next's runtime does not expose the former dev-server file-watcher control
 * endpoint. Keep these async hooks as no-ops so synchronization call sites can
 * retain their ordering without coupling the app to a bundler plugin.
 */

export async function pauseHmr(_paths: string[]): Promise<void> {
  // Intentionally empty.
}

export async function resumeHmr(_paths: string[]): Promise<void> {
  // Intentionally empty.
}
