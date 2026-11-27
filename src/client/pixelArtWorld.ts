import { TILE_SIZE, type DungeonMap, type FieldZoneState } from '../shared/types.ts';
import type { WorldViewBounds } from './camera.ts';

/**
 * Draws a crisp 1px/2px stepped pixel-art disc (filled circle) with zero smooth anti-aliasing.
 */
export function drawPixelFilledDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  step = 2
): void {
  const s = Math.max(1, Math.round(step));
  const r2 = radius * radius;
  const rx = Math.round(cx);
  const ry = Math.round(cy);
  const maxR = Math.ceil(radius / s) * s;
  for (let dy = -maxR; dy <= maxR; dy += s) {
    const py = dy + s * 0.5;
    if (py * py > r2) continue;
    const span = Math.sqrt(Math.max(0, r2 - py * py));
    const halfSpan = Math.floor(span / s) * s;
    if (halfSpan > 0) {
      ctx.fillRect(rx - halfSpan, ry + dy, halfSpan * 2, s);
    }
  }
}

/**
 * Draws a crisp stepped pixel-art ring outline (integer stepped blocks, zero smooth vector arcs).
 */
export function drawPixelCircleOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  thickness = 2,
  step = 2,
  dashPeriod = 0
): void {
  const s = Math.max(1, Math.round(step));
  const rx = Math.round(cx);
  const ry = Math.round(cy);
  const rOuter = radius + thickness * 0.5;
  const rInner = Math.max(0, radius - thickness * 0.5);
  const rOuter2 = rOuter * rOuter;
  const rInner2 = rInner * rInner;
  const maxR = Math.ceil(rOuter / s) * s;
  let tick = 0;
  for (let dy = -maxR; dy <= maxR; dy += s) {
    for (let dx = -maxR; dx <= maxR; dx += s) {
      const px = dx + s * 0.5;
      const py = dy + s * 0.5;
      const d2 = px * px + py * py;
      if (d2 <= rOuter2 && d2 >= rInner2) {
        if (dashPeriod > 1) {
          tick++;
          if (Math.floor(tick / dashPeriod) % 2 === 1) continue;
        }
        ctx.fillRect(rx + dx, ry + dy, s, s);
      }
    }
  }
}

/**
 * Creates a quantized 4-band stepped + Bayer-dithered pixel-art torchlight glow canvas.
 * Replaces blurry radial gradients with authentic 16-bit pixel lighting pools.
 */
export function createSteppedTorchGlowCanvas(): HTMLCanvasElement {
  const size = 136;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;

  const half = size / 2;
  const step = 2;
  const bands: readonly { maxR: number; color: string; dither?: boolean }[] = [
    { maxR: 20, color: 'rgba(255, 224, 130, 0.24)' },
    { maxR: 36, color: 'rgba(255, 196, 98, 0.16)' },
    { maxR: 52, color: 'rgba(245, 158, 11, 0.10)', dither: true },
    { maxR: 66, color: 'rgba(217, 119, 6, 0.06)', dither: true },
  ];

  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const dx = x + step * 0.5 - half;
      const dy = y + step * 0.5 - half;
      const dist = Math.hypot(dx, dy);
      if (dist > 66) continue;
      for (let b = 0; b < bands.length; b++) {
        if (dist <= bands[b].maxR) {
          if (bands[b].dither && ((x / step + y / step) & 1) === 1) {
            // 50% checkerboard dither for crisp retro pixel falloff
            if (b < bands.length - 1) {
              ctx.fillStyle = bands[b].color;
              ctx.fillRect(x, y, step, step);
            }
            break;
          }
          ctx.fillStyle = bands[b].color;
          ctx.fillRect(x, y, step, step);
          break;
        }
      }
    }
  }
  return c;
}

/**
 * Creates a quantized 4-band pixel-stepped radial aura sprite for spell zones.
 */
export function createQuantizedRadialZoneSprite(
  size: number,
  stops: readonly [number, string][]
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const gCtx = c.getContext('2d');
  if (!gCtx) return c;
  gCtx.imageSmoothingEnabled = false;

  const half = size / 2;
  const step = Math.max(2, Math.round(size / 48));
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);

  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const dx = x + step * 0.5 - half;
      const dy = y + step * 0.5 - half;
      const rNorm = Math.hypot(dx, dy) / half;
      if (rNorm > 1) continue;
      // Quantize radial distance to 5 crisp steps with subtle checkerboard edge dither
      const checker = (((x / step) ^ (y / step)) & 1) === 1;
      const qNorm = Math.min(0.99, Math.floor(rNorm * 5) / 5 + (checker ? 0.04 : 0));
      let chosen = sorted[sorted.length - 1][1];
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (qNorm >= sorted[i][0] * 0.92) {
          chosen = sorted[i][1];
          break;
        }
      }
      gCtx.fillStyle = chosen;
      gCtx.fillRect(x, y, step, step);
    }
  }
  return c;
}

/**
 * Renders the Verdant Borderlands Overworld terrain into the cached map offscreen canvas
 * using 2px pixel-art clusters, Bayer shoreline dithering, multi-tiered pixel trees,
 * and organic cross-tile stone flagstones (ZERO repetitive square tile grids).
 */
