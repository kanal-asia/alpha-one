import {
  Activity,
  Archive,
  Boxes,
  Calendar,
  Clock,
  Cpu,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  Mail,
  Presentation,
  Server,
  Settings,
  Sparkles,
  Terminal,
  Wrench,
} from 'lucide-react'
import { type SidebarData } from '../types'
import { WorkspaceLogo } from './workspace-logo'

export const sidebarData: SidebarData = {
  user: {
    name: 'Workspace User',
    email: 'local@workspace',
    avatar: '',
  },
  teams: [
    {
      name: 'Alpha Workspace',
      logo: WorkspaceLogo,
      plan: 'Local Workspace',
    },
  ],
  navGroups: [
    {
      title: 'Main',
      items: [
        {
          title: 'Home',
          url: '/',
          icon: LayoutDashboard,
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
        {
          title: 'Docs',
          url: '/google/docs',
          icon: FileText,
        },
        {
          title: 'Sheets',
          url: '/google/sheets',
          icon: FileSpreadsheet,
        },
        {
          title: 'Slides',
          url: '/google/slides',
          icon: Presentation,
        },
        {
          title: 'Calendar',
          url: '/google/calendar',
          icon: Calendar,
        },
        {
          title: 'Gmail',
          url: '/google/gmail',
          icon: Mail,
        },
      ],
    },
    {
      title: 'Workspace',
      items: [
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
  /** Bottom-anchored AI Assistant entry — rendered separately from collapsible groups. */
  aiAssistant: {
    title: 'AI Assistant',
    url: '/workspace/assistant',
    icon: Sparkles,
  },
}

/** Nav groups visible for a given mode. Hides the engineer-facing Platform group unless Developer Mode is on. */
export function navGroupsForMode(developerMode: boolean) {
  if (developerMode) return sidebarData.navGroups
  return sidebarData.navGroups.filter((group) => !group.developerOnly)
}
