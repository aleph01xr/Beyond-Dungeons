import type { HeroClassId } from '../shared/types.ts';
import { DEFAULT_WEAPON_BY_CLASS, resolveEquippedWeaponForClass } from '../shared/armaments.ts';
import type { HeroSwingKind } from './heroCombatAnim.ts';

export interface WeaponSwingAnimationState {
  bornAt: number;
  durationMs: number;
  kind: HeroSwingKind;
  comboStep: number;
  freezeStartAt: number;
  freezeEndAt: number;
  frozenMsAccumulated: number;
  hitStopLockTier: number;
  impactColor: string;
}

export interface SwingProgressSample {
  progress: number;
  isHitStopped: boolean;
  impactJitter: number;
  isDone: boolean;
}

export interface EnemyImpactState {
  freezeStartAt: number;
  freezeEndAt: number;
  flashUntil: number;
  flashDurationMs: number;
  hitAngle: number;
  recoilMag: number;
  isCrit: boolean;
  isFinisher: boolean;
  accentColor: string;
  comboStep: number;
}

export interface EnemyImpactVisualSample {
  renderNow: number;
  offsetX: number;
  offsetY: number;
  impactFlashAlpha: number;
  ringProgress: number;
  isHitStopped: boolean;
  isImpactFrame: boolean;
}

const MAX_HIT_STOP_MS = 92;

export function createWeaponSwingState(
  bornAt: number,
  durationMs: number,
  kind: HeroSwingKind,
  comboStep: number
): WeaponSwingAnimationState {
  return {
    bornAt,
    durationMs: Math.max(1, durationMs),
    kind,
    comboStep: ((comboStep % 3) + 3) % 3,
    freezeStartAt: 0,
    freezeEndAt: 0,
    frozenMsAccumulated: 0,
    hitStopLockTier: 0,
    impactColor: '#FFFFFF',
  };
}

/**
 * Returns crisp, weapon- and combo-beat-weighted hit-stop freeze durations in milliseconds.
 * Heavy 2H melee weapons & Beat 2 finishers lock longer than rapid twinbow/chronostar pokes,
 * while capping cleanly under 92ms so combat feels weighty without feeling sluggish.
 */
export function computeWeaponHitStopDurationMs(
  heroClass: HeroClassId,
  rawWeaponId: string | null | undefined,
  comboStep: number,
  isCrit: boolean,
  isPrimaryHit: boolean
): number {
  const step = ((comboStep % 3) + 3) % 3;
  const resolvedId =
    rawWeaponId === undefined
      ? DEFAULT_WEAPON_BY_CLASS[heroClass]
      : rawWeaponId === null
        ? null
        : resolveEquippedWeaponForClass(heroClass, rawWeaponId)?.id ?? null;

  let baseMs = 36;
  if (!isPrimaryHit) {
    baseMs = heroClass === 'vanguard' ? 54 : heroClass === 'cleric' ? 48 : 42;
  } else {
    switch (resolvedId) {
      case 'vanguard_sunforged_claymore':
        baseMs = step === 2 ? 74 : step === 1 ? 52 : 46;
        break;
      case 'vanguard_crimson_halberd':
        baseMs = step === 2 ? 76 : step === 1 ? 56 : 48;
        break;
      case 'vanguard_stormbreaker_flail':
        baseMs = step === 2 ? 80 : step === 1 ? 50 : 42;
        break;
      case 'ranger_ashwood_recurve':
        baseMs = step === 2 ? 50 : step === 1 ? 36 : 32;
        break;
      case 'ranger_galewind_twinbow':
        baseMs = step === 2 ? 42 : step === 1 ? 30 : 26;
        break;
      case 'ranger_eclipse_longbow':
        baseMs = step === 2 ? 68 : step === 1 ? 50 : 44;
        break;
      case 'arcanist_runebound_spire':
        baseMs = step === 2 ? 56 : step === 1 ? 40 : 34;
        break;
      case 'arcanist_cinderflare_rod':
        baseMs = step === 2 ? 60 : step === 1 ? 44 : 38;
        break;
      case 'arcanist_chronostar_scepter':
        baseMs = step === 2 ? 50 : step === 1 ? 36 : 30;
        break;
      case 'cleric_dawnstar_mace':
        baseMs = step === 2 ? 72 : step === 1 ? 50 : 44;
        break;
      case 'cleric_solaris_censer':
        baseMs = step === 2 ? 64 : step === 1 ? 44 : 38;
        break;
      case 'cleric_seraphim_crozier':
        baseMs = step === 2 ? 68 : step === 1 ? 46 : 40;
        break;
      default:
        // Unarmed martial strikes
        baseMs = step === 2 ? 52 : step === 1 ? 38 : 32;
        break;
    }
  }

  const critBonus = isCrit ? 12 : 0;
  return Math.max(24, Math.min(MAX_HIT_STOP_MS, baseMs + critBonus));
}

