/**
 * Alpha Workspace ΓÇö Runtime Gateway
 *
 * The single entry point operations use to invoke AI capabilities. The gateway
 * resolves a runtime by id, guards availability, and wraps the call so the
 * Workflow Engine / event bus see a uniform `runtime.started` / `runtime.completed`
 * pair.
 */
import type { EventBus } from '../events/bus'
import type { RuntimeAdapter, RuntimeContext, RuntimeRegistry } from './contract'

export interface RuntimeGateway {
  /** Runs a capability on the named runtime. Returns a structured result. */
  run(runtimeId: string, ctx: RuntimeContext): Promise<RuntimeResult>
  available(): Promise<Array<{ id: string; label: string; available: boolean }>>
}

interface RuntimeResult {
  ok: boolean
  data: Record<string, unknown>
  error: string | null
  runtimeId: string
  capability: string
  durationMs: number
  usage?: RuntimeContext['input']
}

export function createRuntimeGateway(
  registry: RuntimeRegistry,
  events: EventBus,
): RuntimeGateway {
  return {
    async run(runtimeId, ctx) {
      const adapter: RuntimeAdapter | null = registry.get(runtimeId)
      if (!adapter) {
        return {
          ok: false,
          data: {},
          error: `Unknown runtime: ${runtimeId}`,
          runtimeId,
          capability: ctx.capability,
          durationMs: 0,
        }
      }

      const startedAt = Date.now()
      events.publish({
        id: `rt-${startedAt}`,
        type: 'runtime.started',
        ts: new Date(startedAt).toISOString(),
        actor: 'runtime',
        target: runtimeId,
        detail: { runtimeId, capability: ctx.capability },
      })

      try {
        const available = await adapter.isAvailable()
        if (!available) {
          throw new Error(`Runtime "${runtimeId}" is not available.`)
        }
        const result = await adapter.run(ctx)
        const durationMs = Date.now() - startedAt
        events.publish({
          id: `rt-${Date.now()}`,
          type: 'runtime.completed',
          ts: new Date().toISOString(),
          actor: 'runtime',
          target: runtimeId,
          detail: {
            runtimeId,
            capability: ctx.capability,
            ok: result.ok,
            error: result.error ?? null,
          },
        })
        return {
          ok: result.ok,
          data: result.data,
          error: result.ok ? null : (result.error ?? 'Runtime returned a failure.'),
          runtimeId,
          capability: ctx.capability,
          durationMs,
          usage: result.usage as RuntimeResult['usage'],
        }
      } catch (err) {
        const durationMs = Date.now() - startedAt
        const message = err instanceof Error ? err.message : 'Runtime execution failed.'
        events.publish({
          id: `rt-${Date.now()}`,
          type: 'runtime.completed',
          ts: new Date().toISOString(),
          actor: 'runtime',
          target: runtimeId,
          detail: { runtimeId, capability: ctx.capability, ok: false, error: message },
        })
        events.publish({
          id: `rt-${Date.now()}-failed`,
          type: 'runtime.failed',
          ts: new Date().toISOString(),
          actor: 'runtime',
          target: runtimeId,
          detail: { runtimeId, capability: ctx.capability, error: message, durationMs },
        })
        return {
          ok: false,
          data: {},
          error: message,
          runtimeId,
          capability: ctx.capability,
          durationMs,
        }
      }
    },

    async available() {
      const out: Array<{ id: string; label: string; available: boolean }> = []
      for (const adapter of registry.list()) {
        let available: boolean
        try {
          available = await adapter.isAvailable()
        } catch {
          available = false
        }
        out.push({ id: adapter.id, label: adapter.label, available })
      }
      return out
    },
  }
}
