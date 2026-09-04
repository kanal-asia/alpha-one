/// <reference types="vite/client" />

interface DesktopCommandPayload {
  id: string
  path?: string
}

interface ElectronAPI {
  pickerReturn: (data: unknown) => void
  onPickerReturn: (callback: (data: any) => void) => () => void
  /** MSI-067: Electron host → renderer desktop commands (menu/shortcuts). */
  onDesktopCommand?: (callback: (cmd: DesktopCommandPayload) => void) => () => void
}

interface Window {
  electronAPI?: ElectronAPI
}
