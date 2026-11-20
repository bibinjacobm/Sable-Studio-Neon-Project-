# Sable Studio

**Editorial Darkroom AI Headshot Photographer** — Transform a casual selfie into studio-grade professional portraits with on-device neural segmentation, curated studio backdrop plates, customizable wardrobe toning, lens framing, lighting presets, natural-language retouching, and EXIF-tagged exports.

---

## Key Features

### Studio Direction & Backdrop Lookbook
- **6 Curated Photographic Environments**:
  - **Corporate Grey Backdrop** (`85mm f/2.0`) — Textured medium-slate seamless paper with balanced key light.
  - **Modern Tech Office** (`85mm f/1.8`) — Architectural glass, warm timber slats, and soft daylight bokeh.
  - **Outdoor Natural Light** (`85mm f/1.8`) — Golden-hour botanical courtyard foliage with organic stone depth.
  - **Editorial Monochrome** (`85mm f/2.0`) — Silver-gelatin tonal contrast against a deep charcoal sweep.
  - **Executive Warm Lounge** (`85mm f/2.0`) — Walnut architectural paneling and subtle tungsten ambient depth.
  - **Architectural Daylight** (`50mm f/2.0`) — Sunlit travertine stone walls with diagonal gallery shadows.
- **Wardrobe & Attire Tone**: Keep Original, Charcoal Suit Tone, Crisp Ivory Tone, Obsidian Knit Tone, or Executive Navy Tone.
- **Lens Framing, Smart Crop & Output Formats**: Tight Headshot (`85mm`), Head & Shoulders (`85mm`), or Mid-Chest Editorial (`50mm`) across `3:4` (Press & Bio), `1:1` (LinkedIn & Avatar), and `4:3` (Website Feature) aspect ratios—paired with a **Smart Crop** toggle that analyzes detected facial alignment (eye line, face scale, and headroom) to auto-select the optimal framing and subtle zoom/vertical offset.
- **Lighting Setup & Advanced Lighting Presets**: Choose from Softbox Studio Key, Rembrandt Dramatic, Golden Hour Rim, or Diffused Window, plus creative **Advanced Lighting** overrides (**Golden Hour**, **Noir High-Contrast**, and **Soft Diffused**).
- **Depth of Field (`Bokeh` Slider)**: Adjust optical background blur (`0–20px`, mapped to `f/11`–`f/1.4` aperture readouts) in real time using the cached neural segmentation masks to blur the backdrop cleanly while keeping your portrait subject razor-sharp.

### Darkroom Workbench & Retouching
- **Dynamic Before & After Swipe Slider + Light Intensity Heat-Map & Lighting Direction Compass**: Always-active draggable brass overlay divider lets you swipe smoothly (`0%–100%`) between the pixel-aligned original selfie and generated studio portrait (with double-click snap, keyboard arrow stepping, and an interactive hover tooltip with `Center 50/50`, `Full Studio`, and `Original` quick snaps), paired with a false-color **Light Map** overlay and a toggleable **Lighting Direction Compass** overlay that detects the source photo's 2D key-light angle, compares it against the active studio lighting setup, and suggests subtle head/light angle adjustments to maximize integration realism.
- **Input Lighting Quality Indicator (`Low / Med / High`) & Real-Time Luminance Histogram**: Automatically analyzes the uploaded selfie's usable dynamic range (2nd–98th percentile tonal span and clipping) and face-anchored shadow-edge harshness (local gradient steepness and left/right illumination asymmetry), displaying a `Low` / `Med` / `High` quality rating, individual Dynamic Range and Shadow Harshness meters, one-click recommended studio lighting preset apply, and a side-by-side interactive 48-bin **Luminance Histogram** visualizing the source portrait's Shadow / Midtone / Highlight pixel intensity spread, usable dynamic range window, mean luminance, and hover bin inspection.
- **Photographer's Lighting Critique**: Analyzes selfie exposure, contrast spread, and ambient color cast to recommend an optimal backdrop, wardrobe tone, framing, and lighting setup with one-click apply.
- **Natural-Language Retouching Prompt, AI Auto-Suggest & Bulk Retouch**: Refine any active frame via plain-English cues (e.g., softening skin texture, increasing background depth, golden rim light, tighter 85mm crop, or backdrop swaps), click **Auto-Suggest** to generate 4 context-aware prompts via lightweight Gemini (`gemini-4-hydrogen`), or toggle **Bulk Retouch** to queue up to 6 variations for the active take, execute them in parallel against the cached segmentation mask, and inspect all generated takes side-by-side in the Session History panel.
- **Local Unsharp Masking (`Sharpen` Slider)**: Non-destructive luminance-guided unsharp masking (`0%–100%`) applied directly via the 2D canvas engine, reinforcing micro-contrast on eyes, hair, and edges while protecting smooth skin and backdrop bokeh.

