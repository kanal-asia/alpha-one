import { useState } from 'react'
import { Wrench, Pencil, Trash2, Plus, Zap } from 'lucide-react'
import { useSkillStore } from './skill-store'
import { SkillFormDialog } from './skill-form-dialog'
import type { SkillDefinition } from './types'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export function SkillLibraryPage() {
  const { builtinSkills, customSkills, deleteSkill } = useSkillStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<SkillDefinition | undefined>(undefined)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function handleEdit(skill: SkillDefinition) {
    setEditSkill(skill)
    setDialogOpen(true)
  }

  function handleCreate() {
    setEditSkill(undefined)
    setDialogOpen(true)
  }

  function confirmDelete() {
    if (deleteId) deleteSkill(deleteId)
    setDeleteId(null)
  }

  return (
    <>
      <PageHeader />
      <Main>
        <div className='space-y-6'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Skills</h1>
            <p className='text-sm text-muted-foreground'>
              Reusable instruction templates triggered by slash commands.
            </p>
          </div>

          {/* Built-in Skills */}
          <section className='space-y-3'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Built-in Skills</h2>
              <Badge variant='outline' className='text-xs'>
                {builtinSkills.length}
              </Badge>
            </div>
            <div className='grid gap-2'>
              {builtinSkills.map((skill) => (
                <SkillRow key={skill.id} skill={skill} />
              ))}
            </div>
          </section>

          {/* My Skills */}
          <section className='space-y-3'>
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='text-lg font-semibold'>My Skills</h2>
                <p className='text-xs text-muted-foreground'>
                  {customSkills.length === 0
                    ? 'No custom skills yet'
                    : `${customSkills.length} custom skill${customSkills.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <Button size='sm' className='gap-1.5' onClick={handleCreate}>
                <Plus className='size-3.5' />
                Create Skill
              </Button>
            </div>

            {customSkills.length === 0 ? (
              <EmptyState onCreate={handleCreate} />
            ) : (
              <div className='grid gap-2'>
                {customSkills.map((skill) => (
                  <SkillRow
                    key={skill.id}
                    skill={skill}
                    onEdit={() => handleEdit(skill)}
                    onDelete={() => setDeleteId(skill.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Create / Edit Dialog */}
        <SkillFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editSkill={editSkill}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete skill?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the custom skill from your library. The slash command will no longer be available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className='bg-destructive text-destructive-foreground hover:bg-destructive/95'
                onClick={confirmDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Main>
    </>
  )
}

function SkillRow({
  skill,
  onEdit,
  onDelete,
}: {
  skill: SkillDefinition
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className='group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent/50'>
      <div className='flex size-8 shrink-0 items-center justify-center rounded-md bg-muted'>
        <Zap className='size-4 text-muted-foreground' />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium'>{skill.displayName}</span>
          <span className='font-mono text-xs text-muted-foreground'>{skill.command}</span>
        </div>
        <p className='truncate text-xs text-muted-foreground'>{skill.description}</p>
      </div>
      <Badge
        variant='outline'
        className={`shrink-0 border-transparent px-1.5 py-0 text-[10px] font-medium ${
          skill.source === 'builtin'
            ? 'bg-blue-500/10 text-blue-600'
            : 'bg-green-500/10 text-green-600'
        }`}
      >
        {skill.source === 'builtin' ? 'Built-in' : 'My Skill'}
      </Badge>
      {onEdit && (
        <Button
          variant='ghost'
          size='icon'
          className='size-7 shrink-0 opacity-0 group-hover:opacity-100'
          onClick={onEdit}
          aria-label='Edit skill'
        >
          <Pencil className='size-3.5' />
        </Button>
      )}
      {onDelete && (
        <Button
          variant='ghost'
          size='icon'
          className='size-7 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive'
          onClick={onDelete}
          aria-label='Delete skill'
        >
          <Trash2 className='size-3.5' />
        </Button>
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className='flex min-h-48 flex-col items-center justify-center gap-4 py-12 text-center'>
        <div className='flex size-12 items-center justify-center rounded-2xl bg-muted'>
          <Wrench className='size-6 text-muted-foreground' />
        </div>
        <div>
          <h3 className='text-lg font-semibold'>Build skills for the way you work</h3>
          <p className='max-w-sm text-sm text-muted-foreground'>
            Create your first custom skill to get started.
          </p>
        </div>
        <Button size='sm' className='gap-1.5' onClick={onCreate}>
          <Plus className='size-3.5' />
          Create Skill
        </Button>
      </CardContent>
    </Card>
  )
}
