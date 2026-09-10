import { create } from 'zustand'
import {
  type Chat,
  type ChatContext,
  type ChatMessage,
  type ChatProjectContext,
  type ChatUsage,
  type CompactResult,
  type ConnectionStatus,
  type ContextStatus,
  type ExecutionLogEntry,
  type LifecycleStage,
  type ModeInfo,
  type ModelInfo,
  type OpenCodeSession,
  type OpenCodeSessionState,
  type OpenCodeSettings,
  type ProviderSummary,
  type TokenMetrics,
  type UsageStats,
  type WorkspaceInfo,
} from '../types'
import { openCodeService } from '../services/opencode-service'
import { buildProviderErrorWarning } from '@/services/opencode/provider-errors'
import { markModelUsed } from '../model-preferences'
import { resolveRuntimeModel } from '@/features/runtime/contract'
import {
  sanitizeReference,
  type ReferenceAttachment,
} from '@/features/ai/references/contract'
import { registerResourceLocally } from '@/features/resources/registration'
import { useResourceStore } from '@/features/resources/resource-store'

import { KEYS, migrateAllKeys } from '@/lib/storage-keys'

/** TASK-OPENCODE-025: Canonical default model when available from OpenCode runtime. */
const INTENDED_DEFAULT_MODEL = 'opencode/deepseek-v4-flash-free'

// ---------------------------------------------------------------------------
// TASK-OPENCODE-050: Lifecycle observability helpers
// ---------------------------------------------------------------------------

let lifecycleSeq = 0
function nextLifecycleId(): string {
  lifecycleSeq += 1
  return `lc-${Date.now()}-${lifecycleSeq}`
}

function pushStage(
  stages: LifecycleStage[] | undefined,
  kind: LifecycleStage['kind'],
  label: string,
  status: LifecycleStage['status'],
  detail?: string
): LifecycleStage[] {
  return [...(stages ?? []), { id: nextLifecycleId(), kind, label, status, timestamp: new Date().toISOString(), detail }]
}

function appendOrUpdateStage(
  stages: LifecycleStage[] | undefined,
  kind: LifecycleStage['kind'],
  label: string,
  status: LifecycleStage['status'],
  detail?: string
): LifecycleStage[] {
  const existing = stages ?? []
  // A running stage of the same kind replaces any prior running stage of that
  // kind (e.g. thinking→thinking, tool→tool) so the list stays compact.
  const idx = [...existing].reverse().findIndex((s) => s.kind === kind && s.status === 'running')
  if (idx >= 0) {
    const realIdx = existing.length - 1 - idx
    const next = [...existing]
    next[realIdx] = { ...next[realIdx], label, status, detail }
    return next
  }
  return [...existing, { id: nextLifecycleId(), kind, label, status, timestamp: new Date().toISOString(), detail }]
}

const DEFAULT_SETTINGS: OpenCodeSettings = {
  executablePath: 'opencode',
  workspacePath: 'C:\\dev\\alpha-one',
  autoConnect: false,
  autoReconnect: false,
  streamingSpeed: 1,
  defaultModel: '',
  defaultMode: 'build',
  defaultVariant: '',
  autoSave: true,
  streaming: true,
  developerMode: false,
}

const CHATS_KEY = KEYS.CHATS
const SETTINGS_KEY = KEYS.SETTINGS

// TASK-OPENCODE-036: Migrate legacy localStorage keys on import
migrateAllKeys()

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    return raw ? (JSON.parse(raw) as Chat[]) : []
  } catch {
    return []
  }
}

function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 50)))
  } catch {
    /* ignore */
  }
}

function loadSettings(): Partial<OpenCodeSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? (JSON.parse(raw) as Partial<OpenCodeSettings>) : {}
  } catch {
    return {}
  }
}

/**
 * Hydrate persisted settings over defaults and migrate stale execution modes.
 * Pre-007 builds persisted `defaultMode: 'chat'`; only the canonical OpenCode
 * agents Build / Plan are valid execution modes now.
 */
function hydrateSettings(): OpenCodeSettings {
  const raw = { ...DEFAULT_SETTINGS, ...loadSettings() }
  if (raw.defaultMode !== 'build' && raw.defaultMode !== 'plan') {
    raw.defaultMode = 'build'
  }
  // TASK-OPENCODE-023: Migrate away from removed temperature/maxTokens fields.
  // These were presentation-only and never sent to the OpenCode runtime.
  const { temperature: _, maxTokens: __, ...cleaned } = raw as OpenCodeSettings & { temperature?: number; maxTokens?: number }
  return cleaned
}

/** Derived context usage (DERIVED) from native step tokens vs the model's
 * context window. Returns null when the basis is missing — never 0%. */
function computeContext(used: number, limit: number): ChatContext | null {
  if (!(used > 0) || !(limit > 0)) return null
  const percent = Math.min(100, (used / limit) * 100)
  const status: ContextStatus =
    percent > 90 ? 'critical' : percent > 80 ? 'high' : percent > 60 ? 'attention' : 'normal'
  return { used, limit, percent: Math.round(percent * 10) / 10, status }
}

