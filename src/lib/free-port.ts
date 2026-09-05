import { createServer } from 'node:net'

/**
 * MSI-069: loopback port primitives shared by the Electron host (and unit
 * tests). Pure Node — no Electron dependency so the selection mechanism is
 * directly testable. Loopback only; nothing here ever binds 0.0.0.0.
 */

/** True when nothing is listening on 127.0.0.1:port. */
export function checkLoopbackPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

/** Allocate a free loopback port via the OS (bind port 0). */
export function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port =
        addr && typeof addr === 'object' && 'port' in addr ? addr.port : 0
      server.close(() => {
        if (port > 0) resolve(port)
        else reject(new Error('OS did not assign a loopback port'))
      })
    })
  })
}
