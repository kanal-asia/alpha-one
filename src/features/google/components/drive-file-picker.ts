export const DRIVE_FILE_PICKER_MESSAGE_SOURCE = 'alpha-gdrive-file-picker'

const PICKER_FEATURES = 'width=1100,height=750'

export function openDriveFilePicker(): Window | null {
  return window.open(
    '/google/drive-file-picker',
    'alpha-drive-file-picker',
    PICKER_FEATURES
  )
}