function accumulateUsage(prev: ChatUsage | undefined, t: TokenMetrics, cost?: number): ChatUsage {
  return {
    inputTokens: (prev?.inputTokens ?? 0) + t.input,
    outputTokens: (prev?.outputTokens ?? 0) + t.output,
    totalTokens: (prev?.totalTokens ?? 0) + t.total,
    reasoningTokens: (prev?.reasoningTokens ?? 0) + t.reasoning,
    cacheReadTokens: (prev?.cacheReadTokens ?? 0) + t.cacheRead,
    cacheWriteTokens: (prev?.cacheWriteTokens ?? 0) + t.cacheWrite,
    cost: (prev?.cost ?? 0) + (cost ?? 0),
  }
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export interface OpenCodeSnapshot {
  id: string
  workspacePath: string
  state: OpenCodeSessionState
  startedAt?: string
  endedAt?: string
}

interface OpenCodeStore {
  settings: OpenCodeSettings
  connection: ConnectionStatus
  installed: boolean | null
  session: OpenCodeSession | null
  isStreaming: boolean
  logs: ExecutionLogEntry[]
  runtimeEvents: string[]
  workspaces: WorkspaceInfo[]
  history: OpenCodeSnapshot[]
  models: ModelInfo[]
  modes: ModeInfo[]
  modelsLoaded: boolean
  modelRefreshing: boolean
  modelRefreshResult: 'idle' | 'success' | 'error'

  providers: ProviderSummary[]
  providersLoaded: boolean
  providerRefreshing: boolean
  providerRefreshResult: 'idle' | 'success' | 'error'

  // TASK-085 CORRECTIVE: blocking provider-error modal state.
  providerErrorModal: {
    open: boolean
    headline: string
    detail: string
    primaryLabel: string
    secondaryLabel: string
    classification: string | null
    model: string | null
    provider: string | null
    errorKey: string | null
  }
  // TASK-085R3: key of the last dismissed terminal error. A late duplicate
  // chunk carrying the same key must not reopen the dialog; a new sendMessage
  // clears it so a retried failing model still reports.
  dismissedProviderErrorKey: string | null

  usageSummary: UsageStats | null
  compacting: boolean
  compactResult: CompactResult | null

  chats: Chat[]
  activeChatId: string | null

  abortController: AbortController | null

  updateSettings: (patch: Partial<OpenCodeSettings>) => void
  detect: () => Promise<void>
  loadWorkspaces: () => Promise<void>
  selectWorkspace: (path: string) => void
  loadModels: (force?: boolean) => Promise<void>
  loadProviders: (force?: boolean) => Promise<void>
  setProviderErrorModalOpen: (open: boolean) => void
  loadUsageSummary: (days?: number) => Promise<void>
  compactActiveSession: () => Promise<void>
  syncConfigMode: () => Promise<void>
  launch: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>

  // Conversation
  newChat: () => void
  selectChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  archiveChat: (id: string, archived: boolean) => void
  deleteChat: (id: string) => void
  clearLocalCache: () => void
  // TASK-OPENCODE-053: Per-session model/project assignment. These mutate only
  // the active chat — they never touch the workspace-global configured default.
  setActiveChatModel: (modelId: string) => void
  setActiveChatProject: (project: ChatProjectContext | undefined) => void
  sendMessage: (prompt: string, references?: ReferenceAttachment[]) => Promise<void>
  stopGeneration: () => void
  retryLast: () => Promise<void>
  editAndResend: (messageId: string, text: string, references?: ReferenceAttachment[]) => Promise<void>
  continueGeneration: () => Promise<void>

  clearConversation: () => void
  clearLogs: () => void
  pushLog: (level: ExecutionLogEntry['level'], message: string) => void
  pushRuntimeEvent: (message: string) => void
}

function logEntry(
  level: ExecutionLogEntry['level'],
  message: string
): ExecutionLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    level,
    message,
    createdAt: new Date().toISOString(),
  }
}