export function renderOverworldTileMap(
  ctx: CanvasRenderingContext2D,
  map: DungeonMap
): void {
  const tileAt = (cx: number, cy: number): number => {
    if (cx < 0 || cx >= map.width || cy < 0 || cy >= map.height) return 0;
    return map.tiles[cy * map.width + cx];
  };

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const code = map.tiles[ty * map.width + tx];
      const px = tx * TILE_SIZE;
      const py = ty * TILE_SIZE;
      const hash = ((tx * 73856093) ^ (ty * 19349663) ^ ((tx + ty) * 83492791)) >>> 0;
      const isOuterBorder = tx < 2 || tx >= map.width - 2 || ty < 2 || ty >= map.height - 2;
      const n = tileAt(tx, ty - 1);
      const s = tileAt(tx, ty + 1);
      const w = tileAt(tx - 1, ty);
      const e = tileAt(tx + 1, ty);
      const ox = (hash & 6); // 0, 2, 4, 6 (aligned to 2px art grid)
      const oy = ((hash >>> 3) & 6);

      const neighborGroundFill = (): string => {
        const counts = { cobble: 0, sand: 0, dirt: 0, grass: 0 };
        for (const nb of [n, s, w, e]) {
          if (nb === 5) counts.cobble++;
          else if (nb === 6) counts.sand++;
          else if (nb === 4) counts.dirt++;
          else if (nb === 1) counts.grass++;
        }
        if (counts.cobble >= 2) return '#535868';
        if (counts.sand >= 2 || (tx >= 64 && ty < 45 && counts.grass === 0)) return '#B59259';
        if (counts.dirt >= 2) return '#775639';
        return '#2B663C';
      };

      if (code === 0) {
        if (isOuterBorder) {
          // Stepped pixel cliff abyss edge
          ctx.fillStyle = '#090F13';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          if (tx === 1 || tx === map.width - 2 || ty === 1 || ty === map.height - 2) {
            ctx.fillStyle = '#15222B';
            ctx.fillRect(
              px + (tx === 1 ? 24 : 0),
              py + (ty === 1 ? 24 : 0),
              tx === 1 || tx === map.width - 2 ? 8 : TILE_SIZE,
              ty === 1 || ty === map.height - 2 ? 8 : TILE_SIZE
            );
            ctx.fillStyle = '#223642';
            if (hash % 2 === 0) {
              ctx.fillRect(
                px + (tx === 1 ? 24 : tx === map.width - 2 ? 4 : 6 + ox),
                py + (ty === 1 ? 24 : ty === map.height - 2 ? 4 : 6 + oy),
                4,
                4
              );
            }
          }
          if (hash % 4 === 0) {
            ctx.fillStyle = '#142026';
            ctx.fillRect(px + 4 + ox, py + 6 + oy, 8, 2);
            ctx.fillRect(px + 6 + ox, py + 8 + oy, 4, 2);
          }
        } else {
          // Whispering Lake: 3-tone stepped bathymetry + 2px pixel dithering + foam + lilypads
          const touchesLand = n !== 0 || s !== 0 || w !== 0 || e !== 0;
          const touchesBridge = n === 5 || s === 5 || w === 5 || e === 5;
          const diagLand =
            tileAt(tx - 1, ty - 1) !== 0 ||
            tileAt(tx + 1, ty - 1) !== 0 ||
            tileAt(tx - 1, ty + 1) !== 0 ||
            tileAt(tx + 1, ty + 1) !== 0;

          if (touchesLand) {
            ctx.fillStyle = '#256AA8';
          } else if (diagLand) {
            ctx.fillStyle = '#1D538F';
          } else {
            ctx.fillStyle = '#153B6C';
          }
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          // 2px Bayer dither dots along depth transitions so water bands look handcrafted
          if (touchesLand) {
            ctx.fillStyle = '#1D538F';
            for (let i = 0; i < 4; i++) {
              const bx = px + ((i * 8 + (ty % 2) * 4) % 28);
              const by = py + ((hash >> (i * 2)) & 24);
              ctx.fillRect(bx, by, 2, 2);
            }
          } else if (!diagLand && hash % 3 === 0) {
            ctx.fillStyle = '#1B4982';
            ctx.fillRect(px + ox * 2 + 4, py + oy * 2 + 6, 4, 2);
            ctx.fillRect(px + ox * 2 + 6, py + oy * 2 + 8, 2, 2);
          }

          // Crisp 2px pixel wave highlights
          if (hash % 4 === 0) {
            ctx.fillStyle = touchesLand ? '#4D9BE6' : '#2E6FC2';
            ctx.fillRect(px + 4 + ox, py + 8 + oy, 8, 2);
            ctx.fillRect(px + 6 + ox, py + 6 + oy, 4, 2);
          }

          // Floating pixel lilypads & pink lotus in sheltered shallow water
          if (touchesLand && !touchesBridge && hash % 7 === 0) {
            const lx = px + 8 + ox;
            const ly = py + 8 + oy;
            ctx.fillStyle = '#14532D';
            ctx.fillRect(lx - 4, ly - 2, 8, 6);
            ctx.fillStyle = '#22C55E';
            ctx.fillRect(lx - 4, ly - 4, 8, 6);
            ctx.fillStyle = '#256AA8';
            ctx.fillRect(lx + 2, ly - 2, 2, 2); // Lilypad notch
            if (hash % 14 === 0) {
              ctx.fillStyle = '#FBCFE8';
              ctx.fillRect(lx - 2, ly - 2, 2, 2);
              ctx.fillStyle = '#F472B6';
              ctx.fillRect(lx, ly - 2, 2, 2);
            }
          }

          // Bridge parapet shadow cast onto lake
          if (touchesBridge) {
            ctx.fillStyle = '#0D2240';
            if (n === 5) ctx.fillRect(px, py, TILE_SIZE, 6);
            if (s === 5) ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
            if (w === 5) ctx.fillRect(px, py, 6, TILE_SIZE);
            if (e === 5) ctx.fillRect(px + TILE_SIZE - 4, py, 4, TILE_SIZE);
          }

          // Stepped 2px pixel shoreline seafoam
          ctx.fillStyle = '#BAE6FD';
          if (n !== 0 && n !== 5) {
            ctx.fillRect(px + 2, py, TILE_SIZE - 4, 2);
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(px + 6 + ox, py, 8, 2);
          }
          if (s !== 0 && s !== 5) {
            ctx.fillStyle = '#BAE6FD';
            ctx.fillRect(px + 2, py + TILE_SIZE - 2, TILE_SIZE - 4, 2);
          }
          if (w !== 0 && w !== 5) {
            ctx.fillStyle = '#BAE6FD';
            ctx.fillRect(px, py + 2, 2, TILE_SIZE - 4);
          }
          if (e !== 0 && e !== 5) {
            ctx.fillStyle = '#BAE6FD';
            ctx.fillRect(px + TILE_SIZE - 2, py + 2, 2, TILE_SIZE - 4);
          }
        }
      } else if (code === 1) {
        // Lush 16-bit Pixel Meadow: 3-tone grass tufts, clover clusters & pixel wildflowers (NO grid squares)
        ctx.fillStyle = '#2B663C';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Organic 2px grass patches staggered across tile boundaries
        if (hash % 2 === 0) {
          const gx = px + 4 + ox * 2;
          const gy = py + 4 + oy * 2;
          ctx.fillStyle = '#225330';
          ctx.fillRect(gx, gy + 4, 8, 2);
          ctx.fillStyle = '#367D4A';
          ctx.fillRect(gx, gy, 2, 4);
          ctx.fillRect(gx + 4, gy + 2, 2, 2);
          ctx.fillRect(gx + 6, gy, 2, 4);
        }
        if (hash % 3 === 0) {
          const tx2 = px + ((hash >>> 5) & 14) + 6;
          const ty2 = py + ((hash >>> 9) & 14) + 6;
          ctx.fillStyle = '#3F9155';
          ctx.fillRect(tx2, ty2, 2, 4);
          ctx.fillRect(tx2 + 4, ty2 + 2, 2, 2);
          ctx.fillStyle = '#4ADE80';
          ctx.fillRect(tx2, ty2 - 2, 2, 2);
        }
        // Clover clusters
        if (hash % 5 === 0) {
          const cx2 = px + 6 + (ox * 2);
          const cy2 = py + 18 + oy;
          ctx.fillStyle = '#1E4D2B';
          ctx.fillRect(cx2, cy2, 6, 4);
          ctx.fillStyle = '#34D399';
          ctx.fillRect(cx2, cy2, 2, 2);
          ctx.fillRect(cx2 + 4, cy2, 2, 2);
          ctx.fillRect(cx2 + 2, cy2 + 2, 2, 2);
        }
        // Tiny Quarry border stones bleeding into eastern grass
        if (tx >= 60 && ty < 46 && hash % 8 === 0) {
          ctx.fillStyle = '#7C654F';
          ctx.fillRect(px + 10 + ox, py + 12 + oy, 4, 2);
          ctx.fillStyle = '#A68B6D';
          ctx.fillRect(px + 10 + ox, py + 10 + oy, 2, 2);
        }
        // Multi-pixel wildflower sprites
        if (hash % 13 === 0) {
          const fx = px + 8 + ox * 2;
          const fy = py + 8 + oy * 2;
          ctx.fillStyle = '#14532D';
          ctx.fillRect(fx, fy + 2, 4, 2);
          ctx.fillStyle = hash % 3 === 0 ? '#FDE047' : hash % 3 === 1 ? '#F472B6' : '#E0F2FE';
          ctx.fillRect(fx - 2, fy, 2, 2);
          ctx.fillRect(fx + 2, fy, 2, 2);
          ctx.fillRect(fx, fy - 2, 2, 2);
          ctx.fillStyle = '#FEF9C3';
          ctx.fillRect(fx, fy, 2, 2);
        }
        // Stepped pixel dappled canopy shadow below northern/western trees
        if (n === 2) {
          ctx.fillStyle = '#1A4528';
          ctx.fillRect(px + 2, py, TILE_SIZE - 4, 4);
          ctx.fillRect(px + 6, py + 4, TILE_SIZE - 12, 2);
        }
        if (w === 2) {
          ctx.fillStyle = '#1A4528';
          ctx.fillRect(px, py + 4, 4, TILE_SIZE - 8);
        }
      } else if (code === 4) {
        // Packed Earth Road: 2px pebble clusters, wheel ruts, stepped pixel grass tufts at edges
        ctx.fillStyle = '#775639';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Earth shading clusters
        ctx.fillStyle = '#63462D';
        if (hash % 2 === 0) ctx.fillRect(px + 4 + ox, py + 6 + oy, 10, 2);
        if (hash % 3 === 0) ctx.fillRect(px + 12 + ox, py + 18 + oy, 10, 2);

        // 2px pixel pebbles & sunlit dust
        ctx.fillStyle = '#926D4C';
        if (hash % 3 === 0) {
          ctx.fillRect(px + 6 + ox, py + 12 + oy, 4, 2);
          ctx.fillRect(px + 8 + ox, py + 10 + oy, 2, 2);
        }
        ctx.fillStyle = '#4F3621';
        if (hash % 5 === 0) {
          ctx.fillRect(px + 16 + ox, py + 20 + oy, 4, 2);
        }
        ctx.fillStyle = '#A8825E';
        if (hash % 7 === 0) {
          ctx.fillRect(px + 14 + ox, py + 6 + oy, 2, 2);
        }

        // Jagged 2px pixel grass tufts overlapping road borders
        ctx.fillStyle = '#2B663C';
        if (n === 1) {
          ctx.fillRect(px, py, 8, 4);
          ctx.fillRect(px + 10, py, 4, 2);
          ctx.fillRect(px + 16, py, 10, 4);
          ctx.fillRect(px + 28, py, 4, 2);
        }
        if (s === 1) {
          ctx.fillRect(px + 2, py + TILE_SIZE - 4, 10, 4);
          ctx.fillRect(px + 14, py + TILE_SIZE - 2, 4, 2);
          ctx.fillRect(px + 20, py + TILE_SIZE - 4, 8, 4);
        }
        if (w === 1) {
          ctx.fillRect(px, py + 2, 4, 10);
          ctx.fillRect(px, py + 14, 2, 4);
          ctx.fillRect(px, py + 20, 4, 8);
        }
        if (e === 1) {
          ctx.fillRect(px + TILE_SIZE - 4, py + 4, 4, 8);
          ctx.fillRect(px + TILE_SIZE - 2, py + 14, 2, 4);
          ctx.fillRect(px + TILE_SIZE - 4, py + 20, 4, 8);
        }
      } else if (code === 5) {
        // Organic Pixel Ashlar Flagstones & Bridges (NO uniform tile squares!)
        const distCenter = Math.hypot(tx - 60, ty - 45);
        const isCenterInlay =
          distCenter <= 4.3 && (Math.abs(tx - 60) === Math.abs(ty - 45) || tx === 60 || ty === 45);
        ctx.fillStyle = isCenterInlay ? '#686052' : '#535868';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Staggered organic pixel flagstones spanning half-tile offsets
        const shift = ((ty % 2) * 8 + (ox & 6)) & 14;
        ctx.fillStyle = isCenterInlay ? '#8F7338' : '#3C404E';
        ctx.fillRect(px, py + 14 + (ty % 2) * 2, TILE_SIZE, 2);
        ctx.fillRect(px + ((shift + 12) % 30), py, 2, 16);
        ctx.fillRect(px + ((shift + 26) % 30), py + 16, 2, 16);

        // 2px crisp bevel highlights on flagstone top edges
        ctx.fillStyle = isCenterInlay ? '#D9AA52' : '#6F778D';
        if (hash % 2 === 0) ctx.fillRect(px + 4 + ox, py + 2, 8, 2);
        if (hash % 3 === 0) ctx.fillRect(px + 12 + (ox >> 1), py + 18, 8, 2);

        // Subtle stone tone variations & moss crevices near meadow
        if (hash % 5 === 0) {
          ctx.fillStyle = '#474C5C';
          ctx.fillRect(px + 4 + oy, py + 20, 8, 6);
        }
        if ((n === 1 || s === 1 || w === 1 || e === 1) && hash % 4 === 0) {
          ctx.fillStyle = '#367D4A';
          ctx.fillRect(px + 2 + ox, py + 14, 4, 2);
        }

        // Stone bridge parapet curb edges wherever bordering inland water (0)
        const isLakeEdge = (c: number, oxCoord: number, oyCoord: number) =>
          c === 0 && oxCoord >= 2 && oxCoord < map.width - 2 && oyCoord >= 2 && oyCoord < map.height - 2;
        if (isLakeEdge(n, tx, ty - 1)) {
          ctx.fillStyle = '#2B3544';
          ctx.fillRect(px, py, TILE_SIZE, 4);
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(px + 2, py, TILE_SIZE - 4, 2);
        }
        if (isLakeEdge(s, tx, ty + 1)) {
          ctx.fillStyle = '#2B3544';
          ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(px + 2, py + TILE_SIZE - 2, TILE_SIZE - 4, 2);
        }
        if (isLakeEdge(w, tx - 1, ty)) {
          ctx.fillStyle = '#2B3544';
          ctx.fillRect(px, py, 4, TILE_SIZE);
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(px, py + 2, 2, TILE_SIZE - 4);
        }
        if (isLakeEdge(e, tx + 1, ty)) {
          ctx.fillStyle = '#2B3544';
          ctx.fillRect(px + TILE_SIZE - 4, py, 4, TILE_SIZE);
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(px + TILE_SIZE - 2, py + 2, 2, TILE_SIZE - 4);
        }
      } else if (code === 6) {
        // Sunlit Sand: stepped pixel ripples, wet-sand shore checkerboard, tiny shells
        ctx.fillStyle = '#B59259';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Stepped wet-sand band with 2px dithered shore blend
        ctx.fillStyle = '#8F7143';
        if (n === 0) {
          ctx.fillRect(px, py, TILE_SIZE, 4);
          for (let sx = 0; sx < TILE_SIZE; sx += 4) ctx.fillRect(px + sx, py + 4, 2, 2);
        }
        if (s === 0) {
          ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);
          for (let sx = 2; sx < TILE_SIZE; sx += 4) ctx.fillRect(px + sx, py + TILE_SIZE - 6, 2, 2);
        }
        if (w === 0) {
          ctx.fillRect(px, py, 4, TILE_SIZE);
          for (let sy = 0; sy < TILE_SIZE; sy += 4) ctx.fillRect(px + 4, py + sy, 2, 2);
        }
        if (e === 0) {
          ctx.fillRect(px + TILE_SIZE - 4, py, 4, TILE_SIZE);
          for (let sy = 2; sy < TILE_SIZE; sy += 4) ctx.fillRect(px + TILE_SIZE - 6, py + sy, 2, 2);
        }
        if (hash % 3 === 0) {
          ctx.fillStyle = '#CBA96E';
          ctx.fillRect(px + 4 + ox, py + 8 + oy, 8, 2);
          ctx.fillRect(px + 6 + ox, py + 6 + oy, 4, 2);
        }
        if (hash % 6 === 0) {
          ctx.fillStyle = '#9E7E4A';
          ctx.fillRect(px + 14 + ox, py + 20 + oy, 6, 2);
        }
        if (hash % 17 === 0) {
          ctx.fillStyle = '#F5E6C8';
          ctx.fillRect(px + 10 + ox, py + 14 + oy, 2, 2);
        }
      } else if (code === 2) {
        // Lush 16-bit Pixel-Art Evergreen Pines & Scalloped Ancient Oaks
        ctx.fillStyle = neighborGroundFill();
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Stepped pixel undergrowth shadow
        ctx.fillStyle = '#112E1A';
        ctx.fillRect(px + 6, py + 24, 20, 4);
        ctx.fillRect(px + 4, py + 22, 24, 2);

        // Textured pixel tree trunk
        ctx.fillStyle = '#3B2113';
        ctx.fillRect(px + 12, py + 20, 8, 8);
        ctx.fillStyle = '#6B4229';
        ctx.fillRect(px + 14, py + 20, 2, 6);

        if (hash % 2 === 0) {
          // Layered Pixel Evergreen Pine with dark outline shadow & sunlit fronds
          ctx.fillStyle = '#0A2E18';
          ctx.fillRect(px + 4, py + 16, 24, 6);
          ctx.fillRect(px + 6, py + 10, 20, 6);
          ctx.fillRect(px + 10, py + 4, 12, 6);
          ctx.fillRect(px + 14, py + 2, 4, 2);

          ctx.fillStyle = '#14532D';
          ctx.fillRect(px + 6, py + 14, 20, 6);
          ctx.fillRect(px + 8, py + 8, 16, 6);
          ctx.fillRect(px + 12, py + 4, 8, 4);

          ctx.fillStyle = '#16803C';
          ctx.fillRect(px + 8, py + 14, 14, 4);
          ctx.fillRect(px + 10, py + 8, 10, 4);
          ctx.fillRect(px + 12, py + 4, 6, 4);

          ctx.fillStyle = '#4ADE80';
          ctx.fillRect(px + 12, py + 4, 4, 2);
          ctx.fillRect(px + 10, py + 8, 4, 2);
          ctx.fillRect(px + 8, py + 14, 4, 2);
        } else {
          // Scalloped Pixel Broadleaf Ancient Oak (occasional golden-autumn crown)
          const sunlit = hash % 7 === 0;
          ctx.fillStyle = sunlit ? '#2B420B' : '#0B331B';
          ctx.fillRect(px + 4, py + 8, 24, 14);
          ctx.fillRect(px + 6, py + 4, 20, 18);
          ctx.fillRect(px + 2, py + 10, 28, 10);

          ctx.fillStyle = sunlit ? '#4D7C0F' : '#14532D';
          ctx.fillRect(px + 4, py + 8, 22, 12);
          ctx.fillRect(px + 8, py + 4, 16, 14);

          ctx.fillStyle = sunlit ? '#84CC16' : '#16A34A';
          ctx.fillRect(px + 6, py + 6, 16, 8);
          ctx.fillRect(px + 10, py + 4, 10, 6);

          ctx.fillStyle = sunlit ? '#BEF264' : '#4ADE80';
          ctx.fillRect(px + 8, py + 6, 6, 2);
          ctx.fillRect(px + 10, py + 4, 6, 2);
          ctx.fillRect(px + 16, py + 8, 4, 2);
        }
      } else if (code === 3) {
        // Faceted Pixel-Art Quarry Boulders & Ivy-Draped Rune Monoliths
        const isQuarryRock = tx >= 64 && ty < 45;
        ctx.fillStyle = neighborGroundFill();
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Stepped ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(px + 4, py + 24, 24, 4);
        ctx.fillRect(px + 6, py + 28, 20, 2);

        if (isQuarryRock) {
          // Pixel sandstone boulder with dark outline & amber ore crystal vein
          ctx.fillStyle = '#36291E';
          ctx.fillRect(px + 4, py + 8, 24, 18);
          ctx.fillRect(px + 6, py + 4, 20, 22);
          ctx.fillStyle = '#574636';
          ctx.fillRect(px + 6, py + 8, 20, 16);
          ctx.fillStyle = '#7C654F';
          ctx.fillRect(px + 6, py + 6, 18, 12);
          ctx.fillStyle = '#A68B6D';
          ctx.fillRect(px + 8, py + 6, 12, 4);
          ctx.fillStyle = '#D6BC9B';
          ctx.fillRect(px + 10, py + 6, 6, 2);
          // Sparkling amber mineral vein
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(px + 10, py + 16, 6, 2);
          ctx.fillRect(px + 14, py + 18, 4, 2);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(px + 12, py + 16, 2, 2);
        } else {
          // Pixel Rune Monolith with hanging ivy & glowing arcane sigil
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(px + 4, py + 6, 24, 20);
          ctx.fillRect(px + 6, py + 4, 20, 22);
          ctx.fillStyle = '#475569';
          ctx.fillRect(px + 6, py + 6, 20, 18);
          ctx.fillStyle = '#64748B';
          ctx.fillRect(px + 6, py + 4, 18, 12);
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(px + 8, py + 4, 12, 4);
          // Stepped ivy cluster
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px + 4, py + 16, 6, 8);
          ctx.fillStyle = '#22C55E';
          ctx.fillRect(px + 4, py + 16, 4, 4);
          // Pixel rune cross
          ctx.fillStyle = hash % 2 === 0 ? '#34D399' : '#38BDF8';
          ctx.fillRect(px + 12, py + 12, 8, 2);
          ctx.fillRect(px + 15, py + 9, 2, 8);
        }
      }
    }
  }
}

