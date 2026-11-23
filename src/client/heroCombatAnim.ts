import type { HeroClassId } from '../shared/types.ts';
import { DEFAULT_WEAPON_BY_CLASS, resolveEquippedWeaponForClass } from '../shared/armaments.ts';
import type { DirectionalPose } from './directionalFacing.ts';

export type HeroSwingKind = 'primary' | 'tactical' | 'ult';

export type WeaponAnimStyle =
  | 'greatsword'
  | 'war_axe'
  | 'flail'
  | 'recurve_bow'
  | 'twinbow'
  | 'siege_longbow'
  | 'spire_staff'
  | 'cinder_rod'
  | 'chrono_scepter'
  | 'dawn_mace'
  | 'solaris_censer'
  | 'seraphim_crozier'
  | 'unarmed_vanguard'
  | 'unarmed_ranger'
  | 'unarmed_arcanist'
  | 'unarmed_cleric';

export type HeroSlashStyle =
  | 'wide_arc'
  | 'heavy_chop'
  | 'whip_arc'
  | 'overhead_slam'
  | 'punch_jab'
  | 'arrow_release'
  | 'cast_burst'
  | 'censer_arc'
  | 'crook_plant';

export interface HeroCombatPoseInput {
  heroClass: HeroClassId;
  weaponId: string | null | undefined;
  isAttacking: boolean;
  atkProgress: number;
  comboStep: number;
  swingKind: HeroSwingKind;
  swingAmp: number;
  eclipseChargeRatio: number;
  localAim: number;
  moving: boolean;
  isDashing: boolean;
  strideA: number;
  strideB: number;
  liftA: number;
  liftB: number;
  walkPhase: number;
  idleWave: number;
  bodyBob: number;
  headBob: number;
  now: number;
  pose: DirectionalPose;
  hitStopActive?: boolean;
  impactJitter?: number;
}

