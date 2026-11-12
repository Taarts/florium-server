// config/socialPalettes.js — colours and fonts for auto-made social post images, per studio.
// Edit a studio's values here and restart the server to change its look.
// A single post can override any key by sending `card.palette` in the request.

'use strict';

module.exports = {
  'flourish': {
    name:       'Flourish Yoga & Wellness',
    url:        'flourishyoga.studio',
    background: '#f7f3ed',   // --cream
    surface:    '#f5f0eb',   // --cream-mid
    border:     '#e8e0d5',   // --cream-border
    text:       '#2a2a2a',   // --text-dark
    textMid:    '#666666',   // --text-mid
    textMuted:  '#999999',   // --text-muted
    accent:     '#E06B52',   // --coral
    accent2:    '#9AAB85',   // --sage
    fontSerif:  "Georgia, Gelasio, 'DejaVu Serif', serif",
    fontSans:   "'Segoe UI', 'Open Sans', 'DejaVu Sans', sans-serif",
  },

  'demo': {                  // Florium demo studio (florium-server / demo.florium.live)
    name:       'Florium Demo Studio',
    url:        'florium.live',
    background: '#1e5c3a',   // --color-tertiary
    surface:    '#173d29',
    border:     '#9db8a6',   // --color-grey-200
    text:       '#ffffff',
    textMid:    '#eef4f0',   // --color-grey-100
    textMuted:  '#b6c9bc',
    accent:     '#c9a84c',   // --color-secondary
    accent2:    '#e6f2e9',   // --color-primary   hsl(140 30% 92%)
    fontSerif:  "Georgia, Gelasio, 'DejaVu Serif', serif",
    fontSans:   "'Segoe UI', 'Open Sans', 'DejaVu Sans', sans-serif",
  },

  'iy-sp': {
    name:       'Iyengar Yoga · St. Petersburg',
    url:        'iy-sp.com',
    background: '#842953',   // --color-tertiary
    surface:    '#271e22',   // --color-hybrid
    border:     '#b98db9',   // --color-grey-300
    text:       '#ffffff',
    textMid:    '#f7e9f7',   // --color-grey-100
    textMuted:  '#d0afd0',   // --color-grey-200
    accent:     '#e58684',   // --color-secondary
    accent2:    '#f2d9e6',   // --color-primary   hsl(330 50% 90%)
    fontSerif:  "Georgia, Gelasio, 'DejaVu Serif', serif",
    fontSans:   "'Segoe UI', 'Open Sans', 'DejaVu Sans', sans-serif",
  },
};
