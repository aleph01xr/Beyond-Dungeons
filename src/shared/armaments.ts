import { getArcanistScrollDef, type ArcanistScrollId } from './arcanist.ts';
import {
  HERO_CLASSES,
  type AccountRecord,
  type DamageCategory,
  type DamageTypeMode,
  type HeroClassId,
  type ScalingAttribute,
  type VestmentPassiveId,
} from './types.ts';

export type ArmamentSlot = 'weapon' | 'vestment';
export type ArmamentRarity = 'Standard' | 'Forged' | 'Ascendant';

export type WeaponTacticalId =
  | 'bastion_counter'
  | 'crimson_frenzy'
  | 'cyclone_break'
  | 'black_sun'
  | 'seraphic_judgment';

export type ActiveTacticalId =
  | WeaponTacticalId
  | ArcanistScrollId
  | 'bulwark_dash'
  | 'frost_volley'
  | 'astral_nova'
  | 'sanctified_pulse';

export interface ActiveTacticalDef {
  id: ActiveTacticalId;
  name: string;
  shortTitle: string;
  description: string;
  cooldownMs: number;
  accentColor: string;
  secondaryColor: string;
  source: 'class' | 'weapon' | 'scroll';
  weaponTacticalId?: WeaponTacticalId;
  scrollId?: ArcanistScrollId;
  weaponId?: string | null;
  weaponName?: string | null;
  damageCategory: DamageCategory;
}

/**
 * Centralized balance and mechanics tuning configuration for all 12 Weapons & 12 Vestments.
 * Undecided Section 10 parameters are explicitly exposed here as named temporary defaults.
 */
export const ARMAMENT_TUNING = {
  weapons: {
    sunforged: {
      shockwaveDamageRatio: 0.55,
      shockwaveRangePx: 118,
      shockwaveHalfAngleRad: 0.58,
      shockwaveZoneTtlMs: 240,
      bastionBraceMs: 1400,
      bastionDamageReduction: 0.6,
      bastionCleaveRadiusPx: 116,
      bastionCleaveHalfAngleRad: 1.05,
      bastionCleaveBaseDamage: 46,
      bastionBlockedBonusPerHitRatio: 0.25,
      bastionMaxBonusStacks: 3,
      bastionCleaveZoneTtlMs: 280,
      bastionCooldownMs: 7000,
    },
    crimson: {
      bonusPierce: 3,
      rangeBonusPx: 26,
      frenzyDurationMs: 5000,
      frenzyCooldownMs: 10500,
      frenzyDamageBonusPct: 0.25,
      frenzyLifestealPct: 0.14,
      frenzyAttackSpeedBonusPct: 0.25,
      frenzyMoveSpeedBonusPct: 0.65,
    },
    stormbreaker: {
      slamForwardOffsetPx: 54,
      slamRadiusPx: 62,
      slamDamageRatio: 1.15,
      slamZoneTtlMs: 260,
    },
    galewind: {
      counterScope: 'per_target' as const,
      hitsToTrigger: 3,
      aoeRadiusPx: 88,
      aoeDamageRatio: 0.85,
      dexScalingMult: 0.78,
      attackSpeedMult: 0.92,
      novaZoneTtlMs: 260,
      cycloneArrowRangePx: 330,
      cycloneArrowSpeedPx: 540,
      cycloneArrowRadiusPx: 14,
      cycloneArrowCarryDurationMs: 180,
      cycloneArrowBaseDamage: 24,
      cycloneRadiusPx: 132,
      cycloneDurationMs: 2400,
      cycloneTickIntervalMs: 300,
      cyclonePullSpeedPxPerSec: 245,
      cycloneTickBaseDamage: 11,
      cycloneDetonationBaseDamage: 36,
      cycloneCooldownMs: 8500,
    },
    eclipse: {
      minChargeMs: 120,
      maxChargeMs: 950,
      minDamageRatio: 0.55,
      maxDamageRatio: 2.15,
      minProjSpeedMult: 1.05,
      maxProjSpeedMult: 1.55,
      scalingStat: 'intelligence' as const,
      blackSunRangePx: 240,
      blackSunRadiusPx: 115,
      blackSunZoneDurationMs: 1400,
      blackSunTickIntervalMs: 350,
      blackSunTickBaseDamage: 10,
      blackSunStrikeBaseDamage: 68,
      blackSunBurstZoneTtlMs: 360,
      blackSunCooldownMs: 9000,
    },
    cinderflare: {
      aoeRadiusPx: 64,
      aoeDamageRatio: 0.5,
      blastZoneTtlMs: 240,
    },
    chronostar: {
      tacticalSiphonMs: 150,
      ultSiphonMs: 300,
      seekingRadiusPx: 170,
    },
    solaris: {
      allyHealBase: 5,
      healRangePx: 180,
      procCooldownMs: 350,
    },
    seraphim: {
      tacticalRadiusPx: 110,
      tacticalRangePx: 210,
      tacticalBaseDamage: 56,
      tacticalCooldownMs: 6500,
      holyBurstZoneTtlMs: 340,
    },
  },
  passives: {
    warMonger: {
      lowHpThresholdRatio: 0.3,
      thresholdInclusive: true,
      aboveThresholdLifestealPct: 0.06,
      atOrBelowThresholdLifestealPct: 0.5,
    },
    heat: {
      cap: 100,
      gainPerHit: 18,
      maxDamageBonusPct: 0.25,
      resetGraceMs: 2400,
    },
    momentum: {
      cap: 100,
      buildDurationMs: 2500,
      minMoveSpeedPx: 20,
      maxAttackSpeedBonusPct: 0.24,
      resetOnStop: true,
      resetOnHit: true,
    },
    predatorsInstinct: {
      maxStacks: 5,
      damagePerStackPct: 0.06,
      inactivityResetMs: 3500,
    },
    temporalAcceleration: {
      tacticalReductionPerBasicHitMs: 120,
      ultReductionPerTacticalHitMs: 250,
    },
    voidConsumption: {
      cap: 100,
      gainPerHit: 20,
      empoweredTacticalBonusPct: 0.35,
    },
    sharedGrace: {
      storePct: 0.35,
      maxCap: 60,
      triggerHpRatio: 0.6,
      releaseRangePx: 220,
    },
    sacredRetribution: {
      sanctityPerHeal: 25,
      cap: 100,
      shockwaveRadiusPx: 145,
      enemyBaseDamage: 38,
      allyBaseHeal: 18,
      shockwaveZoneTtlMs: 320,
    },
  },
} as const;

export interface WeaponModifiers {
  /** Attribute that scales primary weapon damage and weapon-derived scaling */
  scalingAttribute?: ScalingAttribute;
  /** Default/configured damage category for this weapon */
  damageCategory?: DamageCategory;
  /** 'fixed' (default) or 'adaptive' (STR > INT -> physical, INT > STR -> arcane, tie -> configured default) */
  damageTypeMode?: DamageTypeMode;
  /** Multiplicative damage scaling applied to class primary/ability damage (default 1.0) */
  damageMult?: number;
  /** Multiplicative attack cadence speed (e.g. 1.12 = 12% faster attacks, default 1.0) */
  attackSpeedMult?: number;
  /** Additive critical hit chance (e.g. 0.04 = +4%) */
  critChanceBonus?: number;
  /** Additive critical damage multiplier (e.g. 0.10 = +10% crit multiplier) */
  critMultBonus?: number;
  /** Additional targets pierced per primary projectile */
  bonusPierce?: number;
  /** Multiplier applied to primary projectile velocity */
  projectileSpeedMult?: number;
  /** Extra melee cleave radius or projectile reach in world px */
  rangeBonusPx?: number;
  /** Vanguard-only: Shield restored when a primary attack hits a target */
  shieldOnPrimaryHit?: number;
  /** Multiplicative bonus to healing output (e.g. 0.16 = +16% healing) */
  healingBonusPct?: number;
  /** Bonus damage multiplier vs Undead, Cultists & Bosses (e.g. 0.20 = +20%) */
  undeadBossBonusPct?: number;
  /** Additional Ranger Longshot bonus at >= 180u */
  longshotBonusPct?: number;
  /** Bonus Star Rift zone damage multiplier (e.g. 0.15 = +15%) */
  starRiftBonusDamagePct?: number;
  /** Chance on primary hit to inflict Burn (0..1) */
  burnChance?: number;
  /** Chance on primary hit to Chill/slow enemy (0..1) */
  chillChance?: number;
  /** Chance on primary hit to Shock enemy (0..1) */
  shockChance?: number;
  /** Chance on primary hit to inflict Bleed (0..1) */
  bleedChance?: number;
  /** Sunforged Claymore: releases a short-range golden shockwave while Shield > 0 */
  sunforgedShockwave?: boolean;
  /** Stormbreaker Flail: downward heavy slam & localized forward AoE */
  heavySlamAoe?: boolean;
  /** Crimson War Axe: permanent continuous lock preventing Shield gain from any source */
  shieldGainLocked?: boolean;
  /** Ascendant weapon Tactical replacement identifier */
  tacticalId?: WeaponTacticalId;
  /** Ashwood Recurve: bonus arrow damage against Slowed, Poisoned, or Frozen foes */
  impairedTargetBonusPct?: number;
  /** Galewind Twinbow: per-target 3-hit deterministic Galeburst wind explosion */
  galeburstTriggerHits?: number;
  galeburstRadiusPx?: number;
  galeburstDamageRatio?: number;
  /** Multiplier on DEX damage scaling (used by Galewind balance pass) */
  dexScalingMult?: number;
  /** Eclipse Longbow: hold-to-charge Basic Attack scaling with INT */
  chargeToFire?: boolean;
  usesIntScaling?: boolean;
  /** Runebound Spire: bonus bolt damage while an owned Star Rift is active */
  activeRiftBonusPct?: number;
  /** Cinderflare Rod: Ember Splash Fire AoE detonation on primary hit */
  emberSplashRadiusPx?: number;
  emberSplashRatio?: number;
  /** Chronostar Scepter: wide mid-flight proximity seeking & cooldown siphon on hit */
  seekingRadiusPx?: number;
  tacticalSiphonMs?: number;
  ultSiphonMs?: number;
  /** Solaris Censer: heals lowest-HP nearby ally on primary bolt hit */
  allyHealOnHitBase?: number;
  allyHealOnHitRangePx?: number;
  allyHealProcCooldownMs?: number;
  /** Seraphim Crozier: replaces Cleric Tactical with targeted AoE Holy Burst */
  seraphimTacticalBurst?: boolean;
}

