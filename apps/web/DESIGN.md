---
name: Myriad
description: A focused charcoal workspace for C programming exams.
colors:
  primary: "#e2e2e2"
  primary-hover: "#fff"
  canvas: "#181818"
  surface: "#222222"
  chrome: "#2d2d2d"
  selected: "#353535"
  border: "#363636"
  text: "#e5e5e3"
  muted: "#aaa"
  field: "#1b1b1b"
  field-border: "#505050"
  editor: "#1b1b1b"
  focus: "#b7d2f0"
  success: "#bedb9c"
  error: "#efb1a9"
  warning: "#eac092"
typography:
  headline:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "27px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.7
  label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.65
rounded:
  field: "6px"
  button: "7px"
  badge: "5px"
  rail: "11px"
  dialog: "12px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "16px"
  prose: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.field}"
    rounded: "{rounded.field}"
    padding: "10px"
  problem-selected:
    backgroundColor: "{colors.selected}"
    rounded: "{rounded.button}"
    padding: "11px 10px"
---

# Design System: Myriad

## Overview

**Creative North Star: "The Codex Workspace"**

A focused programming workspace modeled on the Codex desktop reference. Neutral charcoal surfaces, quiet dividers and compact type keep the problem, source and execution feedback close together. Traditional Chinese labels explain actions and state directly.

Density comes from stable panes and restrained spacing. Tonal selection, underlines, icons and written status establish hierarchy; color supports those signals. The editor is the working center, with identity and remaining time visible around it.

**Key Characteristics:**

- Neutral charcoal shell with a narrow icon rail.
- Independent statement, source and judge surfaces.
- Persistent exam time and self-declared identity.
- Compact controls with visible keyboard focus.

## Mark

The mark is a pale rounded tile holding a 5 × 5 field of nodes. Every dot is a judging node, one per student browser; the five dark ones form a check, the nodes that passed. The faint nodes say scale and distribution, the check says the verdict. It appears beside the name in the sidebar, as the favicon (SVG; PNG sizes use slightly larger nodes and fainter background dots so the check survives at 16 px) and as the app icon (full-bleed on iOS). The OG image (`public/og.png`, source `brand/og.html`) scales the same idea: a field of nodes on charcoal, with a run of lit nodes forming a check, beside the name and the line "Reimagining programming exams and real-time online judging."

## Colors

Charcoal establishes the working surfaces; pale neutral actions and restrained semantic colors carry attention.

### Primary

The pale primary fill marks submission, identity confirmation and entry into an exam. Its dark text remains distinct from secondary controls. The lighter hover state reinforces the same role.

### Neutral

Canvas is the deepest broad surface. Surface frames the problem list and judge panel; chrome frames the rail, top bar and secondary buttons. Selected is a quiet row highlight. Editor and field are slightly separated from canvas. Border divides neighboring surfaces; text and muted separate working content from supporting labels.

### Semantic signals

Success marks accepted verdicts; error marks diagnostics and alerts; warning marks urgent time. Focus is reserved for keyboard outlines. Syntax colors remain within the code editor's One Dark highlighting.

**The Written State Rule.** A status remains understandable without its color through visible words, icons or selection underlines.

## Typography

System UI typography supports Traditional Chinese labels and compact operating controls. Monospace is used for code and technical output; countdowns, scores and table measurements use tabular numerals.

The headline role serves page headings; statement headings step down to 23px. Section titles are 18px, statement section titles 17px, and tertiary headings 14px. Body prose has a relaxed line height and statement paragraphs stop at 75ch. Pane labels, status copy and judge controls use 12px; small editor metadata uses 11px. CodeMirror defaults to 14px, with a Menlo-capable monospace stack; output blocks use the code role above. There is no display or marketing type tier.

## Layout

The full-height shell uses `100dvh`, with overflow contained inside the working panes. At widths of 1100px and above, the icon rail is 56px, the problem list 240px and the main region flexible. Within the main workspace, the judge panel is 320px and the remaining width belongs to the statement/editor column.

The central column starts with 40% statement height, a 5px horizontal splitter and the editor in the remaining space. Pointer dragging and the keyboard-operable range control adjust the statement share from 15% to 75%; the chosen size persists. The statement can collapse and reopen from the editor header. Pane headers are 38px, the main top bar and editor action bar 55px. Each content area scrolls independently.

At widths of 1099px and below, the list and judge panel become controlled drawers. The list opens next to the rail at 240px wide; the judge drawer remains 320px. The exam's identity strip stays visible below the top bar with the current student ID and its self-declared status. The top bar keeps timing visible.

At widths of 650px and below, the rail narrows to 44px and its controls to 36px. The main workspace shows one of three views: 題目, 程式 or 結果. The splitter is hidden; results occupy the main content width. Sample input/output stack vertically. Running or submitting switches to results immediately so compilation diagnostics and subsequent output share the same destination.

General pages use a centered region capped at 1120px, with 38px vertical and 42px horizontal padding. Padding contracts to 28px at the drawer breakpoint and 24px by 18px on phones. Lists and tables preserve the shell's density instead of becoming a dashboard of cards.

## Elevation & Depth

Depth comes from tonal layering and single-pixel dividers, without box shadows. The identity dialog uses a translucent black backdrop and a brighter boundary. Drawers overlay the workspace while preserving the same surface language.

## Motion

