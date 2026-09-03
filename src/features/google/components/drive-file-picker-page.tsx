import { GoogleDriveBrowser } from './google-drive-browser'
import { DRIVE_FILE_PICKER_MESSAGE_SOURCE } from './drive-file-picker'

export function DriveFilePickerPage() {
  const handleSelect = (file: {
    id: string
    name: string
    mimeType: string
    size?: string
    modifiedTime: string
    path: string
  }) => {
    const message = { source: DRIVE_FILE_PICKER_MESSAGE_SOURCE, file }
    console.log('[Picker] File selected, sending via IPC:', JSON.stringify(message).substring(0, 200))
    // Electron: use IPC to return selection to parent window
    if (window.electronAPI) {
      console.log('[Picker] electronAPI available, calling pickerReturn')
      window.electronAPI.pickerReturn(message)
    } else {
      console.log('[Picker] No electronAPI, falling back to window.opener')
      // Browser: use postMessage to return selection to opener
      if (window.opener) {
        window.opener.postMessage(message, '*')
      }
    }
  }

  return <GoogleDriveBrowser mode='pick-file' onFileSelect={handleSelect} />
}