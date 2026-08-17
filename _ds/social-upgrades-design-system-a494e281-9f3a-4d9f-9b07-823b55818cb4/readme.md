# Social Upgrades — Design System

Social Upgrades (https://socialupgrades.com) builds and manages **websites, e-commerce stores, and AI chatbots on simple monthly plans** — no contracts, pause or cancel anytime, book a free demo (https://cal.com/socialupgrades/consult). US-based, building since 2014. Founder: Mitchell Fernandez.

**Products / surfaces** (one marketing website, WordPress + Salient): Website Development, E-Commerce, AI Support Chatbot, Marketing Strategy, Content Production — each with a Starter / Growth / Scale plan page and a custom-quote form.

**Sources provided:** brand kit exports in `uploads/` (logo lockups, color variants, app icons/favicons, palette, typography sheets, brand README) plus full-page screenshots of the live site (homepage hero, How It Works, all five plan pages). No codebase or Figma access — UI kit screens are recreated from these screenshots.

## CONTENT FUNDAMENTALS
- Voice: direct, confident, service-first. "We build and manage…", "handled for you." We = the team, you = the business owner.
- Big claims kept short and declarative: "Your Business. Upgraded." Period-separated punch.
- Headlines: ALL CAPS, huge ("WEBSITE DEVELOPMENT", "HOW IT WORKS"). Kicker line above in sentence case ("A Better Way to Build", "No Contracts. Pause or Cancel Anytime.").
- Plan names are one word: Starter / Growth / Scale. Feature lists are terse noun phrases with checkboxes ("Managed hosting, SSL, backups, & security", "1 active request at a time").
- CTAs: "Book a Demo", "Sign Up", "See Plans", "Request Quote", "Book Your FREE 15 Minute Consultation" (ticker). Buttons are short verbs.
- No emoji anywhere. Numerals and $ pricing shown big ("$299/month", "Buyout & handoff: $2,999 or 12 months of service").
- Reassurance is a recurring motif: "No Contracts. Pause or Cancel Anytime." repeats on every plan page.

## VISUAL FOUNDATIONS
- **Color**: Upgrade Green #1FB264, Signal Teal #189D99, Social Blue #2E3FD6, Deep Navy #0F1633, Cloud #F2F4F9. Brand gradient 135° green→blue.
- **Two surface worlds**: (1) dark hero/nav — deep navy or a low-poly faceted green→blue gradient background with white type; (2) light plan pages — flat light gray (#EFEFEF/Cloud), near-black type, hairline-bordered white panels.
- **Type**: Outfit 700–900 for headlines/wordmark/buttons (caps, tight leading); Poppins 400–600 for body, subheads, nav, labels. Mega headlines clamp up to ~120px.
- **Backgrounds**: poly gradient texture (generated `assets/poly-hero.png` — see caveats), solid navy, flat light gray. Gradient cards (green→blue at varying angles) for step cards and social tiles.
- **Buttons**: on light pages — solid black pill, white Poppins text, small white circle with ↗ arrow at right ("Sign Up"); black square-corner button ("Request Quote", "BOOK A DEMO"); thin-outline ghost ("SEE PLANS", "Login"). On dark — white outline pill or gradient pill ("Book a Demo").
- **Checklists**: small navy/blue checkbox squares with white check, left of each feature line; nested items indent.
- **Cards**: white or gradient, 16–24px radius, soft wide shadows on brand-sheet cards; plan columns on the site are flat with 1px hairline dividers, square corners.
- **Forms**: minimal 1px light-gray bordered inputs, small radius, gray placeholder, generous height.
- **Motion**: modest — ticker bar scrolls horizontally; hovers darken/lift slightly. No bounces.
- **Layout**: full-bleed sections, centered content, max ~1200px text measure; ticker bar pinned at very top; footer strips with tiny caps labels ("BASED IN THE UNITED STATES · BUILDING SINCE 2014").
- **Radii**: pills (999) for CTAs and plan sign-ups; 0–6px for utility buttons/inputs; 16–24px for brand cards.
- **Imagery**: 3D-rendered glossy icon illustrations in green/blue (How It Works cards) — provided only inside screenshots, not as standalone assets.

## ICONOGRAPHY
- No icon font or SVG icon set found in sources. Icons in use: ✓ checkbox squares (CSS-drawn), ↗ arrow in button circles (unicode/CSS), platform logos (WordPress, Webflow, Framer — not copied, third-party marks), 3D illustrative icons (raster, embedded in screenshots only).
- The chevron logo mark doubles as the only brand glyph: `assets/logo.svg` (full color), `logo-mono-navy.svg`, `logo-mono-white.svg`, `logo-on-dark.svg`, app icons + favicon, `social-avatar.svg`.
- For any additional UI icons, use a thin geometric line set (e.g. Lucide via CDN) and flag it — none exist in the brand today.

## Intentional additions
- `assets/poly-hero.png` / `poly-navy.png` — programmatically generated low-poly gradient textures approximating the site hero background (original image asset unavailable).

## INDEX
- `styles.css` → `tokens/` (fonts, colors, typography, spacing, effects)
- `assets/` — logos, app icons, lockups, poly backgrounds
- `components/core/` — Logo, Button · `components/forms/` — Input, Textarea · `components/marketing/` — SectionHeader, CheckList, PlanCard, StepCard · `components/navigation/` — Navbar, TickerBar
- `guidelines/` — foundation specimen cards
- `ui_kits/website/` — marketing-site recreation (home, plan page)
- `SKILL.md` — agent skill entry point
