import type { HeroClassId, PlayerState } from '../shared/types.ts';
import {
  DEFAULT_VESTMENT_BY_CLASS,
  DEFAULT_WEAPON_BY_CLASS,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
} from '../shared/armaments.ts';
import {
  angleToDirection8,
  direction8ToPose,
  type Direction8,
  type DirectionalPose,
} from './directionalFacing.ts';
import {
  computeHeroCombatPose,
  type HeroCombatPose,
  type HeroSwingKind,
} from './heroCombatAnim.ts';

export type { HeroSwingKind };

export interface HeroRenderOptions {
  aimAngle: number;
  bob: number;
  moving: boolean;
  now: number;
  isPreview?: boolean;
  swingProgress?: number;
  swingKind?: HeroSwingKind;
  comboStep?: number;
  eclipseChargeRatio?: number;
  hitStopActive?: boolean;
  impactJitter?: number;
  facingLeft?: boolean;
  facingDirection?: Direction8;
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
  isDashing?: boolean;
  dashProgress?: number;
  dashAngle?: number;
  dashStretchAlong?: number;
  dashStretchPerp?: number;
  dashRimColor?: string;
  dashFlashAlpha?: number;
}

function resolveVisualWeaponId(
  heroClass: HeroClassId,
  equippedWeapon: string | null | undefined
): string | null {
  if (equippedWeapon === undefined) {
    return DEFAULT_WEAPON_BY_CLASS[heroClass];
  }
  if (equippedWeapon === null) {
    return null;
  }
  return resolveEquippedWeaponForClass(heroClass, equippedWeapon)?.id ?? null;
}

function resolveVisualVestmentId(
  heroClass: HeroClassId,
  equippedVestment: string | null | undefined
): string | null {
  if (equippedVestment === undefined) {
    return DEFAULT_VESTMENT_BY_CLASS[heroClass];
  }
  if (equippedVestment === null) {
    return null;
  }
  return resolveEquippedVestmentForClass(heroClass, equippedVestment)?.id ?? null;
}

function resolveSpritePose(
  p: Pick<PlayerState, 'vx' | 'vy'>,
  options: HeroRenderOptions
): DirectionalPose {
  if (options.facingDirection) {
    return direction8ToPose(options.facingDirection, options.facingLeft ?? false);
  }
  if (options.facingLeft !== undefined) {
    return direction8ToPose(options.facingLeft ? 'W' : 'E', options.facingLeft);
  }
  const vx = p.vx || 0;
  const vy = p.vy || 0;
  if (options.moving && Math.hypot(vx, vy) > 0.5) {
    return direction8ToPose(angleToDirection8(Math.atan2(vy, vx)), vx < 0);
  }
  return direction8ToPose(
    angleToDirection8(options.aimAngle),
    Math.cos(options.aimAngle) < 0
  );
}

/**
 * Draws an articulated two-segment leg (thigh + shin + boot) connecting hip anchor to footwork coordinate.
 */
function drawArticulatedLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  lift: number,
  thighColor: string,
  shinColor: string,
  bootColor: string,
  width = 4.6
): void {
  const actualFootY = footY - lift;
  const midX = (hipX + footX) * 0.5 + (footX - hipX >= 0 ? 0.6 : -0.6);
  const midY = (hipY + actualFootY) * 0.5 - lift * 0.35;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = thighColor;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(midX, midY);
  ctx.stroke();

  ctx.strokeStyle = shinColor;
  ctx.lineWidth = Math.max(2.6, width - 0.8);
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(footX, actualFootY + 2.2);
  ctx.stroke();

  // Boot / Sabaton planted at foot coordinate
  ctx.fillStyle = bootColor;
  ctx.fillRect(footX - width * 0.55, actualFootY + 1.2, width + 1.4, 2.5);
  ctx.restore();
}

interface HandRenderStyle {
  handColor: string;
  knuckleColor?: string;
  cuffColor?: string;
  size?: number;
  drawHand?: boolean;
}

/**
 * Draws an articulated two-segment arm (upper arm + forearm/bracer + hand/gauntlet)
 * with anatomically natural elbow bend (outward + downward gravity weight).
 */
function drawArticulatedArm(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  elbowBias: number,
  sleeveColor: string,
  bracerColor: string,
  thickness = 3.2,
  handStyle?: HandRenderStyle
): void {
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy);
  const midX = (sx + hx) * 0.5;
  const midY = (sy + hy) * 0.5;
  const lateralFlare = Math.min(2.8, 0.8 + len * 0.14) * elbowBias;
  // Keep elbow naturally lowered rather than flipping upward when reaching left/across torso
  const upLift = dy < -2 ? Math.max(0.25, 1 + dy * 0.08) : 1;
  const gravDrop = Math.min(2.6, 0.9 + len * 0.11) * upLift;
  const ex = midX + lateralFlare;
  const ey = midY + gravDrop;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = sleeveColor;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.strokeStyle = bracerColor;
  ctx.lineWidth = Math.max(2.2, thickness - 0.5);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  if (handStyle && handStyle.drawHand !== false) {
    const hs = handStyle.size ?? 3.2;
    const half = hs * 0.5;
    if (handStyle.cuffColor) {
      const fLen = Math.hypot(hx - ex, hy - ey);
      const ux = fLen > 0.4 ? (hx - ex) / fLen : 0;
      const uy = fLen > 0.4 ? (hy - ey) / fLen : 0;
      ctx.fillStyle = handStyle.cuffColor;
      ctx.fillRect(hx - ux * 1.8 - 1.3, hy - uy * 1.8 - 1.3, 2.6, 2.6);
    }
    ctx.fillStyle = handStyle.handColor;
    ctx.fillRect(hx - half, hy - half, hs, hs);
    if (handStyle.knuckleColor) {
      ctx.fillStyle = handStyle.knuckleColor;
      ctx.fillRect(hx - half * 0.45, hy - half * 0.65, hs * 0.55, hs * 0.45);
    }
  }
  ctx.restore();
}

/**
 * Draws fingers/knuckle wrap on top of a weapon grip so the weapon looks held in-hand.
 */
function drawHandGripCap(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  handColor: string,
  knuckleColor?: string,
  size = 2.6
): void {
  const half = size * 0.5;
  ctx.fillStyle = handColor;
  ctx.fillRect(hx - half, hy - half, size, size);
  if (knuckleColor) {
    ctx.fillStyle = knuckleColor;
    ctx.fillRect(hx - half * 0.4, hy - half * 0.55, size * 0.55, size * 0.45);
  }
}

/**
 * Draws a crisp, animated pixel-art hero character with true 8-directional poses
 * (N, NE, E, SE, S, SW, W, NW), articulated limbs (legs, torso twist/lean, head, arms),
 * weapon-dependent multi-hit combo poses, and independent 360-degree weapon aiming.
 */
