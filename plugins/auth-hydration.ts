/**
 * Auth Hydration Plugin — Fixes Pinia state hydration for auth
 *
 * Problem: During SSR, the auth store sets `initialized = true` and
 * `isLoading = false` without actually loading the session (localStorage
 * isn't available on the server). Pinia then hydrates the client with
 * these values, causing the client to skip initialize() entirely.
 *
 * Solution: After client-side hydration, reset `initialized` to false
 * and `isLoading` to true so the client properly loads the session
 * from localStorage.
 */
import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const authStore = useAuthStore()

    // Reset the hydration from SSR — the client needs to re-initialize
    // with the actual localStorage session
    authStore.initialized = false
    authStore.isLoading = true
  }
})
