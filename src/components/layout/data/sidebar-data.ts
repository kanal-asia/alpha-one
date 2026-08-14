import {
  Activity,
  Archive,
  Boxes,
  Clock,
  Cpu,
  Folder,
  FolderOpen,
  GitBranch,
  Library,
  Server,
  Settings,
  Terminal,
  Wrench,
} from 'lucide-react'
import { type SidebarData } from '../types'
import { WorkspaceLogo } from './workspace-logo'
import { AlphaWorkspaceIcon } from './alpha-workspace-icon'

export const sidebarData: SidebarData = {
  user: {
    name: 'Workspace User',
    email: 'local@workspace',
    avatar: '',
  },
  teams: [
    {
      name: 'Alpha One',
      logo: WorkspaceLogo,
      plan: 'Alpha Workspace',
    },
  ],
  navGroups: [
    {
      title: 'Main',
      items: [
        {
          title: 'ALPHA WORKSPACE',
          url: '/workspace/assistant',
          icon: AlphaWorkspaceIcon,
          className: 'font-semibold',
        },
      ],
    },
    {
      title: 'Google Workspace',
      items: [
        {
          title: 'Drive',
          url: '/google/drive',
          icon: FolderOpen,
        },
      ],
    },
    {
      title: 'Workspace',
      items: [
        {
          title: 'Resources',
          url: '/workspace/resources',
          icon: Library,
        },
        {
          title: 'Files',
          url: '/workspace/artifacts',
          icon: Folder,
        },
        {
          title: 'Activity',
          url: '/workspace/history',
          icon: Clock,
        },
        {
          title: 'Settings',
          url: '/settings',
          icon: Settings,
        },
      ],
    },
    {
      title: 'Platform',
      developerOnly: true,
      items: [
        {
          title: 'SDK Registry',
          url: '/workspace/sdks',
          icon: Boxes,
        },
        {
          title: 'Workflow Registry',
          url: '/workspace/workflows',
          icon: GitBranch,
        },
        {
          title: 'Operation Registry',
          url: '/workspace/operations',
          icon: Cpu,
        },
        {
          title: 'Artifact Registry',
          url: '/workspace/artifacts',
          icon: Archive,
        },
        {
          title: 'Runtime',
          url: '/workspace/runtime',
          icon: Server,
        },
        {
          title: 'Kernel',
          url: '/workspace',
          icon: Activity,
        },
        {
          title: 'Health',
          url: '/workspace/health',
          icon: Activity,
        },
        {
          title: 'Diagnostics',
          url: '/workspace/history',
          icon: Terminal,
        },
        {
          title: 'Developer Tools',
          url: '/tools',
          icon: Wrench,
        },
      ],
    },
  ],
}

/** Nav groups visible for a given mode. Hides the engineer-facing Platform group unless Developer Mode is on. */
export function navGroupsForMode(developerMode: boolean) {
  if (developerMode) return sidebarData.navGroups
  return sidebarData.navGroups.filter((group) => !group.developerOnly)
}
