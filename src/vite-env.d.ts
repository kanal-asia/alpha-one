/// <reference types="vite/client" />

interface ElectronAPI {
  pickerReturn: (data: unknown) => void
  onPickerReturn: (callback: (data: any) => void) => () => void
}

interface Window {
  electronAPI?: ElectronAPI
}