/**
 * Freezes an active swing animation right on its contact frame without ever stacking
 * infinite freezes across multi-target AoE cleaves.
 */
export function applySwingHitStop(
  swing: WeaponSwingAnimationState,
  now: number,
  freezeDurationMs: number,
  isCrit: boolean,
  comboStep: number,
  accentColor: string,
  isPrimaryHit = true
): boolean {
  if (freezeDurationMs <= 0) return false;
  const isFinisher = ((comboStep % 3) + 3) % 3 === 2;
  const tier =
    (isPrimaryHit ? 10 : 0) + (isCrit && isFinisher ? 3 : isCrit || isFinisher ? 2 : 1);

  // Prevent multi-hit AoE swings from stacking hit-stop per enemy struck,
  // while allowing a higher-tier crit/finisher or primary hit to upgrade a secondary proc.
  if (swing.hitStopLockTier >= tier && swing.hitStopLockTier > 0) {
    return false;
  }

  const clampedDur = Math.max(24, Math.min(MAX_HIT_STOP_MS, freezeDurationMs));
  const currentlyFrozen = swing.freezeEndAt > swing.freezeStartAt && now < swing.freezeEndAt;

  if (currentlyFrozen) {
    // Only extend existing freeze when upgrading from normal->crit/finisher or secondary proc->primary hit
    const upgradedFromSecondary = swing.hitStopLockTier < 10 && tier >= 10;
    const candidateEnd = upgradedFromSecondary
      ? swing.freezeStartAt + clampedDur
      : now + clampedDur * 0.65;
    const nextEnd = Math.min(
      swing.freezeStartAt + MAX_HIT_STOP_MS,
      Math.max(swing.freezeEndAt, candidateEnd)
    );
    swing.freezeEndAt = nextEnd;
    swing.hitStopLockTier = tier;
    swing.impactColor = accentColor || swing.impactColor;
    return true;
  }

  // Finalize any earlier completed freeze window before starting a new one
  if (swing.freezeEndAt > swing.freezeStartAt && now >= swing.freezeEndAt) {
    swing.frozenMsAccumulated += swing.freezeEndAt - swing.freezeStartAt;
    swing.freezeStartAt = 0;
    swing.freezeEndAt = 0;
  }

  const rawElapsed = Math.max(0, now - swing.bornAt - swing.frozenMsAccumulated);
  const rawProgress = rawElapsed / Math.max(1, swing.durationMs);
  // If client swing just started (e.g. local input anticipation frame), snap cleanly into
  // the contact strike frame (~0.38) so hit-stop visibly freezes blade/weapon impact, not windup.
  if (rawProgress < 0.34) {
    swing.bornAt = now - swing.frozenMsAccumulated - swing.durationMs * 0.38;
  }

  swing.freezeStartAt = now;
  swing.freezeEndAt = now + clampedDur;
  swing.hitStopLockTier = tier;
  swing.impactColor = accentColor || '#FFFFFF';
  return true;
}

/**
 * Computes normalized swing progress (0..1) accounting for active hit-stop pause
 * and previously completed hit-stop pauses so follow-through resumes seamlessly.
 */
