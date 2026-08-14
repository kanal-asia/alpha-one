import { useState } from 'react'
import type { SkillDefinition } from './types'
import { useSkillStore } from './skill-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface SkillFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If provided, we are editing an existing custom skill. */
  editSkill?: SkillDefinition
}

const COMMAND_REGEX = /^\/[a-z0-9]+(-[a-z0-9]+)*$/

function SkillFormInner({
  editSkill,
  onOpenChange,
}: {
  editSkill?: SkillDefinition
  onOpenChange: (open: boolean) => void
}) {
  const { addSkill, updateSkill } = useSkillStore()
  const isEditing = !!editSkill

  const [name, setName] = useState(editSkill?.displayName ?? '')
  const [command, setCommand] = useState(editSkill?.command ?? '')
  const [description, setDescription] = useState(editSkill?.description ?? '')
  const [prompt, setPrompt] = useState(editSkill?.promptTemplate ?? '')
  const [commandError, setCommandError] = useState('')

  function validateCommand(value: string): boolean {
    if (!value.startsWith('/')) {
      setCommandError('Command must start with /')
      return false
    }
    if (!COMMAND_REGEX.test(value)) {
      setCommandError('Use lowercase letters, numbers, and hyphens only (e.g., /my-skill)')
      return false
    }
    setCommandError('')
    return true
  }

  function handleCommandChange(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')
    setCommand(normalized)
    if (normalized) validateCommand(normalized)
    else setCommandError('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateCommand(command)) return
    if (!name.trim() || !description.trim() || !prompt.trim()) return

    if (isEditing && editSkill) {
      const result = updateSkill(editSkill.id, {
        command,
        displayName: name.trim(),
        description: description.trim(),
        promptTemplate: prompt.trim(),
      })
      if (result) {
        toast.success('Skill updated')
        onOpenChange(false)
      } else {
        setCommandError('A skill with this command already exists')
      }
    } else {
      const result = addSkill({
        command,
        displayName: name.trim(),
        description: description.trim(),
        category: 'Custom',
        promptTemplate: prompt.trim(),
        enabled: true,
      })
      if (result) {
        toast.success('Skill created')
        onOpenChange(false)
      } else {
        setCommandError('A skill with this command already exists')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='skill-name'>Name</Label>
        <Input
          id='skill-name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g., Campaign Report'
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='skill-command'>Command</Label>
        <Input
          id='skill-command'
          value={command}
          onChange={(e) => handleCommandChange(e.target.value)}
          placeholder='/campaign-report'
          aria-invalid={!!commandError}
        />
        {commandError && (
          <p className='text-xs text-destructive'>{commandError}</p>
        )}
      </div>
      <div className='space-y-2'>
        <Label htmlFor='skill-desc'>Description</Label>
        <Input
          id='skill-desc'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='Short description shown in the slash palette'
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='skill-prompt'>Prompt / Instructions</Label>
        <Textarea
          id='skill-prompt'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='The instruction template sent to the agent when this skill is selected.'
          rows={4}
        />
      </div>
      <DialogFooter>
        <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type='submit' disabled={!name.trim() || !command || !description.trim() || !prompt.trim()}>
          {isEditing ? 'Save Changes' : 'Create Skill'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function SkillFormDialog({ open, onOpenChange, editSkill }: SkillFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editSkill ? 'Edit Skill' : 'Create Skill'}</DialogTitle>
          <DialogDescription>
            {editSkill
              ? 'Update the skill configuration. Changes take effect immediately.'
              : 'Define a reusable instruction that can be triggered with a slash command.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SkillFormInner
            key={editSkill?.id ?? 'new'}
            editSkill={editSkill}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
