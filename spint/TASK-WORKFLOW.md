# Task Workflow SOP — Create Task Mandatory Checklist

> Established 2026-10-23 by TASK-ALPHA-SUBSCRIBER-011 (documentation recovery).
> This corrects the observed failure where "Create Task" runs produced only
> chat instructions while `spint/` held no artifact for tasks 002–004 and
> 007–010. No new framework: canonical directory, naming, and commit
> conventions below follow existing repository precedent (69 tracked task files,
> e.g. `docs: TASK-0xx … - <VERDICT>`).

## Canonical locations & naming

- Directory: `spint/` (note: gitignored at `.gitignore:51`; task docs are
  committed via explicit `git add -f <path>`, following the 69-file precedent —
  never `git add .`).
- Naming: `TASK-<AREA>-<NN>[<letter>].md` (e.g. `TASK-ALPHA-SUBSCRIBER-002A.md`).
- Commit style: `docs: TASK-xxx <subject> - <VERDICT> (...)` for doc-only
  task finalizations; `feat(...)/fix(...)` for implementation commits.

## Mandatory Create-Task flow

1. Compose the task specification.
2. Write the Markdown file to `spint/` **before** presenting execution
   instructions, with header: Mode, Priority, Base/HEAD, verdict/status field.
3. Verify: file exists on disk and reads back; name/ID/refs match convention.
4. Only then present execution instructions to the user.
5. After execution, update the **same file** with results: commit SHA(s),
   validation evidence, proven blockers, final verdict.
6. Finalize docs + Git in the same workflow when authorized (explicit
   allow-list staging; `git add -f` for new `spint/` files).

## Failure rule

If the file cannot be written or verified, report the failure explicitly and
do NOT claim the task is documented. A task without a repository artifact is
not a task — it is a chat message.

## Reconstruction rule

Recovered files must carry a `RECOVERY NOTICE` header stating the recovery
date, source task, what is faithful transcription vs reported evidence, and
must never pose as original pre-execution artifacts. Unverifiable details are
marked, not invented.