export function computeEffectiveSwingProgress(
  swing: WeaponSwingAnimationState,
  now: number
): SwingProgressSample {
  const hasFreezeWindow = swing.freezeEndAt > swing.freezeStartAt;
  if (hasFreezeWindow && now < swing.freezeEndAt) {
    const frozenElapsed = Math.max(0, swing.freezeStartAt - swing.bornAt - swing.frozenMsAccumulated);
    const progress = Math.max(0, Math.min(0.999, frozenElapsed / Math.max(1, swing.durationMs)));
    const freezeLen = Math.max(1, swing.freezeEndAt - swing.freezeStartAt);
    const freezeRatio = Math.max(0, Math.min(1, (now - swing.freezeStartAt) / freezeLen));
    const impactJitter = Math.sin(now * 0.45) * (1 - freezeRatio * 0.45);
    return {
      progress,
      isHitStopped: true,
      impactJitter,
      isDone: false,
    };
  }

  const completedFreezeMs = hasFreezeWindow ? swing.freezeEndAt - swing.freezeStartAt : 0;
  const totalFrozen = swing.frozenMsAccumulated + completedFreezeMs;
  const effectiveElapsed = Math.max(0, now - swing.bornAt - totalFrozen);
  const progress = Math.max(0, Math.min(1, effectiveElapsed / Math.max(1, swing.durationMs)));
  return {
    progress,
    isHitStopped: false,
    impactJitter: 0,
    isDone: effectiveElapsed >= swing.durationMs,
  };
}

export function triggerEnemyImpact(
  impactMap: Map<string, EnemyImpactState>,
  targetId: string,
  now: number,
  params: {
    freezeDurationMs: number;
    hitAngle: number;
    isCrit: boolean;
    comboStep: number;
    accentColor: string;
  }
): EnemyImpactState {
  const step = ((params.comboStep % 3) + 3) % 3;
  const isFinisher = step === 2;
  const freezeMs = Math.max(24, Math.min(MAX_HIT_STOP_MS, params.freezeDurationMs));
  const flashMs = Math.max(freezeMs + 40, isFinisher || params.isCrit ? 125 : 95);
  const recoilMag = (isFinisher ? 4.4 : 2.8) + (params.isCrit ? 1.4 : 0);

  const existing = impactMap.get(targetId);
  if (existing && now < existing.freezeEndAt) {
    existing.freezeEndAt = Math.min(
      existing.freezeStartAt + MAX_HIT_STOP_MS,
      Math.max(existing.freezeEndAt, now + freezeMs * 0.6)
    );
    existing.flashUntil = Math.max(existing.flashUntil, now + flashMs);
    existing.flashDurationMs = Math.max(existing.flashDurationMs, existing.flashUntil - now);
    existing.isCrit = existing.isCrit || params.isCrit;
    existing.isFinisher = existing.isFinisher || isFinisher;
    existing.recoilMag = Math.max(existing.recoilMag, recoilMag);
    existing.accentColor = params.accentColor || existing.accentColor;
    existing.hitAngle = params.hitAngle;
    return existing;
  }

  const state: EnemyImpactState = {
    freezeStartAt: now,
    freezeEndAt: now + freezeMs,
    flashUntil: now + flashMs,
    flashDurationMs: flashMs,
    hitAngle: params.hitAngle,
    recoilMag,
    isCrit: params.isCrit,
    isFinisher,
    accentColor: params.accentColor || '#FFFFFF',
    comboStep: step,
  };
  impactMap.set(targetId, state);
  return state;
}

export function sampleEnemyImpactVisual(
  impact: EnemyImpactState | undefined,
  now: number
): EnemyImpactVisualSample {
  if (!impact || now >= impact.flashUntil) {
    return {
      renderNow: now,
      offsetX: 0,
      offsetY: 0,
      impactFlashAlpha: 0,
      ringProgress: 1,
      isHitStopped: false,
      isImpactFrame: false,
    };
  }

  const isHitStopped = now < impact.freezeEndAt;
  const renderNow = isHitStopped ? impact.freezeStartAt : now;
  const elapsed = Math.max(0, now - impact.freezeStartAt);
  const totalFlash = Math.max(1, impact.flashDurationMs);
  const flashRemaining = Math.max(0, Math.min(1, (impact.flashUntil - now) / totalFlash));
  const impactFlashAlpha = isHitStopped ? 0.92 : flashRemaining * 0.65;
  const ringProgress = Math.max(0, Math.min(1, elapsed / totalFlash));

  // Crisp high-frequency hit vibration while frozen + directional kickback settle afterward
  let offsetX = 0;
  let offsetY = 0;
  const dirX = Math.cos(impact.hitAngle);
  const dirY = Math.sin(impact.hitAngle);
  if (isHitStopped) {
    const tremor = Math.sin(now * 0.55) * (impact.recoilMag * 0.55);
    const kick = impact.recoilMag * 0.65;
    offsetX = dirX * kick - dirY * tremor;
    offsetY = dirY * kick + dirX * tremor;
  } else {
    const settle = flashRemaining * flashRemaining * impact.recoilMag * 0.7;
    offsetX = dirX * settle;
    offsetY = dirY * settle;
  }

  const isImpactFrame = isHitStopped || elapsed <= 55;
  return {
    renderNow,
    offsetX,
    offsetY,
    impactFlashAlpha,
    ringProgress,
    isHitStopped,
    isImpactFrame,
  };
}

