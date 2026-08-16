import {
  type CompactResult,
  type ModeInfo,
  type ModelInfo,
  type OpenCodeAuthResult,
  type OpenCodeSession,
  type OpenCodeSettings,
  type StreamChunk,
  type TokenMetrics,
  type ToolEvent,
  type UsageStats,
  type WorkspaceInfo,
  type ProviderSummary,
} from '../types'
import type { RuntimeModel } from '@/features/runtime/contract'
import type {
  ReferenceAttachment,
  ReferenceResolutionError,
} from '@/features/ai/references/contract'

/**
 * Transport abstraction for talking to an OpenCode backend.
 *
 * The UI never communicates directly with OpenCode. It goes through this
 * interface so the underlying mechanism (CLI, HTTP, or IPC) can be swapped
 * without touching components. The HTTPTransport communicates with the
 * OpenCode API server (Express + child_process).
 */
export interface OpenCodeTransport {
  healthCheck(): Promise<boolean>
  detectInstallation(executablePath: string): Promise<boolean>
  launchSession(settings: OpenCodeSettings): Promise<OpenCodeSession>
  stopSession(sessionId: string): Promise<void>
  restartSession(sessionId: string, settings: OpenCodeSettings): Promise<OpenCodeSession>
  listWorkspaces(): Promise<WorkspaceInfo[]>
  listModels(): Promise<ModelInfo[]>
  listModes(): Promise<ModeInfo[]>
  sendPrompt(
    sessionId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    model?: RuntimeModel,
    references?: ReferenceAttachment[],
    agent?: string
  ): Promise<void>
  listProviders(): Promise<ProviderSummary[]>
  connectProvider(providerId: string): Promise<OpenCodeAuthResult>
  disconnectProvider(providerId: string): Promise<OpenCodeAuthResult>
  saveApiKey(providerId: string, apiKey: string): Promise<{ ok: boolean }>
  fetchStats(days?: number): Promise<UsageStats | null>
  compactSession(sessionId: string): Promise<CompactResult>
  fetchConfigDefaultAgent(): Promise<string | null>
  getRuntimeWorkspace(): Promise<{ path: string } | null>
}

const API_BASE = '/api/opencode'

function parseSSEBlock(block: string): { event: string; data: unknown } | null {
  let event = 'message'
  let dataLine = ''

  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLine = line.slice(5).trim()
    }
  }

  if (!dataLine) return null
  try {
    const data = JSON.parse(dataLine)
    return { event, data }
  } catch {
    return null
  }
}

function tokensFromEvent(evt: Record<string, unknown>): TokenMetrics | undefined {
  const part = evt.part as Record<string, unknown> | undefined
  const tok = (evt.tokens ?? part?.tokens) as
    | {
        total?: unknown
        input?: unknown
        output?: unknown
        reasoning?: unknown
        cache?: { read?: unknown; write?: unknown }
      }
    | undefined
  if (!tok) return undefined
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    total: num(tok.total),
    input: num(tok.input),
    output: num(tok.output),
    reasoning: num(tok.reasoning),
    cacheRead: num(tok.cache?.read),
    cacheWrite: num(tok.cache?.write),
  }
}

function costFromEvent(evt: Record<string, unknown>): number | undefined {
  const part = evt.part as Record<string, unknown> | undefined
  const cost = typeof evt.cost === 'number' ? evt.cost : typeof part?.cost === 'number' ? part.cost : undefined
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined
}

// ---------------------------------------------------------------------------
// TASK-OPENCODE-030: Safe tool event mapper
// Maps technical tool names to human-readable labels without exposing
// chain-of-thought or raw arguments.
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  read: 'Reading file',
  write: 'Writing file',
  edit: 'Editing file',
  bash: 'Running command',
  glob: 'Searching files',
  grep: 'Searching content',
  todowrite: 'Updating task list',
  webfetch: 'Fetching web content',
  websearch: 'Searching the web',
  task: 'Running subagent',
}

