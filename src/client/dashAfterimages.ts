import type { HeroClassId, PlayerState } from '../shared/types.ts';
import type { Direction8 } from './directionalFacing.ts';
import { drawHeroSprite, type HeroRenderOptions, type HeroSwingKind } from './heroSprites.ts';

export type DashVisualKind = 'evasion' | 'bulwark';

export interface DashThemePalette {
  primary: string;
  secondary: string;
  glow: string;
  rim: string;
  trailAlpha: number;
}

export interface DashVisualState {
  playerId: string;
  heroClass: HeroClassId;
  kind: DashVisualKind;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  angle: number;
  distance: number;
  startMs: number;
  durationMs: number;
  poseFollowMs: number;
  crimsonFrenzy: boolean;
}

export interface DashVisualSample {
  x: number;
  y: number;
  isDashing: boolean;
  isVisuallyLunging: boolean;
  progress: number;
  angle: number;
  stretchAlong: number;
  stretchPerp: number;
  rimFlashAlpha: number;
  palette: DashThemePalette;
}

interface DashGhostInstance {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  maxAgeMs: number;
  alphaStart: number;
  scaleStart: number;
  scaleEnd: number;
  stretchAlong: number;
  stretchPerp: number;
  angle: number;
  heroClass: HeroClassId;
  kind: DashVisualKind;
  palette: DashThemePalette;
  chromaticOffset: number;
  useChromaticEcho: boolean;
  poseCanvas: PooledGhostCanvas | null;
  silhouetteCanvas: PooledGhostCanvas | null;
}

interface DashRibbonInstance {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  angle: number;
  bornAt: number;
  maxAgeMs: number;
  palette: DashThemePalette;
  width: number;
}

interface PooledGhostCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  refCount: number;
}

export interface DashSnapshotTriggerInput {
  player: Pick<
    PlayerState,
    | 'id'
    | 'heroClass'
    | 'attackAnimMs'
    | 'vx'
    | 'vy'
    | 'hasteMs'
    | 'shield'
    | 'crimsonFrenzyMs'
    | 'equippedWeapon'
    | 'equippedVestment'
    | 'attackComboStep'
    | 'eclipseChargeRatio'
  >;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  aimAngle: number;
  moving: boolean;
  facingLeft: boolean;
  facingDirection: Direction8;
  swingProgress?: number;
  swingKind?: HeroSwingKind;
  now?: number;
  kind?: DashVisualKind;
}

const GHOST_CANVAS_SIZE = 116;
const GHOST_ANCHOR_X = 58;
const GHOST_ANCHOR_Y = 62;
const MAX_POOLED_CANVASES = 20;
const MAX_ACTIVE_GHOSTS = 64;
const MAX_ACTIVE_RIBBONS = 24;

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function easeOutQuad(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv;
}

export function resolveDashPalette(
  heroClass: HeroClassId,
  kind: DashVisualKind = 'evasion',
  crimsonFrenzy = false
): DashThemePalette {
  if (kind === 'bulwark') {
    return {
      primary: '#FBBF24',
      secondary: '#60A5FA',
      glow: '#FEF08A',
      rim: '#FFFFFF',
      trailAlpha: 0.72,
    };
  }
  if (heroClass === 'vanguard') {
    if (crimsonFrenzy) {
      return {
        primary: '#EF4444',
        secondary: '#FCA5A5',
        glow: '#F87171',
        rim: '#FEE2E2',
        trailAlpha: 0.68,
      };
    }
    return {
      primary: '#94A3B8',
      secondary: '#F59E0B',
      glow: '#E2E8F0',
      rim: '#FFFFFF',
      trailAlpha: 0.62,
    };
  }
  if (heroClass === 'ranger') {
    return {
      primary: '#10B981',
      secondary: '#A7F3D0',
      glow: '#34D399',
      rim: '#ECFDF5',
      trailAlpha: 0.68,
    };
  }
  if (heroClass === 'arcanist') {
    return {
      primary: '#A855F7',
      secondary: '#38BDF8',
      glow: '#E879F9',
      rim: '#E0F2FE',
      trailAlpha: 0.74,
    };
  }
  return {
    primary: '#FACC15',
    secondary: '#FEF08A',
    glow: '#FDE047',
    rim: '#FFFFFF',
    trailAlpha: 0.68,
  };
}

/**
 * Manages true sprite-silhouette dash afterimages, kinetic slipstream ribbons,
 * and brief zero-latency visual dash lunge smoothing for all classes.
 */
