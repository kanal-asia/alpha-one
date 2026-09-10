# ALPHA ONE — GOOGLE WORKSPACE PERMISSION POLICY MATRIX v1

Status: PROPOSED CANONICAL PRODUCT POLICY  
Scope: Google Drive, Slides, Docs, Sheets, Gmail, Calendar, Apps Script  
Purpose: Define when Alpha One may execute Google Workspace actions automatically, when permission must be scoped to the active task/resource, and when explicit user confirmation is mandatory.

---

## 1. Objective

Alpha One must support long-running agentic workflows without interrupting the user for every low-risk tool call, while still protecting the user from destructive, external, broad, or privilege-changing actions.

OAuth authorization MUST NOT be treated as equivalent to runtime consent for every action.

The permission model therefore has three independent layers:

1. **Google OAuth Scope**
   - Defines the maximum technical authority Google grants Alpha One.

2. **Resource Scope**
   - Defines which specific file, presentation, spreadsheet, document, calendar, message, or project is currently authorized by task context.

3. **Alpha Runtime Permission Policy**
   - Defines whether the requested operation may execute automatically or requires explicit user confirmation.

Canonical model:

User Intent
→ OAuth Authority
→ Resource Provenance
→ Action Risk Classification
→ Alpha Permission Decision
→ Tool Execution

---

# 2. Permission Levels

Alpha One SHALL use four runtime permission levels.

## LEVEL A — AUTO

Execute immediately without additional user confirmation.

Appropriate for:

- read-only operations;
- metadata inspection;
- search/list operations;
- low-risk operations with no mutation or external side effect.

Examples:

- read presentation;
- inspect slide;
- read spreadsheet;
- search Drive;
- read calendar;
- list files.

---

## LEVEL B — AUTO_SCOPED

Execute automatically only when the target resource is already inside the active task/session authorization boundary.

Typical eligible resources:

- created by Alpha during the current task;
- explicitly selected by the user;
- explicitly named by the user;
- explicitly authorized by the user for the current task.

Examples:

- create ten slides inside the presentation Alpha just created;
- update cells in the spreadsheet the user selected;
- edit text in the document currently being worked on;
- create shapes and update layouts inside the current presentation.

AUTO_SCOPED authorization MUST NOT automatically transfer to unrelated resources.

Recommended scope identity:

`session_id + service + resource_id + operation_class`

Example:

`chat-123 | google-slides | presentation-XYZ | CONTENT_MUTATION`

---

## LEVEL C — CONFIRM

Pause and show a human-readable confirmation before execution.

Required for actions that:

- delete existing user content;
- send external communications;
- affect another person;
- change access permissions;
- perform substantial/bulk mutation;
- modify resources discovered autonomously by the agent rather than selected by the user.

The confirmation must describe the outcome rather than expose an internal tool name.

BAD:

`Allow google-calendar_events_insert?`

GOOD:

`Send calendar invitation to 4 attendees for tomorrow at 10:00?`

---

## LEVEL D — HARD_CONFIRM

Always require explicit confirmation immediately before execution.

No permanent "Always Allow" authorization should bypass this level.

Required for:

- permanent deletion;
- ownership changes;
- broad access changes;
- large destructive operations;
- arbitrary code execution;
- executable deployment;
- account-level or broad-resource destructive actions.

---

# 3. Resource Provenance Model

Permission decisions MUST consider how Alpha obtained authority over the target resource.

---

## 3.1 AGENT_CREATED_CURRENT_TASK

Resource was created by Alpha as part of the user's current instruction.

Example:

User:

> Create a 10-slide marketing presentation.

Alpha creates:

`TASK-085 — Digital Marketing Beautify Benchmark`

The presentation becomes:

`AGENT_CREATED_CURRENT_TASK`

Normal mutations inside that presentation may use AUTO_SCOPED.

Examples:

- create slide;
- populate placeholder;
- update formatting;
- create shape;
- move element;
- group elements;
- reorder elements.

Deletion of major existing structures may still escalate depending on risk.

---

## 3.2 USER_SELECTED_CURRENT_TASK

The user explicitly selected or identified the resource.

Examples:

- resource chosen using a file picker;
- exact presentation URL supplied;
- user explicitly says "edit Q3 Marketing Review";
- resource selected from an Alpha UI file browser.

Normal task-relevant edits may use AUTO_SCOPED.

