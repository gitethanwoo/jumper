# Fix Keyboard Styling & Proportions

## Problem
The hand-rolled QWERTY keyboard looks terrible because:
1. `calculateBaseKeyWidth()` uses `view.bounds.width` during `viewDidLoad()` — bounds are 0 at that point, so all keys collapse to the 20px minimum fallback
2. Vertical row spacing is 6px (iOS uses ~12px via button insets)
3. Fixed 46px row heights don't fill the container properly

## Reference: KeyboardKit iOS Metrics (iPhone Portrait)

Extracted from [KeyboardKit source](https://github.com/KeyboardKit/KeyboardKit).

### Layout
- **Row height**: 54pt (iPhone), 56pt (iPhone large/Pro Max)
- **Button insets**: 3pt horizontal, 5pt vertical (creates ~10pt visual gap between rows, ~6pt between keys)
- **Button corner radius**: 5pt
- **Keyboard bottom edge inset**: -2pt

### Colors
| Surface | Light Mode | Dark Mode |
|---|---|---|
| Keyboard background | `rgb(213,214,221)` | `rgb(44,44,44)` |
| Light keys (letters) | `rgb(255,255,255)` | `rgb(107,107,107)` |
| Dark keys (shift/backspace/123) | `rgb(171,177,186)` | `rgb(71,71,71)` |
| Key shadow | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.7)` |
| Key text | `.label` | `.label` |

### Typography
- **Letters (lowercase/uppercase)**: 26pt, `.light` weight
- **Special labels (123, return, etc.)**: 16pt, `.regular` weight
- **Space label**: 16pt
- **SF Symbols (shift, backspace, globe)**: 20pt, `.light` weight

### Shadows
- Shadow size: 1pt
- Shadow color: see table above
- Shadow offset: (0, 1)

### Key Widths
KeyboardKit uses proportional Auto Layout, not fixed pixel widths:
- Row 0 (QWERTYUIOP): 10 equal-width keys
- Row 1 (ASDFGHJKL): 9 equal-width keys, centered with flexible half-spacers
- Row 2: shift/backspace get `inputPercentage(1.3)` — 1.3x the standard key width
- Row 3: 123/return ~1.5x, globe ~1x, space uses `.available` (fills remaining)

## Fix

Single file: `targets/keyboard/KeyboardViewController.swift`

### 1. Replace calculated widths with Auto Layout proportional constraints
- Delete `calculateBaseKeyWidth()` entirely
- Row 0/1: use `UIStackView` with `distribution = .fillEqually`, `spacing = 6`
- Row 2: constrain shift/backspace width to `1.3 * letterKey.width`, letter keys equal to each other
- Row 3: constrain 123/send to fixed multiplier, space gets low hugging priority to fill remaining

### 2. Fix vertical spacing
- `keyboardContainer.spacing = 0` (insets handle gaps)
- Each row gets a fixed height of **54pt** (matching iOS iPhone portrait)
- Rows are wrapped in a container view with **5pt vertical padding** on top/bottom (creates 10pt visual gap between rows)
- Or simpler: set `keyboardContainer.spacing = 10`, row heights to 44pt
  - 4 rows × 44pt + 3 gaps × 10pt = 206pt. Container is 234pt → 28pt remaining → distribute as top/bottom padding

### 3. Fix overall layout math
Total height budget: 290pt
```
 8pt  top padding
36pt  prompt row
 6pt  gap
230pt keyboard container (4 rows)
10pt  bottom padding
```
Within 230pt container, spacing = 10pt:
- Available for rows: 230 - 3×10 = 200pt
- Row height: 50pt each (200/4)
- This is close to iOS's 54pt row height minus the 5pt vertical button insets = 44pt visible key + 10pt gap ≈ matches

### 4. Fix colors to match iOS exactly
Replace the current `keyBackgroundColor`/`keyboardSurfaceColor` with the exact KeyboardKit values from the table above.

### 5. Fix typography
- Letter keys: 26pt `.light` weight (currently 22pt `.regular`)
- Special text labels: 16pt `.regular`
- SF Symbols: 20pt `.light` (currently 16pt `.medium`)

### 6. Fix shadow
- Size: 1pt (current is 0.5pt radius — change to 1pt)
- Opacity: 0.3 light / 0.7 dark (current is flat 0.2 / 0.0)
- Offset: (0, 1) — current is correct

### 7. Remove key border
- KeyboardKit uses **no border** by default (`borderSize = 0`)
- Current code has `layer.borderWidth = 0.5` on every key — remove it
