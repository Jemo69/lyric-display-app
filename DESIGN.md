---
name: LyricDisplay
description: Calm, dark-mode lyric control for live worship production.
colors:
  chapel-charcoal: "#0a0a0a"
  warm-projection-white: "#fafafa"
  booth-slate: "#262626"
  soft-console-gray: "#a3a3a3"
  rack-edge: "#262626"
  signal-blue: "#93c5fd"
  ready-green: "#6ee7b7"
  caution-amber: "#fcd34d"
  stop-rose: "#fda4af"
typography:
  headline:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  modal: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.warm-projection-white}"
    textColor: "{colors.chapel-charcoal}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.booth-slate}"
    textColor: "{colors.warm-projection-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input-default:
    backgroundColor: "{colors.chapel-charcoal}"
    textColor: "{colors.warm-projection-white}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  modal-surface:
    backgroundColor: "{colors.chapel-charcoal}"
    textColor: "{colors.warm-projection-white}"
    rounded: "{rounded.modal}"
---

# Design System: LyricDisplay

## 1. Overview

**Creative North Star: "The Sanctuary Deck"**

LyricDisplay should feel like a worship-first control surface with the confidence of pro AV software and the restraint of a dark chapel. The app is operated in dim rooms during live services, so dark mode is not cosmetic; it is the physical environment. The interface should lower glare, make live state unmistakable, and keep every control calm under pressure.

The current system is built from Tailwind and shadcn/Radix-style primitives: compact controls, rounded medium corners, Space Grotesk typography, dark neutral surfaces, and semantic blue, green, amber, and rose status cues. The redesign should refine that foundation rather than replace it with spectacle.

It explicitly rejects the PRODUCT.md anti-references: generic SaaS dashboard, gamer or neon dark mode, church bulletin clip-art, toy-like volunteer software, and cluttered legacy AV-rack software.

**Key Characteristics:**
- Dark, low-glare surfaces for real worship and production rooms.
- Dense but disciplined control placement for fast operation.
- Status color used only where state matters.
- Rounded, familiar controls that feel safe for volunteers.
- Overlay depth reserved for modals, menus, and temporary focus.

## 2. Colors

The palette is restrained: tinted dark neutrals carry the UI, with blue for information/current focus and semantic color for live status.

### Primary
- **Warm Projection White**: The primary action and foreground color in dark mode. Use it for main text, default primary buttons, active tab text, and critical labels.
- **Chapel Charcoal**: The default dark canvas. Use it for app background, modal surfaces, and content regions that should recede in a dim room.
- **Signal Blue**: The information and selection accent. Use it for connected states, current focus, links, active search context, and instructional badges.

### Secondary
- **Ready Green**: Success and ready state. Use for authenticated, connected, loaded, synced, or safe-to-go states.
- **Caution Amber**: Warning state. Use for attention-needed states that do not stop the workflow.
- **Stop Rose**: Error and destructive state. Use for failed connection, delete, offline, blocked, or irreversible actions.

### Neutral
- **Booth Slate**: Secondary panel and toolbar surface. Use for grouped controls, muted tabs, menus, and inactive button fills.
- **Soft Console Gray**: Secondary text. Use for metadata, hints, disabled-adjacent copy, and timestamps.
- **Rack Edge**: Borders, dividers, and input strokes. Keep it subtle; it should organize, not decorate.

### Named Rules

**The Low-Glare Rule.** Dark mode is the primary environment. Never use pure black or pure white in new work; tint neutrals toward the warm chapel surface.

**The Status Earns Color Rule.** Signal Blue, Ready Green, Caution Amber, and Stop Rose are for status, focus, and action only. Do not use them as decorative washes.

## 3. Typography

**Display Font:** Space Grotesk (with sans-serif fallback)  
**Body Font:** Space Grotesk (with sans-serif fallback)  
**Label/Mono Font:** Space Grotesk for labels; system monospace only for timers, codes, and technical values.

**Character:** Space Grotesk gives the product a precise production-console voice without becoming sterile. It is geometric enough for control density, warm enough for worship software, and already present in the Tailwind config.

### Hierarchy
- **Display** (600, 1.5rem to 1.875rem, 1.15): Rare. Use for welcome, empty-state, or full-screen setup moments, not normal panels.
- **Headline** (600, 1.25rem, 1.25): Modal titles and major panel headers.
- **Title** (600, 1rem, 1.35): Section titles, current song names, tab-adjacent headings, and active workflow labels.
- **Body** (400, 0.875rem, 1.5): Standard UI copy, helper text, modal descriptions, and settings explanations. Keep prose to 65 to 75 characters per line.
- **Label** (600, 0.75rem, 0.04em tracking): Status chips, compact metadata, keyboard hints, and control labels. Uppercase is allowed only for short state words.

