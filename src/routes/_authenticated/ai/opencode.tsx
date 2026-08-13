import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/ai/opencode')({
  component: Layout,
})

function Layout() {
  return <Outlet />
}
