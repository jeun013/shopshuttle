---
name: Premium Brutalist CSV
colors:
  surface: '#141313'
  surface-dim: '#141313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353435'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c6c6ca'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#909095'
  outline-variant: '#45474a'
  surface-tint: '#c6c6ca'
  primary: '#c6c6ca'
  on-primary: '#2f3034'
  primary-container: '#0d0f12'
  on-primary-container: '#7a7b7f'
  inverse-primary: '#5d5e62'
  secondary: '#c7c6c4'
  on-secondary: '#2f312f'
  secondary-container: '#464745'
  on-secondary-container: '#b5b5b3'
  tertiary: '#f0c04f'
  on-tertiary: '#3f2e00'
  tertiary-container: '#160e00'
  on-tertiary-container: '#9d7600'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e6'
  primary-fixed-dim: '#c6c6ca'
  on-primary-fixed: '#1a1c1f'
  on-primary-fixed-variant: '#45474a'
  secondary-fixed: '#e3e2e0'
  secondary-fixed-dim: '#c7c6c4'
  on-secondary-fixed: '#1a1c1a'
  on-secondary-fixed-variant: '#464745'
  tertiary-fixed: '#ffdf9e'
  tertiary-fixed-dim: '#f0c04f'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5b4300'
  background: '#141313'
  on-background: '#e5e2e1'
  surface-variant: '#353435'
  gold-premium: '#f5c453'
  gold-muted: '#c2901c'
  carbon-depth: '#16191d'
  border-subtle: rgba(252, 251, 248, 0.1)
  glass-bg: rgba(13, 15, 18, 0.7)
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.08em
  code-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  container-max: 1440px
---

## Brand & Style

This design system embodies a **Modern Premium Brutalist** aesthetic, striking a balance between high-utility technical precision and luxury exclusivity. It is designed for professional e-commerce operators and developers who value efficiency, security, and a sophisticated workspace.

The style is characterized by high-contrast minimalist layouts, employing a stark division between "Carbon" and "Cream" surfaces. Unlike traditional brutalism, which can be raw or abrasive, this "Premium" variant uses sharp 1px borders, subtle glassmorphic backdrop filters, and refined "Gold" accents to signify high-value actions and security. The UI feels architectural, dependable, and intentionally engineered.

Key visual principles:
- **Structural Integrity:** Use of thin, high-contrast borders to define zones instead of soft shadows.
- **Intentional Contrast:** Deep navy and pristine cream backgrounds create a clear hierarchy.
- **Technical Luxury:** Monospaced-adjacent clarity paired with elegant, wide-tracked headings.

## Colors

The palette is anchored by a high-contrast foundation. **Deep Carbon-Navy (#0d0f12)** serves as the primary surface in dark mode, providing a focused, low-strain environment for data processing. **Pristine Cream (#fcfbf8)** acts as the light mode counterpart, offering a more "literary" and sophisticated feel than pure white.

**Premium Gold** is used surgically to denote value, security, and conversion pathways. In dark mode, a more vibrant **#f5c453** is used to maintain legibility against the carbon background, while a more grounded **#c2901c** is used for light mode accents.

Neutral tones should favor the cool spectrum in dark mode and the warm spectrum in light mode to maintain the "Cream/Carbon" narrative.

## Typography

The typography strategy pairs the geometric confidence of **Outfit** for headings with the systematic neutrality of **Inter** for UI elements and data-heavy body text.

- **Headings:** Outfit should be set with tighter letter spacing at larger sizes to emphasize the brutalist structure.
- **Body:** Inter is used for all functional text, ensuring high legibility during complex CSV mapping tasks.
- **Labels:** Small labels use heavy tracking and uppercase styling to provide a "technical manual" aesthetic.
- **Hierarchy:** Maintain a clear distinction between editorial headings (Outfit) and functional UI labels (Inter).

## Layout & Spacing

This design system utilizes a **Fixed Grid** philosophy for desktop to maintain the "utility tool" feel, transitioning to a fluid model for mobile. 

- **Grid:** A 12-column system with 24px gutters. Content is often housed in "Panels" that align strictly to grid lines.
- **Rhythm:** An 8px linear scale (using a 4px base unit) governs all padding and margins. 
- **Panels:** Use a "Sidebar + Main Stage" layout. The left sidebar (320px fixed) handles configuration, while the main stage expands to show data previews.
- **Security Contexts:** Components like the Privacy Notice should use a consistent 12px internal padding to feel contained and deliberate.

## Elevation & Depth

Depth is achieved through **Tonal Layers** and **Glassmorphism** rather than traditional soft shadows.

- **The Surface System:**
  - **Level 0 (Background):** Pure Carbon or Cream.
  - **Level 1 (Panels):** A slightly lighter/darker tint with a 1px solid border.
  - **Level 2 (Modals/Floating Actions):** Use a `backdrop-filter: blur(12px)` with a semi-transparent background to create a "glass" effect.
- **Floating Actions:** These are the only elements permitted to have shadows. Use "Ambient Shadows"—diffused, low-opacity (#000000 at 20%) with a wide spread (20-30px) to make them appear truly detached from the technical grid.
- **Borders:** Dynamic 1px borders are the primary separator. Use dashed borders specifically for "Notice" or "Draft" states to distinguish them from permanent UI containers.

## Shapes

In keeping with the **Brutalist** influence, the design system utilizes **Sharp (0px)** corners for primary containers, inputs, and layout panels. This reinforces the technical, "no-fluff" utility of a CSV builder.

Exceptions:
- **Floating Buttons:** May use a subtle `rounded-sm` (4px) to make them feel more ergonomic and distinct from the structural background.
- **Privacy Notices:** Use a 4px radius to soften the presentation of "human-centric" information (security/privacy) against the sharp technical UI.

## Components

### Floating Action Group
Located in the bottom-right, these buttons are stacked vertically. The **Pricing Button** features a subtle Gold gradient border and a backdrop blur. On hover, apply a `translateY(-4px)` and increase the border-opacity. Icons should be minimal 20px strokes.

### Privacy & Security Guarantee Notices
These cards appear beneath critical inputs. 
- **Background:** 2% Gold tint (`rgba(245, 196, 83, 0.02)`).
- **Border:** 1.5px dashed Gold or Neutral-Border.
- **Icon:** A small Gold lock icon positioned top-left.
- **Typography:** Use `body-sm` for the text, with bolded "Zero Server Storage" headers to ensure quick scanning.

### Buttons & Inputs
- **Inputs:** Sharp edges, 1px solid border, Inter typography. Focus state uses a 1px Gold border.
- **Primary Buttons:** High-contrast (Black on Cream or vice-versa), sharp edges, uppercase labels.
- **Premium Buttons:** Gold background with dark navy text, utilizing a slight inner-glow for a "metallic" feel without using dated gradients.

### Data Tables (CSV Preview)
Strict 1px grid lines, monospaced-style Inter font for cell content, and a sticky header with a backdrop-blur.