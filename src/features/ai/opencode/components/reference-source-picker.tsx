import { useEffect, useRef, useState, useCallback } from 'react'
import { Cloud, File as FileIcon, FileCode } from 'lucide-react'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import { openDriveFilePicker } from '@/features/google/components/drive-file-picker'
import { LocalFilePicker, type LocalFileSelection } from './local-file-picker'
import { ScriptProjectPicker, type ScriptProjectSummary } from './script-project-picker'
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
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false)
  const [scriptProjects, setScriptProjects] = useState<ScriptProjectSummary[]>([])
  const [scriptLoading, setScriptLoading] = useState(false)
  const driveWindowRef = useRef<Window | null>(null)
  const onAddRef = useRef(onAddReference)
  onAddRef.current = onAddReference

  const fetchScriptProjects = async () => {
    setScriptLoading(true)
    try {
      const res = await fetch('/api/google/script/projects')
      const data = (await res.json()) as { projects: ScriptProjectSummary[] }
      setScriptProjects(data.projects ?? [])
    } catch {
      setScriptProjects([])
    } finally {
      setScriptLoading(false)
    }
  }

  useEffect(() => {
    const onPickerReturn = (data: {
      source?: string
      file?: {
        id: string
        name: string
        mimeType: string
        size?: string
        modifiedTime: string
        path?: string
      }
    }) => {
      console.log('[RefSourcePicker] onPickerReturn invoked:', JSON.stringify(data).substring(0, 300))
      if (
        !data ||
        data.source !== DRIVE_FILE_PICKER_MESSAGE_SOURCE ||
        !data.file
      ) {
        console.log('[RefSourcePicker] picker return filtered out (source/file mismatch)')
        return
      }
      console.log('[RefSourcePicker] Received file:', data.file.name, 'id:', data.file.id)
      driveWindowRef.current = null
      const f = data.file
      onAddRef.current({
        provider: 'google_drive',
        name: f.name,
        fileId: f.id,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
      })
    }

    // Electron: listen for IPC messages from picker window
    if (window.electronAPI) {
      console.log('[RefSourcePicker] Registering electronAPI picker return listener')
      const cleanup = window.electronAPI.onPickerReturn(onPickerReturn)
      return () => {
        cleanup()
      }
    }

    // Browser: listen for postMessage events from picker window
    const onMessage = (e: MessageEvent) => onPickerReturn(e.data)
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

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
          <Button
            variant='ghost'
            size='sm'
            className='h-9 w-full justify-start gap-2'
            onClick={() => {
              setOpen(false)
              setScriptPickerOpen(true)
              void fetchScriptProjects()
            }}
          >
            <FileCode className='size-4 text-amber-600' />
            Google Apps Script
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

      <ScriptProjectPicker
        open={scriptPickerOpen}
        onOpenChange={setScriptPickerOpen}
        projects={scriptProjects}
        loading={scriptLoading}
        onRefresh={() => void fetchScriptProjects()}
        onSelect={(project) => {
          onAddReference({
            provider: 'apps_script',
            name: project.name,
            fileId: project.scriptId,
            mimeType: 'application/vnd.google-apps.script',
          })
        }}
      />
    </>
  )
}