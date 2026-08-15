import {
  type CompactResult,
  type ExecutionLogEntry,
  type ModeInfo,
  type ModelInfo,
  type OpenCodeAuthResult,
  type OpenCodeSettings,
  type StreamChunk,
  type UsageStats,
  type ProviderSummary,
} from '../types'
import { HTTPTransport, type OpenCodeTransport } from './http-transport'
import type { RuntimeModel } from '@/features/runtime/contract'
import type { ReferenceAttachment } from '@/features/ai/references/contract'

/**
 * OpenCodeService coordinates the transport layer for the UI.
 *
 * Responsibilities: detect installation, launch/stop/restart sessions,
 * workspace management, health checks, and prompt streaming. Components and
 * the store depend only on this service, never on a concrete transport.
 */
export class OpenCodeService {
  private transport: OpenCodeTransport
  private logs: ExecutionLogEntry[] = []

  constructor(transport?: OpenCodeTransport) {
    this.transport = transport ?? new HTTPTransport()
  }

  setTransport(transport: OpenCodeTransport) {
    this.transport = transport
  }

  async healthCheck() {
    return this.transport.healthCheck()
  }

  async detectInstallation(executablePath: string) {
    return this.transport.detectInstallation(executablePath)
  }

  async launchSession(settings: OpenCodeSettings) {
    return this.transport.launchSession(settings)
  }

  async stopSession(sessionId: string) {
    return this.transport.stopSession(sessionId)
  }

  async restartSession(sessionId: string, settings: OpenCodeSettings) {
    return this.transport.restartSession(sessionId, settings)
  }

  async listWorkspaces() {
    return this.transport.listWorkspaces()
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.transport.listModels()
  }

  async listModes(): Promise<ModeInfo[]> {
    return this.transport.listModes()
  }

  async listProviders(): Promise<ProviderSummary[]> {
    return this.transport.listProviders()
  }

  async connectProvider(providerId: string): Promise<OpenCodeAuthResult> {
    return this.transport.connectProvider(providerId)
  }

  async disconnectProvider(providerId: string): Promise<OpenCodeAuthResult> {
    return this.transport.disconnectProvider(providerId)
  }

  async saveApiKey(providerId: string, apiKey: string): Promise<{ ok: boolean }> {
    return this.transport.saveApiKey(providerId, apiKey)
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
    model?: RuntimeModel,
    references?: ReferenceAttachment[],
    agent?: string,
    variant?: string
  ) {
    return this.transport.sendPrompt(sessionId, prompt, onChunk, signal, model, references, agent, variant)
  }

  async fetchStats(days?: number): Promise<UsageStats | null> {
    return this.transport.fetchStats(days)
  }

  async compactSession(sessionId: string): Promise<CompactResult> {
    return this.transport.compactSession(sessionId)
  }

  async fetchConfigDefaultAgent(): Promise<string | null> {
    return this.transport.fetchConfigDefaultAgent()
  }

  getLogs() {
    return this.logs
  }

  log(level: ExecutionLogEntry['level'], message: string) {
    this.logs = [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        level,
        message,
        createdAt: new Date().toISOString(),
      },
      ...this.logs,
    ]
    return this.logs[0]
  }

  clearLogs() {
    this.logs = []
  }
}

export const openCodeService = new OpenCodeService()
