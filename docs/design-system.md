# Design System

## Personality

Group Crash is energetic, social, playful, bold, slightly chaotic, and welcoming. It should feel like stylish TV game-show graphics.

It must not feel like:

- A SaaS dashboard
- A corporate admin panel
- A streaming-service clone
- A mobile banking app
- A generic Material Design template

## Color Tokens

Initial tokens:

```css
:root {
  --gc-red: #e62727;
  --gc-yellow: #fff200;
  --gc-cream: #fff8ed;
  --gc-ink: #291313;
  --gc-white: #ffffff;
}
```

Use red as the environment.

Use yellow for:

- Primary actions
- Host authority
- Important status
- Active focus
- Selection
- Celebratory accents

Use cream for:

- Player cards
- Message surfaces
- Inputs
- High-readability content areas

Use dark ink for:

- Main text
- Borders
- Icon silhouettes

Do not introduce extra accent colors unless there is a clear product need.

## Typography

Use two typography roles:

- Display: bold, rounded, oversized. Used for logo, room code, primary status, major prompts.
- Interface: rounded, readable sans serif. Used for player names, messages, buttons, and supporting labels.

Preferred families from the Figma direction:

- Display: Fredoka
- Interface: Nunito

Do not use thin weights.

## Spacing

Use a simple spacing scale:

```text
4, 8, 12, 16, 24, 32, 48, 64
```

Prefer generous negative space. Do not fill the TV screen just because space exists.

## Shape

Suggested radii:

```text
Small: 12px
Medium: 20px
Large: 32px
Pill: 999px
```

Suggested borders:

```text
Standard: 2px
Emphasis: 4px
TV focus: 6px
```

Use rounded cards, pills, circles, stars, planets, orbital rings, and abstract cosmic shapes.

## TV Layout

Design for:

```text
1920 x 1080
16:9
```

The TV layout should also survive:

```text
1280 x 720
3840 x 2160
```

Keep important content inside a comfortable safe area.

No important text should sit near the extreme screen edges.

## Phone Layout

Target:

```text
320px through 480px wide
```

Controls should be at least 44 x 44 pixels.

Long names and messages must truncate or wrap gracefully.

## Focus States

TV focus states must be unmistakable. Use:

- Thick yellow or cream outline
- Slight scale change
- High contrast
- Short transition, around 100ms to 160ms

Do not rely on hover.

## Motion

Recommended motion:

- Player joins: quick elastic pop
- Player disconnects: fade and shrink
- Message arrives: slide and small bounce
- Host changes: crown or badge pops to new host
- Vote passes: yellow burst
- Vote fails: restrained shake
- Room-code reveal: short scale animation

Avoid constant decorative animation that competes with important information.

Provide reduced-motion alternatives later.

## Component Inventory

The lobby implementation should start with:

- Primary button
- Secondary button
- Destructive button
- Icon button
- Quick-message button
- Player card
- Compact player chip
- Chess avatar
- Host badge
- Wants-host badge
- Connection indicator
- Room-code pill
- QR-code panel
- Chat message
- Toast notification
- Host vote modal
- Vote option
- Vote-count display
- Empty game card
- Text input
- Name input
- Avatar selector
- Join-role selector
- Phone navigation bar
- TV remote focus wrapper

