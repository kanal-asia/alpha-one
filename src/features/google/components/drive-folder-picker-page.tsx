import { GoogleDriveBrowser } from './google-drive-browser'
import { DRIVE_PICKER_MESSAGE_SOURCE } from './drive-folder-picker'

export function DriveFolderPickerPage() {
  const handleSelect = (folder: { id: string; name: string; path: string }) => {
    if (window.opener) {
      window.opener.postMessage(
        { source: DRIVE_PICKER_MESSAGE_SOURCE, folder },
        '*'
      )
    }
    window.close()
  }

  return <GoogleDriveBrowser mode='pick-folder' onFolderSelect={handleSelect} />
}