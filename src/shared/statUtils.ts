import {
  HERO_CLASSES,
  MAX_LEVEL,
  type DamageCategory,
  type DamageTypeMode,
  type HeroClassId,
  type PlayerState,
  type ScalingAttribute,
} from './types.ts';
import { computeArcanistSpellDamage, getArcanistScrollDef } from './arcanist.ts';
import { computePlayerMoveSpeed } from './playerMovement.ts';
import {
  ARMAMENT_TUNING,
  resolveActiveTacticalDef,
  resolveActiveVestmentPassive,
  resolveEquippedVestmentForClass,
  resolveWeaponCombatProfile,
} from './armaments.ts';
import {
  computeEclipseChargeProfile,
  computePlayerAttackCooldownMs,
  computePlayerCcTenacity,
  computePlayerCdrBreakdown,
  computePlayerCritChance,
  computePlayerCritMultiplier,
  computePlayerDamageMultiplier,
  computePlayerDotMultiplier,
  computePlayerHealingMultiplier,
  computePlayerHpRegenPerTick,
  computePlayerMaxHp,
  computePlayerPierceCount,
  computePlayerResistances,
  countFloorBlessingStacks,
  isShieldGainLocked,
} from './combatMechanics.ts';

export type StatRankTier = 'D' | 'C' | 'B' | 'A' | 'S' | 'S+';

export interface StatRankBadge {
  tier: StatRankTier;
  label: string;
  color: string;
  score: number;
}

export function scoreToStatRank(rawScore: number): StatRankBadge {
  const score = Math.max(0, Math.round(rawScore));
  if (score >= 90) return { tier: 'S+', label: 'S+-RANK', color: '#EC4899', score };
  if (score >= 78) return { tier: 'S', label: 'S-RANK', color: '#F59E0B', score };
  if (score >= 62) return { tier: 'A', label: 'A-RANK', color: '#A855F7', score };
  if (score >= 44) return { tier: 'B', label: 'B-RANK', color: '#3B82F6', score };
  if (score >= 30) return { tier: 'C', label: 'C-RANK', color: '#10B981', score };
  return { tier: 'D', label: 'D-RANK', color: '#94A3B8', score };
}

export interface PlayerStatProjections {
  // Survivability & Health
  maxHp: number;
  effectiveHp: number;
  baseHp: number;
  levelHpBonus: number;
  vitHpBonus: number;
  relicHpBonus: number;
  hpRegenPerTick: number; // every 2.0s pulse
  hpRegenPerSec: number;
  healingPerSec: number; // Projected HP/s from class healing kit + regen + relics
  selfShieldPerSec: number; // Projected shield/s (Vanguard Bulwark Dash & Iron Will)

  // Defenses & Mitigations
  physicalResistPct: number; // e.g. 38.5%
  basePhysicalResistPct: number;
  strPhysicalResistPct: number;
  relicPhysicalResistPct: number;
  vanguardIronWillPct: number; // 15%

  elementalResistPct: number; // e.g. 24.5%
  baseElementalResistPct: number;
  intElementalResistPct: number;
  relicElementalResistPct: number;

  faithCcTenacityPct: number; // e.g. 15.0% debuff reduction

  // Offense & DPS
  primaryCategory: DamageCategory;
  scalingAttribute: ScalingAttribute;
  damageTypeMode: DamageTypeMode;
  isAdaptiveDamage: boolean;
  primaryStatName: 'Strength' | 'Dexterity' | 'Intelligence' | 'Faith';
  primaryStatValue: number;
  dexScalingMult: number;
  primaryStatDamageBonusPct: number;
  damageMultiplier: number; // e.g. 2.45
  healingMultiplier: number; // Cleric Level & Faith healing multiplier (1.0 for non-Cleric)
  healingBonusPct: number;
  baseHitDamage: number;
  scaledHitDamage: number; // Damage per non-crit hit (full draw for charged weapons)
  unchargedHitDamage: number; // Tap/uncharged hit damage (differs for charged weapons)
  isChargedWeapon: boolean;
  chargeTimeMs: number;
  effectiveAttackCycleMs: number;
  longshotHitDamage: number; // Ranger Eagle Keenness hit damage (180u+)
  longshotBonusPct: number;