/**
 * Draws a crisp stepped pixel-art crystal spire cluster.
 */
function drawPixelCrystalSpire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  darkColor: string,
  midColor: string,
  hiColor: string,
  tipColor: string
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  // Base shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(rx - 8, ry + 4, 16, 4);
  // Dark crystal silhouette
  ctx.fillStyle = darkColor;
  ctx.fillRect(rx - 6, ry - 4, 12, 10);
  ctx.fillRect(rx - 4, ry - 10, 8, 16);
  ctx.fillRect(rx - 2, ry - 14, 4, 20);
  // Mid facet
  ctx.fillStyle = midColor;
  ctx.fillRect(rx - 4, ry - 4, 8, 8);
  ctx.fillRect(rx - 2, ry - 12, 4, 16);
  // Lit left facet & tip
  ctx.fillStyle = hiColor;
  ctx.fillRect(rx - 2, ry - 10, 2, 12);
  ctx.fillRect(rx - 4, ry - 2, 2, 6);
  ctx.fillStyle = tipColor;
  ctx.fillRect(rx - 2, ry - 12, 2, 4);
}

/**
 * Draws crisp stepped pixel-art Overworld Landmark Centerpieces & Drifting Pixel Clouds.
 * Replaces smooth vector arcs and ellipses with pure 2px pixel-art shapes.
 */