Destructive or external actions still require higher permission.

---

## 3.3 AGENT_DISCOVERED_RESOURCE

The agent discovered the resource itself through search/list operations.

Example:

Alpha searches Drive and finds:

`Board Meeting Q3`

The resource MUST NOT automatically receive write authority merely because Alpha can read it.

Recommended behavior:

> I found "Board Meeting Q3". Use this presentation for the task?

Once explicitly approved, provenance may be upgraded to:

`USER_SELECTED_CURRENT_TASK`

---

## 3.4 EXTERNAL_SIDE_EFFECT

Actions affecting people, access, or systems outside the user's private working artifact remain confirmation-bound even if the resource itself is trusted.

Examples:

- send email;
- invite calendar attendees;
- change Drive sharing;
- transfer ownership.

---

# 4. GOOGLE DRIVE POLICY

| Action | Policy |
|---|---|
| Search files | AUTO |
| List files/folders | AUTO |
| Read metadata | AUTO |
| Download file | AUTO |
| Export file | AUTO |
| Create file | AUTO_SCOPED |
| Create folder | AUTO_SCOPED |
| Copy file | AUTO_SCOPED |
| Rename current-task file | AUTO_SCOPED |
| Move current-task file | AUTO_SCOPED |
| Update current-task file content | AUTO_SCOPED |
| Move existing user file to Trash | CONFIRM |
| Delete sharing permission | CONFIRM |
| Add/change sharing permission | CONFIRM |
| Public/link sharing changes | CONFIRM |
| Permanent file deletion | HARD_CONFIRM |
| Transfer ownership | HARD_CONFIRM |
| Empty Trash | HARD_CONFIRM |
| Bulk destructive Drive operation | HARD_CONFIRM |

### Drive principle

Prefer resource-scoped access where technically feasible.

Google recommends least-privilege authorization and provides `drive.file` for per-file access to files created or explicitly selected by the user.

Alpha should prefer this model over unnecessarily broad Drive authority whenever product requirements permit.

---

# 5. GOOGLE SLIDES POLICY

| Action | Policy |
|---|---|
| List presentations | AUTO |
| Get presentation | AUTO |
| Get page/slide | AUTO |
| Inspect master/layout/theme | AUTO |
| Inspect placeholders | AUTO |
| Create presentation requested by user | AUTO_SCOPED |
| Create slide in current presentation | AUTO_SCOPED |
| Populate placeholders | AUTO_SCOPED |
| Update text | AUTO_SCOPED |
| Update text style | AUTO_SCOPED |
| Update paragraph style | AUTO_SCOPED |
| Create shape/textbox/image/table | AUTO_SCOPED |
| Update element geometry | AUTO_SCOPED |
| Theme-aware color change | AUTO_SCOPED |
| Native background change | AUTO_SCOPED |
| Z-order changes | AUTO_SCOPED |
| Group elements | AUTO_SCOPED |
| Delete agent-created element | AUTO_SCOPED |
| Delete existing user element | AUTO_SCOPED if explicitly part of requested redesign; otherwise CONFIRM |
| Delete existing slide | CONFIRM |
| Rewrite many existing slides | CONFIRM |
| Large whole-deck transformation | CONFIRM |
| Delete presentation | HARD_CONFIRM |

## Slides-specific rule

A user instruction such as:

> Create a 10-slide presentation about digital marketing.

constitutes sufficient task authorization for repeated normal Slides mutations in the presentation created for that task.

The system MUST NOT ask permission for every:

- `slides_create_slide`;
- `slides_batch_update`;
- placeholder insert;
- style update;
- element creation.

This is required for reliable agentic presentation creation.

---

# 6. GOOGLE DOCS POLICY

| Action | Policy |
|---|---|
| Read document | AUTO |
| Inspect structure/style | AUTO |
| Create requested document | AUTO_SCOPED |
| Insert text | AUTO_SCOPED |
| Update text | AUTO_SCOPED |
| Format current document | AUTO_SCOPED |
| Insert headings/lists/tables | AUTO_SCOPED |
| Replace task-scoped content | AUTO_SCOPED |
| Delete small content as part of explicit editing | AUTO_SCOPED |
| Delete substantial existing sections | CONFIRM |
| Rewrite most/all of existing document | CONFIRM |
| Delete document | HARD_CONFIRM |

---