  // Attack Speed & Cadence
  baseAttackCooldownMs: number;
  attackCooldownMs: number; // Recovery cooldown between attacks
  attacksPerSecond: number; // e.g. 3.42 attacks/sec (accounts for draw time on charged weapons)
  dexSpeedBonusPct: number;

  // Critical Strike Stats
  critChancePct: number; // e.g. 34.0%
  baseCritChancePct: number;
  dexCritChancePct: number;
  relicCritChancePct: number;
  critMultiplier: number; // 1.25x+
  critHitDamage: number; // Scaled damage when hit crits

  // Sustained DPS Projection
  directDps: number; // Direct attack & crit/twinstring DPS before DoTs
  sustainedDps: number; // Primary direct DPS + active DoT relics (preserved baseline)
  tacticalAbilityDps: number; // Sustained DPS from [Q/RMB] Tactical Skill or equipped Scroll
  passiveCombatDps: number; // Class passive DPS (Ranger Longshot/Quarry, Arcanist Star Rift)
  effectiveDps: number; // True class combat DPS (Direct + Tactical/Scroll + Passive + DoTs + Relic procs)
  activeTacticalLabel: string;
  activeTacticalHitDamage: number;
  tacticalBaseCooldownMs: number;

  // Hybrid DoT Scaling & Relic Projections
  dotMultiplier: number; // 1 + 0.003 * (Level - 1) + 0.001 * WeaponPrimaryAttr
  dotBonusPct: number; // e.g. 19.7% bonus DoT damage
  hasBurnRelic: boolean;
  hasPoisonRelic: boolean;
  hasBleedRelic: boolean;
  burnTickDamage: number; // per 0.65s tick (0-res baseline)
  poisonTickDamage: number; // per 0.65s tick (0-res baseline)
  bleedTickDamage: number; // stationary per 0.65s tick
  bleedMovingTickDamage: number; // moving per 0.65s tick
  dotDpsContribution: number; // combined active relic DoT DPS per second

  // Utility & CDR
  moveSpeedPx: number; // e.g. 242 px/s
  moveSpeedBonusPct: number;
  cooldownReductionPct: number; // e.g. 15.0%
  tacticalCooldownSec: number;
  ultCooldownSec: number;

  // Piercing & Multi-projectile
  pierceCount: number;
  extraProjectileCount: number;

  // Reassessed D–S+ Performance Ranks
  offenseRank: StatRankBadge;
  defenseRank: StatRankBadge;
  utilityRank: StatRankBadge;
  overallRank: StatRankBadge;
}

