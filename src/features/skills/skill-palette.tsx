import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { SkillDefinition } from './types'
import { filterSkills } from './skill-store'

interface SkillPaletteProps {
  /** Whether the palette should be visible. */
  open: boolean
  /** Current slash query (text after `/`). */
  query: string
  /** Called when a skill is selected. The prompt template is returned. */
  onSelect: (skill: SkillDefinition) => void
  /** Called when the palette should close without selection. */
  onClose: () => void
}

export function SkillPalette({ open, query, onSelect, onClose }: SkillPaletteProps) {
  if (!open) return null

  return (
    <SkillPaletteInner
      key={query}
      query={query}
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}

function SkillPaletteInner({
  query,
  onSelect,
  onClose,
}: {
  query: string
  onSelect: (skill: SkillDefinition) => void
  onClose: () => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const skills = useMemo(() => filterSkills(query), [query])

  useEffect(() => {
    if (skills.length === 0) return
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, skills.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % skills.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + skills.length) % skills.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (skills[activeIndex]) onSelect(skills[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [skills, activeIndex, onSelect, onClose]
  )

  return (
    <div
      ref={listRef}
      role='listbox'
      className='absolute bottom-full left-0 right-0 z-50 mb-1 max-h-60 overflow-auto rounded-lg border bg-popover shadow-md'
      onKeyDown={handleKeyDown}
    >
      {skills.length === 0 ? (
        <div className='px-3 py-2 text-center text-sm text-muted-foreground'>
          No matching skills
        </div>
      ) : (
        skills.map((skill, i) => (
          <button
            key={skill.command}
            type='button'
            role='option'
            aria-selected={i === activeIndex}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
              i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => onSelect(skill)}
          >
            <span className='w-24 shrink-0 font-mono text-xs font-medium text-muted-foreground'>
              {skill.command}
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block truncate font-medium'>{skill.displayName}</span>
              <span className='block truncate text-xs text-muted-foreground'>
                {skill.description}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}
