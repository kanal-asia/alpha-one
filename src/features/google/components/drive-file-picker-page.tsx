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
    if (window.opener) {
      window.opener.postMessage(
        { source: DRIVE_FILE_PICKER_MESSAGE_SOURCE, file },
        '*'
      )
    }
    window.close()
  }

  return <GoogleDriveBrowser mode='pick-file' onFileSelect={handleSelect} />
}