export function calculatePlayerStatProjections(p: PlayerState, floor = 1): PlayerStatProjections {
  const heroClass: HeroClassId = p.heroClass || 'vanguard';
  const def = HERO_CLASSES[heroClass] || HERO_CLASSES.vanguard;
  const level = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
  const safeFloor = Math.max(1, floor || 1);
  const vit = Math.max(0, p.vitality || 0);
  const dex = Math.max(0, p.dexterity || 0);
  const intStat = Math.max(0, p.intelligence || 0);
  const relics = p.relics || [];
  const furyStacks = countFloorBlessingStacks(p.floorBlessings, 'fury');

  const weaponProfile = resolveWeaponCombatProfile(heroClass, p.equippedWeapon, p);
  const weaponMods = weaponProfile.modifiers;
  const vestmentMods = p.equippedVestment
    ? resolveEquippedVestmentForClass(heroClass, p.equippedVestment)?.modifiers
    : undefined;

  // 1. Health
  const baseHp = def.maxHp;
  const levelHpBonus = (level - 1) * 12;
  const vitHpBonus = vit * 5;
  const relicHpBonus =
    (relics.includes('bastion_pauldron') ? 30 : 0) + (vestmentMods?.maxHpBonus || 0);
  const maxHp = computePlayerMaxHp(heroClass, level, vit, relics, p.equippedVestment);

  // Combat HP Regen (pulse every 2.0s for vit >= 6 + Vestment regen)
  const hpRegenPerTick = computePlayerHpRegenPerTick(heroClass, vit, p.equippedVestment);
  const hpRegenPerSec = hpRegenPerTick / 2.0;

  // 2. Physical Armor & Elemental Mitigation (shared single source of truth)
  const resBreakdown = computePlayerResistances(p);
  const basePhysicalResistPct = resBreakdown.basePhysical * 100;
  const strPhysicalResistPct = resBreakdown.strPhysical * 100;
  const relicPhysicalResistPct = resBreakdown.relicPhysical * 100;
  const physicalResistPct = Number((resBreakdown.physicalTotal * 100).toFixed(1));

  const activePassive = resolveActiveVestmentPassive(heroClass, p.equippedVestment);
  const vanguardIronWillPct = activePassive === 'iron_will' ? 15 : 0;

  const baseElementalResistPct = Number((resBreakdown.baseElemental * 100).toFixed(1));
  const intElementalResistPct = resBreakdown.intElemental * 100;
  const relicElementalResistPct = resBreakdown.relicElemental * 100;
  const elementalResistPct = Number((resBreakdown.elementalTotal * 100).toFixed(1));

  // 3. Faith + Vestment Crowd Control Tenacity
  const faithCcTenacityPct = Number((computePlayerCcTenacity(p) * 100).toFixed(1));

  // 4. Offense: Weapon-Resolved Category, Scaling Attribute & Damage Multiplier
  const primaryCategory: DamageCategory = weaponProfile.damageCategory;
  const scalingAttribute: ScalingAttribute = weaponProfile.scalingAttribute;
  const damageTypeMode: DamageTypeMode = weaponProfile.damageTypeMode;
  const isAdaptiveDamage = weaponProfile.isAdaptive;
  const primaryStatName = weaponProfile.scalingAttributeLabel;
  const primaryStatValue = weaponProfile.rawAttributeValue;
  const dexScalingMult = weaponProfile.attributeScalingMult;
  const primaryStatDamageBonusPct = Number(
    (weaponProfile.effectiveAttributeValue * 0.8).toFixed(1)
  );

  const rawDamageMultiplier = computePlayerDamageMultiplier(p, primaryCategory, {
    isPrimaryAttack: true,
    weaponDef: weaponProfile.weaponDef,
  });

  const rawHealingMult = computePlayerHealingMultiplier({
    heroClass,
    level,
    faith: p.faith,
    equippedWeapon: p.equippedWeapon,
    equippedVestment: p.equippedVestment,
  });
  const healingMultiplier = Number(rawHealingMult.toFixed(2));
  const healingBonusPct = Number(((rawHealingMult - 1) * 100).toFixed(1));

  const baseHitDamage = def.damage;
  const isChargedWeapon = Boolean(weaponMods.chargeToFire);
  const eclipseFull = isChargedWeapon
    ? computeEclipseChargeProfile(ARMAMENT_TUNING.weapons.eclipse.maxChargeMs)
    : null;
  const eclipseMin = isChargedWeapon ? computeEclipseChargeProfile(0) : null;
  const chargeTimeMs = isChargedWeapon ? ARMAMENT_TUNING.weapons.eclipse.maxChargeMs : 0;

  const scaledHitDamage = isChargedWeapon
    ? Math.max(1, Math.round(baseHitDamage * rawDamageMultiplier * eclipseFull!.damageRatio))
    : Math.max(1, Math.round(baseHitDamage * rawDamageMultiplier));
  const unchargedHitDamage = isChargedWeapon
    ? Math.max(1, Math.round(baseHitDamage * rawDamageMultiplier * eclipseMin!.damageRatio))
    : scaledHitDamage;

  const hasEagleKeenness = heroClass === 'ranger' && activePassive === 'eagle_keenness';
  const rawLongshotBonus = hasEagleKeenness ? 0.25 + (weaponMods.longshotBonusPct || 0) : 0;
  const longshotBonusPct = Math.round(rawLongshotBonus * 100);
  const longshotHitDamage = hasEagleKeenness
    ? Math.round(scaledHitDamage * (1 + rawLongshotBonus))
    : 0;

  // 5. Attack Speed & Cadence (accounts for draw time on charged weapons)
  const baseAttackCooldownMs = def.attackCooldownMs;
  const dexSpeedBonusPct = Number((dex * 0.4).toFixed(1));
  const attackCooldownMs = computePlayerAttackCooldownMs(p, weaponProfile.weaponDef);
  const effectiveAttackCycleMs = attackCooldownMs + chargeTimeMs;
  const attacksPerSecond = Number((1000 / effectiveAttackCycleMs).toFixed(2));

  // 6. Critical Strike
  const baseCritChancePct = 10.0;
  const dexCritChancePct = Number((dex * 0.3).toFixed(1));
  const relicCritChancePct = Number(
    (
      (relics.includes('keen_arrowhead') ? 20.0 : 0.0) +
      ((weaponMods.critChanceBonus || 0) + (vestmentMods?.critChanceBonus || 0)) * 100
    ).toFixed(1)
  );
  const rawCritChance = computePlayerCritChance(p, weaponMods);
  const critChancePct = Number((rawCritChance * 100).toFixed(1));
  const rawCritMultiplier = computePlayerCritMultiplier(p, weaponMods);
  const critMultiplier = Number(rawCritMultiplier.toFixed(2));
  const critHitDamage = isChargedWeapon
    ? Math.max(
        1,
        Math.round(baseHitDamage * rawDamageMultiplier * rawCritMultiplier * eclipseFull!.damageRatio)
      )
    : Math.round(scaledHitDamage * rawCritMultiplier);

  // 7. Hybrid DoT Scaling & Relic Projections (matches GameRoom.computeDotMultiplier)
  const rawDotMult = computePlayerDotMultiplier(p, {
    sourceKind: 'weapon',
    weaponDef: weaponProfile.weaponDef,
  });
  const dotMultiplier = Number(rawDotMult.toFixed(3));
  const dotBonusPct = Number(((rawDotMult - 1) * 100).toFixed(1));
  const hasBurnRelic = relics.includes('cinder_heart');
  const hasPoisonRelic = relics.includes('viper_crucible');
  const hasBleedRelic = relics.includes('bloodletter_talisman');

  const burnTickDamage = Math.max(1, Math.round((7 + safeFloor) * rawDotMult));
  const poisonTickDamage = Math.max(1, Math.round((5 + safeFloor) * rawDotMult));
  const bleedTickDamage = Math.max(1, Math.round((7 + safeFloor) * rawDotMult));
  const bleedMovingTickDamage = Math.max(1, Math.round((14 + safeFloor) * rawDotMult));

  const rawDotDps =
    (hasBurnRelic ? burnTickDamage / 0.65 : 0) +
    (hasPoisonRelic ? poisonTickDamage / 0.65 : 0) +
    (hasBleedRelic ? bleedTickDamage / 0.65 : 0);
  const dotDpsContribution = Number(rawDotDps.toFixed(1));

  // 8. Primary Sustained DPS Projection
  const extraProjectileFactor = relics.includes('twinstring_charm') ? 0.35 : 0;
  const galeburstFactor =
    weaponMods.galeburstTriggerHits && weaponMods.galeburstDamageRatio
      ? weaponMods.galeburstDamageRatio / weaponMods.galeburstTriggerHits
      : 0;
  const critRatio = critChancePct / 100;
  const avgDamagePerHit = scaledHitDamage * (1 - critRatio) + critHitDamage * critRatio;
  const totalPerShotDmg = avgDamagePerHit * (1 + extraProjectileFactor + galeburstFactor);
  const rawDirectDps = totalPerShotDmg * attacksPerSecond;
  const directDps = Number(rawDirectDps.toFixed(1));
  const sustainedDps = Number((rawDirectDps + rawDotDps).toFixed(1));

  // 9. Mobility & Cooldown Reduction (matches computePlayerMoveSpeed & GameRoom CDR cap)
  const moveSpeedPx = Math.round(
    computePlayerMoveSpeed({
      heroClass,
      dexterity: dex,
      relics,
      hasteMs: p.hasteMs,
      speedBoost: p.speedBoost,
      floorBlessings: p.floorBlessings,
      statuses: p.statuses,
      equippedVestment: p.equippedVestment,
    })
  );
  const moveSpeedBonusPct = Number((((moveSpeedPx - def.speed) / def.speed) * 100).toFixed(1));

  const cdr = computePlayerCdrBreakdown(p);
  const cooldownReductionPct = Number((cdr.totalCdr * 100).toFixed(1));
  const cdrFactor = cdr.cdrFactor;

  const activeScroll = heroClass === 'arcanist' ? getArcanistScrollDef(p.equippedScrollId) : null;
  const activeTactical = resolveActiveTacticalDef(
    heroClass,
    p.equippedWeapon,
    p.equippedScrollId
  );
  const tacticalBaseCooldownMs = activeTactical.cooldownMs;
  const tacticalCooldownSec = Number(((tacticalBaseCooldownMs * cdrFactor) / 1000).toFixed(1));
  const ultCooldownSec = Number(((def.ultCooldownMs * cdrFactor) / 1000).toFixed(1));
  const safeTacCdSec = Math.max(0.5, tacticalCooldownSec);
  const safeUltCdSec = Math.max(1.0, ultCooldownSec);

  // 10. Piercing (matches GameRoom primary attack pierce)
  const pierceCount = computePlayerPierceCount(p, weaponMods);
  const extraProjectileCount = relics.includes('twinstring_charm') ? 1 : 0;

  // 11. Class-Accurate Tactical/Scroll, Passive & Effective Combat Output
  const tacticalCategory = activeTactical.damageCategory;
  const tacticalDamageMult = computePlayerDamageMultiplier(p, tacticalCategory, {
    isPrimaryAttack: false,
    weaponDef: weaponProfile.weaponDef,
  });

  let activeTacticalLabel =
    activeTactical.source === 'scroll' ? activeTactical.name : activeTactical.shortTitle;
  let activeTacticalHitDamage = Math.round(32 * tacticalDamageMult);
  let rawTacticalAbilityDps = 0;

  if (heroClass === 'arcanist' && activeScroll) {
    activeTacticalLabel = activeScroll.scrollName;
    const spellHit = computeArcanistSpellDamage(
      activeScroll.baseDamage,
      { level, intelligence: intStat, relics, furyStacks },
      activeScroll.intCoeff
    );
    activeTacticalHitDamage = spellHit;
    if (activeScroll.id === 'fireball') {
      const burnTicks = Math.floor(
        (activeScroll.durationMs || 3500) / (activeScroll.hitIntervalMs || 500)
      );
      const burnTickDmg = Math.max(1, Math.round(spellHit * (activeScroll.burnTickRatio || 0.22)));
      rawTacticalAbilityDps = (spellHit + burnTicks * burnTickDmg) / safeTacCdSec;
    } else if (activeScroll.id === 'disintegration') {
      const channelDurationSec = 3.0;
      const ticks = channelDurationSec * (1000 / (activeScroll.tickIntervalMs || 200));
      rawTacticalAbilityDps = (spellHit * ticks) / (safeTacCdSec + channelDurationSec);
    } else if (activeScroll.id === 'arcane_orb') {
      rawTacticalAbilityDps = (spellHit * (activeScroll.maxHitsPerEnemy || 2)) / safeTacCdSec;
    } else if (activeScroll.id === 'arcane_barrage') {
      rawTacticalAbilityDps = (spellHit * 3.5) / safeTacCdSec;
    } else {
      rawTacticalAbilityDps = spellHit / safeTacCdSec;
    }
  } else if (activeTactical.id === 'bastion_counter') {
    activeTacticalHitDamage = Math.round(
      ARMAMENT_TUNING.weapons.sunforged.bastionCleaveBaseDamage * tacticalDamageMult
    );
    rawTacticalAbilityDps = activeTacticalHitDamage / safeTacCdSec;
  } else if (activeTactical.id === 'crimson_frenzy') {
    activeTacticalHitDamage = 0;
    const frenzyUptime = Math.min(
      1,
      ARMAMENT_TUNING.weapons.crimson.frenzyDurationMs / 1000 / safeTacCdSec
    );
    const dmgBoost = ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct;
    const spdBoost = ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct;
    rawTacticalAbilityDps =
      rawDirectDps * ((1 + dmgBoost) * (1 + spdBoost) - 1) * frenzyUptime;
  } else if (activeTactical.id === 'cyclone_break') {
    const gCfg = ARMAMENT_TUNING.weapons.galewind;
    const tickDmg = Math.round(gCfg.cycloneTickBaseDamage * tacticalDamageMult);
    const detDmg = Math.round(gCfg.cycloneDetonationBaseDamage * tacticalDamageMult);
    activeTacticalHitDamage = detDmg;
    rawTacticalAbilityDps = (tickDmg * 6 + detDmg) / safeTacCdSec;
  } else if (activeTactical.id === 'black_sun') {
    const eCfg = ARMAMENT_TUNING.weapons.eclipse;
    const tickDmg = Math.round(eCfg.blackSunTickBaseDamage * tacticalDamageMult);
    const strikeDmg = Math.round(eCfg.blackSunStrikeBaseDamage * tacticalDamageMult);
    activeTacticalHitDamage = strikeDmg;
    rawTacticalAbilityDps = (tickDmg * 4 + strikeDmg) / safeTacCdSec;
  } else if (activeTactical.id === 'seraphic_judgment') {
    activeTacticalLabel = 'Seraphic Judgment';
    activeTacticalHitDamage = Math.round(
      ARMAMENT_TUNING.weapons.seraphim.tacticalBaseDamage * tacticalDamageMult
    );
    rawTacticalAbilityDps = activeTacticalHitDamage / safeTacCdSec;
  } else if (heroClass === 'arcanist') {
    activeTacticalLabel = def.tacticalName;
    activeTacticalHitDamage = Math.round(24 * tacticalDamageMult);
    rawTacticalAbilityDps = (activeTacticalHitDamage * 2.5) / safeTacCdSec;
  } else if (heroClass === 'vanguard') {
    activeTacticalLabel = def.tacticalName;
    activeTacticalHitDamage = Math.round(32 * tacticalDamageMult);
    rawTacticalAbilityDps = activeTacticalHitDamage / safeTacCdSec;
  } else if (heroClass === 'ranger') {
    activeTacticalLabel = def.tacticalName;
    activeTacticalHitDamage = Math.round(18 * tacticalDamageMult);
    rawTacticalAbilityDps = (activeTacticalHitDamage * 2.5) / safeTacCdSec;
  } else {
    activeTacticalLabel = def.tacticalName;
    activeTacticalHitDamage = Math.round(28 * tacticalDamageMult);
    rawTacticalAbilityDps = activeTacticalHitDamage / safeTacCdSec;
  }

  let rawPassiveCombatDps = 0;
  if (heroClass === 'ranger') {
    const quarryUptime = Math.min(0.65, 6.5 / safeUltCdSec) * 0.75;
    const longshotUptimeFactor = rawLongshotBonus * 0.6;
    rawPassiveCombatDps = rawDirectDps * (longshotUptimeFactor + 0.35 * quarryUptime);
  } else if (activePassive === 'astral_resonance') {
    const riftTickDmg = Math.round(
      (14 + safeFloor * 2) * (1 + (weaponMods.starRiftBonusDamagePct || 0))
    );
    const riftCycleSec = 8.0 + 4.0 / Math.max(0.5, attacksPerSecond);
    rawPassiveCombatDps = (riftTickDmg * 6) / riftCycleSec;
  }

  const stormcallerBonusDps = relics.includes('stormcaller_lodestone') ? rawDirectDps * 0.08 : 0;
  const tacticalAbilityDps = Number(rawTacticalAbilityDps.toFixed(1));
  const passiveCombatDps = Number(rawPassiveCombatDps.toFixed(1));
  const effectiveDps = Number(
    (
      rawDirectDps +
      rawDotDps +
      rawTacticalAbilityDps +
      rawPassiveCombatDps +
      stormcallerBonusDps
    ).toFixed(1)
  );

  // 12. Effective HP, Healing & Shield Sustain
  const weightedMit = 0.6 * (physicalResistPct / 100) + 0.4 * (elementalResistPct / 100);
  const damageTakenMult =
    (1 - weightedMit) *
    (activePassive === 'iron_will' ? 0.85 : 1.0) *
    (vestmentMods?.damageTakenMult ?? 1.0);
  const effectiveHp = Math.round(maxHp / Math.max(0.18, damageTakenMult));

  const shieldLocked = isShieldGainLocked(p);
  const hasBulwarkDash = activeTactical.id === 'bulwark_dash';
  const selfShieldPerSec = shieldLocked
    ? 0
    : Number(
        (
          (hasBulwarkDash ? 28 / safeTacCdSec : 0) +
          (activePassive === 'iron_will' ? 0.8 : 0) +
          (heroClass === 'vanguard'
            ? (weaponMods.shieldOnPrimaryHit || 0) * attacksPerSecond * 0.6
            : 0)
        ).toFixed(1)
      );
  const censerHealPerSec = relics.includes('oathbound_censer') ? 8 / safeTacCdSec : 0;
  const solarisProcCdSec = Math.max(
    0.05,
    (weaponMods.allyHealProcCooldownMs ?? ARMAMENT_TUNING.weapons.solaris.procCooldownMs) / 1000
  );
  const solarisProcsPerSec = Math.min(attacksPerSecond, 1 / solarisProcCdSec);
  const solarisOnHitHealPerSec =
    weaponMods.allyHealOnHitBase && heroClass === 'cleric'
      ? Math.max(1, Math.round(weaponMods.allyHealOnHitBase * rawHealingMult)) *
        solarisProcsPerSec *
        0.75
      : 0;
  const isSeraphimTactical = activeTactical.id === 'seraphic_judgment';
  const clericKitHealPerSec =
    heroClass === 'cleric'
      ? (activePassive === 'radiant_aura' ? Math.max(1, Math.round(2.3 * rawHealingMult)) / 2.0 : 0) +
        (!isSeraphimTactical ? Math.max(1, Math.round(24 * rawHealingMult)) / safeTacCdSec : 0) +
        (Math.max(1, Math.round(4 * rawHealingMult)) * 10) / safeUltCdSec
      : 0;
  const healingPerSec = Number(
    (hpRegenPerSec + censerHealPerSec + solarisOnHitHealPerSec + clericKitHealPerSec).toFixed(1)
  );

  // 13. Performance Ranks
  const hasFrostfireSynergy = relics.includes('cinder_heart') && relics.includes('rimefrost_shard');
  const hasStormVenomSynergy =
    relics.includes('stormcaller_lodestone') && relics.includes('viper_crucible');
  const hasThornedFortressSynergy =
    relics.includes('runic_carapace') && relics.includes('thorned_aegis');
  const hasTwinPierceSynergy =
    relics.includes('twinstring_charm') && relics.includes('piercing_prism');

  const offenseSynergyBonus =
    (hasFrostfireSynergy ? 5 : 0) +
    (hasStormVenomSynergy ? 5 : 0) +
    (hasTwinPierceSynergy ? 5 : 0);
  let aoeOffenseMult = 1.0;
  if (heroClass === 'arcanist') {
    aoeOffenseMult = activeScroll ? 1.16 : 1.08;
  } else if (heroClass === 'vanguard') {
    aoeOffenseMult = 1.06;
  } else if (pierceCount >= 2 || extraProjectileCount > 0) {
    aoeOffenseMult = 1.04;
  }

  const offenseScore = Math.min(
    115,
    100 * Math.pow(Math.max(1, effectiveDps * aoeOffenseMult) / 780, 0.62) + offenseSynergyBonus
  );

  const defPower = effectiveHp + (hpRegenPerSec + selfShieldPerSec * 0.85) * 16;
  const defenseScore = Math.min(
    115,
    100 * Math.pow(Math.max(1, defPower) / 2450, 0.56) + (hasThornedFortressSynergy ? 4 : 0)
  );

  const healUtilityCap = heroClass === 'cleric' ? 62 : 24;
  const healUtilityScale = heroClass === 'cleric' ? 2.8 : 1.9;
  const sustainContribution = Math.min(
    healUtilityCap,
    (healingPerSec + selfShieldPerSec * 0.75) * healUtilityScale
  );
  const cdrContribution = cooldownReductionPct * 0.85;
  const speedContribution = Math.min(20, Math.max(0, moveSpeedBonusPct) * 0.65);

  let kitAndRelicUtility = 10;
  if (heroClass === 'cleric') {
    kitAndRelicUtility =
      14 +
      Math.min(18, faithCcTenacityPct * 0.55) +
      (relics.includes('oathbound_censer') ? 10 : 0) +
      (relics.includes('hourglass_shard') ? 6 : 0);
  } else if (heroClass === 'vanguard') {
    kitAndRelicUtility =
      12 +
      Math.min(12, Math.max(0, pierceCount - 1) * 2.5) +
      (relics.includes('thorned_aegis') ? 8 : 0) +
      (hasThornedFortressSynergy ? 8 : 0);
  } else if (heroClass === 'arcanist') {
    kitAndRelicUtility =
      10 +
      (activeScroll ? 18 : 6) +
      Math.min(12, Math.max(0, pierceCount - 1) * 4) +
      (relics.includes('rimefrost_shard') ? 8 : 0) +
      (relics.includes('stormcaller_lodestone') ? 6 : 0);
  } else {
    kitAndRelicUtility =
      14 +
      extraProjectileCount * 12 +
      Math.min(12, Math.max(0, pierceCount - 1) * 5) +
      (relics.includes('rimefrost_shard') ? 8 : 0) +
      (hasTwinPierceSynergy ? 8 : 0);
  }

  const utilityScore = Math.min(
    115,
    sustainContribution + cdrContribution + speedContribution + kitAndRelicUtility
  );

  const weights =
    heroClass === 'vanguard'
      ? { off: 0.36, def: 0.44, util: 0.2 }
      : heroClass === 'cleric'
        ? { off: 0.24, def: 0.28, util: 0.48 }
        : heroClass === 'arcanist'
          ? { off: 0.65, def: 0.12, util: 0.23 }
          : { off: 0.62, def: 0.16, util: 0.22 };

  const overallScore =
    offenseScore * weights.off + defenseScore * weights.def + utilityScore * weights.util;

  const offenseRank = scoreToStatRank(offenseScore);
  const defenseRank = scoreToStatRank(defenseScore);
  const utilityRank = scoreToStatRank(utilityScore);
  const overallRank = scoreToStatRank(overallScore);

  return {
    maxHp,
    effectiveHp,
    baseHp,
    levelHpBonus,
    vitHpBonus,
    relicHpBonus,
    hpRegenPerTick,
    hpRegenPerSec,
    healingPerSec,
    selfShieldPerSec,
    physicalResistPct,
    basePhysicalResistPct,
    strPhysicalResistPct,
    relicPhysicalResistPct,
    vanguardIronWillPct,
    elementalResistPct,
    baseElementalResistPct,
    intElementalResistPct,
    relicElementalResistPct,
    faithCcTenacityPct,
    primaryCategory,
    scalingAttribute,
    damageTypeMode,
    isAdaptiveDamage,
    primaryStatName,
    primaryStatValue,
    dexScalingMult,
    primaryStatDamageBonusPct,
    damageMultiplier: Number(rawDamageMultiplier.toFixed(2)),
    healingMultiplier,
    healingBonusPct,
    baseHitDamage,
    scaledHitDamage,
    unchargedHitDamage,
    isChargedWeapon,
    chargeTimeMs,
    effectiveAttackCycleMs,
    longshotHitDamage,
    longshotBonusPct,
    baseAttackCooldownMs,
    attackCooldownMs,
    attacksPerSecond,
    dexSpeedBonusPct,
    critChancePct,
    baseCritChancePct,
    dexCritChancePct,
    relicCritChancePct,
    critMultiplier,
    critHitDamage,
    directDps,
    sustainedDps,
    tacticalAbilityDps,
    passiveCombatDps,
    effectiveDps,
    activeTacticalLabel,
    activeTacticalHitDamage,
    tacticalBaseCooldownMs,
    dotMultiplier,
    dotBonusPct,
    hasBurnRelic,
    hasPoisonRelic,
    hasBleedRelic,
    burnTickDamage,
    poisonTickDamage,
    bleedTickDamage,
    bleedMovingTickDamage,
    dotDpsContribution,
    moveSpeedPx,
    moveSpeedBonusPct,
    cooldownReductionPct,
    tacticalCooldownSec,
    ultCooldownSec,
    pierceCount,
    extraProjectileCount,
    offenseRank,
    defenseRank,
    utilityRank,
    overallRank,
  };
}