export function computeHitStopCameraShake(
  heroClass: HeroClassId,
  rawWeaponId: string | null | undefined,
  comboStep: number,
  isCrit: boolean,
  isLocalPlayer: boolean
): { shakeBoost: number; screenFlashAlpha: number } {
  if (!isLocalPlayer) {
    return { shakeBoost: 0, screenFlashAlpha: 0 };
  }
  const step = ((comboStep % 3) + 3) % 3;
  const isHeavyClass = heroClass === 'vanguard' || rawWeaponId === 'cleric_dawnstar_mace' || rawWeaponId === 'ranger_eclipse_longbow';
  const baseShake = step === 2 ? (isHeavyClass ? 3.4 : 2.5) : isHeavyClass ? 1.8 : 1.25;
  const shakeBoost = baseShake + (isCrit ? 1.6 : 0);
  const screenFlashAlpha =
    step === 2 && isCrit ? 0.14 : step === 2 || isCrit ? 0.08 : 0;
  return { shakeBoost, screenFlashAlpha };
}

/**
 * Draws a crisp, high-contrast impact frame flash & directional slash flare at target contact.
 */
export function drawImpactFrameOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  targetRadius: number,
  impact: EnemyImpactState,
  visual: EnemyImpactVisualSample
): void {
  if (visual.impactFlashAlpha <= 0.02) return;

  const r = Math.max(12, targetRadius);
  const alpha = Math.max(0, Math.min(1, visual.impactFlashAlpha));
  const flareScale = (impact.isFinisher ? 1.38 : 1.05) * (impact.isCrit ? 1.18 : 1.0);

  ctx.save();
  ctx.translate(x, y);

  // 1. High-contrast impact silhouette flash burst during the frozen impact frames
  if (visual.isImpactFrame) {
    ctx.globalAlpha = Math.min(0.68, alpha * 0.65);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // Crisp rim outline in weapon accent
    ctx.strokeStyle = impact.accentColor;
    ctx.lineWidth = impact.isFinisher ? 2.8 : 2.0;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.04, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Expanding shockwave ring
  const ringR = r * (0.75 + visual.ringProgress * 1.1 * flareScale);
  ctx.globalAlpha = (1 - visual.ringProgress) * 0.85;
  ctx.strokeStyle = impact.isCrit ? '#FEF08A' : impact.accentColor;
  ctx.lineWidth = (impact.isFinisher ? 2.6 : 1.8) * (1 - visual.ringProgress * 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Directional impact cross-star along strike vector
  ctx.rotate(impact.hitAngle);
  const slashLen = r * (1.45 + (1 - visual.ringProgress) * 0.5) * flareScale;
  const crossLen = r * 0.68 * flareScale;
  const coreThickness = (impact.isFinisher ? 4.2 : 2.8) * Math.max(0.25, alpha);

  ctx.globalAlpha = Math.min(0.95, alpha);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(-slashLen, 0);
  ctx.lineTo(0, -coreThickness);
  ctx.lineTo(slashLen, 0);
  ctx.lineTo(0, coreThickness);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -crossLen);
  ctx.lineTo(coreThickness * 0.7, 0);
  ctx.lineTo(0, crossLen);
  ctx.lineTo(-coreThickness * 0.7, 0);
  ctx.closePath();
  ctx.fill();

  if (impact.isFinisher || impact.isCrit) {
    ctx.strokeStyle = impact.accentColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-slashLen * 1.1, 0);
    ctx.lineTo(slashLen * 1.1, 0);
    ctx.stroke();
  }

  ctx.restore();
}
