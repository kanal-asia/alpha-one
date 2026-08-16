/**
 * Alpha Workspace — Workflow Engine (TASK-ENGINEERING-002)
 *
 * Executes a WorkflowDefinition sequentially. For every step it:
 *   1. resolves the registered Operation,
 *   2. merges accumulated data + step static input,
 *   3. builds the Execution Context and publishes operation.started,
 *   4. invokes the handler (with optional timeout + retry policy),
 *   5. publishes operation.completed and records produced artifact ids,
 *   6. merges the output data for the next step.
 *
 * The engine is fully generic: every business capability is expressed as a
 * registry entry, never as engine code. Adding a workflow requires ZERO engine
 * changes.
 *
 * Deliberately NOT implemented (out of scope): conditionals, loops, parallelism,
 * sub-workflows, scheduling.
 */
import type { ArtifactService } from '../artifacts/service'
import type { ArtifactType } from '../artifacts/types'
import { nextEventId, type EventBus } from '../events/bus'
import type { OperationDefinition, OperationRegistry } from '../registries/operation-registry'
import type { RuntimeGateway } from '../runtime/gateway'
import type { WorkflowDefinition, WorkflowRun, WorkflowStepRun } from './types'

interface EngineContext {
  kernel: { id: string; version: string }
  runId: string
  taskId: string | null
  workspace: { id: string; name: string; path: string }
  workflow: { id: string; name: string; version: string }
  user: { id: string; name: string; role: string }
  runtime: RuntimeGateway
  configuration: Record<string, unknown>
  variables: Record<string, unknown>
  artifactRefs: Array<{ id: string; name: string; type: ArtifactType; format: string }>
  artifacts: ArtifactService
}

interface OperationOutcome {
  ok: boolean
  data: Record<string, unknown>
  artifactIds?: string[]
  error?: string
}

export interface WorkflowEngine {
  run(
    def: WorkflowDefinition,
    opts: {
      runId: string
      taskId: string | null
      input: Record<string, unknown>
      workspace: { id: string; name: string; path: string }
      user?: { id: string; name: string; role: string }
      configuration?: Record<string, unknown>
    },
  ): Promise<WorkflowRun>
}

