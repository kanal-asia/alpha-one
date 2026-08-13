import { OpenCodeDashboard } from './opencode/components/opencode-page'
import { OpenCodeSettingsPage } from './opencode/components/settings-page'
import { KiloCodePage as KiloCodePageImpl } from './components/kilo-code-page'

export function OpenCodePage() {
  return <OpenCodeDashboard />
}

export function OpenCodeSettings() {
  return <OpenCodeSettingsPage />
}

export function KiloCodePage() {
  return <KiloCodePageImpl />
}

export { PromptLibraryPage } from './components/prompt-library-page'