function mapToolToLabel(tool: string, input?: Record<string, unknown>): string {
  const base = TOOL_LABELS[tool] ?? `Using ${tool}`
  // Add safe context for specific tools without exposing sensitive data
  if (tool === 'read' && typeof input?.filePath === 'string') {
    const name = input.filePath.split(/[\\/]/).pop()
    return name ? `Reading ${name}` : base
  }
  if (tool === 'write' && typeof input?.filePath === 'string') {
    const name = input.filePath.split(/[\\/]/).pop()
    return name ? `Writing ${name}` : base
  }
  if (tool === 'edit' && typeof input?.filePath === 'string') {
    const name = input.filePath.split(/[\\/]/).pop()
    return name ? `Editing ${name}` : base
  }
  if (tool === 'glob' && typeof input?.pattern === 'string') {
    return `Searching for ${input.pattern}`
  }
  if (tool === 'bash' && typeof input?.command === 'string') {
    // Show first meaningful part of command, not the full command
    const cmd = input.command.trim()
    if (cmd.startsWith('Get-ChildItem') || cmd.startsWith('ls')) return 'Browsing files'
    if (cmd.startsWith('git ')) return 'Running git'
    if (cmd.includes('Select-String') || cmd.includes('grep')) return 'Searching content'
    return 'Running command'
  }
  return base
}

let toolEventCounter = 0

function makeToolEvent(
  tool: string,
  status: 'running' | 'completed' | 'error',
  input?: Record<string, unknown>,
  detail?: string
): ToolEvent {
  return {
    id: `te-${Date.now()}-${++toolEventCounter}`,
    label: mapToolToLabel(tool, input),
    tool,
    status,
    timestamp: new Date().toISOString(),
    detail,
  }
}