export function createWorkflowEngine(opts: {
  registry: OperationRegistry
  artifacts: ArtifactService
  runtime: RuntimeGateway
  events: EventBus
  kernel?: { id: string; version: string }
}): WorkflowEngine {
  const { registry, artifacts, runtime, events } = opts
  const kernel = opts.kernel ?? { id: 'alpha-one', version: '0.1.0' }

  return {
    async run(def, runOpts) {
      const { runId, taskId, input, workspace } = runOpts
      const user = runOpts.user ?? { id: 'user', name: 'Workspace User', role: 'user' }
      const configuration = runOpts.configuration ?? {}
      const startedAtIso = new Date().toISOString()

      const run: WorkflowRun = {
        id: runId,
        workflowId: def.id,
        taskId,
        status: 'running',
        startedAt: startedAtIso,
        completedAt: null,
        input: { ...input },
        output: {},
        steps: [],
        error: null,
      }

      events.publish({
        id: nextEventId(),
        type: 'workflow.started',
        ts: startedAtIso,
        actor: 'workflow',
        target: runId,
        detail: { workflowId: def.id, steps: def.steps.length },
      })

      const ctx: EngineContext = {
        kernel,
        runId,
        taskId,
        workspace,
        workflow: { id: def.id, name: def.name, version: def.version },
        user,
        runtime,
        configuration,
        variables: {},
        artifactRefs: [],
        artifacts,
      }

      let acc: Record<string, unknown> = { ...input }

      for (const step of def.steps) {
        const stepRun: WorkflowStepRun = {
          stepId: step.id,
          operationId: step.operationId,
          label: step.label,
          status: 'running',
          startedAt: new Date().toISOString(),
          completedAt: null,
          input: { ...acc, ...(step.input ?? {}) },
          output: {},
          artifactIds: [],
          error: null,
        }
        run.steps.push(stepRun)

        const op = registry.get(step.operationId)
        publishStart(step, op)

        if (!op) {
          const error = `Unknown operation "${step.operationId}" for step "${step.id}".`
          finishStep(stepRun, 'failed', error)
          publishStepEnd(stepRun, null)
          failRun(run, def, error)
          break
        }

        try {
          const outcome = await executeWithPolicy(op, ctx, stepRun.input)
          stepRun.output = outcome.data
          stepRun.artifactIds = outcome.artifactIds ?? []
          acc = { ...acc, ...outcome.data }
          for (const aid of stepRun.artifactIds) {
            const rec = artifacts.get(aid)
            if (rec && !ctx.artifactRefs.some((r) => r.id === aid)) {
              ctx.artifactRefs.push({ id: rec.id, name: rec.name, type: rec.type, format: rec.format })
            }
          }          if (outcome.ok) {
            finishStep(stepRun, 'completed', null)
          } else {
            const error = outcome.error ?? `Operation "${step.operationId}" failed.`
            finishStep(stepRun, 'failed', error)
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : `Operation "${step.operationId}" threw.`
          finishStep(stepRun, 'failed', error)
        }

        publishStepEnd(stepRun, op)

        if (stepRun.status === 'failed') {
          failRun(run, def, stepRun.error ?? 'step failed')
          break
        }
      }

      const completed = run.steps.every((s) => s.status === 'completed')
      if (completed) {
        run.status = 'completed'
        run.output = acc
      } else if (run.status === 'running') {
        run.status = 'failed'
        run.error = run.error ?? 'Workflow ended without completing all steps.'
      }
      run.completedAt = new Date().toISOString()

      if (run.status === 'completed') {
        events.publish({
          id: nextEventId(),
          type: 'workflow.completed',
          ts: run.completedAt,
          actor: 'workflow',
          target: runId,
          detail: {
            workflowId: def.id,
            status: 'completed',
            steps: def.steps.length,
            completedSteps: run.steps.length,
            error: null,
          },
        })
      }
      return run
    },
  }

  function publishStart(step: WorkflowDefinition['steps'][number], op: OperationDefinition | null) {
    events.publish({
      id: nextEventId(),
      type: 'operation.started',
      ts: new Date().toISOString(),
      actor: 'operation',
      target: step.operationId,
      detail: { operationId: step.operationId, stepId: step.id, sdkId: op?.sdkOwner },
    })
    if (op?.sdkOwner) {
      events.publish({
        id: nextEventId(),
        type: 'sdk.started',
        ts: new Date().toISOString(),
        actor: 'sdk',
        target: op.sdkOwner,
        detail: { sdkId: op.sdkOwner, operationId: step.operationId, stepId: step.id },
      })
    }
  }

  function publishStepEnd(stepRun: WorkflowStepRun, op: OperationDefinition | null) {
    const ok = stepRun.status === 'completed'
    const durationMs = ok
      ? Math.max(0, Date.now() - new Date(stepRun.startedAt ?? Date.now()).getTime())
      : Math.max(0, Date.now() - new Date(stepRun.startedAt ?? Date.now()).getTime())
    events.publish({
      id: nextEventId(),
      type: 'operation.completed',
      ts: stepRun.completedAt ?? new Date().toISOString(),
      actor: 'operation',
      target: stepRun.operationId,
      detail: {
        operationId: stepRun.operationId,
        stepId: stepRun.stepId,
        sdkId: op?.sdkOwner,
        ok,
        artifactIds: stepRun.artifactIds,
        durationMs,
      },
    })
    if (op?.sdkOwner) {
      events.publish({
        id: nextEventId(),
        type: 'sdk.completed',
        ts: stepRun.completedAt ?? new Date().toISOString(),
        actor: 'sdk',
        target: op.sdkOwner,
        detail: { sdkId: op.sdkOwner, operationId: stepRun.operationId, stepId: stepRun.stepId, ok, durationMs },
      })
    }
  }

  function finishStep(stepRun: WorkflowStepRun, status: 'completed' | 'failed', error: string | null) {
    stepRun.status = status
    stepRun.error = error
    stepRun.completedAt = new Date().toISOString()
  }

  function failRun(run: WorkflowRun, def: WorkflowDefinition, error: string) {
    run.status = 'failed'
    run.error = error
    const completedSteps = run.steps.filter((s) => s.status === 'completed').length
    events.publish({
      id: nextEventId(),
      type: 'error.occurred',
      ts: new Date().toISOString(),
      actor: 'workflow',
      target: run.id,
      detail: { source: 'workflow.engine', message: error, runId: run.id },
    })
    events.publish({
      id: nextEventId(),
      type: 'workflow.failed',
      ts: new Date().toISOString(),
      actor: 'workflow',
      target: run.id,
      detail: { workflowId: def.id, steps: def.steps.length, completedSteps, error },
    })
    events.publish({
      id: nextEventId(),
      type: 'workflow.completed',
      ts: new Date().toISOString(),
      actor: 'workflow',
      target: run.id,
      detail: { workflowId: def.id, status: 'failed', steps: def.steps.length, completedSteps, error },
    })
  }
}

function executeWithPolicy(
  op: OperationDefinition,
  ctx: EngineContext,
  stepInput: Record<string, unknown>,
): Promise<OperationOutcome> {
  const attempts = op.retryPolicy?.attempts ?? 1
  const timeoutMs = op.timeoutMs

  return (async () => {
    let lastError: unknown
    let lastResult: OperationOutcome | undefined
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const call = () =>
          timeoutMs ? withTimeout(op.handler(ctx, stepInput), timeoutMs) : op.handler(ctx, stepInput)
        lastResult = await call()
        if (lastResult.ok || attempt === attempts - 1) {
          return lastResult
        }
        lastError = new Error(lastResult.error ?? `Operation "${op.id}" failed.`)
      } catch (err) {
        lastError = err
      }
      if (attempt < attempts - 1) {
        await sleep(op.retryPolicy?.backoffMs ?? 0)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  })()
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms.`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
