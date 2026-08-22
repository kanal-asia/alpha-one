/**
 * Alpha Workspace ΓÇö OpenCode Runtime Adapter
 *
 * First runtime adapter for the platform. Implements the RuntimeAdapter
 * contract by delegating to the OpenCode CLI. It only receives capabilities,
 * context, artifact references and a credential reference ΓÇö never artifact
 * bytes.
 *
 * Node-only (imports the OpenCode client which uses node:child_process).
 */
import {
  detectProviderStatus,
  resolveOpenCode,
  runOpenCode,
} from '../../../services/opencode/client'
import type {
  RuntimeAdapter,
  RuntimeContext,
  RuntimeResult,
} from '../contract'

const CAPABILITY_PROMPTS: Record<string, string> = {
  summarize:
    'Write a concise executive summary (3-5 sentences) of the data provided. Return only the summary text.',
}

export function createOpenCodeRuntimeAdapter(): RuntimeAdapter {
  return {
    id: 'opencode',
    label: 'OpenCode',
    async isAvailable() {
      const status = await detectProviderStatus(false)
      return status.state === 'installed'
    },
    async run(ctx: RuntimeContext): Promise<RuntimeResult> {
      const prompt = CAPABILITY_PROMPTS[ctx.capability]
      if (!prompt) {
        return { ok: false, data: {}, error: `Unsupported capability: ${ctx.capability}` }
      }

      const resolved = resolveOpenCode()
      if (!resolved) {
        return { ok: false, data: {}, error: 'OpenCode CLI not found.' }
      }

      const payload = JSON.stringify({ context: ctx.input, artifactRefs: ctx.artifacts.map((a) => a.id) })
      const message = `${prompt}\n\nDATA:\n${payload}`

      const out = await runOpenCode(['run', message, '--format', 'json'], 45_000)
      if (out == null) {
        return { ok: false, data: {}, error: 'OpenCode produced no output.' }
      }

      // `--format json` emits one JSON event per line; join message text.
      const text = out
        .split(/\r?\n/)
        .map((line: string) => {
          try {
            const evt = JSON.parse(line) as { text?: string; part?: { text?: string } }
            return evt.text ?? evt.part?.text ?? ''
          } catch {
            return line
          }
        })
        .filter(Boolean)
        .join(' ')
        .trim()

      return { ok: true, data: { summary: text || null } }
    },
  }
}