# 7. GOOGLE SHEETS POLICY

| Action | Policy |
|---|---|
| Read values | AUTO |
| Read formulas | AUTO |
| Read metadata | AUTO |
| Read sheet structure | AUTO |
| Create spreadsheet requested by user | AUTO_SCOPED |
| Create worksheet/tab | AUTO_SCOPED |
| Write cells | AUTO_SCOPED |
| Update cells | AUTO_SCOPED |
| Append rows | AUTO_SCOPED |
| Apply formatting | AUTO_SCOPED |
| Create formulas | AUTO_SCOPED |
| Create chart as explicitly requested | AUTO_SCOPED |
| Sort/filter current task range | AUTO_SCOPED |
| Delete agent-created temporary rows/columns | AUTO_SCOPED |
| Delete existing rows/columns | CONFIRM |
| Delete worksheet/tab | CONFIRM |
| Clear large existing range | CONFIRM |
| Modify protected ranges | CONFIRM |
| Replace large portions of workbook | CONFIRM |
| Clear entire workbook | HARD_CONFIRM |
| Delete spreadsheet | HARD_CONFIRM |

### Sheets note

Spreadsheet authorization frequently applies at workbook level rather than individual worksheet level.

Alpha must therefore maintain its own resource/action boundary even if Google's OAuth token technically permits broader mutation.

---

# 8. GMAIL POLICY

Gmail receives stricter treatment because sending messages creates an external communication in the user's identity.

| Action | Policy |
|---|---|
| Search mail | AUTO |
| Read email | AUTO |
| Read thread | AUTO |
| Read attachment | AUTO |
| Create draft requested by user | AUTO_SCOPED |
| Edit draft | AUTO_SCOPED |
| Apply label | AUTO_SCOPED |
| Mark read/unread | AUTO_SCOPED |
| Archive message | AUTO_SCOPED |
| Send new email | CONFIRM |
| Send existing draft | CONFIRM |
| Reply | CONFIRM |
| Reply-all | CONFIRM |
| Forward | CONFIRM |
| Move message to Trash | CONFIRM |
| Permanent message deletion | HARD_CONFIRM |
| Change Gmail filters/settings | CONFIRM |
| Delegation/account access changes | HARD_CONFIRM |

## Gmail invariant

Creating a draft and sending a draft are separate risk classes.

Example:

User:

> Draft a reply to John.

Alpha may create the draft automatically.

Alpha MUST NOT send it unless:

1. the user explicitly instructed Alpha to send it; and
2. the confirmation policy for external communication has been satisfied.

Explicit instructions such as:

> Send an email to John saying...

may be treated as the user's high-level intent, but Alpha should still show the final send confirmation by default in v1.

---

# 9. GOOGLE CALENDAR POLICY

| Action | Policy |
|---|---|
| Read calendar | AUTO |
| Search events | AUTO |
| Free/busy lookup | AUTO |
| Read event details | AUTO |
| Create personal event with no external attendees when explicitly requested | AUTO_SCOPED |
| Update own task-created event with no attendees | AUTO_SCOPED |
| Add external attendee | CONFIRM |
| Create meeting with attendees | CONFIRM |
| Send invitations | CONFIRM |
| Change attendee list | CONFIRM |
| Modify an existing meeting affecting attendees | CONFIRM |
| Delete event | CONFIRM |
| Cancel meeting with attendees | CONFIRM |
| Change calendar sharing/ACL | HARD_CONFIRM |
| Clear primary calendar | HARD_CONFIRM |
| Delete secondary calendar | HARD_CONFIRM |

## Calendar UI example

Instead of:

`Allow events.insert?`

Show:

> **Send calendar invitation?**
>
> Marketing Review  
> Tomorrow, 10:00–11:00  
> 4 attendees
>
> Cancel | Send invitation

---

# 10. GOOGLE APPS SCRIPT POLICY

Apps Script is considered a higher-risk service because code may invoke other Google services and create persistent executable behavior.

| Action | Policy |
|---|---|
| Read project metadata | AUTO |
| Inspect code | AUTO |
| List project files | AUTO |
| Create project explicitly requested by user | AUTO_SCOPED |
| Edit newly created task-scoped project | CONFIRM |
| Update existing project code | CONFIRM |
| Overwrite substantial existing project content | HARD_CONFIRM |
| Execute script | HARD_CONFIRM by default |
| Create deployment | HARD_CONFIRM |
| Update deployment | HARD_CONFIRM |
| Deploy web app/API executable | HARD_CONFIRM |
| Delete/replace production deployment | HARD_CONFIRM |

