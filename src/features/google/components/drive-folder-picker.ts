export const DRIVE_PICKER_MESSAGE_SOURCE = 'alpha-gdrive-picker'

const PICKER_FEATURES = 'width=1100,height=750'

export function openDriveFolderPicker(): Window | null {
  return window.open(
    '/google/drive-picker',
    'alpha-drive-folder-picker',
    PICKER_FEATURES
  )
}