function makeChat(firstPrompt?: string): Chat {
  const now = new Date().toISOString()
  return {
    id: newId('chat'),
    title: firstPrompt ? firstPrompt.slice(0, 40) : 'New Chat',
    messages: [],
    // TASK-OPENCODE-053: New Chat starts project-empty. The previous session's
    // (or the workspace-global active) project must not be inherited; the user
    // picks a project explicitly via the Recent Projects fast track.
    project: undefined,
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// MSI-071: lifecycle-aware runtime detection (single source of truth).
//
// PROVEN DEFECT: the previous detect() treated any non-ready snapshot as
// terminal — during normal startup (starting/checking_cli/loading_*) it
// logged `OpenCode runtime reported not installed`, a false error that then
// lingered after the runtime became healthy.
//
// Contract:
// - transitional lifecycle/stage (anything not ready/busy/error/stopped)
//   emits ONE informational pending line, never a terminal error;
// - terminal ready + installed logs the canonical resolved path (MSI-070);
// - terminal failure (error lifecycle, ready-but-not-installed, backend
//   unreachable, or startup timeout) logs ONE actionable error with the
//   actual observed state;
// - concurrent callers share one run (no duplicate diagnostics).
// ---------------------------------------------------------------------------

/** Lifecycle values that mean "still starting, not a failure". */
function isTransitionalLifecycle(lifecycle: string | null): boolean {
  return (
    lifecycle !== 'ready' &&
    lifecycle !== 'busy' &&
    lifecycle !== 'error' &&
    lifecycle !== 'stopped'
  )
}

let detectInflight: Promise<void> | null = null

// R2B: shared in-flight force model refresh (concurrent Refresh clicks join one run).
let modelRefreshInflight: Promise<void> | null = null

async function runDetect(
  set: (partial: Partial<OpenCodeStore>) => void,
  get: () => OpenCodeStore
): Promise<void> {
  set({ connection: 'connecting' })

  // Wait for a terminal runtime state (bounded): the runtime typically needs
  // a few seconds for CLI detection + model discovery after backend boot.
  const deadline = Date.now() + 30_000
  let pendingLogged = false
  let lastStage: string | null = null

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cliInfo = await openCodeService
      .getRuntimeCliInfo()
      .catch(() => null)
    lastStage = cliInfo?.stage ?? null

    const terminal =
      cliInfo === null
        ? Date.now() >= deadline
        : !isTransitionalLifecycle(cliInfo.lifecycle) || cliInfo.lifecycle === 'error'

    if (terminal) {
      const installed =
        cliInfo !== null && cliInfo.installed
      set({
        installed,
        connection: installed ? 'connected' : 'disconnected',
      })
      if (installed) {
        const canonicalPath =
          cliInfo?.resolvedCommand ?? cliInfo?.executablePath ?? null
        get().pushLog(
          'info',
          cliInfo?.lifecycle === 'error'
            ? `OpenCode detected at "${canonicalPath ?? get().settings.executablePath}" (runtime in error state, but executable is present).`
            : `OpenCode detected at "${canonicalPath ?? get().settings.executablePath}".`
        )
      } else if (cliInfo) {
        get().pushLog(
          'error',
          `OpenCode runtime reported not installed (lifecycle=${cliInfo.lifecycle ?? 'unknown'}, stage=${cliInfo.stage ?? 'unknown'}). Check runtime health and restart.`
        )
      } else {
        get().pushLog(
          'error',
          'OpenCode runtime unreachable. Check that Alpha One backend is running and restart.'
        )
      }
      return
    }

    if (!pendingLogged) {
      pendingLogged = true
      get().pushLog(
        'info',
        lastStage === 'checking_cli'
          ? 'Checking OpenCode CLI...'
          : 'OpenCode runtime is starting...'
      )
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

export const useOpenCodeStore = create<OpenCodeStore>((set, get) => ({
  settings: hydrateSettings(),
  connection: 'disconnected',
  installed: null,
  session: null,
  isStreaming: false,
  logs: [],
  runtimeEvents: [],
  workspaces: [],
  history: [],
  models: [],
  modes: [],
  modelsLoaded: false,
  modelRefreshing: false,
  modelRefreshResult: 'idle' as const,
  providers: [],
  providersLoaded: false,
  providerRefreshing: false,
  providerRefreshResult: 'idle' as const,
  providerErrorModal: {
    open: false,
    headline: '',
    detail: '',
    primaryLabel: '',
    secondaryLabel: '',
    classification: null,
    model: null,
    provider: null,
    errorKey: null,
  },
  dismissedProviderErrorKey: null,
  usageSummary: null,
  compacting: false,
  compactResult: null,

  chats: loadChats(),
  activeChatId: null,

  abortController: null,

  updateSettings: (patch) => {
    const next = { ...patch }
    if ('defaultMode' in next && next.defaultMode !== 'build' && next.defaultMode !== 'plan') {
      next.defaultMode = 'build'
    }
    set((state) => {
      const settings = { ...state.settings, ...next }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* ignore */
      }
      return { settings }
    })
  },

  pushLog: (level, message) =>
    set((state) => ({ logs: [logEntry(level, message), ...state.logs].slice(0, 200) })),

  pushRuntimeEvent: (message) =>
    set((state) => ({
      runtimeEvents: [message, ...state.runtimeEvents].slice(0, 200),
    })),

  detect: async () => {
    // MSI-071: concurrent detect() calls share one in-flight run so duplicate
    // consumers cannot emit duplicate/contradictory diagnostics.
    if (detectInflight) return detectInflight
    detectInflight = runDetect(set, get)
    try {
      await detectInflight
    } finally {
      detectInflight = null
    }
  },

  loadWorkspaces: async () => {
    const [workspaces, runtimeWs] = await Promise.all([
      openCodeService.listWorkspaces(),
      openCodeService.getRuntimeWorkspace(),
    ])
    set({ workspaces })
    // TASK-OPENCODE-025R1: Sync workspace path with runtime-detected workspace.
    if (runtimeWs?.path) {
      const current = get().settings.workspacePath
      if (current !== runtimeWs.path) {
        get().updateSettings({ workspacePath: runtimeWs.path })
      }
    }
  },

  selectWorkspace: (path) => {
    set((state) => ({ settings: { ...state.settings, workspacePath: path } }))
    get().pushLog('info', `Workspace selected: ${path}`)
  },

  loadModels: async (force?: boolean) => {
    // R2B: concurrent force refreshes share one run (same idea as detectInflight).
    if (force && modelRefreshInflight) {
      await modelRefreshInflight
      return
    }
    const run = (async (): Promise<void> => {
      // R2B safety: snapshot previous catalog so a force refresh can never
      // destructively replace a usable list with an empty one.
      const prevModels = get().models
      if (force) {
        set({ modelRefreshing: true, modelRefreshResult: 'idle' })
      }
      try {
        const [models, modes] = await Promise.all([
          force
            ? openCodeService.forceRefreshModels()
            : openCodeService.listModels(),
          openCodeService.listModes(),
        ])
        const current = get().settings.defaultModel
        const stillExists = models.some((m) => m.id === current)
        let nextDefault = current
        if (!stillExists) {
          const intended = models.find((m) => m.id === INTENDED_DEFAULT_MODEL)
          if (intended) {
            nextDefault = intended.id
          } else {
            const firstFree = [...models]
              .sort((a, b) => Number(b.free) - Number(a.free) || a.displayName.localeCompare(b.displayName))
              .find((m) => m.free)
            nextDefault = firstFree?.id ?? models[0]?.id ?? ''
          }
        }
        // R2B safety: an empty force result must never wipe a previously usable
        // catalog (malformed/failed refresh). Preserve and report error instead.
        // Only a genuinely empty runtime on a previously empty catalog yields [].
      if (force && models.length === 0 && prevModels.length > 0) {
        set({ modes, modelsLoaded: true, modelRefreshResult: 'error' })
        setTimeout(() => set({ modelRefreshResult: 'idle' }), 2000)
        void get().syncConfigMode()
        return
      }
        if (nextDefault !== current) {
          get().updateSettings({ defaultModel: nextDefault })
        }
        if (nextDefault) markModelUsed(nextDefault)
        set({ models, modes, modelsLoaded: true })
      if (force) {
        set({ modelRefreshResult: 'success' })
        setTimeout(() => {
          set({ modelRefreshResult: 'idle' })
        }, 1500)
      }
        void get().syncConfigMode()
      } catch {
      if (force) {
        set({ modelRefreshResult: 'error' })
        setTimeout(() => set({ modelRefreshResult: 'idle' }), 2000)
      }
      } finally {
        if (force) set({ modelRefreshing: false })
      }
    })()
    if (force) {
      modelRefreshInflight = run
      try {
        await run
      } finally {
        if (modelRefreshInflight === run) modelRefreshInflight = null
      }
    } else {
      await run
    }
  },

  syncConfigMode: async () => {
    try {
      const agent = await openCodeService.fetchConfigDefaultAgent()
      if (agent && agent !== get().settings.defaultMode) {
        get().updateSettings({ defaultMode: agent })
      }
    } catch {
      /* config read is best-effort */
    }
  },

  loadProviders: async (force?: boolean) => {
    if (force) set({ providerRefreshing: true, providerRefreshResult: 'idle' })
    try {
      const providers = await openCodeService.listProviders(force)
      set({ providers, providersLoaded: true })
      if (force) {
        set({ providerRefreshResult: 'success' })
        setTimeout(() => set({ providerRefreshResult: 'idle' }), 1500)
      }
    } catch {
      set({ providers: [], providersLoaded: true })
      if (force) {
        set({ providerRefreshResult: 'error' })
        setTimeout(() => set({ providerRefreshResult: 'idle' }), 2000)
      }
    } finally {
      if (force) set({ providerRefreshing: false })
    }
  },

  loadUsageSummary: async (days) => {
    const stats = await openCodeService.fetchStats(days)
    set({ usageSummary: stats })
  },

  compactActiveSession: async () => {
    const chat = get().chats.find((c) => c.id === get().activeChatId)
    if (!chat?.sessionId || get().compacting) return
    set({ compacting: true, compactResult: null })
    const result = await openCodeService.compactSession(chat.sessionId)
    set({ compacting: false, compactResult: result })
    get().pushLog(
      result.supported ? 'info' : 'error',
      `[compaction] ${result.message ?? (result.ok ? 'Compacted.' : 'Compaction failed.')}`
    )
  },

  launch: async () => {
    if (get().session?.state === 'running') return
    set({ connection: 'connecting' })
    get().pushLog('info', 'Starting OpenCode session...')
    const session = await openCodeService.launchSession(get().settings)
    set({ session, connection: 'connected' })
    get().pushLog('completed', 'Session ready. Real session ID will be assigned on first prompt.')
  },

  stop: async () => {
    const { session } = get()
    if (!session) return
    get().abortController?.abort()
    await openCodeService.stopSession(session.id)
    const snapshot: OpenCodeSnapshot = {
      id: session.id,
      workspacePath: session.workspacePath,
      state: 'stopped',
      startedAt: session.startedAt,
      endedAt: new Date().toISOString(),
    }
    set((state) => ({
      session: { ...session, state: 'stopped', endedAt: snapshot.endedAt },
      connection: 'disconnected',
      history: [snapshot, ...state.history],
    }))
    get().pushLog('info', 'Session stopped.')
  },

  restart: async () => {
    const { session } = get()
    if (!session) return
    get().pushLog('info', 'Restarting OpenCode session...')
    const next = await openCodeService.restartSession(session.id, get().settings)
    set({ session: next, connection: 'connected' })
    get().pushLog('completed', `Session restarted (${next.id}).`)
  },

  newChat: () => {
    const chat = makeChat()
    // TASK-085 CORRECTIVE (fresh-session isolation): a New Chat must never
    // inherit a stale OpenCode ses_* from any previous chat. Abort any
    // in-flight generation first (frees isStreaming), then switch.
    get().abortController?.abort()
    set((state) => ({
      chats: [chat, ...state.chats],
      activeChatId: chat.id,
      isStreaming: false,
      abortController: null,
    }))
    // TASK-OPENCODE-053: Persist the freshly created session (consistent with
    // every other chat mutation) so a new chat survives a reload.
    saveChats(get().chats)
    get().pushRuntimeEvent(`New chat created: ${chat.id}`)
  },

  selectChat: (id) => set({ activeChatId: id, isStreaming: false }),

  setActiveChatModel: (modelId) => {
    const id = get().activeChatId
    if (!id) return
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id ? { ...c, model: modelId, updatedAt: new Date().toISOString() } : c
      ),
    }))
    saveChats(get().chats)
  },

  setActiveChatProject: (project) => {
    let { activeChatId, chats } = get()
    if (!activeChatId) {
      const chat = makeChat()
      chat.project = project
      chats = [chat, ...chats]
      activeChatId = chat.id
      set({ chats, activeChatId })
      saveChats(chats)
      return
    }
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === activeChatId ? { ...c, project, updatedAt: new Date().toISOString() } : c
      ),
    }))
    saveChats(get().chats)
  },

  renameChat: (id, title) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id ? { ...c, title: title || c.title, updatedAt: new Date().toISOString() } : c
      ),
    }))
    saveChats(get().chats)
  },

  archiveChat: (id, archived) => {
    set((state) => {
      const chats = state.chats.map((c) =>
        c.id === id ? { ...c, archived, updatedAt: new Date().toISOString() } : c
      )
      const activeChatId =
        state.activeChatId === id && archived
          ? (chats.find((c) => !c.archived)?.id ?? null)
          : state.activeChatId
      return { chats, activeChatId }
    })
    saveChats(get().chats)
  },

  deleteChat: (id) => {
    const chatToDelete = get().chats.find((c) => c.id === id)
    if (chatToDelete?.sessionId) {
      get().pushLog('info', `[SESSION] DELETE chatId=${id} sessionId=${chatToDelete.sessionId}`)
    }
    set((state) => {
      const chats = state.chats.filter((c) => c.id !== id)
      const activeChatId =
        state.activeChatId === id ? (chats[0]?.id ?? null) : state.activeChatId
      return { chats, activeChatId }
    })
    saveChats(get().chats)
  },

  sendMessage: async (prompt, incomingReferences) => {
    if (!prompt.trim() || get().isStreaming) return
    // TASK-085R3: a new attempt re-arms provider-error reporting — a retried
    // failing model must open the dialog again even for the same error key.
    set({ dismissedProviderErrorKey: null })
    // TASK-AIASSISTANT-005: persist reference *metadata* only, never content.
    const references = (incomingReferences ?? []).map(sanitizeReference)
    let { activeChatId, chats } = get()
    if (!activeChatId) {
      const chat = makeChat(prompt)
      chat.messages.push({
        id: newId('msg'),
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
        references,
      })
      chats = [chat, ...chats]
      activeChatId = chat.id
      set({ chats, activeChatId })
    } else {
      const updated = chats.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              title: c.messages.length === 0 ? prompt.slice(0, 40) : c.title,
              // TASK-OPENCODE-053: Preserve the chat's own project only. Do not
              // auto-attach the workspace-global active project — an untouched
              // New Chat must stay project-empty until the user picks a project.
              project: c.project,
              messages: [
                ...c.messages,
                {
                  id: newId('msg'),
                  role: 'user' as const,
                  content: prompt,
                  createdAt: new Date().toISOString(),
                  references,
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : c
      )
      set({ chats: updated })
    }

    const activeChat = get().chats.find((c) => c.id === activeChatId)
    // TASK-OPENCODE-053: Per-session model. The chat's own model wins; otherwise
    // fall back to the configured/default model (never the previous session's).
    const effectiveModel = activeChat?.model ?? get().settings.defaultModel

    const assistantId = newId('msg')
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
      model: effectiveModel,
      mode: get().settings.defaultMode,
      executionState: 'working',
      toolEvents: [],
      lifecycle: pushStage(undefined, 'request', 'Memahami permintaan', 'running'),
      continuations: 0,
    }
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === activeChatId ? { ...c, messages: [...c.messages, assistantMsg] } : c
      ),
      isStreaming: true,
    }))

    await ensureRunning(get)
    const controller = new AbortController()
    set({ abortController: controller })
    const startedAt = Date.now()

    // TASK-AI-033: Use the real CLI session ID stored on the chat, not the
    // global session object. The global session.id is a client-generated fake.
    // The chat.sessionId is the real ID extracted from CLI output events.
    // TASK-085 CORRECTIVE: only a chat that already holds messages may carry a
    // sessionId into a request. A fresh (message-less) chat must always start
    // session-less — even if a stale chat object somehow carries a sessionId
    // (e.g. restored/persisted state) — so a New Chat can never resurrect a
    // dead ses_* and hit the 60s quiet watchdog on its first prompt.
    const hasPriorMessages = (activeChat?.messages?.length ?? 0) > 1
    const realSessionId = hasPriorMessages ? (activeChat?.sessionId ?? '') : ''

    // Runtime Contract (TASK-AI-031): resolve the canonical RuntimeModel and
    // pass it to the transport. The transport extracts `.id` — nothing else.
    const selectedModel = resolveRuntimeModel(get().models, effectiveModel)
    get().pushLog(
      'info',
      `[runtime-trace] selected model: ${JSON.stringify({
        id: selectedModel.id,
        provider: selectedModel.provider,
        slug: selectedModel.slug,
        displayName: selectedModel.displayName,
        free: selectedModel.free,
      })}`
    )
    get().pushLog(
      'info',
      `[runtime-trace] payload: ${JSON.stringify({
        model: selectedModel.id,
        message: prompt,
        references: references.map((r) => ({ provider: r.provider, name: r.name })),
      })}`
    )

    const appendToken = (token: string) => {
      set((state) => ({
        chats: state.chats.map((c) =>
          c.id === activeChatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + token } : m
                ),
              }
            : c
        ),
      }))
    }

    // TASK-AI-033: Session recovery helper.
    // If "Session not found" error is detected, retry once without session ID.
    let sessionRetryAttempted = false

    if (realSessionId) {
      get().pushLog('info', `[SESSION] REUSE chatId=${activeChatId} sessionId=${realSessionId}`)
    } else {
      get().pushLog(
        'info',
        `[SESSION] CREATE chatId=${activeChatId} sessionId=(new) fresh=${String(!hasPriorMessages)}`
      )
    }

    const executePrompt = async (sessionIdForPrompt: string) => {
      await openCodeService.sendPrompt(
        sessionIdForPrompt,
        prompt,
        (chunk) => {
          if (chunk.type === 'token' && chunk.content) appendToken(chunk.content)
          else if (chunk.type === 'thinking' && chunk.thinking) {
            // TASK-OPENCODE-050: step_start → thinking stage.
            set((state) => ({
              chats: state.chats.map((c) =>
                c.id === activeChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              executionState: 'progress',
                              lifecycle: appendOrUpdateStage(m.lifecycle, 'thinking', 'Processing request…', 'running'),
                            }
                          : m
                      ),
                    }
                  : c
              ),
            }))
          } else if (chunk.type === 'continuation' && chunk.continuation) {
            // TASK-OPENCODE-050: Auto-continuation lifecycle.
            const { attempt, sessionId } = chunk.continuation
            set((state) => ({
              chats: state.chats.map((c) =>
                c.id === activeChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              executionState: 'progress',
                              continuations: (m.continuations ?? 0) + 1,
                              lifecycle: pushStage(
                                m.lifecycle,
                                'continuation',
                                'Continuing work',
                                'running',
                                sessionId ? `attempt ${attempt} · ${sessionId}` : `attempt ${attempt}`
                              ),
                            }
                          : m
                      ),
                    }
                  : c
              ),
            }))
            get().pushLog('info', `[lifecycle] continuation attempt=${attempt}`)
          } else if (chunk.type === 'tool_event' && chunk.toolEvent) {
            // TASK-OPENCODE-030: Track tool events for progress display.
            // TASK-OPENCODE-050: also update lifecycle + derive Todo plan from
            // todowrite tool input.
            const te = chunk.toolEvent
            set((state) => ({
              chats: state.chats.map((c) =>
                c.id === activeChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              executionState: 'progress',
                              toolEvents: [...(m.toolEvents ?? []), te],
                              lifecycle: appendOrUpdateStage(
                                m.lifecycle,
                                'tool',
                                te.label,
                                te.status === 'error' ? 'error' : te.status === 'completed' ? 'completed' : 'running',
                                te.detail
                              ),
                              plan: te.todos ? [...te.todos] : m.plan,
                            }
                          : m
                      ),
                    }
                  : c
              ),
            }))
            get().pushLog('info', `[tool] ${chunk.toolEvent.label}`)
          } else if (chunk.type === 'exit_code' && chunk.exitCode != null) {
            // TASK-OPENCODE-030: Track exit code for execution state.
            set((state) => ({
              chats: state.chats.map((c) =>
                c.id === activeChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId ? { ...m, exitCode: chunk.exitCode } : m
                      ),
                    }
                  : c
              ),
            }))
          } else if (chunk.type === 'session' && chunk.sessionId) {
            // TASK-AI-033: Store the real CLI session ID on the chat.
            // This is the session ID the CLI created, not a client-generated one.
            get().pushLog('info', `[SESSION] CREATE chatId=${activeChatId} sessionId=${chunk.sessionId}`)
            set((state) => ({
              chats: state.chats.map((c) =>
                c.id === activeChatId ? { ...c, sessionId: chunk.sessionId } : c
              ),
            }))
          } else if (chunk.type === 'file_operation' && chunk.filePath) {
            // TASK-OPENCODE-018R2: Register agent-created files as Resources.
            // Uses actual tool execution evidence (write/edit) from structured
            // OpenCode CLI events — not text parsing.
            const filePath = chunk.filePath
            const fileName = filePath.split(/[\\/]/).pop() ?? filePath
            const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined
            const mimeMap: Record<string, string> = {
              txt: 'text/plain',
              md: 'text/markdown',
              csv: 'text/csv',
              json: 'application/json',
              js: 'text/javascript',
              ts: 'text/typescript',
              py: 'text/x-python',
              html: 'text/html',
              css: 'text/css',
              xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              pdf: 'application/pdf',
            }
            const mimeType = ext ? mimeMap[ext] : undefined
            registerResourceLocally(useResourceStore.getState(), {
              provider: 'local',
              name: fileName,
              externalId: filePath,
              mimeType,
              path: filePath,
              metadata: {
                source: 'opencode_chat',
                tool: chunk.fileTool,
              },
            })
            get().pushLog('info', `[RESOURCE] REGISTERED file=${fileName} path=${filePath}`)
          } else if (chunk.type === 'done') {
            const doneLatencyMs = Date.now() - startedAt
            get().pushLog('completed', `[runtime-trace] done: model=${selectedModel.id} latency=${doneLatencyMs}ms terminal=${chunk.terminal}`)
            const nativeTokens = chunk.tokens
            // TASK-OPENCODE-033: Only finalize on terminal done.
            // Intermediate done (reason='tool-calls') updates metrics but keeps streaming.
            if (!chunk.terminal) {
              // Intermediate step — update usage metrics only
              set((state) => {
                const chat = state.chats.find((c) => c.id === activeChatId)
                const usage = nativeTokens
                  ? accumulateUsage(chat?.usage, nativeTokens, chunk.cost)
                  : chat?.usage
                const context = nativeTokens
                  ? computeContext(nativeTokens.total, selectedModel.contextWindow)
                  : (chat?.context ?? null)
                return {
                  chats: state.chats.map((c) =>
                    c.id === activeChatId
                      ? { ...c, usage, context, updatedAt: new Date().toISOString() }
                      : c
                  ),
                }
              })
              return
            }
            // Terminal done — finalize execution state
            set((state) => {
              const chat = state.chats.find((c) => c.id === activeChatId)
              const usage = nativeTokens
                ? accumulateUsage(chat?.usage, nativeTokens, chunk.cost)
                : chat?.usage
              const context = nativeTokens
                ? computeContext(nativeTokens.total, selectedModel.contextWindow)
                : (chat?.context ?? null)
              return {
                chats: state.chats.map((c) =>
                  c.id === activeChatId
                    ? {
                        ...c,
                        messages: c.messages.map((m) => {
                          if (m.id !== assistantId) return m
                          // TASK-OPENCODE-030/033: Determine execution state.
                          const hasContent = m.content.length > 0
                          const execState = hasContent ? 'completed' : 'completed_no_text'
                          return {
                            ...m,
                            status: 'done',
                            executionState: execState,
                            durationMs: Date.now() - startedAt,
                            tokens: nativeTokens?.total ?? estimateTokens(m.content),
                            usage: nativeTokens,
                            cost: chunk.cost,
                            lifecycle: pushStage(
                              m.lifecycle,
                              execState === 'completed' ? 'completed' : 'failed',
                              execState === 'completed' ? 'Completed' : 'Execution incomplete',
                              execState === 'completed' ? 'completed' : 'error',
                              execState === 'completed' ? undefined : 'agent stopped without a final answer'
                            ),
                          }
                        }),
                        usage,
                        context,
                        updatedAt: new Date().toISOString(),
                      }
                    : c
                ),
                isStreaming: false,
              }
            })
            get().pushRuntimeEvent('Assistant response completed.')
          } else if (chunk.type === 'warning') {
            // TASK-AI-032: Warnings are diagnostics, not errors.
            // A late exit after successful completion is logged but does NOT
            // overwrite the message status. The response is already complete.
            get().pushLog('info', `[runtime-warning] ${chunk.error ?? 'Unknown warning'}`)
          } else if (chunk.type === 'error') {
            // TASK-AI-033: Session recovery — detect "Session not found" and retry once.
            if (chunk.error === 'Session not found' && !sessionRetryAttempted) {
              sessionRetryAttempted = true
              get().pushLog('info', `[SESSION] INVALIDATE chatId=${activeChatId} sessionId=${sessionIdForPrompt} reason="Session not found"`)
              get().pushLog('info', `[SESSION] RETRY oldSession=${sessionIdForPrompt} newSession=(new)`)
              // Invalidate session on chat
              set((state) => ({
                chats: state.chats.map((c) =>
                  c.id === activeChatId ? { ...c, sessionId: undefined } : c
                ),
              }))
              // Reset streaming state and retry with empty session ID
              set({ isStreaming: false })
              executePrompt('').catch(() => { /* recursive call, errors handled inside */ })
              return
            }

            // TASK-085 CORRECTIVE: classified provider/model failures render a
            // blocking modal inside the Alpha One window. Free/paid split is
            // refined — the store knows the selected model's free flag.
            // Session-not-found retry above is untouched. No toast duplication.
            let modelWarning: string | null = null
            if (chunk.modelError) {
              const info = chunk.modelError
              const classification =
                info.classification === 'PAID_MODEL_USAGE_EXHAUSTED' && selectedModel.free
                  ? 'FREE_MODEL_LIMIT_EXCEEDED'
                  : info.classification
              const warning = buildProviderErrorWarning(classification, {
                provider: info.provider ?? selectedModel.provider,
                model: info.model ?? selectedModel.id,
                modelDisplayName: selectedModel.displayName,
                ...(info.retryAfterSeconds != null ? { retryAfterSeconds: info.retryAfterSeconds } : {}),
              })
              modelWarning = `${warning.headline}\n\n${warning.detail}`
              // TASK-085R3: exactly one dialog per terminal error. Skip when a
              // dialog is already open, or when this exact error was already
              // shown and dismissed (late duplicate SSE chunk). The inline
              // warning below still lands in chat history either way.
              const errorKey = `${classification}|${info.provider ?? selectedModel.provider}|${info.model ?? selectedModel.id}`
              const currentModal = get().providerErrorModal
              if (!currentModal.open && errorKey !== get().dismissedProviderErrorKey) {
                set({
                  providerErrorModal: {
                    open: true,
                    headline: warning.headline,
                    detail: warning.detail,
                    primaryLabel: warning.primaryLabel ?? 'Close',
                    secondaryLabel: warning.secondaryLabel ?? 'Close',
                    classification,
                    model: info.model ?? selectedModel.id,
                    provider: info.provider ?? selectedModel.provider,
                    errorKey,
                  },
                })
              }
              get().pushLog(
                'error',
                `[MODEL_ERROR] classification=${classification} provider=${info.provider ?? selectedModel.provider} model=${info.model ?? selectedModel.id} terminal=true`
              )
            }
            get().pushLog('error', `[runtime-trace] error: model=${selectedModel.id} ${chunk.error ?? ''}`)
            if (chunk.referenceErrors?.length) {
              get().pushLog(
                'error',
                `[references] resolution failed: ${chunk.referenceErrors.map((e) => `${e.name}:${e.code}`).join(', ')}`
              )
            }
            // TASK-AI-032: Guard against late exit overwriting a completed response.
            // Once a message has status 'done', it must not be converted to 'error'.
            set((state) => ({
              chats: state.chats.map((c) =>
                c.id === activeChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id === assistantId) {
                          return {
                            ...m,
                            // Only set error status if not already completed
                            status: m.status === 'done' ? 'done' : 'error',
                            executionState: m.status === 'done' ? m.executionState : 'error',
                            content: m.status === 'done' ? m.content : (m.content || modelWarning || chunk.error || 'Error'),
                            lifecycle:
                              m.status === 'done'
                                ? m.lifecycle
                                : pushStage(m.lifecycle, 'failed', chunk.modelError ? 'Provider limit reached' : (chunk.error || 'Execution failed'), 'error'),
                          }
                        }
                        if (m.role === 'user' && chunk.referenceErrors?.length) {
                          return { ...m, referenceErrors: chunk.referenceErrors }
                        }
                        return m
                      }),
                    }
                  : c
              ),
              isStreaming: false,
            }))
          }
        },
        controller.signal,
        selectedModel,
        references,
        get().settings.defaultMode,
        get().settings.defaultVariant || undefined,
        // TASK-OPENCODE-055: The chat's own Project execution context. New Chat is
        // project-empty (undefined → server uses its runtime workspace, no
        // settings.workspacePath fallback). A valid Local Project Path becomes the
        // CLI execution root; a Google Drive folder ID becomes the Drive boundary.
        activeChat?.project
      )
    }

    try {
      await executePrompt(realSessionId)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === activeChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, status: 'error', content: String((err as Error).message) }
                      : m
                  ),
                }
              : c
          ),
          isStreaming: false,
        }))
      }
    } finally {
      set({ abortController: null })
      saveChats(get().chats)
    }
  },

  stopGeneration: () => {
    get().abortController?.abort()
    set({ isStreaming: false })
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === state.activeChatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.status === 'streaming'
                  ? {
                      ...m,
                      status: 'cancelled',
                      // TASK-OPENCODE-050: Cancelled is a first-class lifecycle state.
                      executionState: 'cancelled',
                      lifecycle: pushStage(m.lifecycle, 'interrupted', 'Execution stopped', 'error'),
                    }
                  : m
              ),
            }
          : c
      ),
    }))
    get().pushLog('info', 'Generation stopped.')
  },

  retryLast: async () => {
    const chat = get().chats.find((c) => c.id === get().activeChatId)
    if (!chat) return
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user')
    if (lastUser) await get().editAndResend(lastUser.id, lastUser.content, lastUser.references)
  },

  editAndResend: async (messageId, text, references) => {
    const { activeChatId } = get()
    if (!activeChatId) return
    // Remove this message and everything after it, then append the edited user
    // message and regenerate.
    set((state) => ({
      chats: state.chats.map((c) => {
        if (c.id !== activeChatId) return c
        const idx = c.messages.findIndex((m) => m.id === messageId)
        if (idx === -1) return c
        const kept = c.messages.slice(0, idx)
        return {
          ...c,
          messages: [
            ...kept,
            {
              id: newId('msg'),
              role: 'user' as const,
              content: text,
              createdAt: new Date().toISOString(),
              references,
            },
          ],
          updatedAt: new Date().toISOString(),
        }
      }),
    }))
    await get().sendMessage(text, references)
  },

  continueGeneration: async () => {
    const chat = get().chats.find((c) => c.id === get().activeChatId)
    if (!chat) return
    await get().sendMessage('Please continue.')
  },

  clearConversation: () => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === state.activeChatId ? { ...c, messages: [] } : c
      ),
    }))
    saveChats(get().chats)
  },

  setProviderErrorModalOpen: (open) => set((s) => ({
    providerErrorModal: { ...s.providerErrorModal, open },
    // TASK-085R3: remember the dismissed key so late duplicate terminal
    // chunks cannot reopen the dialog after Close/Esc/X/CTA.
    ...(open ? {} : { dismissedProviderErrorKey: s.providerErrorModal.errorKey }),
  })),

  clearLogs: () => set({ logs: [], runtimeEvents: [] }),
  clearLocalCache: () => {
    const CLEARABLE_CACHE_KEYS = [
      KEYS.TOOL_HISTORY,
      KEYS.SIDEBAR_COLLAPSED,
      KEYS.MODEL_PREFS,
    ]
    try {
      for (const key of CLEARABLE_CACHE_KEYS) {
        localStorage.removeItem(key)
      }
    } catch {
      /* ignore */
    }
  },
}))

async function ensureRunning(get: () => OpenCodeStore) {
  if (get().session?.state === 'running') return
  await get().launch()
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.trim().split(/\s+/).length * 1.3)
}