export function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  p: Pick<PlayerState, 'heroClass' | 'attackAnimMs' | 'vx' | 'vy' | 'hasteMs' | 'shield'> &
    Partial<
      Pick<
        PlayerState,
        'equippedWeapon' | 'equippedVestment' | 'attackComboStep' | 'eclipseChargeRatio'
      >
    >,
  hx: number,
  hy: number,
  options: HeroRenderOptions
): void {
  const { aimAngle, bob, moving, now } = options;
  const pose = resolveSpritePose(p, options);
  const rawWeapon =
    options.equippedWeapon !== undefined ? options.equippedWeapon : p.equippedWeapon;
  const weaponId = resolveVisualWeaponId(p.heroClass, rawWeapon);
  const rawVestment =
    options.equippedVestment !== undefined ? options.equippedVestment : p.equippedVestment;
  const vestmentId = resolveVisualVestmentId(p.heroClass, rawVestment);

  // Pure vertical poses (N/S) stay horizontally un-mirrored for symmetric torso/head;
  // W, NW, SW mirror across Y-axis so +X in local space always points toward horizontal facing.
  const mirrorX = pose.isPureVertical ? false : pose.facingLeft;

  // Angle in local (possibly X-mirrored) sprite space pointing along exact world aimAngle
  const localAim = Math.atan2(
    Math.sin(aimAngle),
    mirrorX ? -Math.cos(aimAngle) : Math.cos(aimAngle)
  );

  const speedMag = Math.hypot(p.vx || 0, p.vy || 0);
  const isDashing = Boolean(options.isDashing) || speedMag > 290;
  const walkPhase = now * (isDashing ? 0.026 : 0.017) + hx * 0.03;
  const strideA = moving ? Math.sin(walkPhase) : 0;
  const strideB = moving ? -Math.sin(walkPhase) : 0;
  const liftA = moving ? Math.max(0, -Math.cos(walkPhase)) * 2.4 : 0;
  const liftB = moving ? Math.max(0, Math.cos(walkPhase)) * 2.4 : 0;

  const idleWave = Math.sin(now * 0.0045 + hx * 0.07);
  const bodyBob = moving ? bob : idleWave * 0.75;
  const headBob = bodyBob + (moving ? Math.sin(walkPhase * 2) * 0.45 : idleWave * 0.35);

  const hasClientSwing =
    options.swingProgress !== undefined && options.swingProgress >= 0 && options.swingProgress < 1;
  const isAttacking = hasClientSwing || p.attackAnimMs > 0;
  const maxAnim = p.attackAnimMs > 245 ? 280 : p.attackAnimMs > 190 ? 240 : 190;
  const atkProgress = hasClientSwing
    ? Math.max(0, Math.min(1, options.swingProgress as number))
    : isAttacking
      ? Math.max(0, Math.min(1, 1 - p.attackAnimMs / maxAnim))
      : 0;
  const swingKind: HeroSwingKind =
    options.swingKind ?? (p.attackAnimMs > 245 ? 'ult' : p.attackAnimMs > 190 ? 'tactical' : 'primary');
  const swingAmp = swingKind === 'ult' ? 1.25 : swingKind === 'tactical' ? 1.14 : 1.0;
  const comboStep = options.comboStep ?? p.attackComboStep ?? 0;
  const eclipseChargeRatio = options.eclipseChargeRatio ?? p.eclipseChargeRatio ?? 0;

  const combatPose = computeHeroCombatPose({
    heroClass: p.heroClass,
    weaponId,
    isAttacking,
    atkProgress,
    comboStep,
    swingKind,
    swingAmp,
    eclipseChargeRatio,
    localAim,
    moving,
    isDashing,
    strideA,
    strideB,
    liftA,
    liftB,
    walkPhase,
    idleWave,
    bodyBob,
    headBob,
    now,
    pose,
    hitStopActive: options.hitStopActive,
    impactJitter: options.impactJitter,
  });

  // Root transform only translates & mirrors horizontally — NEVER rotates the whole character sprite!
  // Articulated torso/head/limbs perform independent rotation, footwork stepping, and coil.
  ctx.save();
  ctx.translate(hx, hy);
  if (
    options.dashAngle !== undefined &&
    options.dashStretchAlong !== undefined &&
    options.dashStretchPerp !== undefined &&
    (Math.abs(options.dashStretchAlong - 1) > 0.005 || Math.abs(options.dashStretchPerp - 1) > 0.005)
  ) {
    // Symmetric tensor stretch along dash direction with zero net rotation
    ctx.rotate(options.dashAngle);
    ctx.scale(options.dashStretchAlong, options.dashStretchPerp);
    ctx.rotate(-options.dashAngle);
  }
  if (options.dashFlashAlpha && options.dashFlashAlpha > 0.02) {
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = options.dashRimColor || '#E2E8F0';
    ctx.globalAlpha = Math.min(0.45, options.dashFlashAlpha * 0.42);
    ctx.beginPath();
    ctx.ellipse(0, -4, 15, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevComp;
  }
  if (mirrorX) {
    ctx.scale(-1, 1);
  }

  const drawArgs: DrawHeroPartsContext = {
    bodyBob,
    headBob,
    strideA,
    strideB,
    liftA,
    liftB,
    moving,
    isDashing,
    idleWave,
    now,
    isAttacking,
    atkProgress,
    swingKind,
    swingAmp,
    localAim,
    walkPhase,
    pose,
    isBack: pose.verticalPlane === 'back',
    isFront: pose.verticalPlane === 'front',
    isSide: pose.verticalPlane === 'side',
    isPureVertical: pose.isPureVertical,
    isDiagonal: pose.isDiagonal,
    faceShiftX: pose.isPureVertical ? 0 : pose.isDiagonal ? 1.5 : 3,
    weaponId,
    vestmentId,
    combatPose,
  };

  if (p.heroClass === 'vanguard') {
    drawVanguard(ctx, drawArgs);
  } else if (p.heroClass === 'ranger') {
    drawRanger(ctx, drawArgs);
  } else if (p.heroClass === 'arcanist') {
    drawArcanist(ctx, drawArgs);
  } else {
    drawCleric(ctx, drawArgs);
  }

  ctx.restore();
}

interface DrawHeroPartsContext {
  bodyBob: number;
  headBob: number;
  strideA: number;
  strideB: number;
  liftA: number;
  liftB: number;
  moving: boolean;
  isDashing: boolean;
  idleWave: number;
  now: number;
  isAttacking: boolean;
  atkProgress: number;
  swingKind: HeroSwingKind;
  swingAmp: number;
  localAim: number;
  walkPhase: number;
  pose: DirectionalPose;
  isBack: boolean;
  isFront: boolean;
  isSide: boolean;
  isPureVertical: boolean;
  isDiagonal: boolean;
  faceShiftX: number;
  weaponId: string | null;
  vestmentId: string | null;
  combatPose: HeroCombatPose;
}

function drawVanguard(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    moving,
    isDashing,
    idleWave,
    now,
    isAttacking,
    swingKind,
    swingAmp,
    localAim,
    walkPhase,
    isBack,
    isFront,
    isPureVertical,
    isDiagonal,
    combatPose,
  } = s;

  const { footwork, torso, head, mainArm, offArm, weapon, slash } = combatPose;
  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);

  const capeLift = moving
    ? (isDashing ? -5 : -2.5) + Math.sin(walkPhase * 1.4) * 1.8
    : idleWave * 1.1;

  const vestmentId = s.vestmentId;
  const isUnarmored = vestmentId === null;
  const isObsidian = vestmentId === 'vanguard_obsidian_juggernaut';
  const isSovereign = vestmentId === 'vanguard_aegis_sovereign_mail';

  const capeOuter = isObsidian ? '#1E293B' : isSovereign ? '#991B1B' : '#7F1D1D';
  const capeInner = isObsidian ? '#334155' : isSovereign ? '#B91C1C' : '#991B1B';
  const capeTrim = isObsidian ? '#CBD5E1' : isSovereign ? '#FDE047' : '#D97706';

  const drawWarCape = () => {
    if (isUnarmored) return;
    if (isPureVertical) {
      const billow = moving ? Math.sin(walkPhase * 1.4) * 1.5 : idleWave * 0.9;
      ctx.fillStyle = capeOuter;
      ctx.fillRect(-9.5, -5, 19, 14);
      ctx.fillRect(-10.5, 4 + billow * 0.4, 21, 7);
      ctx.fillStyle = capeInner;
      ctx.fillRect(-8, -4, 16, 13);
      ctx.fillStyle = capeTrim;
      ctx.fillRect(-10.5, 10 + billow * 0.4, 21, 1.5);
      return;
    }
    const shiftX = (isDiagonal ? capeLift * 0.35 : capeLift * 0.5) - torso.twistYaw * 1.4;
    const tailX = (isDiagonal ? -10 + capeLift * 0.65 : -13 + capeLift) - torso.twistYaw * 1.8;
    ctx.fillStyle = capeOuter;
    ctx.fillRect(-11 + shiftX, -5, isDiagonal ? 14 : 12, 13);
    ctx.fillRect(tailX, 4, 10, 7);
    ctx.fillStyle = capeInner;
    ctx.fillRect(-10 + shiftX * 0.8, -4, isDiagonal ? 12 : 10, 11);
    ctx.fillStyle = capeTrim;
    ctx.fillRect(tailX, 10, 9, 1.5);
  };

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isHalberd = weaponId === 'vanguard_crimson_halberd';
  const isFlail = weaponId === 'vanguard_stormbreaker_flail';

  const drawShield = () => {
    if (isUnarmed || isHalberd) return;
    const w = isPureVertical ? 5 : 6;
    ctx.save();
    ctx.translate(offArm.handX, offArm.handY);
    ctx.rotate(offArm.angle);
    if (isFlail) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4.5, -9, w + 1, 18);
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(-3.5, -8, w - 1, 16);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-3.5, -8, 1.5, 16);
      ctx.fillRect(-2, -1, w - 3, 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-4.5, -9, w + 1, 1.8);
      ctx.fillRect(-4.5, 7.2, w + 1, 1.8);
    } else {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4, -8, w, 17);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-3, -7, w - 2, 14);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-3, -7, 2, 12);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-3, -3, w - 2, 7);
      ctx.fillRect(-4, -8, w, 1.5);
    }
    ctx.restore();
  };

  const drawWeapon = () => {
    ctx.save();
    ctx.translate(weapon.offX, weapon.offY);
    ctx.rotate(weapon.angle);
    if (isUnarmed) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(-1.5, -2.5, 4.5, 5);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, -2, 3, 2.5);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-1.5, 1.5, 4.5, 1.5);
    } else if (isFlail) {
      ctx.translate(-0.5, -1.5);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-1, -6, 3, 14);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-2, -7, 5, 2);
      ctx.fillRect(-1.5, 8, 4, 2);
      ctx.save();
      ctx.translate(0.5, -7);
      ctx.rotate(weapon.chainSway);
      ctx.fillStyle = '#CBD5E1';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(-1.2, -(i + 1) * 3.4 * weapon.chainExtend, 2.4, 2.4);
      }
      const ballY = -13.5 * weapon.chainExtend;
      ctx.fillStyle = isAttacking ? 'rgba(56, 189, 248, 0.56)' : 'rgba(56, 189, 248, 0.26)';
      ctx.beginPath();
      ctx.arc(0, ballY, isAttacking ? 7.8 : 5.8, 0, Math.PI * 2);
      ctx.fill();
      const boltSpin = now * 0.015;
      ctx.strokeStyle = isAttacking ? '#FEF08A' : '#7DD3FC';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(boltSpin) * 4.5, ballY + Math.sin(boltSpin) * 4.5);
      ctx.lineTo(Math.cos(boltSpin + 0.5) * 7.5, ballY + Math.sin(boltSpin + 0.5) * 7.5);
      ctx.lineTo(Math.cos(boltSpin + 1.1) * 5.2, ballY + Math.sin(boltSpin + 1.1) * 5.2);
      ctx.stroke();
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4, ballY - 4, 8, 8);
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(-3, ballY - 3, 6, 6);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-2, ballY - 2, 4, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-1, ballY - 1, 2, 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-1, ballY - 6, 2, 2.2);
      ctx.fillRect(-6, ballY - 1, 2.2, 2);
      ctx.fillRect(3.8, ballY - 1, 2.2, 2);
      ctx.fillRect(-1, ballY + 3.8, 2, 2.2);
      ctx.restore();
    } else if (isHalberd) {
      ctx.translate(-0.5, -2.5);
      ctx.fillStyle = '#450A0A';
      ctx.fillRect(-1, -20, 3, 29);
      ctx.fillStyle = '#B91C1C';
      ctx.fillRect(-0.5, -19, 2, 27);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-1, 7, 3, 3);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-2, -13, 5, 2);
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-0.5, -24, 2, 4);
      ctx.fillStyle = '#334155';
      ctx.fillRect(1.5, -21, 6, 12);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(2, -19, 3, 8);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(6.5, -22, 2, 14);
      ctx.fillRect(8, -20, 1.5, 10);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-5.5, -19, 4.5, 8);
      ctx.fillStyle = '#991B1B';
      ctx.fillRect(-4.5, -18, 2.5, 6);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-6.5, -20, 1.5, 10);
      const edgeGlintY = -21 + ((now * 0.012) % 10);
      ctx.fillStyle = isAttacking ? '#FEF2F2' : '#FCA5A5';
      ctx.fillRect(7, edgeGlintY, 1.6, 2.5);
    } else {
      ctx.translate(-1.5, -4.5);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-1, -1, 5, 4);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(0, -21, 3.5, 21);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(1, -22, 2.5, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(2, -21, 1, 19);
      const bladeGlint = -20 + ((now * 0.015) % 17);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(0.5, bladeGlint, 2.5, 2.5);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3.5, 0, 10, 2.5);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-3.5, 0, 1.5, 2.5);
      ctx.fillRect(5, 0, 1.5, 2.5);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(0.5, 2.5, 2.5, 4);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(0, 6.5, 3.5, 2.5);
    }
    ctx.restore();
  };

  const drawSlashCrescent = () => {
    if (slash.progress < 0) return;
    const t = slash.progress;
    ctx.save();
    if (slash.style === 'overhead_slam') {
      ctx.translate(slash.slamOffsetX, slash.slamOffsetY);
      const slamR = 11 + t * 16;
      ctx.strokeStyle = `rgba(56, 189, 248, ${(0.92 * (1 - t * 0.45)).toFixed(2)})`;
      ctx.lineWidth = 3.4 * (1 - t * 0.45);
      ctx.beginPath();
      ctx.ellipse(0, 0, slamR, slamR * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(253, 224, 71, ${(0.9 * (1 - t * 0.4)).toFixed(2)})`;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-slamR * 0.65, -4);
      ctx.lineTo(0, 2);
      ctx.lineTo(slamR * 0.72, -3);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.translate(aimCos * 5.5 + torso.x * 0.5, aimSin * 6 + torso.y);
    ctx.rotate(localAim);
    const radiusBase = (isUnarmed ? 15 : isHalberd ? 25 : 22) * slash.radiusScale;
    const startAng = -slash.arcSpan * 0.5;
    const endAng = startAng + slash.arcSpan * t;
    const a0 = slash.reverse ? -endAng : startAng;
    const a1 = slash.reverse ? -startAng : endAng;

    const primaryArcColor = isUnarmed
      ? 'rgba(203, 213, 225, 0.76)'
      : isHalberd
        ? 'rgba(248, 113, 113, 0.9)'
        : isFlail
          ? 'rgba(56, 189, 248, 0.92)'
          : swingKind === 'ult'
            ? 'rgba(147, 197, 253, 0.92)'
            : 'rgba(254, 240, 138, 0.88)';
    ctx.strokeStyle = primaryArcColor;
    ctx.lineWidth = (slash.isFinisher ? 4.4 : 3.4) * (1 - t * 0.42);
    ctx.beginPath();
    ctx.arc(2, 0, radiusBase * (1 + (swingAmp - 1) * 0.35), Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();

    if (!isUnarmed) {
      ctx.strokeStyle = isFlail
        ? 'rgba(253, 224, 71, 0.94)'
        : isHalberd
          ? 'rgba(254, 202, 202, 0.94)'
          : 'rgba(255, 255, 255, 0.94)';
      ctx.lineWidth = 1.6;
      const innerA0 = slash.reverse ? -(startAng + slash.arcSpan * 0.9 * t) : startAng * 0.9;
      const innerA1 = slash.reverse ? -startAng * 0.9 : startAng * 0.9 + slash.arcSpan * 0.92 * t;
      ctx.beginPath();
      ctx.arc(2, 0, radiusBase + 2.5, Math.min(innerA0, innerA1), Math.max(innerA0, innerA1));
      ctx.stroke();

      if (slash.isFinisher || isHalberd) {
        ctx.strokeStyle = isHalberd
          ? 'rgba(220, 38, 38, 0.72)'
          : isFlail
            ? 'rgba(56, 189, 248, 0.65)'
            : 'rgba(251, 191, 36, 0.7)';
        ctx.lineWidth = 2.1 * (1 - t * 0.4);
        ctx.beginPath();
        ctx.arc(2, 0, radiusBase + 5.5, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
    }
    if (combatPose.hitStopActive) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = slash.isFinisher ? 2.6 : 1.9;
      ctx.beginPath();
      ctx.arc(2, 0, radiusBase + 1.2, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawPlume = () => {
    if (isUnarmored) return;
    const plumeWave = moving ? -3 + Math.sin(walkPhase * 1.6) * 2 : Math.sin(now * 0.009) * 1.4;
    const plumeBase = isObsidian ? '#64748B' : isSovereign ? '#F59E0B' : '#B91C1C';
    const plumeTip = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#DC2626';
    if (isPureVertical && isBack) {
      ctx.fillStyle = plumeBase;
      ctx.fillRect(-2.5, -24, 5, 5);
      ctx.fillStyle = plumeTip;
      ctx.fillRect(-2 + plumeWave * 0.25, -20, 4, 8);
      ctx.fillRect(-1.5 + plumeWave * 0.45, -13, 3, 5);
      return;
    }
    if (isPureVertical && isFront) {
      ctx.fillStyle = plumeBase;
      ctx.fillRect(-2.5, -25, 5, 5);
      ctx.fillStyle = plumeTip;
      ctx.fillRect(-2 + plumeWave * 0.2, -27, 4, 3);
      return;
    }
    const pShift = isDiagonal ? 0.6 : 1.0;
    ctx.fillStyle = plumeBase;
    ctx.fillRect(-3, -24, 5, 4);
    ctx.fillStyle = plumeTip;
    ctx.fillRect(-6 + plumeWave * 0.6 * pShift, -25, 5, 3);
    ctx.fillRect(-8 + plumeWave * pShift, -23, 4, 3);
  };

  const drawVanguardVestmentAura = () => {
    if (isSovereign) {
      const auraPulse = 0.28 + Math.sin(now * 0.006) * 0.1;
      ctx.strokeStyle = `rgba(250, 204, 21, ${auraPulse.toFixed(2)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(torso.x, -6 + torso.y, 14.5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (isObsidian) {
      const emberAlpha = 0.18 + Math.sin(now * 0.007) * 0.08;
      ctx.fillStyle = `rgba(249, 115, 22, ${emberAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(torso.x, -2 + torso.y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const isBackAimForward = aimSin <= 0.35;
  const offArmBehind = isBack && (isBackAimForward || offArm.handY <= torso.y + 4.5);
  const mainArmBehind = isBack && (isBackAimForward || mainArm.handY <= torso.y + 4.5);
  const weaponBehind =
    (isBack && (isBackAimForward || weapon.offY <= torso.y + 4.5)) ||
    (!isBack && aimSin < -0.6 && weapon.offY < torso.y - 3);
  const armSleeve = isObsidian ? '#334155' : isSovereign ? '#B45309' : '#475569';
  const armBracer = isObsidian ? '#64748B' : isSovereign ? '#F59E0B' : '#94A3B8';
  const mainGauntlet = isHalberd
    ? '#DC2626'
    : isObsidian
      ? '#475569'
      : isSovereign
        ? '#FBBF24'
        : '#CBD5E1';
  const mainKnuckle = isHalberd ? '#FCA5A5' : isSovereign ? '#FEF08A' : '#F8FAFC';
  const offGauntlet = isHalberd ? '#7F1D1D' : isUnarmed ? '#334155' : mainGauntlet;
  const thighColor = isObsidian ? '#0F172A' : isSovereign ? '#7F1D1D' : '#1E293B';
  const shinColor = isObsidian ? '#334155' : isSovereign ? '#B45309' : '#334155';
  const bootColor = '#0F172A';

  const drawVanguardOffArm = () => {
    drawArticulatedArm(
      ctx,
      offArm.shoulderX,
      offArm.shoulderY,
      offArm.handX,
      offArm.handY,
      offArm.elbowBias,
      armSleeve,
      isHalberd ? '#991B1B' : armBracer,
      3.4,
      {
        handColor: offGauntlet,
        knuckleColor: isHalberd ? '#FCA5A5' : '#94A3B8',
        size: isHalberd || isUnarmed ? 3.8 : 3.2,
        drawHand: isHalberd || isUnarmed,
      }
    );
    if (!isHalberd && !isUnarmed) {
      drawShield();
    }
  };

  const drawVanguardMainHandAndWeapon = (drawWep: boolean, drawArm: boolean) => {
    if (drawArm) {
      drawArticulatedArm(
        ctx,
        mainArm.shoulderX,
        mainArm.shoulderY,
        mainArm.handX,
        mainArm.handY,
        mainArm.elbowBias,
        armSleeve,
        isHalberd ? '#DC2626' : armBracer,
        3.6,
        {
          handColor: mainGauntlet,
          knuckleColor: mainKnuckle,
          size: 3.4,
          drawHand: !isUnarmed,
        }
      );
    }
    if (drawWep) {
      drawWeapon();
      if (!isUnarmed) {
        drawHandGripCap(ctx, mainArm.handX, mainArm.handY, mainGauntlet, mainKnuckle, 2.8);
      }
    }
  };

  drawVanguardVestmentAura();

  // 1. Articulated Legs (grounded hip-to-foot stepping independently of torso lean)
  drawArticulatedLeg(
    ctx,
    torso.x - 3.5,
    4 + torso.y,
    footwork.trailX + 2.5,
    footwork.trailY + 4,
    footwork.trailLift,
    thighColor,
    shinColor,
    bootColor,
    4.6
  );
  drawArticulatedLeg(
    ctx,
    torso.x + 3.0,
    4 + torso.y,
    footwork.leadX + 2.5,
    footwork.leadY + 4,
    footwork.leadLift,
    shinColor,
    isObsidian ? '#64748B' : isSovereign ? '#F59E0B' : '#475569',
    bootColor,
    4.8
  );

  // Behind-torso arms/weapon when facing away (N, NE, NW)
  if (offArmBehind) drawVanguardOffArm();
  drawVanguardMainHandAndWeapon(weaponBehind, mainArmBehind);

  // 2. Articulated Torso + Shoulders + Cape (pivots around hips cleanly)
  ctx.save();
  ctx.translate(torso.x, torso.y);
  ctx.rotate(torso.lean);

  if (!isBack) drawWarCape();

  const sxShift = torso.shoulderShiftX * 0.4;
  if (isUnarmored) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(-7 + sxShift * 0.25, -6, 14, 13);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-6 + sxShift * 0.25, -5, 12, 10);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-7, 4, 14, 2.5);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-2, 4, 4, 2.5);
  } else {
    const cuirassOuter = isObsidian ? '#0F172A' : isSovereign ? '#7F1D1D' : '#334155';
    const cuirassInner = isObsidian ? '#1E293B' : isSovereign ? '#B45309' : '#64748B';
    const cuirassHighlight = isObsidian ? '#475569' : isSovereign ? '#F59E0B' : '#94A3B8';
    const emblemColor = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
    ctx.fillStyle = cuirassOuter;
    ctx.fillRect(-8 + sxShift * 0.2, -7, 16, 14);
    ctx.fillStyle = cuirassInner;
    ctx.fillRect(-7 + sxShift * 0.2, -6, 14, 11);
    if (!isBack) {
      ctx.fillStyle = cuirassHighlight;
      ctx.fillRect(-5 + sxShift * 0.3, -5, 10, 3);
      ctx.fillStyle = emblemColor;
      ctx.fillRect(-1.5 + sxShift * 0.35, -4, 3, 9);
      ctx.fillRect(-4.5 + sxShift * 0.35, -2, 9, 2.5);
    } else if (isSovereign) {
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-2, -4, 4, 7);
    }
    ctx.fillStyle = isObsidian ? '#090D16' : '#1E293B';
    ctx.fillRect(-8, 5, 16, 2.5);
    ctx.fillStyle = isObsidian ? '#CBD5E1' : '#FBBF24';
    ctx.fillRect(-2, 5, 4, 2.5);

    const pauldronBase = isObsidian ? '#1E293B' : isSovereign ? '#B45309' : '#475569';
    const pauldronShine = isObsidian ? '#64748B' : isSovereign ? '#FBBF24' : '#CBD5E1';
    const pauldronTrim = isObsidian ? '#E2E8F0' : isSovereign ? '#FEF08A' : '#F59E0B';
    ctx.fillStyle = pauldronBase;
    ctx.fillRect(-11.5 - sxShift * 0.5, -9, isObsidian ? 6 : 5, isObsidian ? 7 : 6);
    ctx.fillRect(6.5 + sxShift * 0.5, -9, isObsidian ? 6 : 5, isObsidian ? 7 : 6);
    ctx.fillStyle = pauldronShine;
    ctx.fillRect(-10 - sxShift * 0.5, -8, 3, 3);
    ctx.fillRect(7 + sxShift * 0.5, -8, 3, 3);
    ctx.fillStyle = pauldronTrim;
    ctx.fillRect(-11.5 - sxShift * 0.5, -10.5, isObsidian ? 6 : 5, 1.8);
    ctx.fillRect(6.5 + sxShift * 0.5, -10.5, isObsidian ? 6 : 5, 1.8);
    if (isObsidian) {
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(-12.5 - sxShift * 0.5, -12, 2, 2.5);
      ctx.fillRect(10.5 + sxShift * 0.5, -12, 2, 2.5);
      const forgePulse = Math.sin(now * 0.008) > 0;
      ctx.fillStyle = forgePulse ? '#FB923C' : '#EA580C';
      ctx.fillRect(-10.5 - sxShift * 0.5, -5.5, 2.2, 2.2);
      ctx.fillRect(8.3 + sxShift * 0.5, -5.5, 2.2, 2.2);
    } else if (isSovereign) {
      const sparkRise = (now * 0.01) % 8;
      ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
      ctx.fillRect(-9.5, -12 - sparkRise, 1.5, 1.5);
      ctx.fillRect(8.5, -10 - ((sparkRise + 4) % 8), 1.5, 1.5);
    } else {
      const sheenPhase = (now * 0.006) % 14;
      if (!isBack && sheenPhase < 6) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
        ctx.fillRect(-5 + sheenPhase, -4, 2, 2);
      }
    }
  }

  if (isBack) drawWarCape();

  // 3. Articulated Head / Greathelm (counter-tilts slightly to keep eyes locked on foe)
  ctx.save();
  ctx.translate(head.x - torso.x, head.y - bodyBob);
  ctx.rotate(head.tilt);
  if (isUnarmored) {
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-6, -18, 12, 11);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6.5, -20, 13, 4.5);
    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(-6.5, -16, 13, 1.8);
    if (!isBack) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-3.5, -13, 2, 2);
      ctx.fillRect(1.5, -13, 2, 2);
    }
  } else {
    if (!isBack && isPureVertical) drawPlume();
    const helmOuter = isObsidian ? '#0F172A' : isSovereign ? '#92400E' : '#334155';
    const helmInner = isObsidian ? '#1E293B' : isSovereign ? '#D97706' : '#64748B';
    const helmTop = isObsidian ? '#475569' : isSovereign ? '#FBBF24' : '#94A3B8';
    const crestColor = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
    const visorGlow = isObsidian ? '#FB923C' : isSovereign ? '#FEF08A' : '#38BDF8';
    const visorCore = isObsidian ? '#FEF08A' : isSovereign ? '#FFFFFF' : '#E0F2FE';

    ctx.fillStyle = helmOuter;
    ctx.fillRect(-7, -20, 14, 13);
    ctx.fillStyle = helmInner;
    ctx.fillRect(-6, -19, 12, 11);
    ctx.fillStyle = helmTop;
    ctx.fillRect(-4, -19, 8, 3);
    if (isSovereign) {
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-7, -22, 2.5, 3);
      ctx.fillRect(4.5, -22, 2.5, 3);
    }
    if (isBack) {
      ctx.fillStyle = crestColor;
      ctx.fillRect(isDiagonal ? 1 : -1, -20, 2, 11);
      if (isDiagonal) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(4, -14, 3, 2.5);
        ctx.fillStyle = visorGlow;
        ctx.fillRect(5, -14, 1.5, 1.5);
      }
      drawPlume();
    } else {
      ctx.fillStyle = crestColor;
      ctx.fillRect(-1, -20, 2, 11);
      if (isPureVertical) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-5, -14, 10, 3);
        ctx.fillStyle = visorGlow;
        ctx.fillRect(-4, -14, 3, 2);
        ctx.fillRect(1, -14, 3, 2);
        ctx.fillStyle = visorCore;
        ctx.fillRect(-3, -14, 1.5, 1);
        ctx.fillRect(1.5, -14, 1.5, 1);
      } else {
        const visorX = isDiagonal ? -4 : -3;
        const glowX = isDiagonal ? -1.5 : 0;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(visorX, -14, 9, 3);
        ctx.fillStyle = visorGlow;
        ctx.fillRect(glowX, -14, 5, 2);
        ctx.fillStyle = visorCore;
        ctx.fillRect(glowX + 3, -14, 2, 1);
        drawPlume();
      }
    }
  }
  ctx.restore(); // end head
  ctx.restore(); // end torso

  // 4. Foreground Articulated Arms + Shield + Weapon + Slash Trail
  if (!offArmBehind) drawVanguardOffArm();
  drawVanguardMainHandAndWeapon(!weaponBehind, !mainArmBehind);
  drawSlashCrescent();
}

function drawRanger(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    moving,
    isDashing,
    idleWave,
    localAim,
    walkPhase,
    isAttacking,
    atkProgress,
    isBack,
    isFront,
    isPureVertical,
    isDiagonal,
    combatPose,
  } = s;

  const { footwork, torso, head, mainArm, offArm, weapon, slash, isCharging, chargeRatio } =
    combatPose;
  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);

  const cloakTail = moving
    ? (isDashing ? -6 : -3) + Math.sin(walkPhase * 1.5) * 2
    : idleWave * 1.3;

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isTwinbow = weaponId === 'ranger_galewind_twinbow';
  const isEclipse = weaponId === 'ranger_eclipse_longbow';

  const drawQuiver = () => {
    if (isUnarmed) return;
    ctx.save();
    if (isPureVertical && isBack) {
      ctx.translate(0, -3);
      ctx.rotate(-0.45 + (moving ? Math.sin(walkPhase) * 0.06 : 0));
    } else if (isPureVertical && isFront) {
      ctx.translate(-7, -8);
      ctx.rotate(-0.25);
    } else {
      ctx.translate(isDiagonal ? -7 : -9, -6);
      ctx.rotate(-0.22 + (moving ? Math.sin(walkPhase) * 0.08 : 0));
    }
    if (isTwinbow) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-2.5, -6, 5, 14);
      ctx.fillStyle = '#0E7490';
      ctx.fillRect(-2, -5, 4, 12);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-2.5, -2, 5, 1.5);
      ctx.fillRect(-3.5, -10.5, 2.5, 4.5);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(0.5, -11, 2.5, 5);
    } else if (isEclipse) {
      ctx.fillStyle = '#1E1B4B';
      ctx.fillRect(-2.5, -7, 5, 15);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-2.5, -4, 5, 1.5);
      ctx.fillRect(-2.5, 4, 5, 1.5);
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(-3, -11.5, 2.5, 4.5);
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(0, -12, 2.5, 5);
    } else {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-2, -6, 4, 14);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-2, -3, 4, 1.5);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-3, -10, 2.5, 4);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(0, -11, 2.5, 5);
    }
    ctx.restore();
  };

  const vestmentId = s.vestmentId;
  const isBareGarb = vestmentId === null;
  const isWindrunner = vestmentId === 'ranger_windrunner_mantle';
  const isBriarheart = vestmentId === 'ranger_briarheart_leather';

  const drawCloak = () => {
    if (isBareGarb) return;
    const cDark = isWindrunner ? '#082F49' : isBriarheart ? '#022C22' : '#0F2418';
    const cMid = isWindrunner ? '#0E7490' : isBriarheart ? '#065F46' : '#1E3A29';
    const cLight = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#2D5A3C';
    if (isPureVertical) {
      const sway = moving ? Math.sin(walkPhase * 1.5) * 1.6 : idleWave * 1.0;
      ctx.fillStyle = cDark;
      ctx.fillRect(-9, -5, 18, 15);
      ctx.fillStyle = cMid;
      ctx.fillRect(-10, 4 + sway * 0.35, 20, 7);
      ctx.fillStyle = cLight;
      ctx.fillRect(-7.5, -4, 15, isWindrunner ? 3 : 13);
      if (isWindrunner) {
        ctx.fillStyle = '#BAE6FD';
        ctx.fillRect(-9.5, 9 + sway * 0.35, 19, 1.5);
      }
      return;
    }
    const shiftX = (isDiagonal ? cloakTail * 0.35 : cloakTail * 0.5) - torso.twistYaw * 1.2;
    const tailX = (isDiagonal ? -9 + cloakTail * 0.65 : -12 + cloakTail) - torso.twistYaw * 1.5;
    ctx.fillStyle = cDark;
    ctx.fillRect(-10 + shiftX, -5, 14, 14);
    ctx.fillStyle = cMid;
    ctx.fillRect(tailX, 3, 10, 8);
    ctx.fillStyle = cLight;
    ctx.fillRect(-8 + shiftX * 0.8, -4, 10, isWindrunner ? 3 : 12);
    if (isWindrunner) {
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(tailX, 9.5, 9, 1.5);
    }
  };

  const drawBow = () => {
    ctx.save();
    ctx.translate(weapon.offX, weapon.offY);
    ctx.rotate(weapon.angle);

    if (isUnarmed) {
      ctx.fillStyle = '#3F7A52';
      ctx.fillRect(-1, -2, 3.5, 4);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-1.5, -1.5, 1.5, 3);
      ctx.restore();
      return;
    }

    const tipPullBack = weapon.bowFlex * 1.8;

    if (isTwinbow) {
      ctx.fillStyle = '#0E7490';
      ctx.fillRect(1.5 - tipPullBack * 0.7, -14, 2.5, 6);
      ctx.fillRect(1.5 - tipPullBack * 0.7, 8, 2.5, 6);
      ctx.fillStyle = '#22D3EE';
      ctx.fillRect(3, -10, 2.5, 20);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(5 - tipPullBack * 0.4, -11, 1.8, 6);
      ctx.fillRect(5 - tipPullBack * 0.4, 5, 1.8, 6);
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(2.5, -2, 3.5, 4);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(-tipPullBack, -15, 2.5, 2);
      ctx.fillRect(-tipPullBack, 13, 2.5, 2);

      const stringAnchorX = 1.2 - weapon.drawPull + weapon.releaseTwang;
      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1.2 - tipPullBack, -14);
      ctx.lineTo(stringAnchorX, 0);
      ctx.lineTo(1.2 - tipPullBack, 14);
      ctx.stroke();

      ctx.fillStyle = '#0E7490';
      ctx.fillRect(stringAnchorX - 2, -2, 3, 4);
      if (weapon.showNockedArrow) {
        const arrowX = stringAnchorX;
        ctx.fillStyle = '#BAE6FD';
        ctx.fillRect(arrowX, -2.5, 11, 1.3);
        ctx.fillRect(arrowX, 1.2, 11, 1.3);
        ctx.fillStyle = weapon.drawPull > 2 ? '#38BDF8' : '#22D3EE';
        ctx.fillRect(arrowX + 10, -3.5, 3, 2.8);
        ctx.fillRect(arrowX + 10, 0.7, 3, 2.8);
        if (weapon.drawPull > 1.5) {
          ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(arrowX + 10, 0, 5, -0.7, 0.7);
          ctx.stroke();
        }
      } else if (atkProgress < 0.52) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(5, -2);
        ctx.lineTo(16, -3);
        ctx.moveTo(5, 2);
        ctx.lineTo(16, 3);
        ctx.moveTo(7, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
      }
    } else if (isEclipse) {
      // Heavy siege limbs physically flex backward during live hold-to-charge
      ctx.fillStyle = '#312E81';
      ctx.fillRect(1.5 - tipPullBack * 0.7, -17, 3.2, 7);
      ctx.fillRect(1.5 - tipPullBack * 0.7, 10, 3.2, 7);
      ctx.fillStyle = '#7C3AED';
      ctx.fillRect(3, -12, 3.5, 24);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(2.8, -2, 3.8, 4);
      ctx.fillRect(-0.5 - tipPullBack, -18, 3.2, 2.2);
      ctx.fillRect(-0.5 - tipPullBack, 15.8, 3.2, 2.2);
      ctx.fillStyle = '#D8B4FE';
      ctx.fillRect(3.6, -10, 1.8, 6);
      ctx.fillRect(3.6, 4, 1.8, 6);

      ctx.strokeStyle =
        isCharging && chargeRatio >= 0.85
          ? 'rgba(253, 224, 71, 0.96)'
          : weapon.drawPull > 2
            ? 'rgba(253, 224, 71, 0.85)'
            : 'rgba(192, 132, 252, 0.55)';
      ctx.lineWidth = isCharging ? 1.5 + chargeRatio : 1.2;
      ctx.beginPath();
      ctx.arc(4, 0, 4.5 + (isCharging ? chargeRatio * 3.5 : Math.sin(s.now * 0.008) * 0.6), 0, Math.PI * 2);
      ctx.stroke();

      const stringAnchorX = 1.2 - weapon.drawPull + weapon.releaseTwang;
      ctx.strokeStyle = '#EDE9FE';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(1 - tipPullBack, -17);
      ctx.lineTo(stringAnchorX, 0);
      ctx.lineTo(1 - tipPullBack, 17);
      ctx.stroke();

      ctx.fillStyle = '#6D28D9';
      ctx.fillRect(stringAnchorX - 2, -1.5, 3, 3);
      if (weapon.showNockedArrow) {
        const arrowX = stringAnchorX;
        ctx.fillStyle = '#A855F7';
        ctx.fillRect(arrowX, -0.9, 13.5, 1.8);
        ctx.fillStyle =
          (isCharging && chargeRatio >= 0.8) || weapon.drawPull > 2 ? '#FDE047' : '#C084FC';
        ctx.fillRect(arrowX + 12, -2.5, 4.5, 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(arrowX + 14.5, -1, 2, 2);
      } else if (atkProgress < 0.52) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.94)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(2 - tipPullBack * 0.6, -13, 2.5, 5);
      ctx.fillRect(2 - tipPullBack * 0.6, 8, 2.5, 5);
      ctx.fillStyle = '#92400E';
      ctx.fillRect(3, -9, 3, 18);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(3, -1, 3, 3);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(0.5 - tipPullBack, -14, 2.5, 2);
      ctx.fillRect(0.5 - tipPullBack, 12, 2.5, 2);

      const stringAnchorX = 1.5 - weapon.drawPull + weapon.releaseTwang;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1.5 - tipPullBack, -13);
      ctx.lineTo(stringAnchorX, 0);
      ctx.lineTo(1.5 - tipPullBack, 13);
      ctx.stroke();

      ctx.fillStyle = '#3F7A52';
      ctx.fillRect(stringAnchorX - 2, -1.5, 3, 3);
      if (weapon.showNockedArrow) {
        const arrowX = stringAnchorX;
        ctx.fillStyle = '#A16207';
        ctx.fillRect(arrowX, -0.7, 11, 1.5);
        ctx.fillStyle = weapon.drawPull > 2 ? '#6EE7B7' : '#34D399';
        ctx.fillRect(arrowX + 10, -2, 3.5, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(arrowX + 12, -1, 1.5, 2);
      } else if (atkProgress < 0.52) {
        ctx.strokeStyle = 'rgba(110, 231, 183, 0.88)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(15, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const isBackAimForward = aimSin <= 0.35;
  const offArmBehind = isBack && (isBackAimForward || offArm.handY <= torso.y + 4.5);
  const mainArmBehind = isBack && (isBackAimForward || mainArm.handY <= torso.y + 4.5);
  const bowBehind =
    (isBack && (isBackAimForward || weapon.offY <= torso.y + 4.5)) ||
    (!isBack && aimSin < -0.6 && weapon.offY < torso.y - 3);
  const bootTrim = isWindrunner ? '#0E7490' : isBriarheart ? '#064E3B' : '#142E1F';
  const armSleeve = isWindrunner ? '#0E7490' : isBriarheart ? '#065F46' : '#2D5A3C';
  const armBracer = isWindrunner ? '#BAE6FD' : isBriarheart ? '#34D399' : '#78350F';
  const gloveColor = isWindrunner ? '#0369A1' : isBriarheart ? '#047857' : '#92400E';
  const gloveKnuckle = isWindrunner ? '#E0F2FE' : isBriarheart ? '#A7F3D0' : '#FDBA74';

  const drawRangerOffArm = () => {
    drawArticulatedArm(
      ctx,
      offArm.shoulderX,
      offArm.shoulderY,
      offArm.handX,
      offArm.handY,
      offArm.elbowBias,
      armSleeve,
      armBracer,
      2.9,
      {
        handColor: gloveColor,
        knuckleColor: gloveKnuckle,
        size: 3.1,
      }
    );
  };

  const drawRangerMainHandAndBow = (drawWep: boolean, drawArm: boolean) => {
    if (drawArm) {
      drawArticulatedArm(
        ctx,
        mainArm.shoulderX,
        mainArm.shoulderY,
        mainArm.handX,
        mainArm.handY,
        mainArm.elbowBias,
        armSleeve,
        armBracer,
        3.0,
        {
          handColor: gloveColor,
          knuckleColor: gloveKnuckle,
          size: 3.2,
          drawHand: !isUnarmed,
        }
      );
    }
    if (drawWep) {
      drawBow();
      if (!isUnarmed) {
        drawHandGripCap(ctx, mainArm.handX, mainArm.handY, gloveColor, gloveKnuckle, 2.7);
      }
    }
  };

  // 1. Articulated Striding / Bracing Legs
  drawArticulatedLeg(
    ctx,
    torso.x - 3.2,
    4 + torso.y,
    footwork.trailX + 2.2,
    footwork.trailY + 4,
    footwork.trailLift,
    '#271E15',
    '#271E15',
    bootTrim,
    4.3
  );
  drawArticulatedLeg(
    ctx,
    torso.x + 3.0,
    4 + torso.y,
    footwork.leadX + 2.2,
    footwork.leadY + 4,
    footwork.leadLift,
    '#3E2F20',
    '#3E2F20',
    bootTrim,
    4.4
  );

  if (offArmBehind) drawRangerOffArm();
  drawRangerMainHandAndBow(bowBehind, mainArmBehind);

  // 2. Articulated Torso + Hooded Head + Cloak/Quiver
  ctx.save();
  ctx.translate(torso.x, torso.y);
  ctx.rotate(torso.lean);

  if (!isBack) {
    drawCloak();
    drawQuiver();
  }

  const sxShift = torso.shoulderShiftX * 0.35;
  if (isBareGarb) {
    ctx.fillStyle = '#57534E';
    ctx.fillRect(-6.5 + sxShift * 0.2, -6, 13, 12);
    ctx.fillStyle = '#78716C';
    ctx.fillRect(-5.5 + sxShift * 0.2, -5, 11, 9);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-6.5, 3.5, 13, 2);
  } else {
    const tunicOuter = isWindrunner ? '#0F172A' : isBriarheart ? '#064E3B' : '#2D5A3C';
    const tunicInner = isWindrunner ? '#0E7490' : isBriarheart ? '#059669' : '#3F7A52';
    const strapColor = isWindrunner ? '#BAE6FD' : '#78350F';
    const claspColor = isWindrunner ? '#FFFFFF' : '#34D399';
    ctx.fillStyle = tunicOuter;
    ctx.fillRect(-7 + sxShift * 0.2, -6, 14, 13);
    ctx.fillStyle = tunicInner;
    ctx.fillRect(-6 + sxShift * 0.2, -5, 12, 10);
    if (isWindrunner) {
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-8.5 - sxShift * 0.3, -7, 17, 3.5);
      const windSwirl = (s.now * (moving ? 0.009 : 0.004)) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 1, 12.5, windSwirl, windSwirl + 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 1, 12.5, windSwirl + Math.PI, windSwirl + Math.PI + 1.15);
      ctx.stroke();
    } else if (isBriarheart) {
      ctx.fillStyle = '#10B981';
      ctx.fillRect(-8.5 - sxShift * 0.3, -7, 4, 4);
      ctx.fillRect(4.5 + sxShift * 0.3, -7, 4, 4);
      const leafPhase = s.now * 0.0045;
      const lx1 = Math.cos(leafPhase) * 11;
      const ly1 = -11 + Math.sin(leafPhase * 1.4) * 3;
      const lx2 = Math.cos(leafPhase + Math.PI) * 11;
      const ly2 = -9 + Math.sin(leafPhase * 1.4 + 2) * 3;
      ctx.fillStyle = '#A7F3D0';
      ctx.fillRect(lx1 - 1, ly1 - 1, 2.2, 2.2);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(lx2 - 1, ly2 - 1, 2.2, 2.2);
    }
    if (!isBack) {
      ctx.fillStyle = strapColor;
      ctx.fillRect(-6, -5, 3, 3);
      ctx.fillRect(-3, -2, 3, 3);
      ctx.fillRect(0, 1, 3, 3);
      ctx.fillStyle = claspColor;
      ctx.fillRect(-1.5, -3, isBriarheart ? 4 : 3, isBriarheart ? 4 : 3);
      if (isBriarheart) {
        ctx.fillStyle = Math.sin(s.now * 0.008) > 0 ? '#FFFFFF' : '#ECFDF5';
        ctx.fillRect(-0.5, -2, 2, 2);
      }
    }
    ctx.fillStyle = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#D97706';
    ctx.fillRect(-6, 4, 12, 2);
  }

  if (isBack) {
    drawCloak();
    drawQuiver();
  }

  // Head / Hood
  ctx.save();
  ctx.translate(head.x - torso.x, head.y - bodyBob);
  ctx.rotate(head.tilt);
  if (isBareGarb) {
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-6, -18, 12, 11);
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-6.5, -19.5, 13, 4.5);
    if (!isBack) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-3, -13, 2, 2);
      ctx.fillRect(1, -13, 2, 2);
    }
  } else {
    const hoodDark = isWindrunner ? '#082F49' : isBriarheart ? '#022C22' : '#142E1F';
    const hoodMid = isWindrunner ? '#0E7490' : isBriarheart ? '#065F46' : '#2D5A3C';
    const hoodLight = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#3F7A52';
    const eyeColor = isWindrunner ? '#BAE6FD' : isBriarheart ? '#A7F3D0' : '#4ADE80';

    ctx.fillStyle = hoodDark;
    ctx.fillRect(isPureVertical ? -7.5 : -8, -19, 15, 13);
    ctx.fillStyle = hoodMid;
    ctx.fillRect(isPureVertical ? -6.5 : -7, -18, 13, 10);
    ctx.fillStyle = hoodLight;
    ctx.fillRect(isPureVertical ? -2.5 : -4, -21, 5, 3);
    if (isBriarheart) {
      ctx.fillStyle = '#A7F3D0';
      ctx.fillRect(-7, -21, 2, 3);
      ctx.fillRect(5, -21, 2, 3);
    }
    if (isBack) {
      ctx.fillStyle = hoodDark;
      ctx.fillRect(-4, -14, 8, 5);
      ctx.fillStyle = hoodLight;
      if (isPureVertical) {
        ctx.fillRect(-2 + cloakTail * 0.2, -11, 4, 6);
      } else {
        ctx.fillRect(-10 + cloakTail * 0.4, -15, 3, 5);
      }
    } else {
      if (!isPureVertical) {
        ctx.fillRect(-10 + cloakTail * 0.4, -15, 3, 4);
      }
      if (isPureVertical) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-4.5, -13, 9, 4.5);
        ctx.fillStyle = eyeColor;
        ctx.fillRect(-3, -12, 2, 2);
        ctx.fillRect(1, -12, 2, 2);
      } else {
        const maskX = isDiagonal ? -3.5 : -3;
        const eye1X = isDiagonal ? -1.5 : 0;
        const eye2X = isDiagonal ? 2.5 : 4;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(maskX, -13, 8, 4.5);
        ctx.fillStyle = eyeColor;
        ctx.fillRect(eye1X, -12, 2.5, 2);
        ctx.fillRect(eye2X, -12, 2, 2);
      }
    }
  }
  ctx.restore(); // end head
  ctx.restore(); // end torso

  // 3. Foreground Articulated Bow Arm & Draw Hand Arm
  if (!offArmBehind) drawRangerOffArm();
  drawRangerMainHandAndBow(!bowBehind, !mainArmBehind);

  // Unarmed punch/kick crescent feedback
  if (isUnarmed && slash.progress >= 0) {
    const t = slash.progress;
    ctx.save();
    ctx.translate(aimCos * 8, aimSin * 8 + torso.y);
    ctx.rotate(localAim);
    ctx.strokeStyle = `rgba(110, 231, 183, ${(0.85 * (1 - t * 0.45)).toFixed(2)})`;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(2, 0, 14 * slash.radiusScale, -0.9, -0.9 + 1.8 * t);
    ctx.stroke();
    ctx.restore();
  }
  void isFront;
}

function drawArcanist(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    moving,
    isDashing,
    idleWave,
    now,
    isAttacking,
    swingAmp,
    localAim,
    walkPhase,
    isBack,
    isPureVertical,
    isDiagonal,
    combatPose,
  } = s;

  const { footwork, torso, head, mainArm, offArm, weapon, slash } = combatPose;
  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  const floatBob = torso.y;
  const hemFlow = moving
    ? (isDashing ? -5 : -2.5) + Math.sin(walkPhase) * 1.5
    : idleWave * 1;

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isCinder = weaponId === 'arcanist_cinderflare_rod';
  const isChrono = weaponId === 'arcanist_chronostar_scepter';
  const flareIntensity = weapon.flareIntensity;

  const drawStaff = () => {
    ctx.save();
    ctx.translate(weapon.offX, weapon.offY);
    ctx.rotate(weapon.angle);
    if (!isUnarmed) ctx.translate(-0.5, 0);
    if (isUnarmed) {
      ctx.fillStyle = '#4338CA';
      ctx.fillRect(-1.5, -2.5, 4, 4.5);
      ctx.fillStyle = flareIntensity > 0.2 ? '#E0F2FE' : '#38BDF8';
      ctx.fillRect(-0.5, -5.5, 2.5, 2.5);
      ctx.restore();
      return;
    }
    if (isCinder) {
      ctx.fillStyle = '#27272A';
      ctx.fillRect(-1, -14, 3, 28);
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(0, -13, 1.2, 24);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3.5, -16, 8, 2.5);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-4.5, -20, 2, 4.5);
      ctx.fillRect(3.5, -20, 2, 4.5);
      const flicker = Math.sin(now * 0.018) * 1.4;
      if (flareIntensity > 0.1) {
        ctx.strokeStyle = `rgba(249, 115, 22, ${0.85 * flareIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0.5, -21 + flicker * 0.4, 6 + flareIntensity * 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(-2.5, -22 + flicker * 0.5, 6, 6);
      ctx.fillStyle = '#FB923C';
      ctx.fillRect(-1.5, -24 - flicker * 0.5, 4, 6);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-0.5, -22, 2, 3);
      const emberStep = (now * 0.015) % 8;
      ctx.fillStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.fillRect(-2 + Math.sin(now * 0.02) * 1.5, -26 - emberStep, 1.5, 1.5);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.78)';
      ctx.fillRect(2 - Math.cos(now * 0.018) * 1.5, -24 - ((emberStep + 4) % 8), 1.5, 1.5);
    } else if (isChrono) {
      ctx.fillStyle = '#312E81';
      ctx.fillRect(-1, -15, 3, 29);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-0.5, -14, 1.5, 27);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-3, -16, 7, 2);
      ctx.fillRect(-2.5, -2, 6, 1.5);

      const coreY = -22 + Math.sin(now * 0.008) * 0.9;
      ctx.save();
      ctx.translate(0.5, coreY);
      ctx.rotate(now * 0.004);
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.5, 2.4, 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.4, 5.5, 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (flareIntensity > 0.1) {
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.85 * flareIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0.5, coreY, 7 + flareIntensity * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = flareIntensity > 0.5 ? '#FFFFFF' : '#38BDF8';
      ctx.fillRect(-1.5, coreY - 2, 4, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-0.5, coreY - 1, 2, 2);
    } else {
      ctx.fillStyle = '#581C87';
      ctx.fillRect(-1, -15, 3, 29);
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(-1, -15, 1.5, 28);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-2.5, -16, 6, 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-3.5, -22, 2, 6);
      ctx.fillRect(2.5, -22, 2, 6);

      const crystalBob = Math.sin(now * 0.01) * 1.4;
      if (flareIntensity > 0.1) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.85 * flareIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0.5, -21 + crystalBob, 6 + flareIntensity * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = flareIntensity > 0.5 ? '#E0F2FE' : '#38BDF8';
      ctx.fillRect(-2, -23 + crystalBob, 5, 5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-0.5, -21.5 + crystalBob, 2, 2);
    }
    ctx.restore();
  };

  const vestmentId = s.vestmentId;
  const isBareRobe = vestmentId === null;
  const isChronoShroud = vestmentId === 'arcanist_chronomancer_shroud';
  const isVoidward = vestmentId === 'arcanist_voidward_robes';
  const hemOff = isPureVertical ? 0 : hemFlow * (isDiagonal ? 0.35 : 0.5);

  const isBackAimForward = aimSin <= 0.35;
  const offArmBehind = isBack && (isBackAimForward || offArm.handY <= floatBob + 4.5);
  const mainArmBehind = isBack && (isBackAimForward || mainArm.handY <= floatBob + 4.5);
  const staffBehind =
    (isBack && (isBackAimForward || weapon.offY <= floatBob + 4.5)) ||
    (!isBack && aimSin < -0.6 && weapon.offY < floatBob - 3);
  const sleeveCol = isChronoShroud ? '#1E3A8A' : isVoidward ? '#581C87' : '#312E81';
  const bracerCol = isChronoShroud ? '#FBBF24' : isVoidward ? '#C084FC' : '#4338CA';
  const mageHandCol = '#FDBA74';
  const mageGloveCol = isChronoShroud ? '#E0F2FE' : isVoidward ? '#E9D5FF' : '#FDBA74';

  const drawArcanistOffArm = () => {
    drawArticulatedArm(
      ctx,
      offArm.shoulderX,
      offArm.shoulderY,
      offArm.handX,
      offArm.handY,
      offArm.elbowBias,
      sleeveCol,
      bracerCol,
      2.9,
      {
        handColor: mageGloveCol,
        knuckleColor: '#FFFFFF',
        cuffColor: bracerCol,
        size: 3.1,
      }
    );
    // Off-hand glowing channeling mote
    ctx.fillStyle = isCinder
      ? flareIntensity > 0.35
        ? '#FEF08A'
        : '#F97316'
      : isChrono
        ? '#FDE047'
        : flareIntensity > 0.35
          ? '#E0F2FE'
          : '#38BDF8';
    ctx.fillRect(offArm.handX - 1.5, offArm.handY - 4.5, 3, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(offArm.handX - 0.5, offArm.handY - 3.5, 1, 1);
  };

  const drawArcanistMainHandAndStaff = (drawWep: boolean, drawArm: boolean) => {
    if (drawArm) {
      drawArticulatedArm(
        ctx,
        mainArm.shoulderX,
        mainArm.shoulderY,
        mainArm.handX,
        mainArm.handY,
        mainArm.elbowBias,
        sleeveCol,
        bracerCol,
        3.1,
        {
          handColor: mageHandCol,
          knuckleColor: '#FED7AA',
          cuffColor: bracerCol,
          size: 3.1,
          drawHand: !isUnarmed,
        }
      );
    }
    if (drawWep) {
      drawStaff();
      if (!isUnarmed) {
        drawHandGripCap(ctx, mainArm.handX, mainArm.handY, mageHandCol, '#FED7AA', 2.6);
      }
    }
  };

  // 1. Articulated Hovering Boots beneath Robe
  drawArticulatedLeg(
    ctx,
    torso.x - 3.0,
    5 + floatBob,
    footwork.trailX + 2.0,
    footwork.trailY + 3.5,
    footwork.trailLift,
    '#1E1B4B',
    '#0F172A',
    '#0F172A',
    3.8
  );
  drawArticulatedLeg(
    ctx,
    torso.x + 2.8,
    5 + floatBob,
    footwork.leadX + 2.0,
    footwork.leadY + 3.5,
    footwork.leadLift,
    '#312E81',
    '#0F172A',
    '#0F172A',
    3.8
  );

  if (offArmBehind) drawArcanistOffArm();
  drawArcanistMainHandAndStaff(staffBehind, mainArmBehind);

  // 2. Articulated Torso + Cosmic Robe + Archmage Hat
  ctx.save();
  ctx.translate(torso.x, floatBob);
  ctx.rotate(torso.lean);
  const sxShift = torso.shoulderShiftX * 0.35;

  if (isBareRobe) {
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-7 + hemOff * 0.3, -4, 14, 14);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6 + hemOff * 0.2, -3, 12, 12);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-6, 3, 12, 2);

    ctx.save();
    ctx.translate(head.x - torso.x, head.y - bodyBob * 0.9);
    ctx.rotate(head.tilt);
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-5.5, -16, 11, 10);
    ctx.fillStyle = '#312E81';
    ctx.fillRect(-6, -18, 12, 4);
    if (!isBack) {
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-3.5, -12, 2, 2);
      ctx.fillRect(1.5, -12, 2, 2);
    }
    ctx.restore();
  } else {
    const robeOuter = isChronoShroud ? '#0F172A' : isVoidward ? '#3B0764' : '#1E1B4B';
    const robeMid = isChronoShroud ? '#1E3A8A' : isVoidward ? '#581C87' : '#312E81';
    const robeInner = isChronoShroud ? '#1D4ED8' : isVoidward ? '#7E22CE' : '#4338CA';
    const hemTrim = isChronoShroud ? '#FBBF24' : isVoidward ? '#C084FC' : '#38BDF8';
    const mantleDark = isChronoShroud ? '#38BDF8' : isVoidward ? '#9333EA' : '#4F46E5';
    const mantleLight = isChronoShroud ? '#E0F2FE' : isVoidward ? '#E879F9' : '#818CF8';

    ctx.fillStyle = robeOuter;
    ctx.fillRect(-9.5 + hemOff, -4, 19, 16);
    ctx.fillStyle = robeMid;
    ctx.fillRect(-8 + hemOff * 0.6, -3, 16, 14);
    ctx.fillStyle = robeInner;
    ctx.fillRect(-6 + sxShift * 0.25, -4, 12, 13);
    ctx.fillStyle = hemTrim;
    ctx.fillRect(-8 + hemOff * 0.6, 9, 16, 2);
    if (!isBack) {
      if (isChronoShroud) {
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(-2.5 + sxShift * 0.25, -1, 5, 1.8);
        ctx.fillRect(-1.5 + sxShift * 0.25, 1, 3, 2);
        ctx.fillRect(-2.5 + sxShift * 0.25, 3, 5, 1.8);
      } else if (isVoidward) {
        ctx.fillStyle = '#C084FC';
        ctx.fillRect(-2.5 + sxShift * 0.25, -1, 5, 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-1 + sxShift * 0.25, 0.5, 2, 2);
      } else {
        ctx.fillRect(-2 + sxShift * 0.25, -1, 4, 2);
        ctx.fillRect(-1 + sxShift * 0.25, 2, 2, 4);
      }
    } else {
      ctx.fillStyle = isChronoShroud ? '#38BDF8' : isVoidward ? '#C084FC' : '#6366F1';
      ctx.fillRect(-1.5, -2, 3, 9);
    }

    if (isChronoShroud) {
      ctx.save();
      ctx.translate(0, -6);
      ctx.rotate(now * 0.0022);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, 12.5, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 12.5, Math.PI, Math.PI * 2.35);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = mantleDark;
    ctx.fillRect((isVoidward ? -10.5 : -9) + sxShift * 0.35, -7, isVoidward ? 21 : 18, 4.5);
    ctx.fillStyle = mantleLight;
    ctx.fillRect(-6 + sxShift * 0.35, -6, 12, 2);
    if (isVoidward) {
      ctx.fillStyle = '#C084FC';
      ctx.fillRect(-11 + sxShift * 0.35, -9, 3, 3);
      ctx.fillRect(8 + sxShift * 0.35, -9, 3, 3);
      const wardAng = now * 0.004;
      for (let wIdx = 0; wIdx < 2; wIdx++) {
        const wa = wardAng + wIdx * Math.PI;
        ctx.fillStyle = 'rgba(232, 121, 249, 0.85)';
        ctx.fillRect(Math.cos(wa) * 12.5 - 1.2, -4 + Math.sin(wa) * 5 - 1.2, 2.4, 2.4);
      }
    }

    // Crooked-Tip Archmage Hat + Head
    const hatTipWave = moving ? -3 + Math.sin(walkPhase) * 1.2 : idleWave * 1.1;
    const hatTipShift = isPureVertical ? hatTipWave * 0.25 : hatTipWave;
    const hatBand = isChronoShroud ? '#FBBF24' : isVoidward ? '#C084FC' : '#38BDF8';
    const hatTipColor = isChronoShroud ? '#E0F2FE' : isVoidward ? '#E879F9' : '#6366F1';
    const eyeColor = isChronoShroud ? '#BAE6FD' : isVoidward ? '#E879F9' : '#38BDF8';

    ctx.save();
    ctx.translate(head.x - torso.x, head.y - bodyBob * 0.9);
    ctx.rotate(head.tilt);
    ctx.fillStyle = robeOuter;
    ctx.fillRect(-11, -15, 22, 3);
    ctx.fillStyle = robeMid;
    ctx.fillRect(-7, -21, 14, 7);
    ctx.fillStyle = robeInner;
    ctx.fillRect(isPureVertical ? -4.5 : -5, -26, 9, 6);
    ctx.fillStyle = hatTipColor;
    ctx.fillRect(-2.5 + hatTipShift * 0.5, -29, 5, 4);
    ctx.fillStyle = hatBand;
    ctx.fillRect(-7, -17, 14, 2);
    ctx.fillRect(-1.5 + hatTipShift, -30, 2.5, 2.5);

    if (!isBack) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-5, -13, 10, 5);
      ctx.fillStyle = eyeColor;
      if (isPureVertical) {
        ctx.fillRect(-3.5, -12, 2.5, 2);
        ctx.fillRect(1, -12, 2.5, 2);
      } else {
        const eShift = isDiagonal ? -0.5 : 0;
        ctx.fillRect(-1 + eShift, -12, 2.5, 2);
        ctx.fillRect(3 + eShift, -12, 2.5, 2);
      }
    } else {
      ctx.fillStyle = robeOuter;
      ctx.fillRect(-6, -13, 12, 5);
    }
    ctx.restore(); // end head
  }
  ctx.restore(); // end torso

  // 3. Foreground Articulated Casting Arms & Off-Hand Channeling Spark
  if (!offArmBehind) drawArcanistOffArm();
  drawArcanistMainHandAndStaff(!staffBehind, !mainArmBehind);

  // Directional spellcast burst arc & flash matching weapon + combo beat
  if (slash.progress >= 0) {
    const t = slash.progress;
    const fx = aimCos * (18 + t * 10);
    const fy = aimSin * (16 + t * 10) + floatBob;
    ctx.save();
    ctx.fillStyle = isCinder
      ? `rgba(249, 115, 22, ${(1 - t) * 0.9})`
      : isChrono
        ? `rgba(253, 224, 71, ${(1 - t) * 0.85})`
        : `rgba(56, 189, 248, ${(1 - t) * 0.85})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 4.5 * swingAmp * slash.radiusScale * (1 - t * 0.35), 0, Math.PI * 2);
    ctx.fill();

    // Casting gesture trace arc
    ctx.translate(aimCos * 5 + torso.x * 0.5, aimSin * 5 + floatBob);
    ctx.rotate(localAim);
    const span = slash.isFinisher ? 2.1 : 1.55;
    const a0 = slash.reverse ? 0.55 - span * t : -0.75;
    const a1 = slash.reverse ? 0.55 : -0.75 + span * t;
    ctx.strokeStyle = isCinder
      ? `rgba(251, 146, 60, ${(0.82 * (1 - t * 0.45)).toFixed(2)})`
      : isChrono
        ? `rgba(253, 224, 71, ${(0.82 * (1 - t * 0.45)).toFixed(2)})`
        : `rgba(129, 140, 248, ${(0.82 * (1 - t * 0.45)).toFixed(2)})`;
    ctx.lineWidth = slash.isFinisher ? 2.8 : 2.0;
    ctx.beginPath();
    ctx.arc(4, 0, 17 * slash.radiusScale, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    if (combatPose.hitStopActive) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Orbiting Astral Conduit Motes
  if (!isUnarmed) {
    const orbAngle = now * 0.0052;
    const orbCount = isChrono ? 2 : 1;
    for (let i = 0; i < orbCount; i++) {
      const a = orbAngle + i * Math.PI;
      const ox = Math.cos(a) * 15;
      const oy = Math.sin(a) * 6 + floatBob;
      const haloColor = isCinder
        ? 'rgba(249, 115, 22, 0.48)'
        : i === 1
          ? 'rgba(253, 224, 71, 0.48)'
          : 'rgba(56, 189, 248, 0.45)';
      const coreColor = isCinder ? '#FB923C' : i === 1 ? '#FDE047' : '#38BDF8';
      ctx.fillStyle = haloColor;
      ctx.fillRect(ox - 2.5, oy - 2.5, 5, 5);
      ctx.fillStyle = coreColor;
      ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(ox - 0.5, oy - 0.5, 1, 1);
    }
  }
}

function drawCleric(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    moving,
    idleWave,
    now,
    isAttacking,
    swingAmp,
    localAim,
    walkPhase,
    isBack,
    isPureVertical,
    isDiagonal,
    combatPose,
  } = s;

  const { footwork, torso, head, mainArm, offArm, weapon, slash } = combatPose;
  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  const capeSway = moving ? -2.5 + Math.sin(walkPhase) * 1.4 : idleWave * 0.9;

  const vestmentId = s.vestmentId;
  const isNovice = vestmentId === null;
  const isMartyr = vestmentId === 'cleric_martyr_surplice';
  const isTemplar = vestmentId === 'cleric_templar_cassock';

  const drawHalo = () => {
    if (isNovice) return;
    const haloY = -22 + idleWave * 0.8;
    ctx.save();
    ctx.translate(0, haloY);
    ctx.fillStyle = isMartyr
      ? 'rgba(52, 211, 153, 0.25)'
      : isTemplar
        ? 'rgba(250, 204, 21, 0.34)'
        : 'rgba(253, 224, 71, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, isTemplar ? 11 : 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isMartyr ? '#34D399' : '#FACC15';
    ctx.lineWidth = isTemplar ? 2.4 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(now * 0.0014);
    ctx.fillStyle = isMartyr ? '#ECFDF5' : '#FEF08A';
    const rayCount = isTemplar ? 8 : 4;
    for (let r = 0; r < rayCount; r++) {
      ctx.rotate((Math.PI * 2) / rayCount);
      ctx.fillRect(-1.5, isTemplar ? -13.5 : -12.5, 3, isTemplar ? 4 : 3.5);
    }
    ctx.restore();
  };

  const drawCape = () => {
    if (isNovice) return;
    const cOuter = isMartyr ? '#065F46' : isTemplar ? '#7F1D1D' : '#78350F';
    const cInner = isMartyr ? '#059669' : isTemplar ? '#B45309' : '#92400E';
    const cTrim = isMartyr ? '#34D399' : isTemplar ? '#FDE047' : '#F59E0B';
    if (isPureVertical) {
      ctx.fillStyle = cOuter;
      ctx.fillRect(-9, -6, 18, 16);
      ctx.fillStyle = cInner;
      ctx.fillRect(-8, -5, 16, 14);
      ctx.fillStyle = cTrim;
      ctx.fillRect(-8, 8, 16, 1.5);
      return;
    }
    const shiftX = (isDiagonal ? capeSway * 0.35 : capeSway * 0.5) - torso.twistYaw * 1.2;
    ctx.fillStyle = cOuter;
    ctx.fillRect(-10 + shiftX, -6, 14, 16);
    ctx.fillStyle = cInner;
    ctx.fillRect(-9 + shiftX * 0.6, -5, 12, 14);
    if (isTemplar || isMartyr) {
      ctx.fillStyle = cTrim;
      ctx.fillRect(-9 + shiftX * 0.6, 8, 12, 1.5);
    }
  };

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isCenser = weaponId === 'cleric_solaris_censer';
  const isCrozier = weaponId === 'cleric_seraphim_crozier';

  const drawMace = () => {
    ctx.save();
    ctx.translate(weapon.offX, weapon.offY);
    ctx.rotate(weapon.angle);
    if (!isUnarmed) ctx.translate(-0.5, -5.0);
    if (isUnarmed) {
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(-1.5, -2.5, 4, 4.5);
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(-0.5, -2, 2.5, 2);
      ctx.restore();
      return;
    }
    if (isCenser) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(-1, -16, 2.5, 25);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-1, 3, 2.5, 6);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-1, -20, 7, 2.5);
      ctx.fillRect(4.5, -18, 2, 3);
      const thuribleSway = isAttacking ? weapon.chainSway * 0.85 : Math.sin(now * 0.007) * 0.25;
      ctx.save();
      ctx.translate(5.5, -15);
      ctx.rotate(thuribleSway);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, 0, 1.5, 4 * weapon.chainExtend);
      const thurY = 4 * weapon.chainExtend;
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3, thurY, 6, 6);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(-2, thurY + 1, 4, 4);
      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(-1, thurY + 2, 2, 2);
      const wispShift = (now * 0.014) % 9;
      ctx.fillStyle = 'rgba(110, 231, 183, 0.85)';
      ctx.fillRect(-2 + Math.sin(now * 0.01) * 1.5, thurY - 3 - wispShift, 1.8, 1.8);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.75)';
      ctx.fillRect(1 - Math.sin(now * 0.012) * 1.5, thurY - 2 - ((wispShift + 4) % 9), 1.5, 1.5);
      ctx.restore();
    } else if (isCrozier) {
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-1, -18, 2.5, 28);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-1.5, 2, 3.5, 7);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-6.5, -18, 5.5, 2.5);
      ctx.fillRect(1.5, -18, 5.5, 2.5);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-5, -16, 3.5, 1.5);
      ctx.fillRect(2, -16, 3.5, 1.5);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(-1, -25, 2.5, 7);
      ctx.fillRect(-1, -27, 7, 2.5);
      ctx.fillRect(4.5, -25, 2.5, 5);
      ctx.fillRect(2.5, -21, 3, 2);
      const orbPulse = Math.sin(now * 0.009) * 0.7;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(1, -24 + orbPulse, 3, 3);
    } else {
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-1, -12, 3, 22);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-1, 3, 3, 6);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3.5, -19, 8, 8);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-2, -17.5, 5, 5);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-0.5, -22, 2, 3);
      ctx.fillRect(-5.5, -16, 2, 2);
      ctx.fillRect(4.5, -16, 2, 2);
    }
    ctx.restore();
  };

  const drawSweepArc = () => {
    if (slash.progress < 0) return;
    const t = slash.progress;
    ctx.save();
    if (slash.style === 'crook_plant') {
      // Seraphim Crozier Beat 2 finisher: sunlit judgment ground-burst halo
      const gx = aimCos * 17;
      const gy = aimSin * 14 + 2 + torso.y;
      const r = 10 + t * 15;
      ctx.strokeStyle = `rgba(253, 224, 71, ${(0.94 * (1 - t * 0.4)).toFixed(2)})`;
      ctx.lineWidth = 2.8 * (1 - t * 0.4);
      ctx.beginPath();
      ctx.ellipse(gx, gy, r, r * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(254, 249, 195, ${(0.45 * (1 - t)).toFixed(2)})`;
      ctx.fillRect(gx - 2.5, gy - 18 * (1 - t * 0.3), 5, 18 * (1 - t * 0.3));
      ctx.restore();
      return;
    }

    ctx.translate(aimCos * 5.5 + torso.x * 0.5, aimSin * 6 + torso.y);
    ctx.rotate(localAim);
    const radiusBase = (isUnarmed ? 14 : 20) * slash.radiusScale;
    const startAng = -slash.arcSpan * 0.5;
    const endAng = startAng + slash.arcSpan * t;
    const a0 = slash.reverse ? -endAng : startAng;
    const a1 = slash.reverse ? -startAng : endAng;

    ctx.strokeStyle = isUnarmed
      ? 'rgba(254, 240, 138, 0.58)'
      : isCenser
        ? 'rgba(52, 211, 153, 0.9)'
        : isCrozier
          ? 'rgba(254, 249, 195, 0.94)'
          : 'rgba(253, 224, 71, 0.88)';
    ctx.lineWidth = (slash.isFinisher || swingAmp > 1.05 ? 4.0 : 3.0) * (1 - t * 0.4);
    ctx.beginPath();
    ctx.arc(2, 0, radiusBase * (1 + (swingAmp - 1) * 0.32), Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    if ((isCrozier || isCenser || slash.isFinisher) && !isUnarmed) {
      ctx.strokeStyle = isCenser ? 'rgba(167, 243, 208, 0.82)' : 'rgba(250, 204, 21, 0.82)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(2, 0, radiusBase + 3, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
    }
    if (combatPose.hitStopActive) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = slash.isFinisher ? 2.4 : 1.7;
      ctx.beginPath();
      ctx.arc(2, 0, radiusBase + 1.0, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
    }
    ctx.restore();
  };

  const isBackAimForward = aimSin <= 0.35;
  const offArmBehind = isBack && (isBackAimForward || offArm.handY <= torso.y + 4.5);
  const mainArmBehind = isBack && (isBackAimForward || mainArm.handY <= torso.y + 4.5);
  const maceBehind =
    (isBack && (isBackAimForward || weapon.offY <= torso.y + 4.5)) ||
    (!isBack && aimSin < -0.6 && weapon.offY < torso.y - 3);
  const sleeveColor = isMartyr ? '#059669' : isTemplar ? '#64748B' : '#E2E8F0';
  const bracerColor = isMartyr ? '#34D399' : isTemplar ? '#FACC15' : '#D97706';
  const clericHandColor = isTemplar ? '#CBD5E1' : '#F8FAFC';
  const clericKnuckleColor = isMartyr ? '#A7F3D0' : '#FEF08A';

  const drawClericOffArm = () => {
    drawArticulatedArm(
      ctx,
      offArm.shoulderX,
      offArm.shoulderY,
      offArm.handX,
      offArm.handY,
      offArm.elbowBias,
      sleeveColor,
      bracerColor,
      3.0,
      {
        handColor: clericHandColor,
        knuckleColor: clericKnuckleColor,
        cuffColor: bracerColor,
        size: 3.1,
      }
    );
    if (!isUnarmed) {
      ctx.save();
      ctx.translate(offArm.handX, offArm.handY);
      ctx.rotate(offArm.angle);
      if (isCrozier) {
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-4, 0, 8, 2);
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(-2.5, -1, 5, 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-1, 0.5, 2, 2);
      } else if (isCenser) {
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(-0.5, 0, 1.5, 5);
        ctx.fillStyle = '#D97706';
        ctx.fillRect(-2.5, 5, 5, 5);
        ctx.fillStyle = isAttacking ? '#ECFDF5' : '#34D399';
        ctx.fillRect(-1.5, 6, 3, 3);
      } else {
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(-0.5, 0, 1.5, 6);
        ctx.fillStyle = '#D97706';
        ctx.fillRect(-2.5, 6, 5, 5);
        ctx.fillStyle = isAttacking ? '#FFFFFF' : '#FEF08A';
        ctx.fillRect(-1.5, 7, 3, 3);
      }
      ctx.restore();
    }
  };

  const drawClericMainHandAndMace = (drawWep: boolean, drawArm: boolean) => {
    if (drawArm) {
      drawArticulatedArm(
        ctx,
        mainArm.shoulderX,
        mainArm.shoulderY,
        mainArm.handX,
        mainArm.handY,
        mainArm.elbowBias,
        sleeveColor,
        bracerColor,
        3.2,
        {
          handColor: clericHandColor,
          knuckleColor: clericKnuckleColor,
          cuffColor: bracerColor,
          size: 3.2,
          drawHand: !isUnarmed,
        }
      );
    }
    if (drawWep) {
      drawMace();
      if (!isUnarmed) {
        drawHandGripCap(ctx, mainArm.handX, mainArm.handY, clericHandColor, clericKnuckleColor, 2.7);
      }
    }
  };

  // 1. Articulated Striding / Stepping Boots
  drawArticulatedLeg(
    ctx,
    torso.x - 3.0,
    5 + torso.y,
    footwork.trailX + 2.2,
    footwork.trailY + 4,
    footwork.trailLift,
    isTemplar ? '#334155' : '#451A03',
    isTemplar ? '#334155' : '#451A03',
    isTemplar ? '#1E293B' : '#451A03',
    4.3
  );
  drawArticulatedLeg(
    ctx,
    torso.x + 2.8,
    5 + torso.y,
    footwork.leadX + 2.2,
    footwork.leadY + 4,
    footwork.leadLift,
    isTemplar ? '#475569' : '#78350F',
    isTemplar ? '#334155' : '#451A03',
    isTemplar ? '#1E293B' : '#451A03',
    4.3
  );

  if (offArmBehind) drawClericOffArm();
  drawClericMainHandAndMace(maceBehind, mainArmBehind);

  // 2. Articulated Torso + Halo + Cape + Tabard + Mitre
  ctx.save();
  ctx.translate(torso.x, torso.y);
  ctx.rotate(torso.lean);
  const sxShift = torso.shoulderShiftX * 0.35;

  if (!isBack) {
    drawHalo();
    drawCape();
  }

  if (isNovice) {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-7 + sxShift * 0.2, -6, 14, 15);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-6 + sxShift * 0.2, -5, 12, 13);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-7, 4, 14, 2);

    ctx.save();
    ctx.translate(head.x - torso.x, head.y - bodyBob);
    ctx.rotate(head.tilt);
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-5.5, -17, 11, 10);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(-6, -18.5, 12, 4);
    if (!isBack) {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-3, -12, 2, 2);
      ctx.fillRect(1, -12, 2, 2);
    }
    ctx.restore();
  } else {
    const tabardOuter = isMartyr ? '#A7F3D0' : isTemplar ? '#475569' : '#E2E8F0';
    const tabardInner = isMartyr ? '#ECFDF5' : isTemplar ? '#E2E8F0' : '#F8FAFC';
    const stoleColor = isMartyr ? '#10B981' : isTemplar ? '#D97706' : '#B45309';
    const emblemOuter = isMartyr ? '#34D399' : '#F59E0B';
    const emblemCore = isMartyr ? '#FDE047' : '#FEF08A';

    ctx.fillStyle = tabardOuter;
    ctx.fillRect(-8 + sxShift * 0.2, -6, 16, 16);
    ctx.fillStyle = tabardInner;
    ctx.fillRect(-7 + sxShift * 0.2, -5, 14, 14);
    if (isTemplar) {
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-10.5 - sxShift * 0.4, -8, 4.5, 5.5);
      ctx.fillRect(6 + sxShift * 0.4, -8, 4.5, 5.5);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(-10.5 - sxShift * 0.4, -9, 4.5, 1.8);
      ctx.fillRect(6 + sxShift * 0.4, -9, 4.5, 1.8);
      const wingAlpha = (0.35 + Math.sin(now * 0.007) * 0.14).toFixed(2);
      ctx.fillStyle = `rgba(253, 224, 71, ${wingAlpha})`;
      ctx.fillRect(-13.5 - sxShift * 0.4, -9, 2.5, 5);
      ctx.fillRect(11 + sxShift * 0.4, -9, 2.5, 5);
    } else if (isMartyr) {
      ctx.fillStyle = '#34D399';
      ctx.fillRect(-8 + sxShift * 0.2, -6, 16, 3.5);
      const moteRise = (now * 0.011) % 8;
      ctx.fillStyle = 'rgba(110, 231, 183, 0.85)';
      ctx.fillRect(-9, -8 - moteRise, 1.6, 1.6);
      ctx.fillRect(7.5, -6 - ((moteRise + 4) % 8), 1.6, 1.6);
    }
    if (!isBack) {
      ctx.fillStyle = stoleColor;
      ctx.fillRect(-6 + sxShift * 0.25, -5, 2.5, 13);
      ctx.fillRect(3.5 + sxShift * 0.25, -5, 2.5, 13);
      ctx.fillStyle = emblemOuter;
      ctx.fillRect(-3 + sxShift * 0.25, -2, 6, 6);
      ctx.fillStyle = emblemCore;
      ctx.fillRect(-1.5 + sxShift * 0.25, -0.5, 3, 3);
      ctx.fillStyle = emblemOuter;
      ctx.fillRect(-7, 7, 14, 2);
    }
    if (isBack) {
      drawCape();
      drawHalo();
    }

    // Mitre / Crowned Helm & Head
    ctx.save();
    ctx.translate(head.x - torso.x, head.y - bodyBob);
    ctx.rotate(head.tilt);
    ctx.fillStyle = isMartyr ? '#ECFDF5' : isTemplar ? '#94A3B8' : '#F8FAFC';
    ctx.fillRect(-7, -19, 14, 12);
    ctx.fillStyle = isMartyr ? '#34D399' : '#FDE047';
    ctx.fillRect(-8, -19, 16, 3);
    ctx.fillRect(-2, -22, 4, 4);
    if (!isBack) {
      ctx.fillStyle = isMartyr ? '#FDE68A' : isTemplar ? '#CBD5E1' : '#FCD34D';
      ctx.fillRect(-5, -13, 10, 5);
      ctx.fillStyle = isTemplar ? '#0F172A' : '#78350F';
      if (isPureVertical) {
        ctx.fillRect(-3, -12, 2, 2);
        ctx.fillRect(1, -12, 2, 2);
      } else {
        const eShift = isDiagonal ? -0.5 : 0;
        ctx.fillRect(-2 + eShift, -12, 2, 2);
        ctx.fillRect(2 + eShift, -12, 2, 2);
      }
    } else {
      ctx.fillStyle = isMartyr ? '#34D399' : '#F59E0B';
      ctx.fillRect(-1, -16, 2, 8);
    }
    ctx.restore(); // end head
  }
  ctx.restore(); // end torso

  // 3. Foreground Articulated Off-Arm & Main Mace Arm
  if (!offArmBehind) drawClericOffArm();
  drawClericMainHandAndMace(!maceBehind, !mainArmBehind);
  drawSweepArc();
}

export function drawHeroClassLabel(_heroClass: HeroClassId): void {
  // Helper type export reference preserved for modularity
}