export function drawOverworldPixelLandmarks(
  ctx: CanvasRenderingContext2D,
  worldView: WorldViewBounds,
  now: number
): void {
  const viewPad = 240;
  const inViewPt = (wx: number, wy: number) =>
    wx >= worldView.left - viewPad &&
    wx <= worldView.right + viewPad &&
    wy >= worldView.top - viewPad &&
    wy <= worldView.bottom + viewPad;

  // 1. Crossroads Bastion (60.5, 45.5): Pixel-art Inlaid 8-point Brass Compass Rose
  const cbX = Math.round(60.5 * TILE_SIZE);
  const cbY = Math.round(45.5 * TILE_SIZE);
  if (inViewPt(cbX, cbY)) {
    ctx.fillStyle = 'rgba(217, 170, 82, 0.36)';
    drawPixelCircleOutline(ctx, cbX, cbY, 74, 2, 2);
    drawPixelCircleOutline(ctx, cbX, cbY, 48, 2, 2);

    // Cardinal N/S/E/W stepped pixel spikes
    ctx.fillStyle = 'rgba(245, 158, 11, 0.42)';
    for (let d = 14; d <= 68; d += 2) {
      const halfW = Math.max(2, Math.floor((68 - d) / 10) * 2 + 2);
      ctx.fillRect(cbX - halfW, cbY - d, halfW * 2, 2); // N
      ctx.fillRect(cbX - halfW, cbY + d - 2, halfW * 2, 2); // S
      ctx.fillRect(cbX - d, cbY - halfW, 2, halfW * 2); // W
      ctx.fillRect(cbX + d - 2, cbY - halfW, 2, halfW * 2); // E
    }
    // Diagonal NE/NW/SE/SW stepped pixel spikes
    ctx.fillStyle = 'rgba(253, 224, 71, 0.28)';
    for (let d = 12; d <= 36; d += 2) {
      ctx.fillRect(cbX + d - 2, cbY - d, 4, 4);
      ctx.fillRect(cbX - d - 2, cbY - d, 4, 4);
      ctx.fillRect(cbX + d - 2, cbY + d - 4, 4, 4);
      ctx.fillRect(cbX - d - 2, cbY + d - 4, 4, 4);
    }
    // Central inlaid amber jewel block
    ctx.fillStyle = 'rgba(253, 224, 71, 0.55)';
    ctx.fillRect(cbX - 6, cbY - 6, 12, 12);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(cbX - 2, cbY - 2, 4, 4);
  }

  // 2. Emerald Woods (31.5, 22.5): Stepped Pixel Sylvan Runestone Circle
  const ewX = Math.round(31.5 * TILE_SIZE);
  const ewY = Math.round(22.5 * TILE_SIZE);
  if (inViewPt(ewX, ewY)) {
    const glow = 0.34 + Math.sin(now * 0.0025) * 0.12;
    ctx.fillStyle = `rgba(52, 211, 153, ${glow.toFixed(2)})`;
    drawPixelCircleOutline(ctx, ewX, ewY, 56, 2, 2, 3);

    // 6 Mossy Pixel Standing Stones
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + now * 0.00018;
      const sx = Math.round(ewX + Math.cos(a) * 56);
      const sy = Math.round(ewY + Math.sin(a) * 56);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(sx - 4, sy - 6, 8, 12);
      ctx.fillStyle = '#475569';
      ctx.fillRect(sx - 2, sy - 4, 4, 8);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(sx - 2, sy - 2, 4, 2);
      ctx.fillRect(sx, sy - 4, 2, 6);
    }
  }

  // 3. Sunlit Quarry (89.5, 23.5): Faceted Pixel Amberstone Crystal Outcrops
  const sqX = Math.round(89.5 * TILE_SIZE);
  const sqY = Math.round(23.5 * TILE_SIZE);
  if (inViewPt(sqX, sqY)) {
    const crystalSpots = [
      [-64, -36],
      [68, -28],
      [-54, 48],
      [60, 44],
    ] as const;
    for (const [ox, oy] of crystalSpots) {
      drawPixelCrystalSpire(
        ctx,
        sqX + ox,
        sqY + oy,
        '#78350F',
        '#D97706',
        '#FBBF24',
        '#FEF08A'
      );
      drawPixelCrystalSpire(
        ctx,
        sqX + ox + 8,
        sqY + oy + 4,
        '#78350F',
        '#B45309',
        '#F59E0B',
        '#FDE047'
      );
    }
  }

  // 4. Whispering Lake (30.5, 66.5): Stepped Pixel Shore Ripples & Timber Pier Pilings
  const wlX = Math.round(30.5 * TILE_SIZE);
  const wlY = Math.round(66.5 * TILE_SIZE);
  if (inViewPt(wlX, wlY)) {
    for (let r = 0; r < 2; r++) {
      const phase = (now * 0.0004 + r * 0.5) % 1;
      const rad = Math.round((148 + phase * 34) / 2) * 2;
      ctx.fillStyle = `rgba(186, 230, 253, ${((1 - phase) * 0.34).toFixed(2)})`;
      drawPixelCircleOutline(ctx, wlX, wlY, rad, 2, 2, 4);
    }
    const pilingsY = [71.5 * TILE_SIZE, 73.5 * TILE_SIZE, 75.5 * TILE_SIZE];
    for (const py of pilingsY) {
      for (const px of [28 * TILE_SIZE - 4, 32 * TILE_SIZE + 4]) {
        const rx = Math.round(px);
        const ry = Math.round(py);
        ctx.fillStyle = '#291810';
        ctx.fillRect(rx - 4, ry - 4, 8, 10);
        ctx.fillStyle = '#7C5A3C';
        ctx.fillRect(rx - 2, ry - 4, 4, 4);
        ctx.fillStyle = '#A8825E';
        ctx.fillRect(rx - 2, ry - 4, 2, 2);
      }
    }
  }

  // 5. Shattered Sanctum (88.5, 66.5): Pixel Amethyst Arcane Dais Sigil
  const ssX = Math.round(88.5 * TILE_SIZE);
  const ssY = Math.round(66.5 * TILE_SIZE);
  if (inViewPt(ssX, ssY)) {
    const pulse = 0.32 + Math.sin(now * 0.0022) * 0.12;
    ctx.fillStyle = `rgba(167, 139, 250, ${pulse.toFixed(2)})`;
    drawPixelCircleOutline(ctx, ssX, ssY, 62, 2, 2);
    // Rotating 4 corner rune stones in pixel coordinates
    const rot = now * 0.00025;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      const rx = Math.round(ssX + Math.cos(a) * 44);
      const ry = Math.round(ssY + Math.sin(a) * 44);
      ctx.fillStyle = `rgba(196, 181, 253, ${(pulse + 0.15).toFixed(2)})`;
      ctx.fillRect(rx - 4, ry - 4, 8, 8);
      ctx.fillStyle = '#E9D5FF';
      ctx.fillRect(rx - 2, ry - 2, 4, 4);
    }
  }

  // 6. Stepped Pixel-Art Drifting High-Altitude Cloud Shadows
  ctx.fillStyle = 'rgba(10, 18, 28, 0.075)';
  const driftX = (now * 0.018) % 900;
  const driftY = (now * 0.007) % 700;
  const startCx = Math.floor((worldView.left - 300) / 520) * 520;
  const startCy = Math.floor((worldView.top - 300) / 420) * 420;
  for (let cy = startCy; cy <= worldView.bottom + 300; cy += 420) {
    for (let cx = startCx; cx <= worldView.right + 300; cx += 520) {
      const sx = Math.round((cx + ((driftX + ((cy * 17) % 300)) % 520)) / 4) * 4;
      const sy = Math.round((cy + ((driftY + ((cx * 13) % 240)) % 420)) / 4) * 4;
      // Stepped pixel cloud silhouette (4 horizontal stacked pixel bands)
      ctx.fillRect(sx - 68, sy - 32, 128, 16);
      ctx.fillRect(sx - 96, sy - 16, 192, 24);
      ctx.fillRect(sx - 80, sy + 8, 160, 16);
      ctx.fillRect(sx - 44, sy + 24, 96, 12);
    }
  }
}