export class HTTPTransport implements OpenCodeTransport {
  private baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  }

  async healthCheck(): Promise<boolean> {
    const res = await this.request<{ cliReachable: boolean }>('/health')
    return res.cliReachable === true
  }

  async detectInstallation(_executablePath: string): Promise<boolean> {
    const res = await this.request<{ cliReachable: boolean }>('/health')
    return res.cliReachable === true
  }

  async launchSession(settings: OpenCodeSettings): Promise<OpenCodeSession> {
    // TASK-AI-033: Session is managed by the CLI, not by the client.
    // We just verify health here. The real session ID is extracted from
    // CLI output events when the first prompt is sent.
    const healthy = await this.healthCheck()
    if (!healthy) throw new Error('OpenCode CLI not available')
    return {
      id: '',  // No fake session ID — real ID comes from CLI output
      workspacePath: settings.workspacePath,
      state: 'running',
      startedAt: new Date().toISOString(),
    }
  }

  async stopSession(_sessionId: string): Promise<void> {
    // No-op for HTTP transport; server manages process lifecycle per request
  }

  async restartSession(_sessionId: string, settings: OpenCodeSettings): Promise<OpenCodeSession> {
    return this.launchSession(settings)
  }

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    // Workspaces are managed client-side; return empty for now
    return []
  }

  async getRuntimeWorkspace(): Promise<{ path: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runtime/workspace`)
      if (!res.ok) return null
      const data = await res.json()
      return data.workspace ?? null
    } catch {
      return null
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.request<{ models: RuntimeModel[] }>('/models')
    return res.models.map((m) => ({
      ...m,
      availability:
        m.availability === 'available'
          ? 'available'
          : m.availability === 'unavailable'
            ? 'unavailable'
            : 'limited',
      latency:
        m.latency === 'low'
          ? 'low'
          : m.latency === 'high'
            ? 'high'
            : 'medium',
    }))
  }

  async listModes(): Promise<ModeInfo[]> {
    const res = await this.request<{ modes: ModeInfo[] }>('/modes')
    return res.modes
  }

  async listProviders(): Promise<ProviderSummary[]> {
    const res = await this.request<{ providers: ProviderSummary[] }>('/providers')
    return res.providers
  }

  async connectProvider(providerId: string): Promise<OpenCodeAuthResult> {
    const res = await fetch(`${this.baseUrl}${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: providerId }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  }

  async disconnectProvider(providerId: string): Promise<OpenCodeAuthResult> {
    const res = await fetch(`${this.baseUrl}${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: providerId }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  }

  async fetchStats(days?: number): Promise<UsageStats | null> {
    const qs = days && days > 0 ? `?days=${Math.min(365, Math.floor(days))}` : ''
    const res = await this.request<{ stats: UsageStats | null }>(`/stats${qs}`)
    return res.stats
  }

  async compactSession(sessionId: string): Promise<CompactResult> {
    const res = await this.request<CompactResult>(
      `/session/${encodeURIComponent(sessionId)}/compact`,
      { method: 'POST' }
    )
    return res
  }

  async saveApiKey(providerId: string, apiKey: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('/auth/key', {
      method: 'POST',
      body: JSON.stringify({ provider: providerId, apiKey }),
    })
  }

  async fetchConfigDefaultAgent(): Promise<string | null> {
    const res = await this.request<{ config?: Record<string, unknown> }>('/config')
    const v = res.config?.default_agent
    return typeof v === 'string' && (v === 'build' || v === 'plan') ? v : null
  }

  /* eslint-disable no-console -- TEMPORARY debug logging for TASK instrumentation */
  async sendPrompt(
    sessionId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    model?: RuntimeModel,
    references?: ReferenceAttachment[],
    agent?: string,
    variant?: string
  ): Promise<void> {
    const modelId = model?.id ?? ''
    // TASK-AI-033: Only pass session ID to server if it looks like a real CLI session ID.
    // Client-generated IDs (session-*) should NOT be sent to the CLI.
    const realSessionId = sessionId && !sessionId.startsWith('session-') ? sessionId : ''
    // TASK-AIASSISTANT-005: send reference metadata only — no binary content.
    const refs = (references ?? []).map((r) => ({
      provider: r.provider,
      name: r.name,
      mimeType: r.mimeType,
      size: r.size,
      path: r.provider === 'local' ? r.path : undefined,
      fileId: r.provider === 'google_drive' ? r.fileId : undefined,
      modifiedTime: r.modifiedTime,
    }))
    const res = await fetch(`${this.baseUrl}${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        message: prompt,
        sessionId: realSessionId || undefined,
        references: refs,
        agent: agent ?? undefined,
        variant: variant || undefined,
      }),
      signal,
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string
        referenceErrors?: ReferenceResolutionError[]
      }
      onChunk({
        type: 'error',
        error: err.error ?? `HTTP ${res.status}`,
        referenceErrors: err.referenceErrors,
      })
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      onChunk({ type: 'error', error: 'No response body' })
      return
    }

    let buffer = ''
    let chunkCount = 0
    let tokenEvents = 0
    let textTokens = 0
    let totalText = ''
    const decoder = new TextDecoder()

    // TASK-AI-032: Runtime success contract.
    // A successful execution is defined by: received text AND received step_finish.
    // Exit code alone is not sufficient to determine success or failure.
    let stepFinishReceived = false
    let responseCompleted = false

    const requestStart = Date.now()
    let firstTextAt: number | null = null
    let stepFinishAt: number | null = null
    console.log('[OC-TRANSPORT] STREAM START', { modelId, requestStart })

    while (true) {
      // TASK-AI-034: Exit the read loop immediately when the response is complete.
      // step_finish signals the AI response lifecycle is done. The remaining
      // stream (exit event, stdio close) is process cleanup, not response data.
      // Waiting for stream close adds 15-16s latency on Windows.
      if (responseCompleted) {
        console.log('[OC-TRANSPORT] RESPONSE COMPLETE — exiting read loop', {
          chunkCount,
          tokenEvents,
          textTokens,
          totalTextLength: totalText.length,
          totalLatencyMs: Date.now() - requestStart,
          stepFinishToExitMs: Date.now() - (stepFinishAt ?? Date.now()),
        })
        break
      }

      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      buffer += chunk
      chunkCount++

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        if (!block.trim()) continue
        const parsed = parseSSEBlock(block)
        if (!parsed) {
          console.log('[OC-TRANSPORT] SSE PARSE FAILED', { block: block.slice(0, 200) })
          continue
        }

        tokenEvents++

        switch (parsed.event) {
          case 'token': {
            const evt = parsed.data as Record<string, unknown>
            const part = evt.part as Record<string, unknown> | undefined
            const evtType = String(evt.type ?? '')
            const partText = typeof part?.text === 'string' ? part.text : ''
            const topText = typeof evt.text === 'string' ? evt.text : ''
            const text = topText || partText

            console.log('[OC-TRANSPORT] TOKEN', {
              eventType: evtType,
              hasTopText: !!topText,
              hasPartText: !!partText,
              extractedText: text.slice(0, 80),
              textLength: text.length,
            })

            // TASK-OPENCODE-030: Emit tool events for progress display.
            // Only emit for tool_use events — never for reasoning/text parts.
            if (evtType === 'tool_use') {
              const toolPart = (part?.type === 'tool' ? part : undefined) as
                | { tool?: string; state?: { input?: Record<string, unknown>; status?: string } }
                | undefined
              const toolName = toolPart?.tool
              if (toolName) {
                const toolInput = toolPart?.state?.input as Record<string, unknown> | undefined
                const toolStatus = toolPart?.state?.status === 'completed' ? 'completed'
                  : toolPart?.state?.status === 'error' ? 'error'
                  : 'running'
                onChunk({
                  type: 'tool_event',
                  toolEvent: makeToolEvent(toolName, toolStatus, toolInput),
                })
              }
            }

            if (text) {
              textTokens++
              totalText += text
              if (firstTextAt === null) firstTextAt = Date.now()
              onChunk({ type: 'token', content: text })
            }
            break
          }
          case 'file_operation': {
            const data = parsed.data as Record<string, unknown>
            const filePath = String(data.filePath ?? '')
            const tool = String(data.tool ?? '')
            if (filePath) {
              console.log('[OC-TRANSPORT] FILE_OPERATION', { tool, filePath })
              onChunk({ type: 'file_operation', filePath, fileTool: tool })
            }
            break
          }
          case 'step_finish':
            stepFinishReceived = true
            stepFinishAt = Date.now()
            if (totalText.length > 0) {
              responseCompleted = true
            }
            console.log('[OC-TRANSPORT] STEP_FINISH', {
              tokenEvents,
              textTokens,
              totalTextLength: totalText.length,
              responseCompleted,
              latencyMs: stepFinishAt - requestStart,
              firstTextLatencyMs: firstTextAt ? stepFinishAt - firstTextAt : null,
            })
            // TASK-ALPHAONE-007: surface native usage (tokens/cost) reported by
            // the runtime instead of dropping it at the transport boundary.
            onChunk({
              type: 'done',
              tokens: tokensFromEvent(parsed.data as Record<string, unknown>),
              cost: costFromEvent(parsed.data as Record<string, unknown>),
            })
            break
          case 'error': {
            const { message } = parsed.data as { message: string }
            console.log('[OC-TRANSPORT] ERROR EVENT', { message, responseCompleted })
            // TASK-AI-032: Only emit error if response has NOT already completed.
            if (!responseCompleted) {
              onChunk({ type: 'error', error: message })
            } else {
              console.log('[OC-TRANSPORT] ERROR SUPPRESSED (response already completed)', { message })
            }
            break
          }
          case 'exit': {
            const { code } = parsed.data as { code: number }
            console.log('[OC-TRANSPORT] EXIT EVENT', {
              code,
              tokenEvents,
              textTokens,
              totalTextLength: totalText.length,
              stepFinishReceived,
              responseCompleted,
            })
            // TASK-OPENCODE-030: Emit exit code for execution state tracking.
            onChunk({ type: 'exit_code', exitCode: code })
            // TASK-AI-032: New decision model.
            // SUCCESS: responseCompleted = true → ignore non-zero exit code.
            // FAILURE: responseCompleted = false AND code !== 0 → emit error.
            // DIAGNOSTIC: responseCompleted = true AND code !== 0 → emit warning (not error).
            if (responseCompleted) {
              if (code !== 0) {
                // Late exit after successful completion — diagnostic warning only.
                onChunk({
                  type: 'warning',
                  error: `Process exited with code ${code} after successful completion.`,
                })
              }
              // Response is complete. Exit event is informational only.
            } else if (code !== 0) {
              // Response incomplete and process failed — emit error.
              onChunk({ type: 'error', error: `OpenCode exited with code ${code}` })
            }
            break
          }
          case 'session': {
            const { sessionId: realSessionId } = parsed.data as { sessionId: string }
            console.log('[OC-TRANSPORT] SESSION EVENT', { realSessionId })
            onChunk({ type: 'session', sessionId: realSessionId })
            break
          }
          case 'stderr': {
            const { data } = parsed.data as { data: string }
            console.log('[OC-TRANSPORT] STDERR', { data: data.slice(0, 200) })
            // TASK-AI-033: Detect "Session not found" errors from CLI stderr.
            // This indicates the session ID is invalid. The store will handle retry.
            if (data.includes('Session not found')) {
              onChunk({ type: 'error', error: 'Session not found' })
            }
            break
          }
          case 'cancelled':
            console.log('[OC-TRANSPORT] CANCELLED')
            if (!responseCompleted) {
              onChunk({ type: 'error', error: 'Request cancelled' })
            }
            break
          default:
            console.log('[OC-TRANSPORT] UNKNOWN EVENT', { event: parsed.event })
        }
      }
    }

    console.log('[OC-TRANSPORT] STREAM END', {
      chunkCount,
      tokenEvents,
      textTokens,
      totalTextLength: totalText.length,
      stepFinishReceived,
      responseCompleted,
      totalLatencyMs: Date.now() - requestStart,
      firstTextLatencyMs: firstTextAt ? firstTextAt - requestStart : null,
      stepFinishLatencyMs: stepFinishAt ? stepFinishAt - requestStart : null,
    })
  }
  /* eslint-enable no-console */
}