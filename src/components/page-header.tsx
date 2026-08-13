import { type ReactNode } from 'react'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { UserMenu } from '@/components/layout/user-menu'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export function PageHeader({ children }: { children?: ReactNode }) {
  return (
    <Header>
      <Search className='me-auto' />
      <ThemeSwitch />
      <ConfigDrawer />
      <UserMenu />
      {children}
    </Header>
  )
}
