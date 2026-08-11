import { create } from 'zustand'

export type ProjectContextType = 'local' | 'google-drive'

export interface Project {
  id: string
  name: string
  contextType: ProjectContextType
  /** Local folder path or Google Drive folder ID */
  contextPath: string
  /** Human-readable display of the context path */
  contextLabel: string
  createdAt: string
}

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  activeProject: Project | null

  createProject: (project: Omit<Project, 'id' | 'createdAt'>) => Project
  setActiveProject: (id: string | null) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
}

const PROJECTS_KEY = 'alpha-workspace:projects'
const ACTIVE_PROJECT_KEY = 'alpha-workspace:active-project'

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    return raw ? (JSON.parse(raw) as Project[]) : []
  } catch {
    return []
  }
}

function saveProjects(projects: Project[]) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  } catch {
    /* ignore */
  }
}

function loadActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY)
  } catch {
    return null
  }
}

function saveActiveProjectId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY)
    }
  } catch {
    /* ignore */
  }
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: loadProjects(),
  activeProjectId: loadActiveProjectId(),
  activeProject: (() => {
    const projects = loadProjects()
    const activeId = loadActiveProjectId()
    return projects.find((p) => p.id === activeId) ?? null
  })(),

  createProject: (projectData) => {
    const project: Project = {
      ...projectData,
      id: newId('project'),
      createdAt: new Date().toISOString(),
    }
    set((state) => {
      const projects = [...state.projects, project]
      saveProjects(projects)
      return { projects }
    })
    return project
  },

  setActiveProject: (id) => {
    const projects = get().projects
    const activeProject = projects.find((p) => p.id === id) ?? null
    set({ activeProjectId: id, activeProject })
    saveActiveProjectId(id)
  },

  updateProject: (id, patch) => {
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      )
      saveProjects(projects)
      const activeProject =
        state.activeProjectId === id
          ? projects.find((p) => p.id === id) ?? null
          : state.activeProject
      return { projects, activeProject }
    })
  },

  deleteProject: (id) => {
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id)
      saveProjects(projects)
      const activeProjectId =
        state.activeProjectId === id ? null : state.activeProjectId
      const activeProject = activeProjectId
        ? projects.find((p) => p.id === activeProjectId) ?? null
        : null
      saveActiveProjectId(activeProjectId)
      return { projects, activeProjectId, activeProject }
    })
  },
}))