export interface RelicSynergyCombo {
  id: string;
  name: string;
  relicIds: [string, string];
  description: string;
  accent: string;
}

export const RELIC_SYNERGIES: RelicSynergyCombo[] = [
  {
    id: 'frostfire_shatter',
    name: 'Frostfire Shatter',
    relicIds: ['cinder_heart', 'rimefrost_shard'],
    description: 'Chilled & Ignited enemies take +30% shatter burst damage when frozen.',
    accent: '#38BDF8',
  },
  {
    id: 'storm_venom',
    name: 'Storm Venom Conduit',
    relicIds: ['stormcaller_lodestone', 'viper_crucible'],
    description: 'Poisoned enemies arc lightning shockwaves to 2 additional targets.',
    accent: '#22C55E',
  },
  {
    id: 'thorned_carapace',
    name: 'Thorned Iron Fortress',
    relicIds: ['runic_carapace', 'thorned_aegis'],
    description: 'Entering a new room discharges a retaliatory concussive stun wave.',
    accent: '#A855F7',
  },
  {
    id: 'twin_pierce',
    name: 'Twin-Shaft Cataclysm',
    relicIds: ['twinstring_charm', 'piercing_prism'],
    description: 'Both primary projectiles pierce through all targets without damage reduction.',
    accent: '#E0A94F',
  },
];
