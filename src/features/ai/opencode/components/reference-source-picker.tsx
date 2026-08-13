import { useEffect, useRef, useState } from 'react'
import { Cloud, File as FileIcon } from 'lucide-react'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import { openDriveFilePicker } from '@/features/google/components/drive-file-picker'
import { LocalFilePicker, type LocalFileSelection } from './local-file-picker'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

const DRIVE_FILE_PICKER_MESSAGE_SOURCE = 'alpha-gdrive-file-picker'

interface ReferenceSourcePickerProps {
  children: (props: { open: boolean }) => React.ReactNode
  onAddReference: (reference: ReferenceAttachment) => void
}

export function ReferenceSourcePicker({
  children,
  onAddReference,
}: ReferenceSourcePickerProps) {
  const [open, setOpen] = useState(false)
  const [localPickerOpen, setLocalPickerOpen] = useState(false)
  const driveWindowRef = useRef<Window | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as
        | {
            source?: string
            file?: {
              id: string
              name: string
              mimeType: string
              size?: string
              modifiedTime: string
              path?: string
            }
          }
        | undefined
      if (
        !data ||
        data.source !== DRIVE_FILE_PICKER_MESSAGE_SOURCE ||
        !data.file
      ) {
        return
      }
      driveWindowRef.current = null
      const f = data.file
      onAddReference({
        provider: 'google_drive',
        name: f.name,
        fileId: f.id,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onAddReference])

  const handleLocalSelect = (file: LocalFileSelection) => {
    onAddReference({
      provider: 'local',
      name: file.name,
      path: file.path,
      size: file.size,
      modifiedTime: file.modifiedTime,
    })
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children({ open })}</PopoverTrigger>
        <PopoverContent align='start' side='top' className='w-64 p-1'>
          <p className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>
            Attach a file reference
          </p>
          <Button
            variant='ghost'
            size='sm'
            className='h-9 w-full justify-start gap-2'
            onClick={() => {
              setOpen(false)
              setLocalPickerOpen(true)
            }}
          >
            <FileIcon className='size-4' />
            Local file
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-9 w-full justify-start gap-2'
            onClick={() => {
              setOpen(false)
              driveWindowRef.current = openDriveFilePicker()
            }}
          >
            <Cloud className='size-4' />
            Google Drive file
          </Button>
          <p className='px-2 pb-1 text-[11px] text-muted-foreground'>
            Only file metadata is attached; content is resolved server-side.
          </p>
        </PopoverContent>
      </Popover>

      <LocalFilePicker
        open={localPickerOpen}
        onOpenChange={setLocalPickerOpen}
        onSelect={handleLocalSelect}
      />
    </>
  )
}