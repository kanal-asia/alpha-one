import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  pickerReturn: (data: unknown) => {
    ipcRenderer.send('picker:select', data)
  },
  onPickerReturn: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on('picker:return', handler)
    return () => {
      ipcRenderer.removeListener('picker:return', handler)
    }
  },
  // MSI-067: Electron host → renderer desktop commands (menu/shortcuts).
  onDesktopCommand: (callback: (cmd: { id: string; path?: string }) => void) => {
    const handler = (_event: unknown, cmd: { id: string; path?: string }) =>
      callback(cmd)
    ipcRenderer.on('alpha-one:command', handler)
    return () => {
      ipcRenderer.removeListener('alpha-one:command', handler)
    }
  },
})
