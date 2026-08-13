import { useState } from 'react'
import {
  MessageSquarePlus,
  Pencil,
  Search,
  Trash2,
  MessagesSquare,
} from 'lucide-react'
import { type Chat } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ChatSidebarProps = {
  chats: Chat[]
  activeChatId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function ChatSidebar({
  chats,
  activeChatId,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: ChatSidebarProps) {
  const [query, setQuery] = useState('')

  const filtered = chats.filter((c) =>
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
      <div className='px-3 pb-2'>
        <div className='relative'>
          <Search className='absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search chats'
            className='h-8 ps-8 text-xs'
          />
        </div>
      </div>
      <ScrollArea className='min-h-0 flex-1 px-2'>
        {filtered.length === 0 ? (
          <div className='flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground'>
            <MessagesSquare className='size-5' />
            No conversations yet.
          </div>
        ) : (
          <ul className='space-y-1 pb-3'>
            {filtered.map((chat) => (
              <li key={chat.id}>
                <div
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
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
                    {chat.project?.path && (
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
                        className='size-6 opacity-0 group-hover:opacity-100'
                        aria-label='Chat options'
                      >
                        <Pencil className='size-3.5' />
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
                        className='text-destructive'
                        onClick={() => onDelete(chat.id)}
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
      </ScrollArea>
    </div>
  )
}