### Possible future refinement

A specifically reviewed, Alpha-generated, known-safe function might eventually be downgraded from HARD_CONFIRM to CONFIRM.

Do NOT make this relaxation in v1 without a separate security review.

---

# 11. BULK ACTION POLICY

Risk must not be determined solely by individual tool semantics.

A normally safe action can become higher risk when performed at scale.

Example:

Update one slide:
`AUTO_SCOPED`

Rewrite 80 existing slides:
`CONFIRM`

Delete one temporary agent-created shape:
`AUTO_SCOPED`

Delete 120 elements:
`CONFIRM` or `HARD_CONFIRM` depending on scope.

Alpha should calculate or classify:

- number of resources;
- proportion of resource being changed;
- reversibility;
- external impact;
- whether content existed before the current task.

---

# 12. TASK-LEVEL AUTHORIZATION

Alpha SHOULD support:

- `Allow once`
- `Allow for this task`
- `Cancel`

Example:

> Alpha needs to edit this presentation repeatedly while completing your request.
>
> Allow once  
> Allow for this task  
> Cancel

`Allow for this task` MUST be constrained to:

- current Alpha chat/task;
- named service;
- exact resource ID;
- allowed operation class.

It must NOT mean:

`Allow all Google Slides operations forever.`

---

# 13. NEVER SILENTLY REJECT

If OpenCode or another runtime requires a permission decision, Alpha MUST NOT silently map an unanswered permission request to:

`The user rejected permission`

unless the user actually rejected it.

Required runtime states:

### Permission needed

`TOOL_PERMISSION_REQUIRED`

UI:

> Alpha needs your approval before performing this action.

### User explicitly rejects

`TOOL_PERMISSION_DENIED`

UI:

> Action cancelled because permission was not granted.

### Approved

Continue the same task/session whenever technically safe.

---

# 14. ERROR CLASSIFICATION

Permission failures MUST NOT be classified as provider/model errors.

Incorrect:

`PROVIDER_ERROR`

for:

`The user rejected permission to use this specific tool call.`

Required classes:

- `TOOL_PERMISSION_REQUIRED`
- `TOOL_PERMISSION_DENIED`
- `TOOL_PERMISSION_EXPIRED`
- `TOOL_PERMISSION_POLICY_BLOCKED`

These must remain distinct from:

- `RATE_LIMITED`
- `FREE_MODEL_LIMIT_EXCEEDED`
- `PAID_MODEL_USAGE_EXHAUSTED`
- `PROVIDER_TEMPORARILY_UNAVAILABLE`
- `AUTHENTICATION_REQUIRED`
- `PROVIDER_ERROR`

---

# 15. PERMISSION UI PRINCIPLES

Permission dialogs MUST describe outcomes.

Do not expose implementation jargon unless shown as secondary technical detail.

BAD:

> Allow google-drive_permissions_create?

GOOD:

> **Share "Q3 Marketing Review"?**
>
> Alpha will give jane@example.com Viewer access.
>
> Cancel | Share

BAD:

> Allow gmail_messages_send?

GOOD:

> **Send this email?**
>
> To: John Doe  
> Subject: Proposal Follow-up
>
> Cancel | Send

BAD:

> Allow delete tool?

GOOD:

> **Permanently delete this presentation?**
>
> Q3 Marketing Review  
> This cannot be undone.
>
> Cancel | Delete permanently

---

# 16. HIGH-LEVEL USER INTENT

Alpha should distinguish between an action that naturally follows from the user's explicit request and an unrelated side effect discovered during execution.

Example:

User:

> Create 10 marketing slides.

Authorization implied:

- create presentation;
- create slides;
- populate placeholders;
- style slide;
- create visual elements;
- adjust layout.

Do NOT ask repeatedly.

However, this instruction does NOT authorize:

- delete unrelated presentations;
- share the deck publicly;
- email it to someone;
- change Drive permissions.

Those remain separate permission decisions.

---

# 17. GOOGLE OAUTH PRINCIPLE

Follow least privilege.

OAuth scope determines maximum technical authority.

It MUST NOT replace Alpha's action-level permission policy.