export class DashAfterimageManager {
  private readonly visualsByPlayer = new Map<string, DashVisualState>();
  private readonly ghosts: DashGhostInstance[] = [];
  private readonly ribbons: DashRibbonInstance[] = [];
  private readonly canvasPool: PooledGhostCanvas[] = [];
  private readonly activePooled = new Set<PooledGhostCanvas>();

  public clear(): void {
    this.visualsByPlayer.clear();
    for (const g of this.ghosts) {
      this.releaseCanvas(g.poseCanvas);
      this.releaseCanvas(g.silhouetteCanvas);
    }
    this.ghosts.length = 0;
    this.ribbons.length = 0;
  }

  public removePlayer(playerId: string): void {
    this.visualsByPlayer.delete(playerId);
  }

  public getStats(): {
    activeVisuals: number;
    activeGhosts: number;
    activeRibbons: number;
    pooledCanvases: number;
    checkedOutCanvases: number;
  } {
    return {
      activeVisuals: this.visualsByPlayer.size,
      activeGhosts: this.ghosts.length,
      activeRibbons: this.ribbons.length,
      pooledCanvases: this.canvasPool.length,
      checkedOutCanvases: this.activePooled.size,
    };
  }

  private acquireCanvas(): PooledGhostCanvas | null {
    if (typeof document === 'undefined') return null;
    let entry = this.canvasPool.pop();
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = GHOST_CANVAS_SIZE;
      canvas.height = GHOST_CANVAS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      entry = { canvas, ctx, refCount: 0 };
    }
    entry.refCount = 0;
    entry.ctx.setTransform(1, 0, 0, 1, 0, 0);
    entry.ctx.globalCompositeOperation = 'source-over';
    entry.ctx.globalAlpha = 1;
    entry.ctx.clearRect(0, 0, GHOST_CANVAS_SIZE, GHOST_CANVAS_SIZE);
    this.activePooled.add(entry);
    return entry;
  }

  private retainCanvas(entry: PooledGhostCanvas | null): PooledGhostCanvas | null {
    if (!entry) return null;
    entry.refCount++;
    return entry;
  }

  private releaseCanvas(entry: PooledGhostCanvas | null): void {
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
      entry.refCount = 0;
      this.activePooled.delete(entry);
      if (this.canvasPool.length < MAX_POOLED_CANVASES) {
        this.canvasPool.push(entry);
      }
    }
  }

  private captureGhostSnapshots(
    input: DashSnapshotTriggerInput,
    palette: DashThemePalette,
    dashAngle: number,
    now: number
  ): { poseCanvas: PooledGhostCanvas | null; silhouetteCanvas: PooledGhostCanvas | null } {
    if (typeof document === 'undefined') {
      return { poseCanvas: null, silhouetteCanvas: null };
    }

    const tinted = this.acquireCanvas();
    const silhouette = this.acquireCanvas();
    if (!tinted) {
      if (silhouette) this.releaseCanvas(silhouette);
      return { poseCanvas: null, silhouetteCanvas: null };
    }

    const spriteOpts: HeroRenderOptions = {
      aimAngle: input.aimAngle,
      bob: 0,
      moving: true,
      now,
      swingProgress: input.swingProgress,
      swingKind: input.swingKind,
      comboStep: input.player.attackComboStep ?? 0,
      eclipseChargeRatio: input.player.eclipseChargeRatio ?? 0,
      facingLeft: input.facingLeft,
      facingDirection: input.facingDirection,
      equippedWeapon: input.player.equippedWeapon,
      equippedVestment: input.player.equippedVestment,
      isDashing: true,
      dashProgress: 0.35,
      dashAngle,
    };

    // 1. Render exact articulated hero pose + equipment onto offscreen canvas
    drawHeroSprite(tinted.ctx, input.player, GHOST_ANCHOR_X, GHOST_ANCHOR_Y, spriteOpts);

    // 2. Build pure spectral silhouette canvas from the rendered pose before tinting it
    if (silhouette) {
      silhouette.ctx.drawImage(tinted.canvas, 0, 0);
      silhouette.ctx.globalCompositeOperation = 'source-in';
      silhouette.ctx.fillStyle = palette.secondary;
      silhouette.ctx.fillRect(0, 0, GHOST_CANVAS_SIZE, GHOST_CANVAS_SIZE);
      silhouette.ctx.globalCompositeOperation = 'source-over';
    }

    // 3. Apply translucent spectral color-wash over the hero pose while keeping internal details legible
    tinted.ctx.globalCompositeOperation = 'source-atop';
    tinted.ctx.globalAlpha = 0.72;
    tinted.ctx.fillStyle = palette.primary;
    tinted.ctx.fillRect(0, 0, GHOST_CANVAS_SIZE, GHOST_CANVAS_SIZE);
    tinted.ctx.globalCompositeOperation = 'source-over';
    tinted.ctx.globalAlpha = 1;

    return { poseCanvas: tinted, silhouetteCanvas: silhouette };
  }

  public triggerDash(input: DashSnapshotTriggerInput): void {
    const now = input.now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const kind: DashVisualKind = input.kind ?? 'evasion';
    const dx = input.toX - input.fromX;
    const dy = input.toY - input.fromY;
    const dist = Math.hypot(dx, dy);
    const angle = dist > 3 ? Math.atan2(dy, dx) : input.aimAngle;
    const crimsonFrenzy = (input.player.crimsonFrenzyMs || 0) > 0;
    const palette = resolveDashPalette(input.player.heroClass, kind, crimsonFrenzy);

    // Visual lunge glides rapidly into the already-authoritative destination (~92-115ms)
    const durationMs = kind === 'bulwark' ? 115 : dist > 18 ? 92 : 65;
    const poseFollowMs = kind === 'bulwark' ? 75 : 55;

    this.visualsByPlayer.set(input.player.id, {
      playerId: input.player.id,
      heroClass: input.player.heroClass,
      kind,
      fromX: input.fromX,
      fromY: input.fromY,
      toX: input.toX,
      toY: input.toY,
      angle,
      distance: dist,
      startMs: now,
      durationMs,
      poseFollowMs,
      crimsonFrenzy,
    });

    const { poseCanvas, silhouetteCanvas } = this.captureGhostSnapshots(input, palette, angle, now);

    // Staggered real hero-silhouette afterimages along dash trajectory
    const ghostCount = kind === 'bulwark' ? 7 : dist > 18 ? 6 : 3;
    const isArcanistOrRanger =
      input.player.heroClass === 'arcanist' || input.player.heroClass === 'ranger';

    for (let i = 0; i < ghostCount; i++) {
      // Keep oldest afterimages closer to takeoff, newest near arrival
      const t =
        dist > 18
          ? 0.02 + (i / (ghostCount - 1)) * 0.84
          : 0;
      const lateralJitter =
        dist <= 18
          ? (i - 1) * 5.5
          : 0;
      const gx = input.fromX + dx * t - Math.sin(angle) * lateralJitter;
      const gy = input.fromY + dy * t + Math.cos(angle) * lateralJitter;
      const spawnDelay = dist > 18 ? Math.round(t * (durationMs * 0.72)) : i * 16;
      const decayMs = (kind === 'bulwark' ? 350 : 320) + i * 26;
      const headBias = i / Math.max(1, ghostCount - 1);

      this.pushGhost({
        x: gx,
        y: gy,
        vx: -Math.cos(angle) * (18 - headBias * 10),
        vy: -Math.sin(angle) * (18 - headBias * 10),
        bornAt: now + spawnDelay,
        maxAgeMs: decayMs,
        alphaStart: 0.42 + headBias * 0.28,
        scaleStart: 0.98 + headBias * 0.04,
        scaleEnd: 0.88,
        stretchAlong: 1.15 - headBias * 0.07,
        stretchPerp: 0.88 + headBias * 0.05,
        angle,
        heroClass: input.player.heroClass,
        kind,
        palette,
        chromaticOffset: isArcanistOrRanger ? (i % 2 === 0 ? 3.2 : -2.6) : 2.0,
        useChromaticEcho: i < ghostCount - 1,
        poseCanvas: this.retainCanvas(poseCanvas),
        silhouetteCanvas: this.retainCanvas(silhouetteCanvas),
      });
    }

    // Release local factory ownership (retained references stay alive until each ghost expires)
    if (poseCanvas && poseCanvas.refCount === 0) {
      this.activePooled.delete(poseCanvas);
      if (this.canvasPool.length < MAX_POOLED_CANVASES) this.canvasPool.push(poseCanvas);
    }
    if (silhouetteCanvas && silhouetteCanvas.refCount === 0) {
      this.activePooled.delete(silhouetteCanvas);
      if (this.canvasPool.length < MAX_POOLED_CANVASES) this.canvasPool.push(silhouetteCanvas);
    }

    // Kinetic slipstream ribbon spanning dash corridor
    if (dist > 14) {
      if (this.ribbons.length >= MAX_ACTIVE_RIBBONS) {
        this.ribbons.shift();
      }
      this.ribbons.push({
        fromX: input.fromX,
        fromY: input.fromY,
        toX: input.toX,
        toY: input.toY,
        angle,
        bornAt: now,
        maxAgeMs: kind === 'bulwark' ? 280 : 230,
        palette,
        width: kind === 'bulwark' ? 19 : input.player.heroClass === 'vanguard' ? 16 : 13,
      });
    }
  }

  private pushGhost(ghost: DashGhostInstance): void {
    while (this.ghosts.length >= MAX_ACTIVE_GHOSTS) {
      const dropped = this.ghosts.shift();
      if (dropped) {
        this.releaseCanvas(dropped.poseCanvas);
        this.releaseCanvas(dropped.silhouetteCanvas);
      }
    }
    this.ghosts.push(ghost);
  }

  public isPlayerVisuallyDashing(playerId: string, now: number): boolean {
    const v = this.visualsByPlayer.get(playerId);
    if (!v) return false;
    return now - v.startMs < v.durationMs + v.poseFollowMs;
  }

  public getVisualDashSample(
    playerId: string,
    authoritativeX: number,
    authoritativeY: number,
    now: number
  ): DashVisualSample | null {
    const v = this.visualsByPlayer.get(playerId);
    if (!v) return null;

    const elapsed = now - v.startMs;
    const totalMs = v.durationMs + v.poseFollowMs;
    if (elapsed >= totalMs || elapsed < 0) {
      if (elapsed >= totalMs) {
        this.visualsByPlayer.delete(playerId);
      }
      return null;
    }

    const palette = resolveDashPalette(v.heroClass, v.kind, v.crimsonFrenzy);
    const lungeT = Math.min(1, elapsed / Math.max(1, v.durationMs));
    const isVisuallyLunging = elapsed < v.durationMs;

    // Immediate ~38% forward snap on frame 0 so dash feels ultra-responsive, then cubic glide to destination
    const visualAlpha = 0.38 + 0.62 * easeOutCubic(lungeT);
    const dx = authoritativeX - v.fromX;
    const dy = authoritativeY - v.fromY;

    // Only apply interpolation while displacement stays bounded (guards against floor teleports)
    const canInterpolate = v.distance > 12 && Math.hypot(dx, dy) < 260;
    const vx = canInterpolate ? v.fromX + dx * visualAlpha : authoritativeX;
    const vy = canInterpolate ? v.fromY + dy * visualAlpha : authoritativeY;

    // Squash & stretch curve: lengthen along motion during flight, crisp brief settle cushion on arrival
    let stretchAlong = 1;
    let stretchPerp = 1;
    if (lungeT < 0.72) {
      const f = 1 - lungeT / 0.72;
      stretchAlong = 1 + 0.17 * f;
      stretchPerp = 1 - 0.13 * f;
    } else {
      const settleT = (lungeT - 0.72) / 0.28;
      const bounce = Math.sin(settleT * Math.PI);
      stretchAlong = 1 - 0.06 * bounce;
      stretchPerp = 1 + 0.065 * bounce;
    }

    const fullT = elapsed / totalMs;
    const rimFlashAlpha = Math.max(0, (1 - fullT) * 0.65);

    return {
      x: vx,
      y: vy,
      isDashing: true,
      isVisuallyLunging,
      progress: fullT,
      angle: v.angle,
      stretchAlong,
      stretchPerp,
      rimFlashAlpha,
      palette,
    };
  }

  public updateAndDraw(
    ctx: CanvasRenderingContext2D,
    now: number,
    viewBounds?: { left: number; right: number; top: number; bottom: number }
  ): void {
    // 1. Update & render tapered kinetic slipstream ribbons under the afterimage silhouettes
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const r = this.ribbons[i];
      const age = now - r.bornAt;
      if (age >= r.maxAgeMs) {
        this.ribbons.splice(i, 1);
        continue;
      }
      if (age < 0) continue;

      if (viewBounds) {
        const minX = Math.min(r.fromX, r.toX) - 48;
        const maxX = Math.max(r.fromX, r.toX) + 48;
        const minY = Math.min(r.fromY, r.toY) - 48;
        const maxY = Math.max(r.fromY, r.toY) + 48;
        if (
          maxX < viewBounds.left ||
          minX > viewBounds.right ||
          maxY < viewBounds.top ||
          minY > viewBounds.bottom
        ) {
          continue;
        }
      }

      const t = age / r.maxAgeMs;
      const fade = 1 - easeOutQuad(t);
      // Tail whips forward toward arrival point as ribbon decays
      const tailStart = easeOutCubic(Math.min(1, t * 1.15)) * 0.85;
      const sx = r.fromX + (r.toX - r.fromX) * tailStart;
      const sy = r.fromY + (r.toY - r.fromY) * tailStart;
      const nx = -Math.sin(r.angle);
      const ny = Math.cos(r.angle);
      const headHalfW = r.width * 0.5 * fade;

      ctx.save();
      // Soft outer spectral ribbon wedge
      const grad = ctx.createLinearGradient(sx, sy, r.toX, r.toY);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.55, r.palette.primary);
      grad.addColorStop(1, r.palette.secondary);

      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(r.toX + nx * headHalfW, r.toY + ny * headHalfW);
      ctx.lineTo(r.toX - nx * headHalfW, r.toY - ny * headHalfW);
      ctx.closePath();
      ctx.fill();

      // Twin crisp speed lines flanking trajectory
      ctx.globalAlpha = 0.52 * fade;
      ctx.strokeStyle = r.palette.rim;
      ctx.lineWidth = 1.4;
      for (const side of [-1, 1]) {
        const off = side * (r.width * 0.42);
        ctx.beginPath();
        ctx.moveTo(sx + nx * off * 0.45, sy + ny * off * 0.45);
        ctx.lineTo(r.toX + nx * off, r.toY + ny * off);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Update & render staggered hero-silhouette afterimages
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      const age = now - g.bornAt;
      if (age >= g.maxAgeMs) {
        this.releaseCanvas(g.poseCanvas);
        this.releaseCanvas(g.silhouetteCanvas);
        this.ghosts.splice(i, 1);
        continue;
      }
      if (age < 0) continue;

      const t = age / g.maxAgeMs;
      const dtSec = 1 / 60;
      const px = g.x + g.vx * (age * 0.001) * (1 - t * 0.45);
      const py = g.y + g.vy * (age * 0.001) * (1 - t * 0.45);
      void dtSec;

      if (
        viewBounds &&
        (px < viewBounds.left - 70 ||
          px > viewBounds.right + 70 ||
          py < viewBounds.top - 70 ||
          py > viewBounds.bottom + 70)
      ) {
        continue;
      }

      const alpha = g.alphaStart * Math.pow(1 - t, 1.45);
      if (alpha <= 0.015) continue;

      const scale = g.scaleStart + (g.scaleEnd - g.scaleStart) * easeOutQuad(t);
      const stretchAlong = 1 + (g.stretchAlong - 1) * (1 - t);
      const stretchPerp = 1 + (g.stretchPerp - 1) * (1 - t);

      ctx.save();
      ctx.translate(px, py);
      // Pure symmetric directional stretch without net sprite rotation
      ctx.rotate(g.angle);
      ctx.scale(scale * stretchAlong, scale * stretchPerp);
      ctx.rotate(-g.angle);

      if (g.poseCanvas) {
        // Optional subtle chromatic split echo behind main afterimage
        if (g.silhouetteCanvas && g.useChromaticEcho && t < 0.72) {
          const prevComp = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * 0.42;
          const offX = Math.cos(g.angle + Math.PI * 0.5) * g.chromaticOffset;
          const offY = Math.sin(g.angle + Math.PI * 0.5) * g.chromaticOffset;
          ctx.drawImage(
            g.silhouetteCanvas.canvas,
            -GHOST_ANCHOR_X + offX,
            -GHOST_ANCHOR_Y + offY
          );
          ctx.globalCompositeOperation = prevComp;
        }

        // Main spectral hero-pose afterimage
        ctx.globalAlpha = alpha;
        ctx.drawImage(g.poseCanvas.canvas, -GHOST_ANCHOR_X, -GHOST_ANCHOR_Y);
      } else {
        // Fallback geometric silhouette (only if offscreen canvas unavailable)
        ctx.globalAlpha = alpha * 0.75;
        ctx.fillStyle = g.palette.primary;
        ctx.beginPath();
        ctx.ellipse(0, -4, 9, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }
}