export interface VestmentModifiers {
  /** Flat bonus to Maximum HP */
  maxHpBonus?: number;
  /** Additive physical damage resistance (e.g. 0.05 = +5%) */
  physicalResistBonus?: number;
  /** Additive elemental/magic damage resistance (e.g. 0.05 = +5%) */
  elementalResistBonus?: number;
  /** Multiplicative incoming damage reduction factor (e.g. 0.94 = -6% incoming damage) */
  damageTakenMult?: number;
  /** Multiplicative movement speed multiplier (e.g. 1.05 = +5% speed) */
  moveSpeedMult?: number;
  /** Additive attack speed bonus (e.g. 0.05 = +5% attack speed) */
  attackSpeedBonus?: number;
  /** Additive critical strike chance bonus (e.g. 0.05 = +5% crit chance) */
  critChanceBonus?: number;
  /** Additive cooldown reduction (e.g. 0.08 = +8% CDR) */
  cdrBonus?: number;
  /** Bonus HP regenerated per 2.0s combat pulse */
  hpRegenPerTickBonus?: number;
  /** Additive crowd-control duration reduction (e.g. 0.12 = +12%) */
  ccTenacityBonus?: number;
  /** Additive ally revive speed multiplier (e.g. 0.20 = +20% faster revive) */
  reviveSpeedBonus?: number;
  /** Multiplicative bonus to Cleric healing output (e.g. 0.15 = +15%) */
  auraHealBonusPct?: number;
  /** Vanguard-only: Flat increase to Maximum Shield cap (base 60) */
  maxShieldBonus?: number;
  /** Vanguard-only: Bonus starting Shield at expedition start */
  startingShieldBonus?: number;
}

export interface WeaponDef {
  id: string;
  slot: 'weapon';
  heroClass: HeroClassId;
  name: string;
  rarity: ArmamentRarity;
  archetype: string;
  summary: string;
  effectLines: string[];
  unlockHint: string;
  isDefault?: boolean;
  accent: string;
  modifiers: WeaponModifiers;
}

export interface VestmentDef {
  id: string;
  slot: 'vestment';
  heroClass: HeroClassId;
  name: string;
  rarity: ArmamentRarity;
  archetype: string;
  passiveId: VestmentPassiveId;
  passiveName: string;
  passiveSummary: string;
  summary: string;
  effectLines: string[];
  unlockHint: string;
  isDefault?: boolean;
  accent: string;
  modifiers: VestmentModifiers;
}

export type ArmamentDef = WeaponDef | VestmentDef;

export const DEFAULT_WEAPON_BY_CLASS: Record<HeroClassId, string> = {
  vanguard: 'vanguard_sunforged_claymore',
  ranger: 'ranger_ashwood_recurve',
  arcanist: 'arcanist_runebound_spire',
  cleric: 'cleric_dawnstar_mace',
};

export const DEFAULT_VESTMENT_BY_CLASS: Record<HeroClassId, string> = {
  vanguard: 'vanguard_ironcrest_plate',
  ranger: 'ranger_thornwood_brigandine',
  arcanist: 'arcanist_astral_vestments',
  cleric: 'cleric_prelate_raiment',
};

