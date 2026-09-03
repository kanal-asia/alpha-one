import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  MessageSquarePlus,
  Pencil,
  Search,
  Trash2,
  MessagesSquare,
  MoreVertical,
} from 'lucide-react'
import { type Chat } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type ChatSidebarProps = {
  chats: Chat[]
  activeChatId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onArchive: (id: string, archived: boolean) => void
  onDelete: (id: string) => void
}

export function ChatSidebar({
  chats,
  activeChatId,
  onNew,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: ChatSidebarProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const activeChats = chats.filter((c) => !c.archived)
  const archivedChats = chats.filter((c) => c.archived)
  const currentList = tab === 'active' ? activeChats : archivedChats
  const filtered = currentList.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className='flex h-full flex-col'>
      <div className='flex items-center gap-2 p-3'>
        <Button className='flex-1 gap-2' size='sm' onClick={onNew}>
          <MessageSquarePlus className='size-4' />
          New Chat
        </Button>
      </div>
      <div className='px-3 pb-2 space-y-2'>
        <div className='relative'>
          <Search className='absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search chats'
            className='h-8 ps-8 text-xs'
          />
        </div>
        <div className='flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs font-medium'>
          <button
            type='button'
            onClick={() => setTab('active')}
            className={cn(
              'flex-1 rounded-md py-1 text-center transition-colors',
              tab === 'active' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Active ({activeChats.length})
          </button>
          <button
            type='button'
            onClick={() => setTab('archived')}
            className={cn(
              'flex-1 rounded-md py-1 text-center transition-colors',
              tab === 'archived' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Archived ({archivedChats.length})
          </button>
        </div>
      </div>
      {/* TASK-OPENCODE-053: Plain scroll container (not Radix ScrollArea) so the
          list is width-constrained to the sidebar. Radix's viewport let the ul
          escape to its max-content width, clipping the pinned action buttons. */}
      <div className='min-h-0 flex-1 overflow-y-auto px-2'>
        {filtered.length === 0 ? (
          <div className='flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground'>
            <MessagesSquare className='size-5' />
            {tab === 'active' ? 'No active conversations.' : 'No archived conversations.'}
          </div>
        ) : (
          <ul className='w-full min-w-0 space-y-1 pb-3'>
            {filtered.map((chat) => (
              <li key={chat.id}>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                    chat.id === activeChatId
                      ? 'bg-muted font-medium'
                      : 'hover:bg-accent'
                  )}
                >
                  <button
                    type='button'
                    onClick={() => onSelect(chat.id)}
                    className='min-w-0 flex-1 text-start'
                    title={chat.project?.path ?? undefined}
                  >
                    <span className='block truncate'>{chat.title}</span>
                    <span className='block truncate text-xs text-muted-foreground'>
                      {chat.project?.name ?? 'No project'}
                    </span>
                    {chat.project?.type === 'google-drive'
                      ? chat.project?.label && (
                          <span className='block truncate text-[11px] text-muted-foreground/70'>
                            {chat.project.label}
                          </span>
                        )
                      : chat.project?.path && (
                          <span className='block truncate text-[11px] text-muted-foreground/70'>
                            {chat.project.path}
                          </span>
                        )}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='ghost'
                        size='icon'
                        // TASK-OPENCODE-053: Actions are pinned and always
                        // visible (shrink-0) — never dependent on title length
                        // or sidebar width. Title truncates instead.
                        className='size-6 shrink-0 text-muted-foreground hover:text-foreground'
                        aria-label='Chat options'
                      >
                        <MoreVertical className='size-3.5' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem
                        onClick={() => {
                          const title = prompt('Rename chat', chat.title)
                          if (title != null) onRename(chat.id, title)
                        }}
                      >
                        <Pencil className='me-2 size-3.5' />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onArchive(chat.id, !chat.archived)}
                      >
                        {chat.archived ? (
                          <>
                            <ArchiveRestore className='me-2 size-3.5' />
                            Unarchive
                          </>
                        ) : (
                          <>
                            <Archive className='me-2 size-3.5' />
                            Archive
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='text-destructive focus:text-destructive'
                        onClick={() => setDeleteTargetId(chat.id)}
                      >
                        <Trash2 className='me-2 size-3.5' />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation will be permanently removed from this workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/95'
              onClick={() => {
                if (deleteTargetId) {
                  onDelete(deleteTargetId)
                  setDeleteTargetId(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
