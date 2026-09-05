import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  allocateLoopbackPort,
  checkLoopbackPortFree,
} from './free-port'

/**
 * MSI-069: loopback port mechanism proof. The Electron host prefers 3001 and
 * falls back to OS allocation when a foreign process owns it — these tests
 * prove the primitives that decision is built on.
 */
describe('loopback port primitives', () => {
  it('allocateLoopbackPort returns a bindable loopback port', async () => {
    const port = await allocateLoopbackPort()
    expect(port).toBeGreaterThan(0)
    // The allocated port is genuinely free: binding succeeds.
    await new Promise<void>((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve())
      })
    })
  })

  it('checkLoopbackPortFree tracks actual occupancy', async () => {
    const port = await allocateLoopbackPort()
    expect(await checkLoopbackPortFree(port)).toBe(true)

    const holder = createServer()
    await new Promise<void>((resolve) => {
      holder.listen(port, '127.0.0.1', () => resolve())
    })
    try {
      expect(await checkLoopbackPortFree(port)).toBe(false)
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()))
    }
    expect(await checkLoopbackPortFree(port)).toBe(true)
  })

  it('occupied preferred port yields a different alternate port', async () => {
    // Simulate the MSI collision: a foreign owner holds the preferred port.
    const preferred = await allocateLoopbackPort()
    const foreign = createServer()
    await new Promise<void>((resolve) => {
      foreign.listen(preferred, '127.0.0.1', () => resolve())
    })
    try {
      expect(await checkLoopbackPortFree(preferred)).toBe(false)
      const alternate = await allocateLoopbackPort()
      expect(alternate).not.toBe(preferred)
      expect(await checkLoopbackPortFree(alternate)).toBe(true)
    } finally {
      await new Promise<void>((resolve) => foreign.close(() => resolve()))
    }
  })
})