### Named Rules

**The Console Voice Rule.** Labels must be short, concrete, and readable at a glance. Do not use display typography inside controls, lists, or dense settings.

## 4. Elevation

LyricDisplay is flat and layered by default. Depth comes from tonal panels, borders, and state contrast. Shadows are reserved for overlays, modals, popovers, tooltips, and temporary focus surfaces that must rise above the live workspace.

### Shadow Vocabulary
- **Control Shadow** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.20)`): Existing shadcn-style buttons and inputs. Use only for small tactile confirmation.
- **Menu Shadow** (`box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28)`): Context menus, selects, popovers, and floating tooltips.
- **Modal Shadow** (`box-shadow: 0 25px 50px rgba(0, 0, 0, 0.45)`): Large blocking overlays and confirmation flows.

### Named Rules

**The Flat-Until-Floating Rule.** A surface at rest stays flat. If it floats above the live workspace, it earns shadow; if it is just a panel, it earns a border and tonal separation.

## 5. Components

### Buttons

Buttons are calm under pressure: compact, familiar, and unmistakably interactive.

- **Shape:** Medium rounded corners (6px), with 8px to 10px heights for larger flows.
- **Primary:** Warm Projection White on Chapel Charcoal in dark mode, 36px high, 16px horizontal padding, 14px text, 500 to 600 weight.
- **Hover / Focus:** Hover changes tone by about 10%. Focus uses a 1px visible ring in the current ring token, never a vague glow alone.
- **Secondary / Ghost / Tertiary:** Secondary uses Booth Slate. Ghost buttons stay transparent until hover. Link buttons are for low-risk navigation, not primary live actions.

### Chips

Chips carry state, filters, and compact metadata.

- **Style:** Rounded pills or small rounded rectangles with tinted backgrounds and readable state text.
- **State:** Selected chips must change background and text, not color alone. Connection and output chips should pair color with label or icon.

### Cards / Containers

Containers organize control groups without becoming repetitive card grids.

- **Corner Style:** Gently curved panels (8px to 12px), modal surfaces (16px).
- **Background:** Chapel Charcoal for main surfaces, Booth Slate for toolbars and grouped controls.
- **Shadow Strategy:** Flat by default. Use shadow only for floating layers.
- **Border:** Rack Edge at 1px for separation.
- **Internal Padding:** 12px for dense controls, 16px to 24px for modal and instructional content.

### Inputs / Fields

Inputs are compact and operational.

- **Style:** 36px height, 6px radius, 1px Rack Edge border, transparent or Chapel Charcoal fill.
- **Focus:** 1px ring with clear contrast. Do not remove focus states.
- **Error / Disabled:** Disabled uses opacity plus cursor change. Error uses Stop Rose plus a text label; never red alone.

### Navigation

Tabs and top-level controls should be predictable and fast.

- **Style:** Compact tab lists on muted surfaces, active tab raised through tonal contrast and text color.
- **Typography:** 14px medium labels for standard tabs, 12px semibold for dense status groups.
- **States:** Active, hover, focus, disabled, and loading states must be visually distinct.
- **Mobile Treatment:** Mobile controller navigation should feel like a trusted remote: large enough targets, fewer competing controls, and persistent output/live status.

### Modals

Modals are the current system's strongest floating component, but they must remain purposeful.

- **Shape:** Large rounded surfaces (16px) with 1px border and ring.
- **Background:** Chapel Charcoal in dark mode; do not use glassmorphism by default.
- **Motion:** 200ms to 220ms fade and scale transitions for entry and exit.
- **Content:** Use clear headers, compact descriptions, and explicit actions. Exhaust inline patterns before adding a modal.

## 6. Do's and Don'ts

### Do:
- **Do** preserve dark mode as the primary design scene for dim worship and production rooms.
- **Do** use semantic state color only for meaning: Signal Blue for information/current focus, Ready Green for safe/connected, Caution Amber for warning, Stop Rose for danger.
- **Do** keep live-state controls glanceable: output visibility, selected lyric, connection state, active file, and display routing must be obvious.
- **Do** use 1px borders, tonal layers, and compact spacing before adding shadows.
- **Do** keep keyboard focus visible and high contrast on every interactive element.

### Don't:
- **Don't** make LyricDisplay look like a generic SaaS dashboard.
- **Don't** make it gamer or neon dark mode.
- **Don't** use church bulletin clip-art or decorative worship clichés.
- **Don't** make it toy-like volunteer software; volunteer-safe still means serious and precise.
- **Don't** recreate cluttered legacy AV-rack software.
- **Don't** use side-stripe borders greater than 1px as accents on cards, list items, callouts, or alerts.
- **Don't** use gradient text or decorative glassmorphism.
- **Don't** rely on color alone for connection, output, warning, or error states.
