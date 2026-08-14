import { createContext, useContext, useState } from 'react'
import { getCookie, setCookie } from '@/lib/cookies'

// Cookie following the pattern from layout-provider.tsx
const DEVELOPER_MODE_COOKIE_NAME = 'developer_mode'
const DEVELOPER_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

const DEFAULT_DEVELOPER_MODE = false

type DeveloperModeContextType = {
  defaultDeveloperMode: boolean
  developerMode: boolean
  setDeveloperMode: (enabled: boolean) => void
  resetDeveloperMode: () => void
}

const DeveloperModeContext = createContext<DeveloperModeContextType | null>(null)

type DeveloperModeProviderProps = {
  children: React.ReactNode
}

export function DeveloperModeProvider({
  children,
}: DeveloperModeProviderProps) {
  const [developerMode, _setDeveloperMode] = useState<boolean>(() => {
    return getCookie(DEVELOPER_MODE_COOKIE_NAME) === 'on'
  })

  const setDeveloperMode = (enabled: boolean) => {
    _setDeveloperMode(enabled)
    setCookie(
      DEVELOPER_MODE_COOKIE_NAME,
      enabled ? 'on' : 'off',
      DEVELOPER_MODE_COOKIE_MAX_AGE
    )
  }

  const resetDeveloperMode = () => {
    setDeveloperMode(DEFAULT_DEVELOPER_MODE)
  }

  const contextValue: DeveloperModeContextType = {
    defaultDeveloperMode: DEFAULT_DEVELOPER_MODE,
    developerMode,
    setDeveloperMode,
    resetDeveloperMode,
  }

  return (
    <DeveloperModeContext value={contextValue}>
      {children}
    </DeveloperModeContext>
  )
}

// Define the hook for the provider
// eslint-disable-next-line react-refresh/only-export-components
export function useDeveloperMode() {
  const context = useContext(DeveloperModeContext)
  if (!context) {
    throw new Error(
      'useDeveloperMode must be used within a DeveloperModeProvider'
    )
  }
  return context
}
