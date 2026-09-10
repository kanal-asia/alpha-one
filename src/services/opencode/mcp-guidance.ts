/**
 * TASK-OPENCODE-082 (+ TASK-082-CORRECTIVE C02): Canonical Google Custom MCP
 * selection guidance. Pure builder (no imports, no side effects) so the exact
 * agent-facing text is unit-testable.
 *
 * ROUTING_CORRECTIVE: the block is split in two. Google routing hints load
 * when the prompt concerns Google Workspace (or carries Drive refs / a Drive
 * project); Slides/Beautify doctrine loads only for presentation intents.
 * See classifyPromptIntent / assemblePromptWithGuidance in prompt-intent.ts.
 * buildMcpGuidanceBlock() is kept as the concatenation for compatibility.
 */
const GOOGLE_ROUTING_LINES = [
  `GOOGLE MCP (TASK-OPENCODE-082): Choose the MCP by the resource/INTENT you operate, not by assuming every Google file is a Drive operation.`,
  `- Google Sheets (google_sheets.*): spreadsheet data - list/read/write ranges, sheets, formulas.`,
  `- Google Docs (docs_*): document create/read/update/append.`,
  `- Google Drive (drive_*): file discovery/search/metadata/content and file-level ops; use it to LOCATE resources, not to edit Doc/Slides/Sheet content.`,
  `- Google Calendar (calendar_*): calendar/event create/read/update/delete.`,
  `- Google Apps Script (apps_script_*): discover/read projects and run a known callable function via the Execution API.`,
  `Cross-service requests: decompose into per-service operations and use MULTIPLE MCPs - never force one MCP to do another service's job.`,
  `VERIFY: after every important write/execute, READ BACK the authoritative Google state (docs_get_document, slides_get_presentation, slides_get_page, drive_get_file_metadata/content, calendar_get/list, read_range, apps_script_run DONE+SUCCESS) before claiming success.`,
  `Never report "done/created/updated/executed" without that verification evidence. Classify outcomes PROVEN / UNPROVEN / UNKNOWN.`,
  `If a capability is AUTHORIZATION_REQUIRED and not yet granted, use the existing progressive OAuth flow once (preserve granted scopes, same identity), then retry - do NOT blindly reconnect or loop.`,
  `Apps Script Execution API can return a transient 404: treat it as retriable with bounded retry, verify DONE+SUCCESS, and never interpret it as an OAuth failure.`,
]

const SLIDES_DOCTRINE_LINES = [
  `- Google Slides (slides_*): inspect design system first (slides_get_presentation masters/layouts/theme, slides_get_page layout/master/background/placeholders); prefer native layouts (slides_create_slide) and native placeholders over replacement primitives; use semantic theme colors and native page background (slides_update_page); layer with z-order and group related components. Create slides and visual elements (slides_create_element); update existing text, style and geometry (slides_update_element); delete objects (slides_delete_object); duplicate objects (slides_duplicate_object); atomic allowlisted batches (slides_batch_update). Inspect page/object IDs with slides_get_page BEFORE mutating, and update the existing element when asked to change it - never simulate an edit by inserting a replacement textbox.`,
  `- Alpha Beautify (presentations): presentation-generation intents ("Buatkan presentasi...", "Create/Make a presentation/pitch deck...") default to professional composition ON unless the user explicitly asks for plain/simple/raw/minimal title-body. Plan first: derive narrative, classify EACH slide into one archetype (COVER, EXECUTIVE_SUMMARY, KPI_DASHBOARD, PROCESS_FUNNEL, COMPARISON, TIMELINE_ROADMAP, PILLARS_STRATEGY, CLOSING_INSIGHT) from content semantics, then render with slides_compose_slide (structured title/metrics/stages/columns — never hand-computed geometry), then read back with slides_get_page and verify content/geometry before reporting. Never map every slide to TITLE_AND_BODY; never duplicate source lists alongside visualizations; never flatten slides into images; keep every value/label/unit factually unchanged.`,
  `- Alpha Beautify fail-closed rule: if slides_compose_slide fails, inspect the exact error, fix the invocation/input when safe, retry boundedly (max 2 retries), re-run composition, and verify through readback. NEVER silently fall back to plain title/body placeholders while reporting an archetype as proven. ARCHETYPE_PROVEN requires the expected native structure present in authoritative slides_get_page readback. If composition cannot complete, say so explicitly with the failing slide and error.`,
  `- Alpha Beautify no-primitive-fallback rule (TASK-086R2): when the request routes to professional archetype composition, slides_compose_slide is the ONLY authorized composition path. If slides_compose_slide is absent from your available tools, or terminally fails after the bounded retries above, do NOT reconstruct the slide with slides_create_element / slides_update_element / slides_batch_update loops and do NOT claim success. STOP the professional generation and report explicitly: "Professional Slides composition capability is unavailable in this runtime. Presentation generation stopped before fallback composition." Primitive Slides tools remain valid ONLY for explicit targeted edits the user directly requested (change one text, move/delete/create one element) — never as a substitute for the compose engine.`,
  `- Alpha Beautify success-claim integrity (TASK-086R2): report an archetype, slide, or deck as PROVEN only when slides_compose_slide succeeded AND authoritative slides_get_page readback verifies the expected native structure with no unresolved BLOCKING findings. A manually constructed slide (primitive element calls, hand-computed geometry) is NEVER PROVEN — report it UNPROVEN with the cause. Never report "Presentation Created Successfully" or "All slides PROVEN" unless every slide meets this bar.`,
]

/** Google Workspace routing + verification hints (no Slides doctrine). */
export function buildGoogleRoutingBlock(): string {
  return GOOGLE_ROUTING_LINES.join('\n')
}

/** Slides/Beautify composition doctrine (presentation intents only). */
export function buildSlidesDoctrineBlock(): string {
  return SLIDES_DOCTRINE_LINES.join('\n')
}

export function buildMcpGuidanceBlock(): string {
  return [...GOOGLE_ROUTING_LINES, ...SLIDES_DOCTRINE_LINES].join('\n')
}
