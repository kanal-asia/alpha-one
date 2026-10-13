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
  `- Alpha Beautify (presentations): presentation-generation intents ("Buatkan presentasi...", "Create/Make a presentation/pitch deck...") default to professional composition ON unless the user explicitly asks for plain/simple/raw/minimal title-body. For any NEW deck with 2 or more slides, call slides_compose_deck exactly once with a complete semantic DeckSpec; do NOT create a deck by looping slides_create_presentation, slides_create_slide, and slides_compose_slide. Use slides_compose_slide only for an explicit single-slide request, compatibility with existing one-slide flows, or editing/composing one existing slide. Never map every slide to TITLE_AND_BODY; never duplicate source lists alongside visualizations; never flatten slides into images; keep every value/label/unit factually unchanged.`,
  `- Alpha Beautify fail-closed rule: if slides_compose_deck or slides_compose_slide fails, inspect the exact error, fix the invocation/input when safe, retry boundedly only when the result explicitly allows retry, and verify through readback. In deck-level flow, do NOT retry by changing per-slide archetypes manually; the deck engine owns archetype/variant selection. NEVER silently fall back to plain title/body placeholders while reporting an archetype as proven. ARCHETYPE_PROVEN requires the expected native structure present in authoritative readback. If composition cannot complete, say so explicitly with the failing slide and error.`,
  `- Alpha Beautify no-primitive-fallback rule (TASK-086R2/TASK-095-R2): when the request routes to professional archetype composition, slides_compose_deck is the ONLY authorized composition path for new decks with 2 or more slides, and slides_compose_slide is the authorized path only for explicit single-slide/existing-slide composition. If the appropriate compose tool is absent or terminally fails, do NOT reconstruct the deck or slide with slides_create_element / slides_update_element / slides_batch_update loops and do NOT claim success. STOP the professional generation and report explicitly: "Professional Slides composition capability is unavailable in this runtime. Presentation generation stopped before fallback composition." Primitive Slides tools remain valid ONLY for explicit targeted edits the user directly requested (change one text, move/delete/create one element) — never as a substitute for the compose engine.`,
  `- Alpha Beautify success-claim integrity (TASK-086R2/TASK-095-R2): report an archetype, slide, or deck as PROVEN only when slides_compose_deck (for new 2+ slide decks) or slides_compose_slide (for explicit single-slide/existing-slide work) succeeded AND authoritative readback verifies the expected native structure with no unresolved BLOCKING findings. A manually constructed slide or agent-loop-assembled deck is NEVER PROVEN — report it UNPROVEN with the cause. Never report "Presentation Created Successfully" or "All slides PROVEN" unless every slide meets this bar.`,
  `- Alpha Beautify semantic routing (TASK-090-R2): the engine is the SINGLE semantic authority for visual grammar. You suggest an archetype; the engine validates it against content semantics and redirects degrading selections. To help the engine succeed, shape your payload correctly:`,
  `  • KPI_DASHBOARD = independent business KPIs (ARR, retention, satisfaction). metrics [{label, value}]. Do NOT use for channel rankings, budget allocations, or percentage distributions — the engine will redirect these.`,
  `  • CHANNEL RANKINGS (percentages like 42%, 28%, 18%, 12%) → COMPARISON with columns [{name:"Channel", items:["42%"]}] (ranked proportional bars).`,
  `  • BUDGET ALLOCATIONS (total + amounts + percentages) → PILLARS_STRATEGY with columns [{name:"Category 50%", items:["Rp2B"]}] and sharedGoal (never droppable).`,
  `  • FUNNEL (ordered conversion stages: visitors→leads→trials→paid) → PROCESS_FUNNEL with stages [{label, description}]. Values must be in description.`,
  `  • EXECUTIVE_SUMMARY with metrics → bullets with embedded metrics (Rp12B, 2500, 92%). The engine extracts hero metrics automatically.`,
  `  • PILLARS + shared goal → PILLARS_STRATEGY with columns [{name, items[]}] + sharedGoal. The goal is NEVER droppable.`,
  `  • CLOSING → CLOSING_INSIGHT with closing statement. Keep under 200 chars for standard layout.`,
  `- Alpha Beautify no-substitution rule (TASK-090-R1/TASK-095-R2): if compose fails for a semantic intent, retry the SAME intent with a corrected payload shape only when retry is explicitly allowed. NEVER repair a failed ranking by rendering an Executive Summary, never repair a failed distribution by rendering numbered bullets, and never substitute another archetype merely to obtain qaPass=true. In deck-level flow, never choose retry archetypes per slide; the deck engine owns semantic routing. A degrading substitution is a wrong result even when all facts survive. If no equivalent safe encoding exists, report the blocking failure explicitly.`,
  `- Alpha Beautify terminal-error rule (TASK-093-R2/TASK-095-R2): a deterministic provider failure (Google Slides HTTP 400 request-validation, e.g. invalid text range) is TERMINAL — stop after the first failure. Do NOT repeat the identical compose call, do NOT tweak content merely to evade an engine defect, and do NOT fall back to primitive element tools. Report presentationId, pageObjectId or slideKey, providerStatus, failedRequestIndex/Type, and the honest verdict. Retry a compose call ONLY when the returned result explicitly declares retryable:true AND the writeOutcome permits it (NOT_APPLIED or NOT_ATTEMPTED); a terminal error declares retryable:false. Retry remains allowed only for explicitly classified transient readback/network conditions, and an UNKNOWN write outcome must be verified before any further write.`,
  `- Alpha Beautify deck lifecycle (TASK-095-R2): for a new 2+ slide deck, slides_compose_deck handles presentation creation, exact-N slide lifecycle, atomic deck content batch, aggregate separation, deck-level readback, and proof statuses. Do NOT pre-create the presentation, create slides, call slides_compose_slide per slide, or run an agent-controlled archetype retry loop for deck generation. For existing user decks or explicit single-slide tasks, use the single-slide/edit tools only on the targeted existing page.`,
  `- Alpha Beautify deck-assembly discipline (TASK-095-R2): normal multi-slide presentation generation is one slides_compose_deck call with the full typed topology. A success response must never describe an agent-loop-built deck as deck-runtime proven. Final verification distinguishes total slide records, meaningful slides, blank slides, aggregate facts, and failed slide IDs: slideCount alone is insufficient.`,
  `- Alpha Beautify verification economy (TASK-095-R2): slides_compose_deck returns deck-level readback/fidelity evidence for new 2+ slide decks; rely on that and perform at most one final deck readback if needed. Per-slide readbacks and per-slide compose loops are obsolete for normal new deck generation now that the deck-level tool exists.`,
  `- Alpha Beautify factual immutability (TASK-094): source categories, labels, values, percentages, amounts, totals, and their relationships are immutable. Never merge two categories, never drop one, never rename one, never change a number to fit a layout. If content does not fit, the engine fails honestly — report the blocking finding instead of editing facts.`,
  `- Alpha Beautify source payload rule (TASK-094-R1): copy mandatory slide facts verbatim from the user into compose input (labels, values, percentages, amounts, totals, order) AND into the optional sourceFacts field (max 8 lines, verbatim user wording) so the engine gates input against source before any write. Never merge categories to fit a layout; never shorten, rename, omit, or combine mandatory facts; never retry with altered facts. Keep totals and component relationships intact. Style instructions belong in userPrompt/themeId only and can never overwrite factual source. If the layout cannot fit, let the engine reflow or fail honestly.`,
]