export interface HeroCombatPose {
  style: WeaponAnimStyle;
  comboStep: number;
  isCharging: boolean;
  chargeRatio: number;
  hitStopActive?: boolean;
  footwork: {
    leadX: number;
    leadY: number;
    leadLift: number;
    trailX: number;
    trailY: number;
    trailLift: number;
  };
  torso: {
    x: number;
    y: number;
    lean: number;
    twistYaw: number;
    shoulderShiftX: number;
  };
  head: {
    x: number;
    y: number;
    tilt: number;
  };
  mainArm: {
    shoulderX: number;
    shoulderY: number;
    handX: number;
    handY: number;
    elbowBias: number;
  };
  offArm: {
    shoulderX: number;
    shoulderY: number;
    handX: number;
    handY: number;
    angle: number;
    elbowBias: number;
  };
  weapon: {
    offX: number;
    offY: number;
    angle: number;
    drawPull: number;
    bowFlex: number;
    releaseTwang: number;
    showNockedArrow: boolean;
    chainSway: number;
    chainExtend: number;
    flareIntensity: number;
  };
  slash: {
    progress: number;
    reverse: boolean;
    style: HeroSlashStyle;
    radiusScale: number;
    arcSpan: number;
    isFinisher: boolean;
    slamOffsetX: number;
    slamOffsetY: number;
  };
}

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function easeInQuad(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function resolveWeaponAnimStyle(
  heroClass: HeroClassId,
  rawWeaponId: string | null | undefined
): WeaponAnimStyle {
  const resolvedId =
    rawWeaponId === undefined
      ? DEFAULT_WEAPON_BY_CLASS[heroClass]
      : rawWeaponId === null
        ? null
        : resolveEquippedWeaponForClass(heroClass, rawWeaponId)?.id ?? null;

  if (resolvedId === null) {
    if (heroClass === 'vanguard') return 'unarmed_vanguard';
    if (heroClass === 'ranger') return 'unarmed_ranger';
    if (heroClass === 'arcanist') return 'unarmed_arcanist';
    return 'unarmed_cleric';
  }

  switch (resolvedId) {
    case 'vanguard_sunforged_claymore':
      return 'greatsword';
    case 'vanguard_crimson_halberd':
      return 'war_axe';
    case 'vanguard_stormbreaker_flail':
      return 'flail';
    case 'ranger_ashwood_recurve':
      return 'recurve_bow';
    case 'ranger_galewind_twinbow':
      return 'twinbow';
    case 'ranger_eclipse_longbow':
      return 'siege_longbow';
    case 'arcanist_runebound_spire':
      return 'spire_staff';
    case 'arcanist_cinderflare_rod':
      return 'cinder_rod';
    case 'arcanist_chronostar_scepter':
      return 'chrono_scepter';
    case 'cleric_dawnstar_mace':
      return 'dawn_mace';
    case 'cleric_solaris_censer':
      return 'solaris_censer';
    case 'cleric_seraphim_crozier':
      return 'seraphim_crozier';
    default:
      return heroClass === 'vanguard'
        ? 'greatsword'
        : heroClass === 'ranger'
          ? 'recurve_bow'
          : heroClass === 'arcanist'
            ? 'spire_staff'
            : 'dawn_mace';
  }
}

interface SwingCurveSpec {
  windEnd: number;
  strikeEnd: number;
  windAngleDelta: number;
  strikeAngleDelta: number;
  windBackDist: number;
  strikeFwdDist: number;
  windUpLift: number;
  strikeDrop: number;
  windPerp: number;
  strikePerp: number;
  windTorsoLean: number;
  strikeTorsoLean: number;
  windTwist: number;
  strikeTwist: number;
  lungeStep: number;
  braceRecoil: number;
  offHandFwd: number;
  offHandPerp: number;
  slashStyle: HeroSlashStyle;
  reverseArc: boolean;
  radiusScale: number;
  arcSpan: number;
}

function getMeleeCurveSpec(
  style: WeaponAnimStyle,
  step: number,
  swingKind: HeroSwingKind,
  swingAmp: number
): SwingCurveSpec {
  const isTactical = swingKind === 'tactical';
  const isUlt = swingKind === 'ult';

  // Bastion Counter / Tactical / Ult amplifications
  if (style === 'greatsword') {
    if (isTactical || isUlt) {
      return {
        windEnd: 0.24,
        strikeEnd: 0.64,
        windAngleDelta: -1.78 * swingAmp,
        strikeAngleDelta: 1.55 * swingAmp,
        windBackDist: 4,
        strikeFwdDist: 14,
        windUpLift: 4,
        strikeDrop: 1,
        windPerp: -5,
        strikePerp: 6,
        windTorsoLean: -0.16,
        strikeTorsoLean: 0.24,
        windTwist: -0.85,
        strikeTwist: 0.95,
        lungeStep: 7.0,
        braceRecoil: 2.5,
        offHandFwd: 8,
        offHandPerp: -6,
        slashStyle: 'wide_arc',
        reverseArc: false,
        radiusScale: 1.32,
        arcSpan: 2.85,
      };
    }
    if (step === 0) {
      // Beat 1: Wide Forehand Cleave (right-to-left horizontal sweep)
      return {
        windEnd: 0.24,
        strikeEnd: 0.62,
        windAngleDelta: -1.55,
        strikeAngleDelta: 1.38,
        windBackDist: 2.5,
        strikeFwdDist: 11.5,
        windUpLift: 2,
        strikeDrop: 1,
        windPerp: -5.5,
        strikePerp: 6,
        windTorsoLean: -0.12,
        strikeTorsoLean: 0.18,
        windTwist: -0.72,
        strikeTwist: 0.78,
        lungeStep: 4.5,
        braceRecoil: 1.8,
        offHandFwd: 4,
        offHandPerp: -5,
        slashStyle: 'wide_arc',
        reverseArc: false,
        radiusScale: 1.08,
        arcSpan: 2.65,
      };
    }
    if (step === 1) {
      // Beat 2: Sweeping Backhand Return Arc (left-to-right reverse cleave)
      return {
        windEnd: 0.2,
        strikeEnd: 0.6,
        windAngleDelta: 1.48,
        strikeAngleDelta: -1.42,
        windBackDist: 1.5,
        strikeFwdDist: 12.0,
        windUpLift: 1.5,
        strikeDrop: 0.5,
        windPerp: 6.0,
        strikePerp: -6.5,
        windTorsoLean: -0.09,
        strikeTorsoLean: 0.19,
        windTwist: 0.72,
        strikeTwist: -0.82,
        lungeStep: 5.2,
        braceRecoil: 1.6,
        offHandFwd: 5,
        offHandPerp: -4,
        slashStyle: 'wide_arc',
        reverseArc: true,
        radiusScale: 1.12,
        arcSpan: 2.7,
      };
    }
    // Beat 3 Finisher: Heavy Overhead Sunforged Crusher
    return {
      windEnd: 0.3,
      strikeEnd: 0.66,
      windAngleDelta: -1.92,
      strikeAngleDelta: 1.62,
      windBackDist: 4.5,
      strikeFwdDist: 14.5,
      windUpLift: 8.5,
      strikeDrop: 3.5,
      windPerp: -2.0,
      strikePerp: 3.5,
      windTorsoLean: -0.18,
      strikeTorsoLean: 0.27,
      windTwist: -0.55,
      strikeTwist: 0.92,
      lungeStep: 6.8,
      braceRecoil: 2.5,
      offHandFwd: 6.5,
      offHandPerp: -5.5,
      slashStyle: 'wide_arc',
      reverseArc: false,
      radiusScale: 1.28,
      arcSpan: 2.95,
    };
  }

  if (style === 'war_axe') {
    if (step === 0) {
      // Beat 1: Aggressive Diagonal Downward Chop
      return {
        windEnd: 0.22,
        strikeEnd: 0.58,
        windAngleDelta: -1.35 * swingAmp,
        strikeAngleDelta: 1.18 * swingAmp,
        windBackDist: 3.5,
        strikeFwdDist: 14.5,
        windUpLift: 7.5,
        strikeDrop: 3.0,
        windPerp: -3.5,
        strikePerp: 4.0,
        windTorsoLean: -0.15,
        strikeTorsoLean: 0.24,
        windTwist: -0.65,
        strikeTwist: 0.85,
        lungeStep: 5.5,
        braceRecoil: 2.2,
        offHandFwd: -4,
        offHandPerp: 4,
        slashStyle: 'heavy_chop',
        reverseArc: false,
        radiusScale: 1.15,
        arcSpan: 2.15,
      };
    }
    if (step === 1) {
      // Beat 2: Savage Reverse Cross-Hack
      return {
        windEnd: 0.2,
        strikeEnd: 0.56,
        windAngleDelta: 1.32 * swingAmp,
        strikeAngleDelta: -1.25 * swingAmp,
        windBackDist: 2.0,
        strikeFwdDist: 15.0,
        windUpLift: 1.0,
        strikeDrop: -1.5,
        windPerp: 6.5,
        strikePerp: -6.0,
        windTorsoLean: -0.1,
        strikeTorsoLean: 0.22,
        windTwist: 0.78,
        strikeTwist: -0.88,
        lungeStep: 6.0,
        braceRecoil: 2.0,
        offHandFwd: 7,
        offHandPerp: -6,
        slashStyle: 'heavy_chop',
        reverseArc: true,
        radiusScale: 1.18,
        arcSpan: 2.25,
      };
    }
    // Beat 3 Finisher: Leaping Executioner Overhead Cleaver
    return {
      windEnd: 0.3,
      strikeEnd: 0.64,
      windAngleDelta: -1.85 * swingAmp,
      strikeAngleDelta: 1.38 * swingAmp,
      windBackDist: 5.5,
      strikeFwdDist: 16.5,
      windUpLift: 10.5,
      strikeDrop: 4.5,
      windPerp: -1.5,
      strikePerp: 2.5,
      windTorsoLean: -0.22,
      strikeTorsoLean: 0.3,
      windTwist: -0.45,
      strikeTwist: 0.95,
      lungeStep: 7.5,
      braceRecoil: 2.8,
      offHandFwd: 8,
      offHandPerp: 2,
      slashStyle: 'heavy_chop',
      reverseArc: false,
      radiusScale: 1.32,
      arcSpan: 2.5,
    };
  }

  if (style === 'flail') {
    if (step === 0) {
      // Beat 1: Centrifugal Momentum Forehand Whip-Swing
      return {
        windEnd: 0.22,
        strikeEnd: 0.6,
        windAngleDelta: -1.65 * swingAmp,
        strikeAngleDelta: 1.55 * swingAmp,
        windBackDist: 3.0,
        strikeFwdDist: 12.5,
        windUpLift: 3.5,
        strikeDrop: 1.5,
        windPerp: -6.5,
        strikePerp: 6.5,
        windTorsoLean: -0.12,
        strikeTorsoLean: 0.2,
        windTwist: -0.85,
        strikeTwist: 0.9,
        lungeStep: 5.0,
        braceRecoil: 2.0,
        offHandFwd: 5,
        offHandPerp: -5,
        slashStyle: 'whip_arc',
        reverseArc: false,
        radiusScale: 1.12,
        arcSpan: 2.55,
      };
    }
    if (step === 1) {
      // Beat 2: Momentum Reverse Back-Whip Swing
      return {
        windEnd: 0.2,
        strikeEnd: 0.58,
        windAngleDelta: 1.62 * swingAmp,
        strikeAngleDelta: -1.58 * swingAmp,
        windBackDist: 2.0,
        strikeFwdDist: 13.0,
        windUpLift: 2.5,
        strikeDrop: 1.0,
        windPerp: 6.8,
        strikePerp: -6.8,
        windTorsoLean: -0.1,
        strikeTorsoLean: 0.22,
        windTwist: 0.85,
        strikeTwist: -0.9,
        lungeStep: 5.5,
        braceRecoil: 1.8,
        offHandFwd: 6,
        offHandPerp: -4,
        slashStyle: 'whip_arc',
        reverseArc: true,
        radiusScale: 1.15,
        arcSpan: 2.6,
      };
    }
    // Beat 3 Finisher: Overhead Centrifugal Whirl into Downward Stormbreaker Slam
    return {
      windEnd: 0.3,
      strikeEnd: 0.66,
      windAngleDelta: -1.85 * swingAmp,
      strikeAngleDelta: 0.15 * swingAmp,
      windBackDist: 4.0,
      strikeFwdDist: 15.5,
      windUpLift: 10.0,
      strikeDrop: 5.0,
      windPerp: -2.0,
      strikePerp: 0,
      windTorsoLean: -0.2,
      strikeTorsoLean: 0.28,
      windTwist: -0.5,
      strikeTwist: 0.75,
      lungeStep: 6.5,
      braceRecoil: 2.4,
      offHandFwd: 7.5,
      offHandPerp: -6,
      slashStyle: 'overhead_slam',
      reverseArc: false,
      radiusScale: 1.25,
      arcSpan: 2.4,
    };
  }

  if (style === 'dawn_mace') {
    if (step === 0) {
      // Beat 1: Weighty Overhead Crown-Strike
      return {
        windEnd: 0.26,
        strikeEnd: 0.62,
        windAngleDelta: -1.6 * swingAmp,
        strikeAngleDelta: 1.15 * swingAmp,
        windBackDist: 3.5,
        strikeFwdDist: 12.0,
        windUpLift: 8.0,
        strikeDrop: 3.5,
        windPerp: -2.0,
        strikePerp: 2.5,
        windTorsoLean: -0.14,
        strikeTorsoLean: 0.22,
        windTwist: -0.45,
        strikeTwist: 0.72,
        lungeStep: 4.5,
        braceRecoil: 1.8,
        offHandFwd: 4.5,
        offHandPerp: -5,
        slashStyle: 'heavy_chop',
        reverseArc: false,
        radiusScale: 1.05,
        arcSpan: 2.1,
      };
    }
    if (step === 1) {
      // Beat 2: Heavy Forearm Side Sweep (backhand across torso)
      return {
        windEnd: 0.22,
        strikeEnd: 0.6,
        windAngleDelta: 1.42 * swingAmp,
        strikeAngleDelta: -1.35 * swingAmp,
        windBackDist: 2.0,
        strikeFwdDist: 11.5,
        windUpLift: 1.5,
        strikeDrop: 0.5,
        windPerp: 5.5,
        strikePerp: -5.5,
        windTorsoLean: -0.1,
        strikeTorsoLean: 0.18,
        windTwist: 0.75,
        strikeTwist: -0.8,
        lungeStep: 4.8,
        braceRecoil: 1.5,
        offHandFwd: 5.5,
        offHandPerp: -4,
        slashStyle: 'wide_arc',
        reverseArc: true,
        radiusScale: 1.08,
        arcSpan: 2.35,
      };
    }
    // Beat 3 Finisher: Rising Righteous Uppercut + Reliquary Burst
    return {
      windEnd: 0.26,
      strikeEnd: 0.64,
      windAngleDelta: -1.75 * swingAmp,
      strikeAngleDelta: 1.45 * swingAmp,
      windBackDist: 4.0,
      strikeFwdDist: 13.5,
      windUpLift: 6.5,
      strikeDrop: -2.0,
      windPerp: -4.5,
      strikePerp: 4.0,
      windTorsoLean: -0.16,
      strikeTorsoLean: 0.24,
      windTwist: -0.7,
      strikeTwist: 0.88,
      lungeStep: 5.8,
      braceRecoil: 2.0,
      offHandFwd: 7.0,
      offHandPerp: -3.5,
      slashStyle: 'wide_arc',
      reverseArc: false,
      radiusScale: 1.2,
      arcSpan: 2.65,
    };
  }

  if (style === 'solaris_censer') {
    if (step === 0) {
      // Beat 1: Pendulum Thurible Wide Forehand Arc
      return {
        windEnd: 0.24,
        strikeEnd: 0.62,
        windAngleDelta: -1.55 * swingAmp,
        strikeAngleDelta: 1.42 * swingAmp,
        windBackDist: 3.0,
        strikeFwdDist: 12.5,
        windUpLift: 2.5,
        strikeDrop: 1.0,
        windPerp: -5.5,
        strikePerp: 5.5,
        windTorsoLean: -0.1,
        strikeTorsoLean: 0.18,
        windTwist: -0.75,
        strikeTwist: 0.8,
        lungeStep: 4.5,
        braceRecoil: 1.6,
        offHandFwd: 5,
        offHandPerp: -5,
        slashStyle: 'censer_arc',
        reverseArc: false,
        radiusScale: 1.12,
        arcSpan: 2.45,
      };
    }
    if (step === 1) {
      // Beat 2: Reverse Incense Return Whip
      return {
        windEnd: 0.22,
        strikeEnd: 0.6,
        windAngleDelta: 1.52 * swingAmp,
        strikeAngleDelta: -1.48 * swingAmp,
        windBackDist: 2.0,
        strikeFwdDist: 12.5,
        windUpLift: 2.0,
        strikeDrop: 0.5,
        windPerp: 6.0,
        strikePerp: -6.0,
        windTorsoLean: -0.09,
        strikeTorsoLean: 0.19,
        windTwist: 0.78,
        strikeTwist: -0.82,
        lungeStep: 4.8,
        braceRecoil: 1.5,
        offHandFwd: 6,
        offHandPerp: -4,
        slashStyle: 'censer_arc',
        reverseArc: true,
        radiusScale: 1.15,
        arcSpan: 2.5,
      };
    }
    // Beat 3 Finisher: Overhead Censer Benediction Arc
    return {
      windEnd: 0.28,
      strikeEnd: 0.65,
      windAngleDelta: -1.85 * swingAmp,
      strikeAngleDelta: 1.35 * swingAmp,
      windBackDist: 4.0,
      strikeFwdDist: 14.0,
      windUpLift: 9.0,
      strikeDrop: 3.0,
      windPerp: -2.0,
      strikePerp: 2.5,
      windTorsoLean: -0.17,
      strikeTorsoLean: 0.24,
      windTwist: -0.5,
      strikeTwist: 0.85,
      lungeStep: 6.0,
      braceRecoil: 2.2,
      offHandFwd: 7.5,
      offHandPerp: -4,
      slashStyle: 'censer_arc',
      reverseArc: false,
      radiusScale: 1.24,
      arcSpan: 2.75,
    };
  }

  if (style === 'seraphim_crozier') {
    if (step === 0) {
      // Beat 1: Ceremonial Sweeping Crook Cleave
      return {
        windEnd: 0.24,
        strikeEnd: 0.62,
        windAngleDelta: -1.48 * swingAmp,
        strikeAngleDelta: 1.38 * swingAmp,
        windBackDist: 3.0,
        strikeFwdDist: 12.5,
        windUpLift: 4.0,
        strikeDrop: 1.0,
        windPerp: -5.0,
        strikePerp: 5.0,
        windTorsoLean: -0.11,
        strikeTorsoLean: 0.19,
        windTwist: -0.7,
        strikeTwist: 0.78,
        lungeStep: 4.8,
        braceRecoil: 1.6,
        offHandFwd: 6.0,
        offHandPerp: -4.5,
        slashStyle: 'wide_arc',
        reverseArc: false,
        radiusScale: 1.15,
        arcSpan: 2.5,
      };
    }
    if (step === 1) {
      // Beat 2: Reverse Golden Arc Return
      return {
        windEnd: 0.22,
        strikeEnd: 0.6,
        windAngleDelta: 1.45 * swingAmp,
        strikeAngleDelta: -1.35 * swingAmp,
        windBackDist: 2.5,
        strikeFwdDist: 12.5,
        windUpLift: 3.0,
        strikeDrop: 0,
        windPerp: 5.5,
        strikePerp: -5.5,
        windTorsoLean: -0.1,
        strikeTorsoLean: 0.2,
        windTwist: 0.72,
        strikeTwist: -0.78,
        lungeStep: 5.0,
        braceRecoil: 1.6,
        offHandFwd: 7.0,
        offHandPerp: -4.0,
        slashStyle: 'wide_arc',
        reverseArc: true,
        radiusScale: 1.16,
        arcSpan: 2.55,
      };
    }
    // Beat 3 Finisher: Raised Seraphic Crook Vertical Judgment Thrust/Plant
    return {
      windEnd: 0.28,
      strikeEnd: 0.64,
      windAngleDelta: -0.55 * swingAmp,
      strikeAngleDelta: 0.12 * swingAmp,
      windBackDist: 2.0,
      strikeFwdDist: 14.5,
      windUpLift: 9.5,
      strikeDrop: 2.5,
      windPerp: -1.0,
      strikePerp: 0,
      windTorsoLean: -0.15,
      strikeTorsoLean: 0.22,
      windTwist: -0.4,
      strikeTwist: 0.6,
      lungeStep: 6.2,
      braceRecoil: 2.2,
      offHandFwd: 8.0,
      offHandPerp: -4.0,
      slashStyle: 'crook_plant',
      reverseArc: false,
      radiusScale: 1.26,
      arcSpan: 2.8,
    };
  }

  // Unarmed melee combos (Vanguard / Ranger / Cleric)
  if (step === 0) {
    return {
      windEnd: 0.2,
      strikeEnd: 0.56,
      windAngleDelta: -0.45 * swingAmp,
      strikeAngleDelta: 0.18 * swingAmp,
      windBackDist: 4.5,
      strikeFwdDist: 15.0,
      windUpLift: 1.0,
      strikeDrop: 0,
      windPerp: 3.0,
      strikePerp: 1.5,
      windTorsoLean: -0.1,
      strikeTorsoLean: 0.2,
      windTwist: -0.65,
      strikeTwist: 0.85,
      lungeStep: 5.5,
      braceRecoil: 1.5,
      offHandFwd: -3.0,
      offHandPerp: -4.0,
      slashStyle: 'punch_jab',
      reverseArc: false,
      radiusScale: 0.88,
      arcSpan: 1.75,
    };
  }
  if (step === 1) {
    return {
      windEnd: 0.2,
      strikeEnd: 0.56,
      windAngleDelta: 1.15 * swingAmp,
      strikeAngleDelta: -0.95 * swingAmp,
      windBackDist: 3.0,
      strikeFwdDist: 14.5,
      windUpLift: 1.5,
      strikeDrop: 0,
      windPerp: 5.0,
      strikePerp: -4.5,
      windTorsoLean: -0.09,
      strikeTorsoLean: 0.21,
      windTwist: 0.7,
      strikeTwist: -0.88,
      lungeStep: 5.8,
      braceRecoil: 1.5,
      offHandFwd: 10.5,
      offHandPerp: -2.0,
      slashStyle: 'punch_jab',
      reverseArc: true,
      radiusScale: 0.92,
      arcSpan: 1.9,
    };
  }
  return {
    windEnd: 0.26,
    strikeEnd: 0.62,
    windAngleDelta: -1.25 * swingAmp,
    strikeAngleDelta: 0.55 * swingAmp,
    windBackDist: 5.0,
    strikeFwdDist: 16.5,
    windUpLift: 5.0,
    strikeDrop: -2.0,
    windPerp: -2.5,
    strikePerp: 2.5,
    windTorsoLean: -0.16,
    strikeTorsoLean: 0.26,
    windTwist: -0.6,
    strikeTwist: 0.92,
    lungeStep: 7.0,
    braceRecoil: 2.2,
    offHandFwd: 8.5,
    offHandPerp: -3.0,
    slashStyle: 'punch_jab',
    reverseArc: false,
    radiusScale: 1.05,
    arcSpan: 2.2,
  };
}

function computeShoulderWorld(
  torsoX: number,
  torsoY: number,
  torsoLean: number,
  localX: number,
  localY: number
): { x: number; y: number } {
  const c = Math.cos(torsoLean);
  const s = Math.sin(torsoLean);
  return {
    x: torsoX + localX * c - localY * s,
    y: torsoY + localX * s + localY * c,
  };
}

function clampHandToReach(
  shoulderX: number,
  shoulderY: number,
  handX: number,
  handY: number,
  maxReach: number
): { x: number; y: number; dx: number; dy: number } {
  const vx = handX - shoulderX;
  const vy = handY - shoulderY;
  const dist = Math.hypot(vx, vy);
  if (dist <= maxReach || dist < 0.001) {
    return { x: handX, y: handY, dx: 0, dy: 0 };
  }
  const scale = maxReach / dist;
  const nx = shoulderX + vx * scale;
  const ny = shoulderY + vy * scale;
  return { x: nx, y: ny, dx: nx - handX, dy: ny - handY };
}

function computeHeroCombatPoseInternal(input: HeroCombatPoseInput): HeroCombatPose {
  const {
    heroClass,
    weaponId,
    isAttacking,
    atkProgress,
    comboStep: rawComboStep,
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
  } = input;

  const style = resolveWeaponAnimStyle(heroClass, weaponId);
  const comboStep = ((rawComboStep % 3) + 3) % 3;
  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  // Keep vertical poses (N/S) immune to aimCos crossing 0.0 so limbs never snap/X-cross across the back;
  // lungeDirX fades smoothly to aimCos on N/S so heroes lunge along their aim rather than sideways.
  const aimDirX = pose.isPureVertical && Math.abs(aimCos) < 0.4 ? 1 : aimCos >= 0 ? 1 : -1;
  const lungeDirX = pose.isPureVertical ? aimCos : aimDirX;
  const lungeDirY = pose.isPureVertical ? aimSin : 0;
  // Smooth continuous orthogonal side basis relative to aim direction
  const perpX = -aimSin;
  const perpY = aimCos;

  const baseLegs = pose.isPureVertical
    ? {
        leadX: 1,
        leadY: 6 + strideA * 1.5,
        leadLift: liftA * 0.75,
        trailX: -5.5,
        trailY: 6 + strideB * 1.5,
        trailLift: liftB * 0.75,
      }
    : pose.isDiagonal
      ? {
          leadX: 1 + strideA * 2.2,
          leadY: 6 + strideA * 1.0,
          leadLift: liftA,
          trailX: -5.5 + strideB * 2.2,
          trailY: 6 + strideB * 1.0,
          trailLift: liftB,
        }
      : {
          leadX: 1 + strideA * 3.5,
          leadY: 6,
          leadLift: liftA,
          trailX: -6 + strideB * 3.5,
          trailY: 6,
          trailLift: liftB,
        };

  const moveLeanFactor = pose.isPureVertical ? 0 : pose.isDiagonal ? 0.55 : 1.0;
  let torsoLean = moving ? (isDashing ? 0.13 : 0.055) * moveLeanFactor : 0;
  let torsoX = 0;
  let torsoY = bodyBob;
  let twistYaw = moving ? strideA * 0.18 : idleWave * 0.04;
  let headX = 0;
  let headY = headBob;
  let headTilt = 0;

  let leadFootDX = 0;
  let leadFootDY = 0;
  let leadFootLift = 0;
  let trailFootDX = 0;
  let trailFootDY = 0;
  let trailFootLift = 0;

  // ============================================================================
  // 1. RANGER BOWS (Recurve / Galewind Twinbow / Eclipse Siege Longbow)
  // ============================================================================
  if (style === 'recurve_bow' || style === 'twinbow' || style === 'siege_longbow') {
    const isEclipse = style === 'siege_longbow';
    const isTwin = style === 'twinbow';
    const isCharging = isEclipse && eclipseChargeRatio > 0.01 && !isAttacking;
    const chargeRatio = isEclipse ? Math.max(0, Math.min(1, eclipseChargeRatio)) : 0;
    const isBack = pose.verticalPlane === 'back';

    const northLateralOffset = isBack && Math.abs(aimCos) < 0.45 ? 6.8 : 0;
    const baseBowX =
      northLateralOffset +
      aimCos * (isEclipse ? 8.4 : 7.6) +
      (moving && !pose.isPureVertical ? strideA * 0.8 : 0);
    const baseBowY = -1 + bodyBob + aimSin * 5.8;

    // Distinct idle / aiming bow cant per bow archetype & combo step
    const idleTiltOffset = isTwin
      ? (comboStep === 1 ? -0.22 : comboStep === 2 ? 0.14 : -0.1)
      : isEclipse
        ? 0.04
        : 0;
    const baseBowTilt =
      localAim + idleTiltOffset + (moving ? Math.sin(walkPhase) * 0.06 : idleWave * 0.03);

    let bowOffX = baseBowX;
    let bowOffY = baseBowY;
    let bowTilt = baseBowTilt;
    let drawPull = moving ? 0.4 : 0.15;
    let bowFlex = 0;
    let releaseTwang = 0;
    let showNockedArrow = true;
    let slashProg = -1;

    if (isCharging) {
      // Live hold-to-charge stance: anchor back foot, brace front knee, lean torso back & pull bowstring!
      const tension = easeOutCubic(chargeRatio);
      const braceStep = 3.8 * tension;
      leadFootDX = lungeDirX * braceStep;
      leadFootDY = 0.8 * tension + lungeDirY * 1.5 * tension;
      trailFootDX = -lungeDirX * 3.2 * tension;
      torsoX = -lungeDirX * 2.2 * tension;
      torsoY += 1.6 * tension - lungeDirY * 1.2 * tension;
      torsoLean -= lungeDirX * 0.11 * tension;
      twistYaw = -0.55 * tension;
      headX = lungeDirX * 0.8 * tension;
      headY += 1.2 * tension;
      headTilt = lungeDirX * 0.06 * tension;

      drawPull = 1.5 + tension * 6.2;
      bowFlex = tension * 1.35;
      const microTremor = tension > 0.85 ? Math.sin(now * 0.06) * 0.55 : 0;
      bowOffX = baseBowX + aimCos * (2.2 * tension) + microTremor * 0.4;
      bowOffY = baseBowY + aimSin * (2.0 * tension) - 0.8 * tension + microTremor * 0.3;
      bowTilt = localAim - 0.05 * tension;
    } else if (isAttacking) {
      // Weapon- and combo-step-specific bow draw -> snap release -> follow-through
      const isHeavyBow = isEclipse || swingKind !== 'primary';
      const drawPhaseEnd = isTwin ? 0.28 : isHeavyBow ? 0.36 : 0.33;
      const releasePhaseEnd = isTwin ? 0.62 : isHeavyBow ? 0.68 : 0.64;

      const cantStep =
        isTwin && swingKind === 'primary'
          ? comboStep === 0
            ? -0.24
            : comboStep === 1
              ? 0.26
              : -0.08
          : style === 'recurve_bow' && swingKind === 'primary'
            ? comboStep === 1
              ? 0.16
              : comboStep === 2
                ? -0.14
                : 0
            : 0;

      const drawReach = isEclipse ? 4.2 * swingAmp : isTwin ? 2.6 * swingAmp : 3.2 * swingAmp;
      const kickBack = isEclipse ? 3.8 * swingAmp : isTwin ? 1.8 * swingAmp : 2.5 * swingAmp;
      const stepBack = isTwin && comboStep === 1 ? -3.5 : isEclipse ? 4.2 : 2.8;

      const drawBowX = baseBowX + aimCos * drawReach;
      const drawBowY = baseBowY + aimSin * drawReach * 0.85 - (comboStep === 2 ? 1.5 : 0);
      const recoilBowX = baseBowX - aimCos * kickBack;
      const recoilBowY = baseBowY - aimSin * kickBack * 0.85 - (isEclipse ? 1.8 : 0.8);
      const drawTilt = localAim + cantStep - 0.06 * swingAmp;
      const recoilTilt = localAim + cantStep + (isEclipse ? 0.22 : 0.13) * swingAmp;

      if (atkProgress < drawPhaseEnd) {
        const t = easeOutCubic(atkProgress / drawPhaseEnd);
        drawPull = t * (isEclipse ? 7.2 : isTwin ? 4.8 : 5.8);
        bowFlex = t * (isEclipse ? 1.2 : isTwin ? 0.75 : 0.9);
        bowTilt = lerp(baseBowTilt, drawTilt, t);
        bowOffX = lerp(baseBowX, drawBowX, t);
        bowOffY = lerp(baseBowY, drawBowY, t);

        torsoX = -lungeDirX * 1.8 * t;
        torsoY += (comboStep === 2 ? 1.5 : 0.8) * t - lungeDirY * 1.0 * t;
        torsoLean -= lungeDirX * 0.08 * swingAmp * t;
        twistYaw = -0.58 * t;
        leadFootDX = lungeDirX * stepBack * t;
        trailFootDX = -lungeDirX * 2.2 * t;
      } else if (atkProgress < releasePhaseEnd) {
        const t = (atkProgress - drawPhaseEnd) / (releasePhaseEnd - drawPhaseEnd);
        const kick = Math.sin(t * Math.PI);
        slashProg = t;
        drawPull = lerp(1.5, -1.6, easeOutCubic(Math.min(1, t * 1.6)));
        bowFlex = Math.max(0, 1 - t * 2.5) * 0.4;
        releaseTwang = Math.sin(t * Math.PI * 5) * (1 - t) * (isEclipse ? 2.4 : 1.9);
        showNockedArrow = false;
        bowTilt = lerp(drawTilt, recoilTilt, easeOutCubic(Math.min(1, t * 1.4)));
        bowOffX = lerp(drawBowX, recoilBowX, kick);
        bowOffY = lerp(drawBowY, recoilBowY, kick);

        // Body snaps upright/back from recoil while front shoulder & foot absorb kick
        torsoX = lerp(-lungeDirX * 1.8, lungeDirX * (isTwin && comboStep === 1 ? -2.0 : 1.4), kick);
        torsoY += lungeDirY * 1.2 * kick;
        torsoLean += lungeDirX * (isEclipse ? -0.14 : 0.06) * kick;
        twistYaw = lerp(-0.58, 0.32, easeOutCubic(Math.min(1, t * 1.3)));
        headX = -lungeDirX * (isEclipse ? 1.4 : 0.6) * kick;
        leadFootDX = lungeDirX * (stepBack + (comboStep === 2 ? 1.5 : 0));
        leadFootLift = comboStep === 2 ? kick * 2.4 : 0;
        trailFootDX = -lungeDirX * (2.2 + kick * 1.2);
      } else {
        const t = easeOutCubic((atkProgress - releasePhaseEnd) / (1 - releasePhaseEnd));
        drawPull = lerp(0, 0.5, t);
        bowTilt = lerp(recoilTilt, baseBowTilt, t);
        bowOffX = lerp(recoilBowX, baseBowX, t);
        bowOffY = lerp(recoilBowY, baseBowY, t);
        torsoX = lerp(lungeDirX * 1.0, 0, t);
        twistYaw = lerp(0.28, 0, t);
        leadFootDX = lerp(lungeDirX * stepBack, 0, t);
        trailFootDX = lerp(-lungeDirX * 2.2, 0, t);
      }
    }

    const bowGripX = bowOffX + Math.cos(bowTilt) * 4.2;
    const bowGripY = bowOffY + Math.sin(bowTilt) * 4.2;
    const stringWorldX = bowOffX + Math.cos(bowTilt) * (1.2 - drawPull);
    const stringWorldY = bowOffY + Math.sin(bowTilt) * (1.2 - drawPull);
    const mainShoulder = computeShoulderWorld(
      torsoX,
      torsoY,
      torsoLean,
      5.4 + twistYaw * 1.6,
      -3.5
    );
    const offShoulder = computeShoulderWorld(
      torsoX,
      torsoY,
      torsoLean,
      -5.4 - twistYaw * 1.4,
      -3.5
    );

    // When not actively drawing or releasing, rest off-hand naturally on the left flank/quiver side
    // instead of gluing both hands together across the chest/back!
    const activelyDrawing = isCharging || isAttacking;
    const offRestX = -9.0 + (moving ? strideB * 1.3 : idleWave * 0.4);
    const offRestY = (isBack ? -1.2 : 1.2) + bodyBob;
    const rawOffHandX = activelyDrawing
      ? showNockedArrow || isCharging
        ? stringWorldX
        : bowOffX - aimCos * 5.2
      : offRestX;
    const rawOffHandY = activelyDrawing
      ? showNockedArrow || isCharging
        ? stringWorldY
        : bowOffY - aimSin * 4.2 - 1.5
      : offRestY;

    const clampedMain = clampHandToReach(mainShoulder.x, mainShoulder.y, bowGripX, bowGripY, 14.5);
    const clampedOff = clampHandToReach(offShoulder.x, offShoulder.y, rawOffHandX, rawOffHandY, 14.5);

    return {
      style,
      comboStep,
      isCharging,
      chargeRatio,
      footwork: {
        leadX: baseLegs.leadX + leadFootDX,
        leadY: baseLegs.leadY + leadFootDY,
        leadLift: baseLegs.leadLift + leadFootLift,
        trailX: baseLegs.trailX + trailFootDX,
        trailY: baseLegs.trailY + trailFootDY,
        trailLift: baseLegs.trailLift + trailFootLift,
      },
      torso: {
        x: torsoX,
        y: torsoY,
        lean: torsoLean,
        twistYaw,
        shoulderShiftX: twistYaw * 3.0,
      },
      head: {
        x: headX + torsoX * 0.65,
        y: headY + (torsoY - bodyBob) * 0.75,
        tilt: headTilt,
      },
      mainArm: {
        shoulderX: mainShoulder.x,
        shoulderY: mainShoulder.y,
        handX: clampedMain.x,
        handY: clampedMain.y,
        elbowBias: 1,
      },
      offArm: {
        shoulderX: offShoulder.x,
        shoulderY: offShoulder.y,
        handX: clampedOff.x,
        handY: clampedOff.y,
        angle: bowTilt,
        elbowBias: -1,
      },
      weapon: {
        offX: bowOffX + clampedMain.dx,
        offY: bowOffY + clampedMain.dy,
        angle: bowTilt,
        drawPull,
        bowFlex,
        releaseTwang,
        showNockedArrow,
        chainSway: 0,
        chainExtend: 1,
        flareIntensity: isCharging ? 0.35 + chargeRatio * 0.85 : isAttacking ? 0.75 : 0,
      },
      slash: {
        progress: slashProg,
        reverse: comboStep === 1,
        style: 'arrow_release',
        radiusScale: isEclipse ? 1.25 : isTwin ? 1.05 : 1.0,
        arcSpan: 1.5,
        isFinisher: comboStep === 2 || swingKind !== 'primary',
        slamOffsetX: 0,
        slamOffsetY: 0,
      },
    };
  }

  // ============================================================================
  // 2. ARCANIST STAVES & SCEPTERS (Runebound Spire / Cinderflare / Chronostar)
  // ============================================================================
  if (
    style === 'spire_staff' ||
    style === 'cinder_rod' ||
    style === 'chrono_scepter' ||
    style === 'unarmed_arcanist'
  ) {
    const floatBob = moving ? bodyBob * 0.75 - 1 : idleWave * 1.4 - 0.8;
    torsoY = floatBob;
    headY = headBob * 0.9;
    const isBack = pose.verticalPlane === 'back';

    const staffSide = pose.isPureVertical
      ? aimCos < -0.4
        ? -12.2
        : 12.2
      : aimCos < -0.35
        ? -11.8
        : 11.8;

    const baseStaffAngle =
      (staffSide < 0 ? -0.22 : 0.22) +
      Math.sin(localAim) * 0.16 +
      (moving ? Math.sin(walkPhase) * 0.08 : Math.sin(now * 0.004) * 0.06);
    const baseStaffX = staffSide + (moving && !pose.isPureVertical ? strideA * 1.2 : 0);
    const baseStaffY = (isBack ? -1.8 : -0.6) + floatBob + (pose.isPureVertical ? aimSin * 1.2 : 0);

    let staffAngle = baseStaffAngle;
    let staffOffX = baseStaffX;
    let staffOffY = baseStaffY;
    let flareIntensity = 0;
    let offHandX = (staffSide >= 0 ? -1 : 1) * 11;
    let offHandY = (isBack ? -1.5 : -0.5) + floatBob + Math.sin(now * 0.007) * 1.5;
    let slashProg = -1;

    if (isAttacking) {
      const castDirAngle = localAim + Math.PI / 2;
      const angleDelta = Math.atan2(
        Math.sin(castDirAngle - baseStaffAngle),
        Math.cos(castDirAngle - baseStaffAngle)
      );

      // Unique casting gesture curves per weapon & combo beat!
      let windAngle = baseStaffAngle - (angleDelta >= 0 ? 0.38 : -0.38) * swingAmp;
      let castAngle = baseStaffAngle + angleDelta * 0.72;
      let windX = baseStaffX - aimCos * 3.5 * swingAmp;
      let windY = baseStaffY - 2.5 - aimSin * 2.0;
      let castX = baseStaffX + aimCos * 8.5 * swingAmp;
      let castY = baseStaffY + aimSin * 7.2 * swingAmp;
      let stepFwd = 2.6;

      if (style === 'cinder_rod') {
        // Pyromancy catalyst: Beat 0 low scoop, Beat 1 wide fire-whip cross, Beat 2 overhead brazier slam
        if (comboStep === 0) {
          windAngle = baseStaffAngle + 0.55;
          castAngle = baseStaffAngle + angleDelta * 0.85 - 0.25;
          windY = baseStaffY + 3.5;
          castY = baseStaffY + aimSin * 7 - 3.5;
        } else if (comboStep === 1) {
          windAngle = baseStaffAngle - 0.95;
          castAngle = baseStaffAngle + 0.95 + angleDelta * 0.45;
          windX = baseStaffX + perpX * -4 - aimCos * 2;
          castX = baseStaffX + aimCos * 9 + perpX * 5;
        } else {
          windAngle = -0.35 * aimDirX;
          castAngle = castDirAngle;
          windY = baseStaffY - 8.5;
          castX = baseStaffX + aimCos * 11 * swingAmp;
          castY = baseStaffY + aimSin * 8 + 1.5;
          stepFwd = 4.2;
        }
      } else if (style === 'chrono_scepter') {
        // Chronostar Scepter: Beat 0 precise pointer thrust, Beat 1 reverse clockwork sweep, Beat 2 skyward convergence
        if (comboStep === 0) {
          windAngle = baseStaffAngle - 0.25;
          castAngle = castDirAngle;
          windX = baseStaffX - aimCos * 4.5;
          castX = baseStaffX + aimCos * 10.5 * swingAmp;
          castY = baseStaffY + aimSin * 8.5 * swingAmp;
        } else if (comboStep === 1) {
          windAngle = baseStaffAngle + 0.85;
          castAngle = baseStaffAngle - 0.85;
          windX = baseStaffX + perpX * 4;
          castX = baseStaffX + aimCos * 7.5 - perpX * 5;
        } else {
          windAngle = -0.15 * aimDirX;
          castAngle = baseStaffAngle + angleDelta * 0.6;
          windY = baseStaffY - 9.0;
          castY = baseStaffY + aimSin * 6.5 - 2.0;
          stepFwd = 3.8;
        }
      } else {
        // Runebound Spire & Unarmed: Beat 0 spiral weave, Beat 1 wide rift sweep, Beat 2 double-hand forward surge
        if (comboStep === 0) {
          windAngle = baseStaffAngle - 0.48 * aimDirX;
          castAngle = baseStaffAngle + angleDelta * 0.65;
        } else if (comboStep === 1) {
          windAngle = baseStaffAngle + 0.72 * aimDirX;
          castAngle = baseStaffAngle - 0.72 * aimDirX + angleDelta * 0.4;
          windX = baseStaffX + perpX * 3.5;
          castX = baseStaffX + aimCos * 8 - perpX * 4.5;
        } else {
          windAngle = -0.25 * aimDirX;
          castAngle = castDirAngle;
          windY = baseStaffY - 7.5;
          castX = baseStaffX + aimCos * 10.5 * swingAmp;
          stepFwd = 4.2;
        }
      }

      const baseOffSide = staffSide >= 0 ? -1 : 1;
      const baseOffX = baseOffSide * 11;
      const baseOffY = (isBack ? -1.5 : -0.5) + floatBob;

      if (atkProgress < 0.25) {
        const t = easeOutCubic(atkProgress / 0.25);
        staffAngle = lerp(baseStaffAngle, windAngle, t);
        staffOffX = lerp(baseStaffX, windX, t);
        staffOffY = lerp(baseStaffY, windY, t);
        flareIntensity = 0.65 * t;
        torsoX = -lungeDirX * 1.6 * t;
        torsoY -= lungeDirY * 1.0 * t;
        torsoLean -= lungeDirX * 0.08 * t;
        twistYaw = (comboStep === 1 ? 0.55 : -0.55) * t;
        leadFootDX = -lungeDirX * 1.4 * t;
        offHandX = lerp(baseOffX, aimCos * 2 + baseOffSide * 7, t);
        offHandY = lerp(baseOffY, -4 + floatBob, t);
      } else if (atkProgress < 0.65) {
        const t = easeOutCubic((atkProgress - 0.25) / 0.4);
        const thrustArc = Math.sin(t * Math.PI);
        slashProg = t;
        staffAngle = lerp(windAngle, castAngle, t);
        staffOffX = lerp(windX, castX, t) + aimCos * thrustArc * 2.8;
        staffOffY = lerp(windY, castY, t) + aimSin * thrustArc * 2.2;
        flareIntensity = 0.65 + 0.55 * thrustArc;
        torsoX = lerp(-lungeDirX * 1.6, lungeDirX * 2.4, t);
        torsoY += lungeDirY * 1.8 * t;
        torsoLean += lungeDirX * 0.14 * swingAmp * thrustArc;
        twistYaw = lerp(comboStep === 1 ? 0.55 : -0.55, comboStep === 1 ? -0.65 : 0.65, t);
        leadFootDX = lungeDirX * stepFwd * Math.sin(t * Math.PI * 0.85);
        leadFootDY = lungeDirY * stepFwd * 0.6 * Math.sin(t * Math.PI * 0.85);
        leadFootLift = comboStep === 2 ? thrustArc * 2.8 : thrustArc * 1.4;
        trailFootDX = -lungeDirX * 1.8 * t;
        // Double-hand convergence on Beat 2 finisher, off-hand rune projection on Beats 0/1
        offHandX =
          comboStep === 2
            ? lerp(baseOffSide * 7, aimCos * 9.5, t)
            : lerp(baseOffSide * 7, aimCos * 7.5 + baseOffSide * 4.5, thrustArc);
        offHandY =
          comboStep === 2
            ? lerp(-4 + floatBob, aimSin * 5 + floatBob, t)
            : lerp(-4 + floatBob, -5.5 + floatBob + aimSin * 3, thrustArc);
      } else {
        const t = easeOutCubic((atkProgress - 0.65) / 0.35);
        staffAngle = lerp(castAngle, baseStaffAngle, t);
        staffOffX = lerp(castX, baseStaffX, t);
        staffOffY = lerp(castY, baseStaffY, t);
        flareIntensity = Math.max(0, 0.6 * (1 - t));
        torsoX = lerp(lungeDirX * 2.0, 0, t);
        twistYaw = lerp(comboStep === 1 ? -0.5 : 0.5, 0, t);
        leadFootDX = lerp(lungeDirX * stepFwd * 0.6, 0, t);
        offHandX = lerp(aimCos * 7 + baseOffSide * 4, baseOffX, t);
        offHandY = lerp(-3 + floatBob, baseOffY, t);
      }
    }

    const mainSideSign = staffSide >= 0 ? 1 : -1;
    const mainShoulder = computeShoulderWorld(
      torsoX,
      torsoY,
      torsoLean,
      mainSideSign * (5.2 + twistYaw * 1.4),
      -3.8
    );
    const offShoulder = computeShoulderWorld(
      torsoX,
      torsoY,
      torsoLean,
      -mainSideSign * (5.2 + twistYaw * 1.4),
      -3.8
    );

    const clampedMain = clampHandToReach(mainShoulder.x, mainShoulder.y, staffOffX, staffOffY, 14.5);
    const clampedOff = clampHandToReach(offShoulder.x, offShoulder.y, offHandX, offHandY, 14.5);

    return {
      style,
      comboStep,
      isCharging: false,
      chargeRatio: 0,
      footwork: {
        leadX: baseLegs.leadX + leadFootDX,
        leadY: baseLegs.leadY + floatBob - bodyBob + leadFootDY,
        leadLift: baseLegs.leadLift * 0.6 + leadFootLift,
        trailX: baseLegs.trailX + trailFootDX,
        trailY: baseLegs.trailY + floatBob - bodyBob + trailFootDY,
        trailLift: baseLegs.trailLift * 0.6 + trailFootLift,
      },
      torso: {
        x: torsoX,
        y: torsoY,
        lean: torsoLean,
        twistYaw,
        shoulderShiftX: twistYaw * 2.6,
      },
      head: {
        x: torsoX * 0.55,
        y: headY,
        tilt: -torsoLean * 0.35,
      },
      mainArm: {
        shoulderX: mainShoulder.x,
        shoulderY: mainShoulder.y,
        handX: clampedMain.x,
        handY: clampedMain.y,
        elbowBias: mainSideSign,
      },
      offArm: {
        shoulderX: offShoulder.x,
        shoulderY: offShoulder.y,
        handX: clampedOff.x,
        handY: clampedOff.y,
        angle: 0,
        elbowBias: -mainSideSign,
      },
      weapon: {
        offX: clampedMain.x,
        offY: clampedMain.y,
        angle: staffAngle,
        drawPull: 0,
        bowFlex: 0,
        releaseTwang: 0,
        showNockedArrow: false,
        chainSway: 0,
        chainExtend: 1,
        flareIntensity,
      },
      slash: {
        progress: slashProg,
        reverse: comboStep === 1,
        style: 'cast_burst',
        radiusScale: comboStep === 2 ? 1.2 : 1.0,
        arcSpan: 2.0,
        isFinisher: comboStep === 2 || swingKind !== 'primary',
        slamOffsetX: 0,
        slamOffsetY: 0,
      },
    };
  }

  // ============================================================================
  // 3. MELEE / HYBRID WEAPONS (Vanguard & Cleric & Ranger Unarmed)
  // ============================================================================
  const isBack = pose.verticalPlane === 'back';
  const aimingStronglyBack = !pose.isPureVertical && aimCos < -0.35;

  const baseWeaponAngle = aimingStronglyBack
    ? localAim + Math.PI / 2 + 0.3
    : moving
      ? 0.4 + aimSin * 0.2 + Math.sin(walkPhase) * 0.14
      : 0.34 + aimSin * 0.2 + idleWave * 0.06;
  const baseWeaponX = pose.isPureVertical
    ? (isBack ? 11.6 : 10.8) + (moving ? strideA * 0.9 : 0)
    : aimingStronglyBack
      ? aimCos * 10.5
      : moving
        ? 9.8 + strideA * 1.4
        : 10.5;
  const baseWeaponY =
    (isBack ? -1.4 : 1.0) + bodyBob + (pose.isPureVertical ? aimSin * 1.2 : aimSin * 2.2);

  let weaponAngle = baseWeaponAngle;
  let weaponOffX = baseWeaponX;
  let weaponOffY = baseWeaponY;
  let offHandX = pose.isPureVertical
    ? (isBack ? -11.4 : -10.5) + (moving ? strideB * 0.9 : 0)
    : -10.2 + (moving ? strideB * 1.4 : idleWave * 0.5);
  let offHandY = (isBack ? -1.4 : 1.0) + bodyBob;
  let offAngle = moving ? strideB * 0.08 : 0;
  let chainSway = 0.14 + Math.sin(now * 0.008) * 0.2;
  let chainExtend = 1;
  let slashProg = -1;

  const curve = getMeleeCurveSpec(style, comboStep, swingKind, swingAmp);
  const targetRot = localAim + Math.PI / 2;

  if (isAttacking) {
    const windAngle = targetRot + curve.windAngleDelta;
    const strikeAngle = targetRot + curve.strikeAngleDelta;

    const windX = aimCos * (4.5 - curve.windBackDist) + perpX * curve.windPerp;
    const windY = aimSin * (3.5 - curve.windBackDist) + perpY * curve.windPerp - curve.windUpLift + bodyBob;

    const strikeX = aimCos * (curve.strikeFwdDist + (swingAmp - 1) * 3.5) + perpX * curve.strikePerp;
    const strikeY =
      aimSin * (curve.strikeFwdDist * 0.8 + (swingAmp - 1) * 2.5) +
      perpY * curve.strikePerp +
      curve.strikeDrop +
      bodyBob;

    const offBaseX = offHandX;
    const offBaseY = offHandY;
    // Keep off-arm windup on the left/off-hand (-X) side so it never flips across the spine
    const offWindX = -9.2 - Math.max(0, aimCos) * 1.8;
    const offWindY = (isBack ? -2.8 : -1.5) + bodyBob;
    const rawOffStrikeX = aimCos * curve.offHandFwd + perpX * curve.offHandPerp;
    // Prevent shield/off-arm from crossing awkwardly over the front chest in pure-South unless unarmed combo jab
    const offStrikeX =
      pose.isPureVertical && pose.verticalPlane === 'front' && style !== 'unarmed_vanguard' && style !== 'unarmed_ranger' && style !== 'unarmed_cleric'
        ? Math.min(-3.0, rawOffStrikeX)
        : rawOffStrikeX;
    const offStrikeY = aimSin * (curve.offHandFwd * 0.7) + perpY * curve.offHandPerp + bodyBob - 1.5;

    if (atkProgress < curve.windEnd) {
      const t = easeOutCubic(atkProgress / curve.windEnd);
      weaponAngle = lerp(baseWeaponAngle, windAngle, t);
      weaponOffX = lerp(baseWeaponX, windX, t);
      weaponOffY = lerp(baseWeaponY, windY, t);

      torsoX = -lungeDirX * 2.2 * t;
      torsoY = bodyBob + 1.2 * t - lungeDirY * 1.2 * t;
      torsoLean += curve.windTorsoLean * lungeDirX * t;
      twistYaw = curve.windTwist * t;
      headX = lungeDirX * 0.6 * t;
      headY = headBob + 1.0 * t;
      headTilt = -curve.windTorsoLean * 0.45 * lungeDirX * t;

      leadFootDX = -lungeDirX * 1.8 * t;
      leadFootDY = -lungeDirY * 1.2 * t;
      leadFootLift = comboStep === 2 ? 2.4 * t : 1.0 * t;
      trailFootDX = -lungeDirX * curve.braceRecoil * 0.5 * t;

      offHandX = lerp(offBaseX, offWindX, t);
      offHandY = lerp(offBaseY, offWindY, t);
      offAngle = -0.2 * t;
      chainSway = (curve.reverseArc ? -0.45 : 0.45) * t;
      chainExtend = 1 + 0.18 * t;
    } else if (atkProgress < curve.strikeEnd) {
      const rawT = (atkProgress - curve.windEnd) / (curve.strikeEnd - curve.windEnd);
      const t = easeOutCubic(rawT);
      const peakImpulse = Math.sin(rawT * Math.PI);
      slashProg = t;

      weaponAngle = lerp(windAngle, strikeAngle, t);
      weaponOffX =
        lerp(windX, strikeX, t) + aimCos * peakImpulse * 3.8 * swingAmp;
      weaponOffY =
        lerp(windY, strikeY, t) +
        aimSin * peakImpulse * 3.0 * swingAmp -
        (curve.slashStyle === 'overhead_slam' ? peakImpulse * 5.0 : 0);

      torsoX = lerp(-lungeDirX * 2.2, lungeDirX * 3.4 * swingAmp, t);
      torsoY =
        bodyBob +
        (curve.slashStyle === 'overhead_slam' ? easeInQuad(rawT) * 2.5 : -peakImpulse * 1.0) +
        lungeDirY * 2.2 * t;
      torsoLean += lerp(curve.windTorsoLean, curve.strikeTorsoLean, t) * lungeDirX;
      twistYaw = lerp(curve.windTwist, curve.strikeTwist, t);
      headX = lungeDirX * 1.8 * t;
      headY = headBob + (torsoY - bodyBob) * 0.8;
      headTilt = -lerp(curve.windTorsoLean, curve.strikeTorsoLean, t) * 0.4 * lungeDirX;

      leadFootDX = lungeDirX * curve.lungeStep * t;
      leadFootDY = 1.0 * peakImpulse + lungeDirY * curve.lungeStep * 0.55 * t;
      leadFootLift = peakImpulse * (comboStep === 2 ? 3.2 : 1.6);
      trailFootDX = -lungeDirX * curve.braceRecoil * t;
      trailFootLift = t > 0.5 ? (t - 0.5) * 2.4 : 0;

      offHandX = lerp(offWindX, offStrikeX, t);
      offHandY = lerp(offWindY, offStrikeY, t);
      offAngle = (swingKind === 'tactical' ? -0.36 : -0.25) * peakImpulse;
      chainSway = (curve.reverseArc ? 0.65 : -0.65) * peakImpulse + 0.25;
      chainExtend = 1 + 0.55 * peakImpulse;
    } else {
      const t = easeOutCubic((atkProgress - curve.strikeEnd) / (1 - curve.strikeEnd));
      weaponAngle = lerp(strikeAngle, baseWeaponAngle, t);
      weaponOffX = lerp(strikeX, baseWeaponX, t);
      weaponOffY = lerp(strikeY, baseWeaponY, t);

      torsoX = lerp(lungeDirX * 3.0, 0, t);
      torsoY = bodyBob + lerp(1.0 + lungeDirY * 1.8, 0, t);
      torsoLean += lerp(curve.strikeTorsoLean * 0.7, 0, t) * lungeDirX;
      twistYaw = lerp(curve.strikeTwist, 0, t);
      headX = lerp(lungeDirX * 1.6, 0, t);
      headY = headBob;

      leadFootDX = lerp(lungeDirX * curve.lungeStep, 0, t);
      leadFootDY = lerp(lungeDirY * curve.lungeStep * 0.55, 0, t);
      trailFootDX = lerp(-lungeDirX * curve.braceRecoil, 0, t);

      offHandX = lerp(offStrikeX, offBaseX, t);
      offHandY = lerp(offStrikeY, offBaseY, t);
      offAngle = lerp(-0.15, 0, t);
      chainSway = lerp(0.32, 0.14, t);
      chainExtend = lerp(1.25, 1, t);
    }
  }

  // Keep shoulders anchored to torso translation & lean so arms never detach or X-cross!
  const mainShoulder = computeShoulderWorld(
    torsoX,
    torsoY,
    torsoLean,
    5.8 + twistYaw * 1.8,
    -3.5
  );
  const offShoulder = computeShoulderWorld(
    torsoX,
    torsoY,
    torsoLean,
    -5.8 - twistYaw * 1.6,
    -3.5
  );

  const clampedMain = clampHandToReach(mainShoulder.x, mainShoulder.y, weaponOffX, weaponOffY, 14.5);
  const clampedOff = clampHandToReach(offShoulder.x, offShoulder.y, offHandX, offHandY, 14.5);

  return {
    style,
    comboStep,
    isCharging: false,
    chargeRatio: 0,
    footwork: {
      leadX: baseLegs.leadX + leadFootDX,
      leadY: baseLegs.leadY + leadFootDY,
      leadLift: baseLegs.leadLift + leadFootLift,
      trailX: baseLegs.trailX + trailFootDX,
      trailY: baseLegs.trailY + trailFootDY,
      trailLift: baseLegs.trailLift + trailFootLift,
    },
    torso: {
      x: torsoX,
      y: torsoY,
      lean: torsoLean,
      twistYaw,
      shoulderShiftX: twistYaw * 3.2,
    },
    head: {
      x: headX + torsoX * 0.6,
      y: headY + (torsoY - bodyBob) * 0.75,
      tilt: headTilt,
    },
    mainArm: {
      shoulderX: mainShoulder.x,
      shoulderY: mainShoulder.y,
      handX: clampedMain.x,
      handY: clampedMain.y,
      elbowBias: curve.reverseArc ? -1 : 1,
    },
    offArm: {
      shoulderX: offShoulder.x,
      shoulderY: offShoulder.y,
      handX: clampedOff.x,
      handY: clampedOff.y,
      angle: offAngle,
      elbowBias: -1,
    },
    weapon: {
      offX: clampedMain.x,
      offY: clampedMain.y,
      angle: weaponAngle,
      drawPull: 0,
      bowFlex: 0,
      releaseTwang: 0,
      showNockedArrow: false,
      chainSway,
      chainExtend,
      flareIntensity: slashProg >= 0 ? Math.sin(slashProg * Math.PI) : 0,
    },
    slash: {
      progress: slashProg,
      reverse: curve.reverseArc,
      style: curve.slashStyle,
      radiusScale: curve.radiusScale,
      arcSpan: curve.arcSpan,
      isFinisher: comboStep === 2 || swingKind !== 'primary',
      slamOffsetX: aimCos * 18,
      slamOffsetY: aimSin * 15 + 3 + bodyBob,
    },
  };
}

export function computeHeroCombatPose(input: HeroCombatPoseInput): HeroCombatPose {
  const result = computeHeroCombatPoseInternal(input);
  if (!input.hitStopActive) {
    return result;
  }
  const jit = input.impactJitter ?? 0;
  const aimCos = Math.cos(input.localAim);
  const aimSin = Math.sin(input.localAim);
  const step = ((input.comboStep % 3) + 3) % 3;
  const amp = (step === 2 ? 1.55 : 1.05) * jit;

  result.hitStopActive = true;
  result.weapon.offX += aimCos * amp * 0.85 - aimSin * amp * 0.45;
  result.weapon.offY += aimSin * amp * 0.85 + aimCos * amp * 0.45;
  result.mainArm.handX += aimCos * amp * 0.8 - aimSin * amp * 0.35;
  result.mainArm.handY += aimSin * amp * 0.8 + aimCos * amp * 0.35;
  result.torso.x += aimCos * amp * 0.45;
  result.weapon.flareIntensity = Math.max(result.weapon.flareIntensity, 1.0);
  return result;
}
