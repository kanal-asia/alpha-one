import { type LinkProps } from '@tanstack/react-router'

type User = {
  name: string
  email: string
  avatar: string
}

type Team = {
  name: string
  logo: React.ElementType
  plan: string
}

type BaseNavItem = {
  title: string
  badge?: string
  icon?: React.ElementType
}

type NavLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {})
  items?: never
}

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps['to'] | (string & {}) })[]
  url?: never
}

type NavItem = NavCollapsible | NavLink

type NavGroup = {
  title: string
  items: NavItem[]
  /** Only shown when Developer Mode is enabled (engineer-facing UI). */
  developerOnly?: boolean
}

type SidebarData = {
  user: User
  teams: Team[]
  navGroups: NavGroup[]
  /** Bottom-anchored AI Assistant entry — always visible, separated from groups. */
  aiAssistant?: NavLink
}

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }
