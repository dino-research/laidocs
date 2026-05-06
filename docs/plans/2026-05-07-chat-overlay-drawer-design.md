# Chat Overlay Drawer Design

**Date:** 2026-05-07
**Status:** Approved

## Problem
When the chat panel opens, the 3-column layout (Sidebar 260px + Editor flex + Chat 400px) makes the editor too narrow, especially on screens ≤1440px.

## Solution
Convert the chat panel from a layout column to an **overlay drawer** that floats above the editor.

### Behavior
- Drawer slides in from the right (`translateX` animation)
- Editor retains full width — no layout shift
- Editor remains fully interactive behind the drawer
- Close via X button or Escape key
- No backdrop overlay

### Specs
| Property | Value |
|---|---|
| Position | `absolute`, right edge of editor area |
| Width | `420px` |
| Height | `100%` of editor area |
| Shadow | Deep left shadow for layer separation |
| Animation | `slideInRight 0.28s` |
| z-index | `20` |
| Background | `var(--surface)` solid |

### Files Changed
1. `DocumentEditor.tsx` — Chat container: flex column → absolute overlay
2. `ChatPanel.tsx` — Add Escape key handler