Recommended conceptual boundary:

`Google OAuth Scope`
= what Alpha technically CAN do.

`Resource authorization`
= WHERE Alpha may operate.

`Alpha Permission Policy`
= what Alpha SHOULD do automatically.

`User confirmation`
= explicit approval for higher-risk effects.

Where feasible, prefer per-file/resource access such as Google's `drive.file` model instead of unrestricted Drive access.

---

# 18. DEFAULT GLOBAL POLICY

## AUTO

Default for:

- read;
- list;
- search;
- inspect;
- metadata;
- export/read-only retrieval.

---

## AUTO_SCOPED

Default for:

- resource creation explicitly requested by the user;
- normal edits to resources created by Alpha during current task;
- normal edits to resources explicitly selected by the user;
- Docs/Sheets/Slides content construction and formatting;
- email draft creation;
- ordinary non-external current-task mutations.

---

## CONFIRM

Default for:

- sending communication;
- calendar invitations;
- external recipients;
- sharing/ACL changes;
- deleting pre-existing user content;
- bulk mutation;
- Trash actions;
- modifying resources only discovered autonomously by Alpha;
- substantial rewrites.

---

## HARD_CONFIRM

Default for:

- permanent deletion;
- ownership transfer;
- privilege escalation;
- account-level destructive actions;
- clearing whole calendars/workbooks;
- Apps Script execution/deployment;
- broad irreversible changes.

---

# 19. INITIAL V1 IMPLEMENTATION PRIORITY

Implement in this order.

### P0 — Required for reliable Alpha agent execution

1. Distinguish permission rejection from provider errors.
2. Add:
   - TOOL_PERMISSION_REQUIRED
   - TOOL_PERMISSION_DENIED
3. Prevent unanswered permission prompts from becoming silent rejection.
4. Allow task-scoped Slides/Docs/Sheets mutations.
5. Preserve resource/session authorization boundary.
6. Surface confirmation when truly required.

### P1 — External side effects

7. Gmail send confirmation.
8. Calendar attendee/invite confirmation.
9. Drive sharing confirmation.
10. Trash/delete confirmation.

### P2 — Advanced safety

11. Bulk mutation thresholds.
12. Permanent-delete hard confirmation.
13. Apps Script execution/deployment policy.
14. Persistent permission audit trail.

---

# 20. TASK-085 IMMEDIATE APPLICATION

For the current Google Slides benchmark workflow:

User explicitly requested creation of:

`TASK-085 — Digital Marketing Beautify Benchmark`

Therefore the presentation is:

`AGENT_CREATED_CURRENT_TASK`

The following actions SHOULD be AUTO_SCOPED:

- slides_create_presentation
- slides_create_slide
- slides_get_presentation
- slides_get_page
- slides_batch_update
- slides_create_element
- slides_update_element
- slides_update_page
- normal placeholder mutation
- normal formatting/layout operations

Creating 10 slides MUST NOT require ten separate user approvals.

If OpenCode currently requests permission for these expected task-scoped Google Slides writes, Alpha should supply the narrowest safe task/resource-scoped authorization rather than globally disabling permissions.

Any attempt to:

- delete unrelated content;
- delete the presentation;
- alter sharing;
- affect another resource;

must still follow the higher permission level.

---

# 21. REQUIRED SECURITY INVARIANTS

1. AUTO permission must never imply unlimited global access.
2. Resource scope must be explicit and inspectable.
3. Permission decisions must be tied to task/session/resource.
4. External side effects require stronger controls than private edits.
5. Permanent deletion always requires explicit confirmation.
6. Apps Script execution receives high-risk treatment.
7. A model must not grant itself broader permission.
8. Tool permission errors must never masquerade as provider errors.
9. Lack of response is not equivalent to explicit denial.
10. Runtime permissions must be enforceable independently from model instructions.
11. OAuth consent alone must not be considered sufficient authorization for every tool action.
12. Alpha must preserve evidence of significant permission decisions for debugging/audit purposes.

---

# 22. PRODUCT PRINCIPLE

The desired experience is:

> Alpha is autonomous inside the work the user explicitly asked it to perform, but asks before crossing meaningful boundaries.

Not:

> Ask before every tool call.

And not:

> Give the agent permanent unrestricted authority after OAuth.

Canonical UX principle:

**Autonomous within scope. Explicit at boundaries.**