/**
 * Renders the Open World War Font zone with crisp pixel-art capture ring pips,
 * stepped runic perimeter, and faceted floating pixel crystal obelisk.
 */
export function drawOverworldFontZonePixel(
  ctx: CanvasRenderingContext2D,
  z: FieldZoneState,
  now: number
): void {
  const fontKind = z.quadrant || 1;
  const baseColor =
    fontKind === 1 ? '#EF4444' : fontKind === 2 ? '#34D399' : '#38BDF8';
  const darkColor =
    fontKind === 1 ? '#7F1D1D' : fontKind === 2 ? '#064E3B' : '#0C4A6E';
  const hiColor =
    fontKind === 1 ? '#FCA5A5' : fontKind === 2 ? '#A7F3D0' : '#BAE6FD';
  const fillTint =
    fontKind === 1
      ? 'rgba(239, 68, 68, 0.13)'
      : fontKind === 2
        ? 'rgba(52, 211, 153, 0.13)'
        : 'rgba(56, 189, 248, 0.13)';
  const isContested = z.ownerId === 'contested';
  const pct = Math.max(0, Math.min(100, z.stage ?? 0));
  const zx = Math.round(z.x);
  const zy = Math.round(z.y);

  // Quantized stepped pixel aura disc
  ctx.fillStyle = fillTint;
  drawPixelFilledDisc(ctx, zx, zy, z.radius, 4);

  // Crisp pixel perimeter ring
  ctx.fillStyle = isContested ? '#F59E0B' : baseColor;
  ctx.globalAlpha = 0.55;
  drawPixelCircleOutline(ctx, zx, zy, z.radius, 2, 2);
  ctx.globalAlpha = 1;

  // 24 discrete pixel capture gauge blocks around outer perimeter
  const segCount = 24;
  const litSegs = Math.round((pct / 100) * segCount);
  for (let i = 0; i < segCount; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / segCount;
    const px = Math.round((zx + Math.cos(a) * (z.radius + 5)) / 2) * 2;
    const py = Math.round((zy + Math.sin(a) * (z.radius + 5)) / 2) * 2;
    ctx.fillStyle =
      i < litSegs
        ? isContested
          ? '#F59E0B'
          : '#FDE047'
        : 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(px - 2, py - 2, 4, 4);
  }

  // Inner rotating pixel rune circle + 4 orbiting rune blocks
  ctx.fillStyle = baseColor;
  ctx.globalAlpha = 0.72;
  drawPixelCircleOutline(ctx, zx, zy, Math.round(z.radius * 0.56), 2, 2, 3);
  ctx.globalAlpha = 1;
  const rot = now * 0.0014;
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    const rx = Math.round((zx + Math.cos(a) * (z.radius * 0.56)) / 2) * 2;
    const ry = Math.round((zy + Math.sin(a) * (z.radius * 0.56)) / 2) * 2;
    ctx.fillStyle = hiColor;
    ctx.fillRect(rx - 2, ry - 2, 4, 4);
  }

  // Floating faceted pixel crystal obelisk at center
  const bobCrystal = Math.round(Math.sin(now * 0.004) * 3);
  drawPixelCrystalSpire(ctx, zx, zy + bobCrystal, darkColor, baseColor, hiColor, '#FFFFFF');
}
