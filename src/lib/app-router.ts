import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
// Generated Routes
import { routeTree } from '../routeTree.gen'

/**
 * MSI-067: application router instance, extracted from main.tsx so
 * non-component modules (e.g. the desktop command handler) can navigate
 * without importing the app bootstrap (which would re-execute rendering).
 */
export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
