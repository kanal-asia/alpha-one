import { CliProvider } from './CliProvider'
import { type ProviderInfo } from './types/Provider'

const info: ProviderInfo = {
  id: 'kilo-code',
  name: 'Kilo Code',
  description: 'AI pair programmer for code completion and refactoring.',
  version: '1.0.0',
  category: 'ai',
}

export class KiloCodeProvider extends CliProvider {
  constructor(config?: Partial<import('./types/Provider').ProviderConfig>) {
    super(info, config)
  }

  async readVersion(): Promise<string | null> {
    return this.config.executablePath ? '1.0.0' : null
  }
}