export const WEAPON_CATALOG: readonly WeaponDef[] = [
  // ================= VANGUARD WEAPONS =================
  {
    id: 'vanguard_sunforged_claymore',
    slot: 'weapon',
    heroClass: 'vanguard',
    name: HERO_CLASSES.vanguard.weapon,
    rarity: 'Ascendant',
    archetype: 'Shield-Wave Bastion Greatsword',
    summary: 'Sunforged greatsword releasing golden forward shockwaves with Shield, and replacing Bulwark Dash with Bastion Counter.',
    effectLines: [
      '+10px primary cleave reach & +3% Critical Chance',
      'Sunforged Shockwave: While Shield > 0, swings release a golden cone shockwave (55% dmg, 118px)',
      `Bastion Counter (Tactical): Brace ${(ARMAMENT_TUNING.weapons.sunforged.bastionBraceMs / 1000).toFixed(1)}s (-${Math.round(ARMAMENT_TUNING.weapons.sunforged.bastionDamageReduction * 100)}% incoming dmg), then retaliate with a ${ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx}px golden cleave (${(ARMAMENT_TUNING.weapons.sunforged.bastionCooldownMs / 1000).toFixed(1)}s CD)`,
      'Restores +2 Shield when primary cleave hits a foe',
    ],
    unlockHint: 'Starter Vanguard armament',
    isDefault: true,
    accent: '#F59E0B',
    modifiers: {
      scalingAttribute: 'strength',
      damageCategory: 'physical',
      damageTypeMode: 'fixed',
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      critChanceBonus: 0.03,
      rangeBonusPx: 10,
      shieldOnPrimaryHit: 2,
      sunforgedShockwave: true,
      tacticalId: 'bastion_counter',
    },
  },
  {
    id: 'vanguard_crimson_halberd',
    slot: 'weapon',
    heroClass: 'vanguard',
    name: 'Crimson War Axe',
    rarity: 'Ascendant',
    archetype: 'Shield-Locked Berserker Great-Axe',
    summary: 'Extended-reach war axe that permanently locks all Shield gain in exchange for piercing cleaves, Bleed, and Crimson Frenzy.',
    effectLines: [
      `+10% Offensive Damage, +${ARMAMENT_TUNING.weapons.crimson.rangeBonusPx}px Reach & +${ARMAMENT_TUNING.weapons.crimson.bonusPierce} Pierce (-6% cadence); 45% Bleed (4s)`,
      'Permanent Shield Lock: While equipped, you cannot gain Shield from any source (existing Shield stays; unequipping restores Shield gain)',
      `Crimson Frenzy (Tactical): For ${(ARMAMENT_TUNING.weapons.crimson.frenzyDurationMs / 1000).toFixed(1)}s, gain +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct * 100)}% Damage, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyLifestealPct * 100)}% Lifesteal, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct * 100)}% Attack Speed & a fading +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyMoveSpeedBonusPct * 100)}% Movement Speed buff (${(ARMAMENT_TUNING.weapons.crimson.frenzyCooldownMs / 1000).toFixed(1)}s CD)`,
    ],
    unlockHint: 'Defeat Floor Bosses as Vanguard',
    accent: '#EF4444',
    modifiers: {
      scalingAttribute: 'strength',
      damageCategory: 'physical',
      damageTypeMode: 'fixed',
      damageMult: 1.1,
      attackSpeedMult: 0.94,
      bonusPierce: ARMAMENT_TUNING.weapons.crimson.bonusPierce,
      rangeBonusPx: ARMAMENT_TUNING.weapons.crimson.rangeBonusPx,
      bleedChance: 0.45,
      shieldGainLocked: true,
      tacticalId: 'crimson_frenzy',
    },
  },
  {
    id: 'vanguard_stormbreaker_flail',
    slot: 'weapon',
    heroClass: 'vanguard',
    name: 'Stormbreaker Flail & Bastion Wall',
    rarity: 'Forged',
    archetype: 'Heavy Slam War Flail',
    summary: 'Thunder-forged flail smashing downward into a localized forward Shock AoE while retaining Bulwark Dash.',
    effectLines: [
      `Heavy Slam: Downward overhead slam crushes a localized ${ARMAMENT_TUNING.weapons.stormbreaker.slamRadiusPx}px forward AoE (${Math.round(ARMAMENT_TUNING.weapons.stormbreaker.slamDamageRatio * 100)}% dmg, ${ARMAMENT_TUNING.weapons.stormbreaker.slamForwardOffsetPx}px ahead)`,
      '+5% Damage, +12% Attack Speed, +5% Crit Chance & +3 Shield on hit (retains Bulwark Dash)',
      '25% chance on primary hit to Shock foes (3.5s)',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Vanguard',
    accent: '#FBBF24',
    modifiers: {
      scalingAttribute: 'strength',
      damageCategory: 'physical',
      damageTypeMode: 'fixed',
      damageMult: 1.05,
      attackSpeedMult: 1.12,
      critChanceBonus: 0.05,
      shieldOnPrimaryHit: 3,
      shockChance: 0.25,
      heavySlamAoe: true,
    },
  },

  // ================= RANGER WEAPONS =================
  {
    id: 'ranger_ashwood_recurve',
    slot: 'weapon',
    heroClass: 'ranger',
    name: HERO_CLASSES.ranger.weapon,
    rarity: 'Forged',
    archetype: 'Precision Hunter Recurve',
    summary: 'Supple Thornwood recurve strung with barbed arrows that punish slowed or poisoned prey while retaining Frost Volley.',
    effectLines: [
      '+4% Critical Chance & +10% Arrow Velocity (retains Frost Volley)',
      'Barbed Broadheads: +15% arrow damage vs Slowed, Frozen, or Poisoned foes',
      '+5% bonus Longshot damage beyond 180u',
    ],
    unlockHint: 'Starter Ranger armament',
    isDefault: true,
    accent: '#34D399',
    modifiers: {
      scalingAttribute: 'dexterity',
      damageCategory: 'physical',
      damageTypeMode: 'fixed',
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      critChanceBonus: 0.04,
      projectileSpeedMult: 1.1,
      longshotBonusPct: 0.05,
      impairedTargetBonusPct: 0.15,
    },
  },
  {
    id: 'ranger_galewind_twinbow',
    slot: 'weapon',
    heroClass: 'ranger',
    name: 'Galewind Twinbow & Split Quiver',
    rarity: 'Ascendant',
    archetype: 'Galeburst Cyclone Twinbow',
    summary: 'Twin-limbed composite bow triggering 3-hit Galeburst wind bursts and replacing Frost Volley with Cyclone Break.',
    effectLines: [
      `Galeburst: Every ${ARMAMENT_TUNING.weapons.galewind.hitsToTrigger}rd confirmed hit on a target triggers an ${ARMAMENT_TUNING.weapons.galewind.aoeRadiusPx}px wind AoE (${Math.round(ARMAMENT_TUNING.weapons.galewind.aoeDamageRatio * 100)}% dmg) & primes Cyclone Break`,
      `Cyclone Break (Tactical): Shoot a straight Cyclone Greatarrow that drags hit foes forward and erupts into a ${ARMAMENT_TUNING.weapons.galewind.cycloneRadiusPx}px whirlwind (${(ARMAMENT_TUNING.weapons.galewind.cycloneDurationMs / 1000).toFixed(1)}s), strongly pulling enemies inward & detonating Galeburst marks (${(ARMAMENT_TUNING.weapons.galewind.cycloneCooldownMs / 1000).toFixed(1)}s CD)`,
      `+12% Arrow Velocity & +4% Crit Chance (${Math.round(ARMAMENT_TUNING.weapons.galewind.attackSpeedMult * 100)}% cadence, ${Math.round(ARMAMENT_TUNING.weapons.galewind.dexScalingMult * 100)}% DEX scaling)`,
    ],
    unlockHint: 'Defeat Floor Bosses as Ranger',
    accent: '#38BDF8',
    modifiers: {
      scalingAttribute: 'dexterity',
      damageCategory: 'physical',
      damageTypeMode: 'fixed',
      damageMult: 0.95,
      attackSpeedMult: ARMAMENT_TUNING.weapons.galewind.attackSpeedMult,
      projectileSpeedMult: 1.12,
      critChanceBonus: 0.04,
      dexScalingMult: ARMAMENT_TUNING.weapons.galewind.dexScalingMult,
      galeburstTriggerHits: ARMAMENT_TUNING.weapons.galewind.hitsToTrigger,
      galeburstRadiusPx: ARMAMENT_TUNING.weapons.galewind.aoeRadiusPx,
      galeburstDamageRatio: ARMAMENT_TUNING.weapons.galewind.aoeDamageRatio,
      tacticalId: 'cyclone_break',
    },
  },
  {
    id: 'ranger_eclipse_longbow',
    slot: 'weapon',
    heroClass: 'ranger',
    name: 'Eclipse Siege Longbow & Bodkins',
    rarity: 'Ascendant',
    archetype: 'INT-Scaled Eclipse Siege Bow',
    summary: 'Heavy arcane-sinew bow with hold-to-charge INT shots that replaces Frost Volley with Black Sun.',
    effectLines: [
      `Hold-to-Charge (${ARMAMENT_TUNING.weapons.eclipse.minChargeMs}-${ARMAMENT_TUNING.weapons.eclipse.maxChargeMs}ms): Deals ${Math.round(ARMAMENT_TUNING.weapons.eclipse.minDamageRatio * 100)}%-${Math.round(ARMAMENT_TUNING.weapons.eclipse.maxDamageRatio * 100)}% Arcane arrow damage (+2 Pierce, +6% Crit, +10% Crit Mult)`,
      `Black Sun (Tactical): Create a ${ARMAMENT_TUNING.weapons.eclipse.blackSunRadiusPx}px eclipse zone (${(ARMAMENT_TUNING.weapons.eclipse.blackSunZoneDurationMs / 1000).toFixed(1)}s) before a celestial arrow strike & explosion (${(ARMAMENT_TUNING.weapons.eclipse.blackSunCooldownMs / 1000).toFixed(1)}s CD)`,
      'Arcane Sinew: Deals Arcane damage and scales with Intelligence (INT) instead of Dexterity',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Ranger',
    accent: '#FBBF24',
    modifiers: {
      scalingAttribute: 'intelligence',
      damageCategory: 'arcane',
      damageTypeMode: 'fixed',
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      bonusPierce: 2,
      critChanceBonus: 0.06,
      critMultBonus: 0.1,
      projectileSpeedMult: 1.2,
      chargeToFire: true,
      usesIntScaling: true,
      tacticalId: 'black_sun',
    },
  },

  // ================= ARCANIST WEAPONS =================
  {
    id: 'arcanist_runebound_spire',
    slot: 'weapon',
    heroClass: 'arcanist',
    name: HERO_CLASSES.arcanist.weapon,
    rarity: 'Forged',
    archetype: 'Astral Rift Conduit',
    summary: 'Crystalline focus rod attuned with orbiting astral spheres that draw power from Star Rifts; retains Astral Nova and Scroll spells.',
    effectLines: [
      '+1 Cosmic Bolt Pierce & +3% Critical Chance',
      'Rift Resonance: +12% primary bolt damage while your Star Rift is active',
      '+15% Star Rift Zone resonance damage',
    ],
    unlockHint: 'Starter Arcanist armament',
    isDefault: true,
    accent: '#818CF8',
    modifiers: {
      scalingAttribute: 'intelligence',
      damageCategory: 'arcane',
      damageTypeMode: 'fixed',
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      critChanceBonus: 0.03,
      starRiftBonusDamagePct: 0.15,
      activeRiftBonusPct: 0.12,
    },
  },
  {
    id: 'arcanist_cinderflare_rod',
    slot: 'weapon',
    heroClass: 'arcanist',
    name: 'Cinderflare Catalyst & Ember Crown',
    rarity: 'Forged',
    archetype: 'Detonating Pyromancy Catalyst',
    summary: 'Obsidian-gold catalyst firing volatile ember bolts that erupt into fiery AoE blasts on hit; retains Astral Nova and Scroll spells.',
    effectLines: [
      '+8% Arcane Bolt Damage, +1 Pierce & +10% Crit Multiplier',
      `Ember Detonation: Confirmed hits trigger a ${ARMAMENT_TUNING.weapons.cinderflare.aoeRadiusPx}px Fire AoE blast (${Math.round(ARMAMENT_TUNING.weapons.cinderflare.aoeDamageRatio * 100)}% dmg)`,
      '35% chance on primary hit to Ignite foes (4s Burn)',
    ],
    unlockHint: 'Defeat Floor Bosses as Arcanist',
    accent: '#F97316',
    modifiers: {
      scalingAttribute: 'intelligence',
      damageCategory: 'arcane',
      damageTypeMode: 'fixed',
      damageMult: 1.08,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      critMultBonus: 0.1,
      burnChance: 0.35,
      emberSplashRadiusPx: ARMAMENT_TUNING.weapons.cinderflare.aoeRadiusPx,
      emberSplashRatio: ARMAMENT_TUNING.weapons.cinderflare.aoeDamageRatio,
    },
  },
  {
    id: 'arcanist_chronostar_scepter',
    slot: 'weapon',
    heroClass: 'arcanist',
    name: 'Chronostar Scepter & Twin Orbs',
    rarity: 'Forged',
    archetype: 'Seeking Temporal Star-Orb Scepter',
    summary: 'Celestial astrolabe scepter launching homing Star-Orbs that siphon spell cooldowns while retaining Astral Nova and Scroll spells.',
    effectLines: [
      `Seeking Star-Orb: Curves toward foes within ${ARMAMENT_TUNING.weapons.chronostar.seekingRadiusPx}px (+8% dmg, +8% cadence)`,
      `Temporal Siphon: Confirmed orb hits trim -${ARMAMENT_TUNING.weapons.chronostar.tacticalSiphonMs}ms Tactical & -${ARMAMENT_TUNING.weapons.chronostar.ultSiphonMs}ms Ultimate CD once per orb`,
      '+1 Pierce, +5% Crit Chance, 35% Chill & +25% Star Rift resonance damage',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Arcanist',
    accent: '#38BDF8',
    modifiers: {
      scalingAttribute: 'intelligence',
      damageCategory: 'arcane',
      damageTypeMode: 'fixed',
      damageMult: 1.08,
      attackSpeedMult: 1.08,
      bonusPierce: 1,
      critChanceBonus: 0.05,
      projectileSpeedMult: 1.15,
      starRiftBonusDamagePct: 0.25,
      seekingRadiusPx: ARMAMENT_TUNING.weapons.chronostar.seekingRadiusPx,
      tacticalSiphonMs: ARMAMENT_TUNING.weapons.chronostar.tacticalSiphonMs,
      ultSiphonMs: ARMAMENT_TUNING.weapons.chronostar.ultSiphonMs,
      chillChance: 0.35,
    },
  },

  // ================= CLERIC WEAPONS =================
  {
    id: 'cleric_dawnstar_mace',
    slot: 'weapon',
    heroClass: 'cleric',
    name: HERO_CLASSES.cleric.weapon,
    rarity: 'Forged',
    archetype: 'Consecrated Sanctuary Mace',
    summary: 'Flanged sun-gold mace paired with a consecrated reliquary of undead-banishing judgment; retains Sanctified Pulse.',
    effectLines: [
      '+20% Smite damage vs Undead, Cultists & Bosses',
      '+4% Critical Strike Chance (retains Sanctified Pulse)',
      'Sanctuary Judgment: Pure radiant Smite attacks without Shield mechanics',
    ],
    unlockHint: 'Starter Cleric armament',
    isDefault: true,
    accent: '#FACC15',
    modifiers: {
      scalingAttribute: 'faith',
      damageCategory: 'divine',
      damageTypeMode: 'fixed',
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      critChanceBonus: 0.04,
      undeadBossBonusPct: 0.2,
    },
  },
  {
    id: 'cleric_solaris_censer',
    slot: 'weapon',
    heroClass: 'cleric',
    name: 'Solaris War-Censer & Thurible',
    rarity: 'Forged',
    archetype: 'Mending Incense Focus',
    summary: 'Swinging emerald-gold war-censer whose confirmed hits mend the lowest-HP nearby injured ally while retaining Sanctified Pulse.',
    effectLines: [
      '+16% Healing Power, +6% Divine Damage & +1 Radiant Bolt Pierce (retains Sanctified Pulse)',
      `Incense Mending: Confirmed hits heal lowest-HP injured ally within ${ARMAMENT_TUNING.weapons.solaris.healRangePx}px (+${ARMAMENT_TUNING.weapons.solaris.allyHealBase} scaled HP, ${ARMAMENT_TUNING.weapons.solaris.procCooldownMs}ms CD)`,
      '30% chance on primary hit to Chill targets (2.5s)',
    ],
    unlockHint: 'Defeat Floor Bosses as Cleric',
    accent: '#34D399',
    modifiers: {
      scalingAttribute: 'faith',
      damageCategory: 'divine',
      damageTypeMode: 'fixed',
      damageMult: 1.06,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      healingBonusPct: 0.16,
      chillChance: 0.3,
      allyHealOnHitBase: ARMAMENT_TUNING.weapons.solaris.allyHealBase,
      allyHealOnHitRangePx: ARMAMENT_TUNING.weapons.solaris.healRangePx,
      allyHealProcCooldownMs: ARMAMENT_TUNING.weapons.solaris.procCooldownMs,
    },
  },
  {
    id: 'cleric_seraphim_crozier',
    slot: 'weapon',
    heroClass: 'cleric',
    name: 'Seraphim Judgment Crozier & Sun-Relic',
    rarity: 'Ascendant',
    archetype: 'Seraphic Burst Battle-Crozier',
    summary: 'High-choir crozier that retains steady Smite bolts while transforming your Tactical Skill into a targeted Holy Burst.',
    effectLines: [
      '+12% Divine Damage, +1 Pierce & +5% Critical Chance',
      `Seraphic Judgment (Tactical): Targeted ${ARMAMENT_TUNING.weapons.seraphim.tacticalRadiusPx}px AoE Holy Burst (${ARMAMENT_TUNING.weapons.seraphim.tacticalBaseDamage} scaled Divine dmg, no heal, ${(ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs / 1000).toFixed(1)}s CD)`,
      '+10% Healing Power & +15% Smite damage vs Undead/Bosses',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Cleric',
    accent: '#FDE047',
    modifiers: {
      scalingAttribute: 'faith',
      damageCategory: 'divine',
      damageTypeMode: 'fixed',
      damageMult: 1.12,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      critChanceBonus: 0.05,
      healingBonusPct: 0.1,
      undeadBossBonusPct: 0.15,
      seraphimTacticalBurst: true,
      tacticalId: 'seraphic_judgment',
    },
  },
];

export const WEAPON_TACTICALS: Record<WeaponTacticalId, Omit<ActiveTacticalDef, 'source' | 'weaponId' | 'weaponName'>> = {
  bastion_counter: {
    id: 'bastion_counter',
    weaponTacticalId: 'bastion_counter',
    name: 'Bastion Counter',
    shortTitle: 'Bastion Counter',
    description: `Brace ${(ARMAMENT_TUNING.weapons.sunforged.bastionBraceMs / 1000).toFixed(1)}s (-${Math.round(ARMAMENT_TUNING.weapons.sunforged.bastionDamageReduction * 100)}% dmg taken), then cleave ${ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx}px (+${Math.round(ARMAMENT_TUNING.weapons.sunforged.bastionBlockedBonusPerHitRatio * 100)}% dmg/block).`,
    cooldownMs: ARMAMENT_TUNING.weapons.sunforged.bastionCooldownMs,
    accentColor: '#FBBF24',
    secondaryColor: '#FEF08A',
    damageCategory: 'physical',
  },
  crimson_frenzy: {
    id: 'crimson_frenzy',
    weaponTacticalId: 'crimson_frenzy',
    name: 'Crimson Frenzy',
    shortTitle: 'Crimson Frenzy',
    description: `Frenzy ${(ARMAMENT_TUNING.weapons.crimson.frenzyDurationMs / 1000).toFixed(1)}s: +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct * 100)}% DMG, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyLifestealPct * 100)}% Lifesteal, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct * 100)}% Atk Spd, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyMoveSpeedBonusPct * 100)}% Move Spd. Shield gain locked.`,
    cooldownMs: ARMAMENT_TUNING.weapons.crimson.frenzyCooldownMs,
    accentColor: '#EF4444',
    secondaryColor: '#FCA5A5',
    damageCategory: 'physical',
  },
  cyclone_break: {
    id: 'cyclone_break',
    weaponTacticalId: 'cyclone_break',
    name: 'Cyclone Break',
    shortTitle: 'Cyclone Break',
    description: `Fire a dragging Greatarrow that erupts into a ${ARMAMENT_TUNING.weapons.galewind.cycloneRadiusPx}px whirlwind (${(ARMAMENT_TUNING.weapons.galewind.cycloneDurationMs / 1000).toFixed(1)}s), pulling foes and popping Galeburst marks.`,
    cooldownMs: ARMAMENT_TUNING.weapons.galewind.cycloneCooldownMs,
    accentColor: '#38BDF8',
    secondaryColor: '#6EE7B7',
    damageCategory: 'physical',
  },
  black_sun: {
    id: 'black_sun',
    weaponTacticalId: 'black_sun',
    name: 'Black Sun',
    shortTitle: 'Black Sun',
    description: `Summon a ${ARMAMENT_TUNING.weapons.eclipse.blackSunRadiusPx}px eclipse zone (${(ARMAMENT_TUNING.weapons.eclipse.blackSunZoneDurationMs / 1000).toFixed(1)}s Arcane pulses) before a celestial arrow detonates it.`,
    cooldownMs: ARMAMENT_TUNING.weapons.eclipse.blackSunCooldownMs,
    accentColor: '#A855F7',
    secondaryColor: '#FBBF24',
    damageCategory: 'arcane',
  },
  seraphic_judgment: {
    id: 'seraphic_judgment',
    weaponTacticalId: 'seraphic_judgment',
    name: 'Seraphic Judgment',
    shortTitle: 'Seraphic Judgment',
    description: `Targeted ${ARMAMENT_TUNING.weapons.seraphim.tacticalRadiusPx}px Divine AoE burst (scales with Faith, no healing).`,
    cooldownMs: ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs,
    accentColor: '#FDE047',
    secondaryColor: '#F59E0B',
    damageCategory: 'divine',
  },
};

const CLASS_DEFAULT_TACTICAL_BY_CLASS: Record<HeroClassId, ActiveTacticalDef> = {
  vanguard: {
    id: 'bulwark_dash',
    name: HERO_CLASSES.vanguard.tacticalName,
    shortTitle: 'Bulwark Dash',
    description: HERO_CLASSES.vanguard.tacticalDesc,
    cooldownMs: HERO_CLASSES.vanguard.tacticalCooldownMs,
    accentColor: '#F59E0B',
    secondaryColor: '#93C5FD',
    source: 'class',
    damageCategory: 'physical',
  },
  ranger: {
    id: 'frost_volley',
    name: HERO_CLASSES.ranger.tacticalName,
    shortTitle: 'Frost Volley',
    description: HERO_CLASSES.ranger.tacticalDesc,
    cooldownMs: HERO_CLASSES.ranger.tacticalCooldownMs,
    accentColor: '#38BDF8',
    secondaryColor: '#BAE6FD',
    source: 'class',
    damageCategory: 'frost',
  },
  arcanist: {
    id: 'astral_nova',
    name: HERO_CLASSES.arcanist.tacticalName,
    shortTitle: 'Astral Nova',
    description: HERO_CLASSES.arcanist.tacticalDesc,
    cooldownMs: HERO_CLASSES.arcanist.tacticalCooldownMs,
    accentColor: '#818CF8',
    secondaryColor: '#38BDF8',
    source: 'class',
    damageCategory: 'arcane',
  },
  cleric: {
    id: 'sanctified_pulse',
    name: HERO_CLASSES.cleric.tacticalName,
    shortTitle: 'Sanctified Pulse',
    description: HERO_CLASSES.cleric.tacticalDesc,
    cooldownMs: HERO_CLASSES.cleric.tacticalCooldownMs,
    accentColor: '#34D399',
    secondaryColor: '#FACC15',
    source: 'class',
    damageCategory: 'divine',
  },
};

/**
 * Shared Tactical System resolver:
 * 1. Arcanist Scrolls remain a separate Tactical replacement system and take precedence for Arcanist.
 * 2. Ascendant weapons with `modifiers.tacticalId` replace the class default Tactical.
 * 3. Forged (or unequipped) weapons preserve the class default Tactical.
 */
export function resolveActiveTacticalDef(
  heroClass: HeroClassId,
  equippedWeaponId?: string | null,
  equippedScrollId?: ArcanistScrollId | null
): ActiveTacticalDef {
  if (heroClass === 'arcanist' && equippedScrollId) {
    const scroll = getArcanistScrollDef(equippedScrollId);
    if (scroll) {
      return {
        id: scroll.id,
        scrollId: scroll.id,
        name: scroll.scrollName,
        shortTitle: scroll.tacticalTitle,
        description: scroll.summary,
        cooldownMs: scroll.cooldownMs,
        accentColor: scroll.accentColor,
        secondaryColor: '#E9D5FF',
        source: 'scroll',
        damageCategory: scroll.damageCategory,
      };
    }
  }

  const equippedWeapon = resolveEquippedWeaponForClass(heroClass, equippedWeaponId);
  const tacticalId =
    equippedWeapon?.modifiers.tacticalId ??
    (equippedWeapon?.modifiers.seraphimTacticalBurst ? 'seraphic_judgment' : undefined);

  if (equippedWeapon && tacticalId && WEAPON_TACTICALS[tacticalId]) {
    const def = WEAPON_TACTICALS[tacticalId];
    return {
      ...def,
      source: 'weapon',
      weaponId: equippedWeapon.id,
      weaponName: equippedWeapon.name,
    };
  }

  return {
    ...CLASS_DEFAULT_TACTICAL_BY_CLASS[heroClass],
    weaponId: equippedWeapon?.id ?? null,
    weaponName: equippedWeapon?.name ?? null,
  };
}

export function getWeaponTacticalDef(weapon?: WeaponDef | string | null): ActiveTacticalDef | null {
  const def = typeof weapon === 'string' ? getWeaponDef(weapon) : weapon;
  if (!def) return null;
  const tacticalId =
    def.modifiers.tacticalId ?? (def.modifiers.seraphimTacticalBurst ? 'seraphic_judgment' : undefined);
  if (!tacticalId || !WEAPON_TACTICALS[tacticalId]) return null;
  return {
    ...WEAPON_TACTICALS[tacticalId],
    source: 'weapon',
    weaponId: def.id,
    weaponName: def.name,
  };
}

export const VESTMENT_CATALOG: readonly VestmentDef[] = [
  // ================= VANGUARD VESTMENTS =================
  {
    id: 'vanguard_ironcrest_plate',
    slot: 'vestment',
    heroClass: 'vanguard',
    name: 'Ironcrest Bastion Plate',
    rarity: 'Standard',
    archetype: 'Linebreaker Knight Armor',
    passiveId: 'iron_will',
    passiveName: 'Iron Will',
    passiveSummary: 'Absorbs 15% of all incoming damage. Striking stunned, burned, or frozen foes restores +3 Shield.',
    summary: 'Layered bastion steel sustaining the classic Vanguard Iron Will passive and extra Shield capacity.',
    effectLines: [
      'Passive — Iron Will: -15% incoming damage; +3 Shield on hitting Stunned/Burned/Frozen foes',
      '+10 Maximum Shield Cap & +5 Starting Shield',
      '+4% Elemental Resistance',
    ],
    unlockHint: 'Starter Vanguard vestment',
    isDefault: true,
    accent: '#94A3B8',
    modifiers: {
      elementalResistBonus: 0.04,
      maxShieldBonus: 10,
      startingShieldBonus: 5,
    },
  },
  {
    id: 'vanguard_obsidian_juggernaut',
    slot: 'vestment',
    heroClass: 'vanguard',
    name: 'Obsidian Juggernaut Harness',
    rarity: 'Forged',
    archetype: 'Berserker Juggernaut Plate',
    passiveId: 'war_monger',
    passiveName: 'War Monger',
    passiveSummary: `Above 30% HP, direct hits heal ${Math.round(ARMAMENT_TUNING.passives.warMonger.aboveThresholdLifestealPct * 100)}% Lifesteal. At or below 30% HP, Lifesteal surges to 50%.`,
    summary: 'Heavy obsidian warplate trading mobility for brutal desperate Lifesteal when battered.',
    effectLines: [
      `Passive — War Monger: ${Math.round(ARMAMENT_TUNING.passives.warMonger.aboveThresholdLifestealPct * 100)}% Lifesteal above 30% HP; 50% Lifesteal at/below 30% HP (replaces Iron Will)`,
      '+25 Maximum HP & +8% Physical Resistance',
      '-5% Movement Speed',
    ],
    unlockHint: 'Defeat Floor Bosses as Vanguard',
    accent: '#CBD5E1',
    modifiers: {
      maxHpBonus: 25,
      physicalResistBonus: 0.08,
      moveSpeedMult: 0.95,
    },
  },
  {
    id: 'vanguard_aegis_sovereign_mail',
    slot: 'vestment',
    heroClass: 'vanguard',
    name: 'Sovereign Aegis Warplate',
    rarity: 'Ascendant',
    archetype: 'Thermal Furnace Warplate',
    passiveId: 'heat',
    passiveName: 'Heat',
    passiveSummary: `Confirmed Basic Attack hits build Heat (+${ARMAMENT_TUNING.passives.heat.gainPerHit}/hit up to ${ARMAMENT_TUNING.passives.heat.cap}), boosting damage up to +${Math.round(ARMAMENT_TUNING.passives.heat.maxDamageBonusPct * 100)}%. Resets after ${(ARMAMENT_TUNING.passives.heat.resetGraceMs / 1000).toFixed(1)}s without hits.`,
    summary: 'Gilded sanctum warplate stoking an escalating Heat gauge during relentless melee pressure.',
    effectLines: [
      `Passive — Heat: Basic hits build Heat (up to +${Math.round(ARMAMENT_TUNING.passives.heat.maxDamageBonusPct * 100)}% dmg); resets when idle (replaces Iron Will)`,
      '+15 Maximum HP & +5% Physical Resistance',
      '+5% Attack Speed',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Vanguard',
    accent: '#F59E0B',
    modifiers: {
      maxHpBonus: 15,
      physicalResistBonus: 0.05,
      attackSpeedBonus: 0.05,
    },
  },

  // ================= RANGER VESTMENTS =================
  {
    id: 'ranger_thornwood_brigandine',
    slot: 'vestment',
    heroClass: 'ranger',
    name: 'Thornwood Stalker Brigandine',
    rarity: 'Standard',
    archetype: 'Scout Leather & Cloak',
    passiveId: 'eagle_keenness',
    passiveName: 'Eagle Keenness',
    passiveSummary: 'Arrows hitting foes at 180u+ trigger Longshot (+25% guaranteed Crit). Kills grant +22% Haste for 2.5s.',
    summary: 'Oil-treated forest brigandine preserving classic Eagle Keenness sniping and kill-haste.',
    effectLines: [
      'Passive — Eagle Keenness: Longshot Crits at 180u+ (+25% dmg) & 2.5s Haste on kill',
      '+5% Movement Speed & +4% Elemental Resistance',
      '+5 Maximum HP',
    ],
    unlockHint: 'Starter Ranger vestment',
    isDefault: true,
    accent: '#4ADE80',
    modifiers: {
      maxHpBonus: 5,
      moveSpeedMult: 1.05,
      elementalResistBonus: 0.04,
    },
  },
  {
    id: 'ranger_windrunner_mantle',
    slot: 'vestment',
    heroClass: 'ranger',
    name: 'Windrunner Mistcloak',
    rarity: 'Forged',
    archetype: 'Gale-Charged Skirmisher Cloak',
    passiveId: 'momentum',
    passiveName: 'Momentum',
    passiveSummary: `Continuous movement builds Momentum (up to +${Math.round(ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct * 100)}% Attack Speed). Standing still or taking damage resets it.`,
    summary: 'Featherlight mistcloak converting sustained kiting movement directly into rapid bow cadence.',
    effectLines: [
      `Passive — Momentum: Moving builds up to +${Math.round(ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct * 100)}% Attack Speed; stopping or hit resets (replaces Eagle Keenness)`,
      '+10% Movement Speed & +5% Attack Speed',
      '+10 Maximum HP',
    ],
    unlockHint: 'Defeat Floor Bosses as Ranger',
    accent: '#38BDF8',
    modifiers: {
      maxHpBonus: 10,
      moveSpeedMult: 1.1,
      attackSpeedBonus: 0.05,
    },
  },
  {
    id: 'ranger_briarheart_leather',
    slot: 'vestment',
    heroClass: 'ranger',
    name: 'Briarheart Sentinel Hauberk',
    rarity: 'Ascendant',
    archetype: 'Apex Tracker Brigandine',
    passiveId: 'predators_instinct',
    passiveName: "Predator's Instinct",
    passiveSummary: `Repeated attacks against the same foe build up to ${ARMAMENT_TUNING.passives.predatorsInstinct.maxStacks} stacks (+${Math.round(ARMAMENT_TUNING.passives.predatorsInstinct.damagePerStackPct * 100)}%/stack, max +${ARMAMENT_TUNING.passives.predatorsInstinct.maxStacks * Math.round(ARMAMENT_TUNING.passives.predatorsInstinct.damagePerStackPct * 100)}%). Switching targets or stopping resets.`,
    summary: 'Briar-woven sentinel leather locking focus onto a single quarry until brought down.',
    effectLines: [
      `Passive — Predator's Instinct: Focusing one target stacks up to +${ARMAMENT_TUNING.passives.predatorsInstinct.maxStacks * Math.round(ARMAMENT_TUNING.passives.predatorsInstinct.damagePerStackPct * 100)}% damage (replaces Eagle Keenness)`,
      '+20 Maximum HP & +6% Physical Resistance',
      '+5% Critical Strike Chance',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Ranger',
    accent: '#10B981',
    modifiers: {
      maxHpBonus: 20,
      physicalResistBonus: 0.06,
      critChanceBonus: 0.05,
    },
  },

  // ================= ARCANIST VESTMENTS =================
  {
    id: 'arcanist_astral_vestments',
    slot: 'vestment',
    heroClass: 'arcanist',
    name: 'Spireweaver Astral Vestments',
    rarity: 'Standard',
    archetype: 'Runed Scholar Robes',
    passiveId: 'astral_resonance',
    passiveName: 'Astral Resonance',
    passiveSummary: 'Every 4th cosmic bolt unleashes a pulsing Star Rift zone (8s CD) dealing continuous AoE Arcane damage.',
    summary: 'Indigo vestments threaded with silver astrolabe wire channeling classic Astral Resonance rifts.',
    effectLines: [
      'Passive — Astral Resonance: Every 4th Basic Attack summons a pulsing Star Rift',
      '+5% Elemental Resistance & +3% Cooldown Reduction',
      '+5 Maximum HP',
    ],
    unlockHint: 'Starter Arcanist vestment',
    isDefault: true,
    accent: '#818CF8',
    modifiers: {
      maxHpBonus: 5,
      elementalResistBonus: 0.05,
      cdrBonus: 0.03,
    },
  },
  {
    id: 'arcanist_chronomancer_shroud',
    slot: 'vestment',
    heroClass: 'arcanist',
    name: 'Chronomancer Silk Shroud',
    rarity: 'Forged',
    archetype: 'Temporal Conduit Robes',
    passiveId: 'temporal_acceleration',
    passiveName: 'Temporal Acceleration',
    passiveSummary: `Basic hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.tacticalReductionPerBasicHitMs}ms Tactical CD; Tactical hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.ultReductionPerTacticalHitMs}ms Ultimate CD.`,
    summary: 'Quicksilver-lined shroud cycling Scrolls and Chrono Wells at blinding speed.',
    effectLines: [
      `Passive — Temporal Acceleration: Basic hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.tacticalReductionPerBasicHitMs}ms Tactical & Tactical hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.ultReductionPerTacticalHitMs}ms Ult CD (replaces Astral Resonance)`,
      '+8% Cooldown Reduction & +5% Movement Speed',
      '+10 Maximum HP',
    ],
    unlockHint: 'Defeat Floor Bosses as Arcanist',
    accent: '#38BDF8',
    modifiers: {
      maxHpBonus: 10,
      cdrBonus: 0.08,
      moveSpeedMult: 1.05,
    },
  },
  {
    id: 'arcanist_voidward_robes',
    slot: 'vestment',
    heroClass: 'arcanist',
    name: 'Voidward Battlemage Robes',
    rarity: 'Ascendant',
    archetype: 'Void-Empowered Battle Robes',
    passiveId: 'void_consumption',
    passiveName: 'Void Consumption',
    passiveSummary: `Basic hits build Void Energy (+${ARMAMENT_TUNING.passives.voidConsumption.gainPerHit}/${ARMAMENT_TUNING.passives.voidConsumption.cap}). At max Energy, your next Tactical/Scroll consumes it for +${Math.round(ARMAMENT_TUNING.passives.voidConsumption.empoweredTacticalBonusPct * 100)}% damage.`,
    summary: 'Runic void-cloth storing raw eldritch charge to overcharge your next Tactical or Scroll cast.',
    effectLines: [
      `Passive — Void Consumption: Basic hits fill Void Energy to empower next Tactical/Scroll by +${Math.round(ARMAMENT_TUNING.passives.voidConsumption.empoweredTacticalBonusPct * 100)}% (replaces Astral Resonance)`,
      '+25 Maximum HP & +8% Elemental Resistance',
      '+5% Cooldown Reduction',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Arcanist',
    accent: '#A855F7',
    modifiers: {
      maxHpBonus: 25,
      elementalResistBonus: 0.08,
      cdrBonus: 0.05,
    },
  },

  // ================= CLERIC VESTMENTS =================
  {
    id: 'cleric_prelate_raiment',
    slot: 'vestment',
    heroClass: 'cleric',
    name: 'Sunbrand Prelate Raiment',
    rarity: 'Standard',
    archetype: 'Consecrated Choir Vestments',
    passiveId: 'radiant_aura',
    passiveName: 'Radiant Aura',
    passiveSummary: 'Pulses healing light every 2.0s to nearby allies and revives fallen allies 40% faster.',
    summary: 'Gold-embroidered vestments channeling classic Radiant Aura party sustenance.',
    effectLines: [
      'Passive — Radiant Aura: 2.0s party healing pulse & +40% Ally Revive Speed',
      '+5% Healing Power & +3% Physical Resistance',
      '+5 Maximum HP',
    ],
    unlockHint: 'Starter Cleric vestment',
    isDefault: true,
    accent: '#FACC15',
    modifiers: {
      maxHpBonus: 5,
      auraHealBonusPct: 0.05,
      physicalResistBonus: 0.03,
    },
  },
  {
    id: 'cleric_martyr_surplice',
    slot: 'vestment',
    heroClass: 'cleric',
    name: 'Hallowed Martyr Surplice',
    rarity: 'Forged',
    archetype: 'Lifewell Reservoir Vestments',
    passiveId: 'shared_grace',
    passiveName: 'Shared Grace',
    passiveSummary: `Stores ${Math.round(ARMAMENT_TUNING.passives.sharedGrace.storePct * 100)}% of effective ally healing as Grace (cap ${ARMAMENT_TUNING.passives.sharedGrace.maxCap}). Automatically heals allies dropping below ${Math.round(ARMAMENT_TUNING.passives.sharedGrace.triggerHpRatio * 100)}% HP.`,
    summary: 'Sunlit surplice banking overflow devotion to rescue injured allies the moment danger strikes.',
    effectLines: [
      `Passive — Shared Grace: Stores ${Math.round(ARMAMENT_TUNING.passives.sharedGrace.storePct * 100)}% ally healing (cap ${ARMAMENT_TUNING.passives.sharedGrace.maxCap}) & auto-mends injured allies (replaces Radiant Aura)`,
      '+15% Healing Power & +5% Cooldown Reduction',
      '+15 Maximum HP',
    ],
    unlockHint: 'Defeat Floor Bosses as Cleric',
    accent: '#34D399',
    modifiers: {
      maxHpBonus: 15,
      auraHealBonusPct: 0.15,
      cdrBonus: 0.05,
    },
  },
  {
    id: 'cleric_templar_cassock',
    slot: 'vestment',
    heroClass: 'cleric',
    name: 'Arch-Templar Sanctum Plate',
    rarity: 'Ascendant',
    archetype: 'Sanctified Battle-Plate',
    passiveId: 'sacred_retribution',
    passiveName: 'Sacred Retribution',
    passiveSummary: `Ally heals build Sanctity (+${ARMAMENT_TUNING.passives.sacredRetribution.sanctityPerHeal}/${ARMAMENT_TUNING.passives.sacredRetribution.cap}). At max Sanctity, your next Basic Attack emits a holy shockwave damaging enemies & healing allies.`,
    summary: 'Sacred steel-lined plate converting battlefield triage into punishing holy shockwaves.',
    effectLines: [
      `Passive — Sacred Retribution: Ally heals build Sanctity; at ${ARMAMENT_TUNING.passives.sacredRetribution.cap}, next Basic Attack triggers Holy Shockwave (replaces Radiant Aura)`,
      '+25 Maximum HP & +8% Physical Resistance',
      '+8% Elemental Resistance',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Cleric',
    accent: '#FDE047',
    modifiers: {
      maxHpBonus: 25,
      physicalResistBonus: 0.08,
      elementalResistBonus: 0.08,
    },
  },
];

export const WEAPONS_BY_ID: ReadonlyMap<string, WeaponDef> = new Map(
  WEAPON_CATALOG.map((w) => [w.id, w])
);

export const VESTMENTS_BY_ID: ReadonlyMap<string, VestmentDef> = new Map(
  VESTMENT_CATALOG.map((v) => [v.id, v])
);

export function getDefaultWeaponIdForClass(heroClass: HeroClassId): string {
  return DEFAULT_WEAPON_BY_CLASS[heroClass] || DEFAULT_WEAPON_BY_CLASS.vanguard;
}

export function getDefaultVestmentIdForClass(heroClass: HeroClassId): string {
  return DEFAULT_VESTMENT_BY_CLASS[heroClass] || DEFAULT_VESTMENT_BY_CLASS.vanguard;
}

export function getWeaponDef(weaponId?: string | null): WeaponDef | null {
  if (!weaponId || typeof weaponId !== 'string') return null;
  return WEAPONS_BY_ID.get(weaponId) ?? null;
}

export function getVestmentDef(vestmentId?: string | null): VestmentDef | null {
  if (!vestmentId || typeof vestmentId !== 'string') return null;
  return VESTMENTS_BY_ID.get(vestmentId) ?? null;
}

export function getArmamentDef(slot: ArmamentSlot, itemId?: string | null): ArmamentDef | null {
  return slot === 'weapon' ? getWeaponDef(itemId) : getVestmentDef(itemId);
}

/**
 * Resolves a character's equipped Weapon ONLY if it exists AND matches their active HeroClassId.
 * An explicit `null` means unequipped. `undefined` on runtime PlayerState also resolves to null.
 */
export function resolveEquippedWeaponForClass(
  heroClass: HeroClassId,
  weaponId?: string | null
): WeaponDef | null {
  const def = getWeaponDef(weaponId);
  if (!def || def.heroClass !== heroClass) return null;
  return def;
}

export function resolveEquippedVestmentForClass(
  heroClass: HeroClassId,
  vestmentId?: string | null
): VestmentDef | null {
  const def = getVestmentDef(vestmentId);
  if (!def || def.heroClass !== heroClass) return null;
  return def;
}

/**
 * Resolves the active class passive from the currently equipped Vestment.
 * Only the equipped Vestment's passive runs; if no valid class Vestment is equipped,
 * falls back to that class's default Vestment passive rather than leaving the player passive-less.
 */
export function resolveActiveVestmentPassive(
  heroClass: HeroClassId,
  vestmentId?: string | null
): VestmentPassiveId {
  const equipped = resolveEquippedVestmentForClass(heroClass, vestmentId);
  if (equipped) return equipped.passiveId;
  const fallback = getVestmentDef(getDefaultVestmentIdForClass(heroClass));
  return fallback?.passiveId ?? 'iron_will';
}

export function getClassDefaultScalingAttribute(heroClass: HeroClassId): ScalingAttribute {
  switch (heroClass) {
    case 'ranger':
      return 'dexterity';
    case 'arcanist':
      return 'intelligence';
    case 'cleric':
      return 'faith';
    case 'vanguard':
    default:
      return 'strength';
  }
}

export function getClassDefaultDamageCategory(heroClass: HeroClassId): DamageCategory {
  if (heroClass === 'arcanist') return 'arcane';
  if (heroClass === 'cleric') return 'divine';
  return 'physical';
}

export function getAttributeLabel(
  attr: ScalingAttribute
): 'Strength' | 'Dexterity' | 'Intelligence' | 'Faith' {
  switch (attr) {
    case 'dexterity':
      return 'Dexterity';
    case 'intelligence':
      return 'Intelligence';
    case 'faith':
      return 'Faith';
    case 'strength':
    default:
      return 'Strength';
  }
}

export function getAttributeShortLabel(attr: ScalingAttribute): 'STR' | 'DEX' | 'INT' | 'FTH' {
  switch (attr) {
    case 'dexterity':
      return 'DEX';
    case 'intelligence':
      return 'INT';
    case 'faith':
      return 'FTH';
    case 'strength':
    default:
      return 'STR';
  }
}

export function getPlayerAttributeValue(
  stats: {
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    faith?: number;
  },
  attr: ScalingAttribute
): number {
  switch (attr) {
    case 'dexterity':
      return Math.max(0, stats.dexterity || 0);
    case 'intelligence':
      return Math.max(0, stats.intelligence || 0);
    case 'faith':
      return Math.max(0, stats.faith || 0);
    case 'strength':
    default:
      return Math.max(0, stats.strength || 0);
  }
}

export function resolveWeaponDamageCategory(
  defaultCategory: DamageCategory,
  mode: DamageTypeMode,
  stats?: { strength?: number; intelligence?: number }
): DamageCategory {
  if (mode === 'adaptive') {
    const str = Math.max(0, stats?.strength || 0);
    const intStat = Math.max(0, stats?.intelligence || 0);
    if (str > intStat) return 'physical';
    if (intStat > str) return 'arcane';
    return defaultCategory;
  }
  return defaultCategory;
}

export interface ResolvedWeaponCombatProfile {
  weaponDef: WeaponDef | null;
  modifiers: WeaponModifiers;
  scalingAttribute: ScalingAttribute;
  scalingAttributeLabel: 'Strength' | 'Dexterity' | 'Intelligence' | 'Faith';
  scalingAttributeShort: 'STR' | 'DEX' | 'INT' | 'FTH';
  defaultDamageCategory: DamageCategory;
  damageTypeMode: DamageTypeMode;
  damageCategory: DamageCategory;
  isAdaptive: boolean;
  rawAttributeValue: number;
  attributeScalingMult: number;
  effectiveAttributeValue: number;
}

/**
 * Single source of truth for resolving a weapon's scaling attribute, damage category,
 * and adaptive damage mode independently of class defaults.
 */
export function resolveWeaponCombatProfile(
  heroClass: HeroClassId,
  weaponInput?: string | WeaponDef | null,
  stats?: {
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    faith?: number;
  }
): ResolvedWeaponCombatProfile {
  const weaponDef =
    weaponInput && typeof weaponInput === 'object'
      ? weaponInput.heroClass === heroClass
        ? weaponInput
        : null
      : resolveEquippedWeaponForClass(heroClass, weaponInput);

  const modifiers: WeaponModifiers = weaponDef?.modifiers || {};
  const scalingAttribute: ScalingAttribute =
    modifiers.scalingAttribute ??
    (modifiers.usesIntScaling ? 'intelligence' : getClassDefaultScalingAttribute(heroClass));
  const defaultDamageCategory: DamageCategory =
    modifiers.damageCategory ?? getClassDefaultDamageCategory(heroClass);
  const damageTypeMode: DamageTypeMode = modifiers.damageTypeMode ?? 'fixed';
  const damageCategory = resolveWeaponDamageCategory(defaultDamageCategory, damageTypeMode, stats);
  const rawAttributeValue = getPlayerAttributeValue(stats || {}, scalingAttribute);
  const attributeScalingMult =
    scalingAttribute === 'dexterity' && modifiers.dexScalingMult !== undefined
      ? modifiers.dexScalingMult
      : 1.0;

  return {
    weaponDef,
    modifiers,
    scalingAttribute,
    scalingAttributeLabel: getAttributeLabel(scalingAttribute),
    scalingAttributeShort: getAttributeShortLabel(scalingAttribute),
    defaultDamageCategory,
    damageTypeMode,
    damageCategory,
    isAdaptive: damageTypeMode === 'adaptive',
    rawAttributeValue,
    attributeScalingMult,
    effectiveAttributeValue: rawAttributeValue * attributeScalingMult,
  };
}

export function getClassWeapons(heroClass: HeroClassId): WeaponDef[] {
  return WEAPON_CATALOG.filter((w) => w.heroClass === heroClass);
}

export function getClassVestments(heroClass: HeroClassId): VestmentDef[] {
  return VESTMENT_CATALOG.filter((v) => v.heroClass === heroClass);
}

export function parseArmamentIdArray(raw: unknown, slot: ArmamentSlot): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const def = slot === 'weapon' ? WEAPONS_BY_ID.get(entry) : VESTMENTS_BY_ID.get(entry);
    if (def && !seen.has(entry)) {
      seen.add(entry);
      valid.push(entry);
    }
  }
  return valid;
}

export interface SanitizedArmamentLoadout {
  ownedWeapons: string[];
  ownedVestments: string[];
  equippedWeapon: string | null;
  equippedVestment: string | null;
}

/**
 * Normalizes and validates an account's permanent armaments:
 * - Strips unknown/tampered item IDs
 * - Guarantees the class default Weapon & Vestment are owned
 * - Enforces ownership + class restriction on equipped items
 * - Ensures a Vestment is always equipped (restoring class default if null/missing) so passive replacement never leaves a player without a passive.
 */
export function normalizeArmamentLoadout(
  heroClass: HeroClassId,
  input?: {
    ownedWeapons?: unknown;
    ownedVestments?: unknown;
    equippedWeapon?: string | null;
    equippedVestment?: string | null;
  },
  forceEquipDefaultsIfEmpty = false
): SanitizedArmamentLoadout {
  const defaultWeapon = getDefaultWeaponIdForClass(heroClass);
  const defaultVestment = getDefaultVestmentIdForClass(heroClass);

  const ownedWeapons = parseArmamentIdArray(input?.ownedWeapons, 'weapon');
  if (!ownedWeapons.includes(defaultWeapon)) {
    ownedWeapons.unshift(defaultWeapon);
  }

  const ownedVestments = parseArmamentIdArray(input?.ownedVestments, 'vestment');
  if (!ownedVestments.includes(defaultVestment)) {
    ownedVestments.unshift(defaultVestment);
  }

  let equippedWeapon: string | null;
  if (input?.equippedWeapon === undefined) {
    equippedWeapon = defaultWeapon;
  } else if (input.equippedWeapon === null) {
    equippedWeapon = forceEquipDefaultsIfEmpty ? defaultWeapon : null;
  } else {
    const def = resolveEquippedWeaponForClass(heroClass, input.equippedWeapon);
    if (def && ownedWeapons.includes(def.id)) {
      equippedWeapon = def.id;
    } else {
      equippedWeapon = defaultWeapon;
    }
  }

  let equippedVestment: string | null;
  if (input?.equippedVestment === undefined || input.equippedVestment === null) {
    equippedVestment = defaultVestment;
  } else {
    const def = resolveEquippedVestmentForClass(heroClass, input.equippedVestment);
    if (def && ownedVestments.includes(def.id)) {
      equippedVestment = def.id;
    } else {
      equippedVestment = defaultVestment;
    }
  }

  return {
    ownedWeapons,
    ownedVestments,
    equippedWeapon,
    equippedVestment,
  };
}

/**
 * Safely migrates and normalizes an AccountRecord without overwriting existing progression or relics.
 */
export function applyAccountArmamentMigration(
  acc: AccountRecord,
  isFirstTimeMigration = false
): boolean {
  const heroClass: HeroClassId = HERO_CLASSES[acc.lockedClass]
    ? acc.lockedClass
    : HERO_CLASSES[acc.preferredClass]
      ? acc.preferredClass
      : 'vanguard';

  const forceDefaults =
    isFirstTimeMigration &&
    acc.equippedWeapon === undefined &&
    acc.equippedVestment === undefined;

  const beforeW = JSON.stringify(acc.ownedWeapons || []);
  const beforeV = JSON.stringify(acc.ownedVestments || []);
  const beforeEqW = acc.equippedWeapon;
  const beforeEqV = acc.equippedVestment;

  const normalized = normalizeArmamentLoadout(
    heroClass,
    {
      ownedWeapons: acc.ownedWeapons,
      ownedVestments: acc.ownedVestments,
      equippedWeapon: acc.equippedWeapon,
      equippedVestment: acc.equippedVestment,
    },
    forceDefaults
  );

  acc.ownedWeapons = normalized.ownedWeapons;
  acc.ownedVestments = normalized.ownedVestments;
  acc.equippedWeapon = normalized.equippedWeapon;
  acc.equippedVestment = normalized.equippedVestment;

  return (
    JSON.stringify(acc.ownedWeapons) !== beforeW ||
    JSON.stringify(acc.ownedVestments) !== beforeV ||
    acc.equippedWeapon !== beforeEqW ||
    acc.equippedVestment !== beforeEqV
  );
}

/**
 * Picks the next unowned class Weapon or Vestment for a boss clear discovery drop.
 * Floors 1-2 favor Forged armaments; Floors 3+ unlock Forged & Ascendant armaments.
 */
export function pickNextUnlockableArmamentForClass(
  heroClass: HeroClassId,
  ownedWeapons: readonly string[],
  ownedVestments: readonly string[],
  floor: number
): ArmamentDef | null {
  const classItems: ArmamentDef[] = [
    ...WEAPON_CATALOG.filter((w) => w.heroClass === heroClass && !w.isDefault),
    ...VESTMENT_CATALOG.filter((v) => v.heroClass === heroClass && !v.isDefault),
  ];

  const unowned = classItems.filter((item) =>
    item.slot === 'weapon'
      ? !ownedWeapons.includes(item.id)
      : !ownedVestments.includes(item.id)
  );
  if (unowned.length === 0) return null;

  const forgedPool = unowned.filter((i) => i.rarity === 'Forged');
  const pool = floor < 3 && forgedPool.length > 0 ? forgedPool : unowned;
  return pool[Math.floor(Math.random() * pool.length)] ?? unowned[0];
}

export const PRIMARY_COMBO_RESET_WINDOW_MS = 1400;

export function getWeaponComboStepCount(
  _heroClass: HeroClassId,
  _equippedWeapon: string | null | undefined
): number {
  return 3;
}

export function getWeaponSwingDurationMs(
  heroClass: HeroClassId,
  equippedWeapon: string | null | undefined,
  comboStep: number,
  swingKind: 'primary' | 'tactical' | 'ult'
): number {
  if (swingKind === 'ult') return 330;
  if (swingKind === 'tactical') return 285;
  const resolved =
    equippedWeapon === null
      ? null
      : (equippedWeapon === undefined
          ? DEFAULT_WEAPON_BY_CLASS[heroClass]
          : resolveEquippedWeaponForClass(heroClass, equippedWeapon)?.id ?? null);
  const step = ((comboStep % 3) + 3) % 3;
  switch (resolved) {
    case 'vanguard_sunforged_claymore':
      return step === 2 ? 265 : 225;
    case 'vanguard_crimson_halberd':
      return step === 2 ? 255 : 215;
    case 'vanguard_stormbreaker_flail':
      return step === 2 ? 255 : 210;
    case 'ranger_ashwood_recurve':
      return step === 2 ? 220 : 195;
    case 'ranger_galewind_twinbow':
      return step === 2 ? 205 : 180;
    case 'ranger_eclipse_longbow':
      return step === 2 ? 245 : 215;
    case 'arcanist_runebound_spire':
      return step === 2 ? 235 : 205;
    case 'arcanist_cinderflare_rod':
      return step === 2 ? 235 : 200;
    case 'arcanist_chronostar_scepter':
      return step === 2 ? 230 : 195;
    case 'cleric_dawnstar_mace':
      return step === 2 ? 250 : 215;
    case 'cleric_solaris_censer':
      return step === 2 ? 240 : 210;
    case 'cleric_seraphim_crozier':
      return step === 2 ? 255 : 220;
    default:
      return step === 2 ? 225 : 195;
  }
}