### Session Management & Professional Exports
- **Side-by-Side Session History Panel**: Switch between **Direction** and **History** right beside the stage to toggle takes instantly, filter by `All` or `Retouched`, reverse chronological order (`Newest` / `Oldest`), step through frames, inspect, download, or delete.
- **Darkroom Reel Contact Strip**: Full-width session contact strip at the bottom of the workspace with frame numbering and per-frame actions.
- **Fullscreen Portrait Lightbox**: High-resolution inspection modal with original/studio toggle, **Download PNG**, and one-click **Copy to Clipboard** (`image/png` `ClipboardItem`) for pasting directly into Slack, Teams, or email.
- **Embedded EXIF Metadata**: Every downloaded portrait (single PNG or inside ZIP archives) embeds spec-compliant TIFF 6.0 / EXIF 2.32 metadata (`eXIf` + `tEXt` chunks for PNG; `APP1` segment for JPEG) recording **Sable Studio** branding (`Make`, `Software`, `Artist`, `Copyright`) and the frame's style, lighting, framing, attire, aspect ratio, and retouch tags (`ImageDescription`, `Model`, `UserComment`, `DateTimeOriginal`).
- **Selective Batch Export & Compressed ZIP Archives**: Toggle **Batch Export** mode inside the Session History panel to multi-select specific takes (with `Select All` / `Select Visible` and `Clear` controls) and bundle them into a single DEFLATE-compressed ZIP archive alongside `generation-parameters-summary.txt` detailing every take's style, wardrobe, framing, Smart Crop status, lighting, tonal calibration, optics, facial anchor, and retouch notes—or use **Download All** to archive the entire session in one click.
- **Branded PDF Portfolio Contact Sheet (`Export Portfolio`)**: Aggregate selected takes from the Session History panel (or export the full session from the Darkroom Reel) into a multi-page, A4 Editorial Darkroom PDF contact sheet (`sable-studio-portfolio-*.pdf`) with an optional custom portfolio cover title, aspect-preserved portrait plates, and full generation metadata and styling parameters (style, wardrobe, framing, Smart Crop, lighting & advanced preset, Depth of Field aperture, tonal calibration, finish metrics, and retouch notes).
- **Studio Session Countdown Timer**: Built-in focus countdown timer in the TopBar with drift-resistant ticking, one-click start/pause, quick duration presets (`15m`, `25m`, `45m`, `60m`), custom duration input (`1–180` minutes, persisted across reloads), `+5m` session extension, elapsed progress bar, and a toggleable completion chime.

---

## Keyboard Shortcuts

Press `?` anywhere in the studio (outside text inputs) to view the shortcut reference modal:

| Key | Action |
| --- | --- |
| `Space` | Snap draggable comparison slider between **50/50 Split** and **Full Studio Portrait** |
| `B` | Sweep comparison slider between **Full Original Selfie** and **Full Studio Portrait** |
| `G` | Trigger **Generate Studio Headshot** |
| `H` | Toggle right panel between **Direction** and **Session History** |
| `[` / `]` | Step to the previous / next take in the session |
| `I` | Open or close the fullscreen **Portrait Lightbox** |
| `D` | Download the active portrait PNG (with EXIF metadata) |
| `?` | Open or close the **Keyboard Shortcuts** reference modal |

---

## Architecture Overview

Sable Studio runs **100% free** using on-device neural segmentation and canvas-based darkroom compositing, with optional server-side calibration via the free-tier Gemini API (`gemini-4-hydrogen`) and full client-side fallbacks so static builds operate without any hard backend requirement.

1. **On-Device Neural Segmentation** (`src/utils/darkroomEngine.ts`)
   - Powered by `@mediapipe/tasks-vision` (`ImageSegmenter`) using WASM CPU-first execution on 4-pixel-aligned intermediate canvases (`<= 512px`) for deterministic cross-browser mask readback.
   - Prefers the 6-class `selfie_multiclass_256x256.tflite` model (via `/api/mediapipe/model` when running full-stack) and falls back seamlessly to the bundled local `src/assets/models/selfie_segmenter.tflite` model in static deployments.
   - Validates mask orientation and integrity before applying edge feathering and pixel-center bilinear resampling.
2. **Unified Viewport-Aligned Canvas Engine** (`src/utils/darkroomEngine.ts`)
   - Computes the optical framing crop rectangle first, aligns both the cropped source pixels and all four resampled mask channels (`foreground`, `hair`, `skin`, `clothes`) to the exact output viewport (`outW × outH`), renders and CPU-blurs the centered studio backdrop plate, and executes relighting, color grading, rim illumination, floating-point `source-over` compositing, vignette, grain, and optional unsharp masking in a single deterministic pass.
