# AInside — design system

Identità visiva della app desktop. La reference grafica guida profondità, gerarchia e tono: non è un calco pixel-per-pixel.

## Principio

Premium, minimale, scuro. L’utente vede esito e azione. Hardware, quantizzazione e runtime restano dietro Avanzate o Modalità esperto.

## Superfici

| Token | Uso |
| --- | --- |
| `--bg` | Fondo app, quasi navy/black |
| `--surface-1` | Sidebar, pannelli |
| `--surface-2` | Card, composer, widget |
| `--surface-hover` | Hover / selezione |
| `--border` | Bordi sottili, basso contrasto |
| `--text-primary` | Titoli e corpo |
| `--text-secondary` | Meta, hint |
| `--accent-primary` | Azioni, nav attiva (blu) |
| `--accent-secondary` | Brand, hero (viola) |
| `--accent-cyan` | Gauge, velocità |
| `--success` / `--warning` / `--danger` | Stati |

Glow solo su focus, nav attiva, profilo selezionato, download in corso. Nessun vetro ovunque, nessun gradiente decorativo a tappeto.

## Tipo

Inter. Pesi 400 / 500 / 600. Display con tracking stretto. Meta 12–13px, secondario.

## Raggio e moto

Raggio 12–16px. Transizioni 150–280ms, easing `cubic-bezier(0.22, 1, 0.36, 1)`. Niente loop GPU-heavy. `prefers-reduced-motion` spegne float e parallax.

## 3D

CSS/SVG isometrico, materiale scuro, bordi emissivi blu/viola. Solo home, analisi, download, empty state. Non Three.js.

## Componenti

Toast, dialog, popover, tooltip, skeleton, spinner, progress, empty, error a due livelli, badge di stato, alert inline. Tutti da `src/ui`.

## Layout

Sidebar persistente: Nuova chat, Codice, cronologia (chat o lavori, in base al posto), Modelli, Download, Impostazioni. Brand → home. In basso widget prestazioni. Impostazioni ha nav interna.

Viewport: 1920, 1440, 1366. Sotto ~1100px la sidebar diventa icon-rail.