Motion explains state and continuity; it never decorates. The authored moment is the judge stream: keyed verdict rows settle into the ledger one by one, a 2px hairline fills as verdicts arrive (sweeping while compiling or connecting), and the saved score counts up in tabular numerals. Saved results stay neutral; motion never makes a provisional browser verdict look like an official grade.

Supporting motion keeps the workspace continuous. One selection surface slides between rail icons and problem rows, and one underline travels between tabs. Route changes cross-fade, and the exam title morphs between the list and the overview. Drawers wipe open from their edge with `clip-path`. Collapsing the statement eases the editor upward. Dialogs rise slightly into place, and popups unfold from their trigger. Pressed buttons scale to 0.97.

Durations: 100ms press, 140ms feedback and exits, 200ms routine state changes, 280ms layout and selection travel. Arrivals use `cubic-bezier(0.16, 1, 0.3, 1)`; exits are shorter than entrances. Loading uses layout-shaped charcoal skeletons with a faint sheen rather than spinners, and spinners replace an action's icon only while that action is running. Reduced motion removes spatial movement, sheen, spin, view transitions and count-ups; color and opacity changes that carry state remain.

## Shapes

Controls have gently rounded corners: buttons use the button radius, fields and code blocks the field radius, and status badges the badge radius. Rail selections are softer; the identity dialog has the broadest corners. Pane boundaries, table rows and tab underlines stay straight. Small status dots are circular. Avoid adding ornamental shapes to the working canvas.

## Components

### Buttons

Primary actions use pale fill, dark text and semibold type. Secondary actions use chrome fill with a quiet border. Both share compact padding and icon/label spacing. Hover brightens the fill; disabled controls use 45% opacity and the disabled cursor. Keyboard focus has a 2px focus outline offset by 3px.

### Navigation and tabs

The rail uses labeled icon buttons with tooltips and a filled active state. Problem rows combine a letter, title and optional completion icon; the active row uses selected fill. Judge tabs offer 執行, 判題 and 紀錄, with a pale 2px underline on selection. Phone tabs use the same underline vocabulary for 題目, 程式 and 結果.

### Fields and identity

Inputs and textareas are dark inset surfaces with a visible boundary and associated labels. The native modal dialog names the identity field, supports cancellation and confirms a self-declared student ID. Current identity stays in the desktop list footer or the compact identity strip. Drafts belong to a student, exam and problem; switching identity changes the visible draft accordingly. The editor header speaks up only when a draft cannot be saved: before an identity is chosen or after a storage failure.

### Editor and splitter

The source editor shows line numbers, syntax highlighting and a subtle active line on the dark editor surface. Its accessible name is C 程式碼編輯器. Focus shows through the caret and active line, without an outline around the editor. Typing offers basic completion in a charcoal list: C keywords, common standard-library functions with their signatures, short snippets marked 片段, names already in the file and header names after `#include`; Enter accepts and Tab stays free for focus movement. Brackets and quotes close automatically and matching brackets are highlighted. 格式化 in the editor header (Shift+Alt+F) puts the contents of single-line blocks one statement per line, re-indents from the syntax tree, strips trailing spaces and ends with one newline as a single undoable edit; it never runs on save or submission. A compact filename header and fixed action footer frame it; 執行 is secondary and 提交 is primary. The splitter is a thin horizontal range control with a small visible grip and an accessible height-adjustment label.

### Judge feedback

Compiler readiness combines a dot with explicit text. The run panel pairs a custom-input textarea with output and duration; compilation diagnostics are visible above the selected panel content. Run and submission errors appear at the top of the judge panel, never in the page banner. A submission the server refuses is not left pending, and 提交 shows the remaining seconds of the five-second cooldown. The judge panel shows progress, numbered verdict rows, an interrupted-submission continuation action when applicable, and an explicit saved confirmation. The saved result explains that browser judging is provisional pending teacher review. Submission history uses compact divided rows.

### Lists, badges and tables

Exam navigation uses full-width rows with title, schedule and a compact outlined status badge. Private teacher verification reports and analytics use flat tables with quiet horizontal dividers and tabular numerals. Teacher summary counts use larger numerals with small labels. Exam selection uses the shared custom Select component: a labeled combobox, charcoal listbox, highlighted active option and checkmark on the selected item. Arrow keys, Enter, Escape, Tab and prefix typing provide keyboard operation. Report details use the shared Collapsible component with a full-width disclosure button, rotating chevron and an explicitly labeled content region. Empty states provide a short title or message and the relevant next step without illustration or decorative cards.

## Do's and Don'ts

### Do:

- Do retain the charcoal shell and compact pane hierarchy.
- Do keep the current student identity and exam timing visible at narrow widths.
- Do pair status color with text, an icon or an underline.
- Do preserve clear distinctions between local drafts, saved submissions and released grades.
- Do use Traditional Chinese for operating controls and explanatory copy.

### Don't:

- Don't introduce decorative blue panels or a promotional hero into the workspace.
- Don't replace pane dividers and rows with elevated card stacks.
- Don't use monospace as the general interface typeface.
- Don't make a successful browser verdict look like a released official grade.

Student access ends with the exam. The shell displays an ended message instead of the workspace or submission history. There is no student grades tab or report-publication action; uploaded verification reports remain inside the teacher workspace.

Implementation ownership and interaction contracts are documented in [ARCHITECTURE.md](ARCHITECTURE.md). Semantic theme values are defined in `src/styles/tokens.css`; component layout rules are colocated with their Svelte components.
