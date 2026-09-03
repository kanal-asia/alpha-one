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
})
