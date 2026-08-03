---
name: <Project Name>
description: <one-line tagline>
colors:
  primary: "#000000"
  neutral-bg: "#ffffff"
  neutral-fg: "#0a0a0a"
  accent: "#000000"
typography:
  display:
    fontFamily: "<serif or sans of choice>"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "normal"
  body:
    fontFamily: "<body face>"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "16px 48px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    opacity: 0.9
---

# Design System

## Overview

<1-2 sentence project summary that grounds the visual choices>

## Colors

- **primary**: <when to use, e.g. "primary CTAs, key headings">
- **neutral-bg / neutral-fg**: <body and surface roles>
- **accent**: <sparing use, e.g. "links, focus rings, the single decision point">

Tints: list each color with its token name, hex value, and use case. Never describe a tint in prose without naming the token.

## Typography

- **display**: <the face, weight, optical size, where it appears>
- **body**: <the face, weight, line height, where it appears>
- **scale**: <ratio between body, h1-h6, captions>

Tracking floor: -0.04em. Body measure 65-75ch. Display max 6rem.

## Layout

- **grid**: <columns, gutter, max width>
- **spacing scale**: <how the spacing tokens compose into rhythm>
- **breakpoints**: <mobile / tablet / desktop thresholds>

## Elevation & Depth

- **shadows**: <when shadow, when border, the shadow tokens>
- **borders**: <1px border use cases>
- **glass / blur**: <only when a specific effect calls for it; not as decoration>

## Shapes

- **radius**: <when to use which radius; cards 12-16px, pills for small controls>
- **strokes**: <icon stroke / weight conventions>

## Components

For each component, list:
- **name**: <button-primary, card-product, input-text>
- **tokens used**: <which color / typography / radius / spacing>
- **states**: <default / hover / active / focus / disabled / loading / error / success>
- **variants**: <sibling keys like button-primary-hover>

## Do's and Don'ts

Concrete rules the agent must follow. Examples:

- DO: <"Buttons get a 16/48 padding pair, never arbitrary values">
- DON'T: <"Never use a kicker above a heading; the heading carries its own weight">
- DO: <"Real copy at every breakpoint; test overflow, not just the screenshot">
- DON'T: <"Never animate an image on hover; give the container the feedback">