const THEME_SELECTION_LINES = [
  `- Alpha Beautify theme selection (TASK-092/092-R1/TASK-096): the engine applies a visual theme with full art direction to every composition. For normal deck generation (slides_compose_deck), ALPHA_NAVY_TEAL_PRODUCTION_V1 is the default: deep navy canvas, teal primary accent, image-gradient hero/closing surfaces, full production layout family. Pass themeId in compose args to select a different theme; omit for the production default. Available themes:`,
  `  • ALPHA_NAVY_TEAL_PRODUCTION_V1 — production default for normal deck generation. Deep navy/teal premium identity, image-gradient hero and closing backgrounds, full art direction (default for slides_compose_deck).`,
  `  • EXECUTIVE_NAVY — board presentations, management reviews, enterprise proposals. Restrained, formal, outlined cards, standard typography (per-slide default).`,
  `  • MODERN_GRADIENT — product strategy, technology, innovation. Dark layered background, luminous accents, hero metrics, rich panels.`,
  `  • EDITORIAL_MINIMAL — thought leadership, reports, narrative strategy. Typography-led, NO cards, generous whitespace, thin dividers, Georgia titles.`,
  `  • BOLD_TECH — AI, technology launches, developer narratives. Dark canvas, SHARP geometry (rectangles), strong accent edges, bold metrics.`,
  `  • WARM_STRATEGY — workshops, organizational strategy, people narratives. Warm canvas, soft fills, approachable language.`,
  `  • DATA_INTELLIGENCE — analytics, performance reviews, financial presentations. Dark, analytical data-viz, monospace metrics, compact density.`,
  `  • PREMIUM_MONOCHROME — premium proposals, executive narratives. Black/white/gray, typography-heavy, thin lines, monochrome fills, HERO numbers.`,
  `  • KANAL_BRAND — Kanal Digital Indonesia official decks. Brand-authentic orange-red accent, professional, clean.`,
  `- Theme selection rule: infer theme from user prompt tone/keywords (e.g. "formal"→EXECUTIVE_NAVY, "tech launch"→BOLD_TECH, "monochrome"→PREMIUM_MONOCHROME). If user explicitly names a theme, pass it as themeId. When themeId is absent, pass the original user prompt as userPrompt so the engine can infer theme from intent. Theme never affects semantic routing, factual content, or encoding — only palette, surface language, shape, typography, decorative motif, and data-viz treatment.`,
]

/** Google Workspace routing + verification hints (no Slides doctrine). */
export function buildGoogleRoutingBlock(): string {
  return GOOGLE_ROUTING_LINES.join('\n')
}

/** Slides/Beautify composition doctrine (presentation intents only). */
export function buildSlidesDoctrineBlock(): string {
  return [...SLIDES_DOCTRINE_LINES, ...THEME_SELECTION_LINES].join('\n')
}

export function buildMcpGuidanceBlock(): string {
  return [...GOOGLE_ROUTING_LINES, ...SLIDES_DOCTRINE_LINES, ...THEME_SELECTION_LINES].join('\n')
}