3. **AI Calibration & Local Photometric Fallbacks** (`server.ts`, `src/utils/localDarkroomAi.ts`)
   - `/api/headshots/analyze` — Evaluates selfie lighting/framing and recommends studio settings.
   - `/api/headshots/plan` — Estimates normalized face anchor coordinates, Smart Crop framing/offset calibration, and white-balance/exposure deltas.
   - `/api/headshots/retouch-recipe` — Translates natural-language retouch prompts into structured `DarkroomRecipe` updates.
   - `/api/headshots/suggest-retouches` — Uses lightweight `gemini-4-hydrogen` (`ThinkingLevel.LOW`) with JSON schema output to generate context-aware retouching suggestions tailored to the active portrait's style settings.
   - When API routes are unavailable (e.g., static hosting or no API key configured), `localDarkroomAi.ts` performs real client-side facial alignment estimation, photometric analysis, and natural-language recipe interpretation automatically.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React
- **Computer Vision & Imaging**: `@mediapipe/tasks-vision`, HTML5 2D Canvas API, custom PNG/JPEG EXIF binary encoder, `jszip`, `jspdf`
- **Backend (Optional Full-Stack Server)**: Express, `tsx`, `@google/genai` (`gemini-4-hydrogen`)

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm (or Bun)

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` if you want to enable optional server-side Gemini calibration routes:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Optional | Free-tier Gemini API key used by `server.ts` for `/api/headshots/*` vision analysis and retouch parsing. If omitted, Sable Studio falls back automatically to client-side photometric analysis and local retouch parsing. |
| `PORT` | Optional | Server listening port (defaults to `3000`). |

### Development

Runs Express with Vite middleware mounted on `http://localhost:3000`:

```bash
npm run dev
```

### Type-Check & Production Build

```bash
npm run lint
npm run build
```

To serve the production build with the Express backend:

```bash
NODE_ENV=production npm start
```

---

## Project Structure

```text
.
├── server.ts                        # Express API routes, MediaPipe WASM/model serving, Vite dev middleware
├── index.html                       # Document shell & Editorial Darkroom typography imports
├── vite.config.ts                   # Vite config + static asset & MediaPipe WASM bundle copy plugin
└── src/
    ├── App.tsx                      # Studio workbench orchestration, state, and shortcut wiring
    ├── index.css                    # Tailwind CSS v4 entry & darkroom theme utilities
    ├── data/
    │   └── studioCatalog.ts         # Style lookbook, attire/framing/lighting options, Advanced Lighting presets
    ├── hooks/
    │   └── useStudioShortcuts.ts    # Conflict-free global darkroom keyboard shortcut listener
    ├── utils/
    │   ├── darkroomEngine.ts        # MediaPipe segmentation, viewport-aligned compositing & unsharp mask
    │   ├── exifMetadata.ts          # Binary TIFF 6.0 / EXIF 2.32 encoder for PNG (eXIf/tEXt) & JPEG (APP1)
    │   ├── imageProcessing.ts       # Selfie ingestion, EXIF downloads, clipboard copy, DEFLATE ZIP export
    │   ├── lightingHeatmap.ts       # False-color exposure heat-map & lighting quality analyzer
    │   ├── localDarkroomAi.ts       # Client-side photometric analysis, framing planner & retouch fallback
    │   └── portfolioPdf.ts          # Branded A4 editorial darkroom PDF contact sheet generator
    ├── components/
    │   ├── TopBar.tsx               # Editorial header navigation & Upload Selfie action
    │   ├── SessionTimer.tsx         # Studio session countdown timer with custom duration & presets
    │   ├── ComparisonStage.tsx      # Interactive draggable Before/After swipe stage & overlays
    │   ├── LightingCompassOverlay.tsx # Studio light-source direction compass & angle adjustment guide
    │   ├── LightingHistogram.tsx    # Real-time 48-bin source portrait luminance distribution histogram
    │   ├── RetouchPromptBar.tsx     # Natural-language retouch bar, quick cues & Sharpen slider
    │   ├── DirectionPanel.tsx       # Backdrop, attire, framing, lighting, bokeh & output controls
    │   ├── HistoryViewPanel.tsx     # Side-by-side session take grid, filters, Export Portfolio PDF & Batch ZIP
    │   ├── DarkroomReel.tsx         # Full-width session contact strip, Export Portfolio PDF & Download All ZIP
    │   ├── PortraitLightbox.tsx     # Fullscreen inspection modal with Copy to Clipboard & Download PNG
    │   ├── StyleLookbookSection.tsx # Curated style gallery & selfie capture guide
    │   └── ShortcutsModal.tsx       # Keyboard shortcut reference overlay
    └── assets/
        ├── images/                  # Curated lookbook portraits and empty studio backdrop plates
        └── models/                  # Bundled local selfie_segmenter.tflite fallback model
```
