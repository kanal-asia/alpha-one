import { useLayout } from '@/context/layout-provider'
import { useDeveloperMode } from '@/context/developer-mode-provider'
import { Link, useLocation } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { navGroupsForMode, sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { AppTitle } from './app-title'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { developerMode } = useDeveloperMode()
  const navGroups = navGroupsForMode(developerMode)
  const aiAssistant = sidebarData.aiAssistant
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <AppTitle />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>

      {aiAssistant?.url && <AiAssistantLink item={{ ...aiAssistant, url: aiAssistant.url, icon: aiAssistant.icon ?? Sparkles }} />}

      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function AiAssistantLink({
  item,
}: {
  item: { title: string; url: string; icon: React.ElementType }
}) {
  const href = useLocation({ select: (location) => location.href })
  const { setOpenMobile } = useSidebar()
  const isActive = href === item.url || href.startsWith(item.url)
  const Icon = item.icon ?? Sparkles

  return (
    <div className='mt-auto px-3 pb-2'>
      <Separator className='mb-2' />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={item.title}
            className={cn(
              'w-full justify-start gap-2 font-medium',
              isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
            )}
          >
            <Link to={item.url as string} onClick={() => setOpenMobile(false)}>
              <Icon className='size-4' />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  )
}
