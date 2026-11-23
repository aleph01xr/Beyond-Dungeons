import {
  CRIT_DAMAGE_MULTIPLIER,
  HERO_CLASSES,
  MAX_LEVEL,
  type DamageCategory,
  type EnemyResistances,
  type FloorBlessingId,
  type HeroClassId,
  type PlayerStatusEffect,
} from './types.ts';
import {
  ARMAMENT_TUNING,
  getClassDefaultScalingAttribute,
  getPlayerAttributeValue,
  resolveActiveVestmentPassive,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
  resolveWeaponCombatProfile,
  type WeaponDef,
  type WeaponModifiers,
} from './armaments.ts';

export interface CombatPlayerSubject {
  heroClass: HeroClassId;
  level?: number;
  strength?: number;
  vitality?: number;
  dexterity?: number;
  intelligence?: number;
  faith?: number;
  relics?: string[];
  floorBlessings?: FloorBlessingId[];
  statuses?: PlayerStatusEffect[];
  hasteMs?: number;
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
  vanguardHeat?: number;
  rangerMomentum?: number;
  crimsonFrenzyMs?: number;
}

export interface EclipseChargeProfile {
  clampedHoldMs: number;
  chargeT: number;
  damageRatio: number;
  projSpeedMult: number;
}

export function computeEclipseChargeProfile(holdDurationMs: number): EclipseChargeProfile {
  const cfg = ARMAMENT_TUNING.weapons.eclipse;
  const clampedHoldMs = Math.max(0, Math.min(cfg.maxChargeMs, holdDurationMs));
  const chargeT =
    clampedHoldMs <= cfg.minChargeMs
      ? 0
      : (clampedHoldMs - cfg.minChargeMs) / Math.max(1, cfg.maxChargeMs - cfg.minChargeMs);
  const damageRatio = cfg.minDamageRatio + chargeT * (cfg.maxDamageRatio - cfg.minDamageRatio);
  const projSpeedMult =
    cfg.minProjSpeedMult + chargeT * (cfg.maxProjSpeedMult - cfg.minProjSpeedMult);
  return { clampedHoldMs, chargeT, damageRatio, projSpeedMult };
}

export function countFloorBlessingStacks(
  floorBlessings: FloorBlessingId[] | undefined,
  kind: FloorBlessingId
): number {
  if (!floorBlessings || floorBlessings.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < floorBlessings.length; i++) {
    if (floorBlessings[i] === kind) count++;
  }
  return count;
}

export function resolveEnemyResistance(
  res: EnemyResistances | undefined,
  category: DamageCategory
): number {
  if (!res) return 0;
  let rawRes = 0;
  switch (category) {
    case 'physical':
      rawRes = res.physical ?? 0;
      break;
    case 'arcane':
      rawRes = res.arcane ?? ((res.fire ?? 0) + (res.frost ?? 0) + (res.lightning ?? 0)) / 3;
      break;
    case 'divine':
      rawRes = res.divine ?? ((res.fire ?? 0) + (res.lightning ?? 0)) / 2;
      break;
    case 'fire':
      rawRes = res.fire ?? 0;
      break;
    case 'frost':
      rawRes = res.frost ?? 0;
      break;
    case 'lightning':
      rawRes = res.lightning ?? 0;
      break;
    case 'poison':
      rawRes = res.poison ?? 0;
      break;
    case 'bleed':
      rawRes = res.bleed ?? 0;
      break;
    default:
      rawRes = res.physical ?? 0;
      break;
  }
  return Number(Math.min(0.75, Math.max(-0.5, rawRes)).toFixed(6));
}

export function computePlayerMaxHp(
  heroClass: HeroClassId,
  level: number,
  vitality: number,
  relics: string[] = [],
  equippedVestment?: string | null
): number {
  const def = HERO_CLASSES[heroClass];
  const baseHp = def ? def.maxHp : 100;
  const clampedLvl = Math.max(1, Math.min(MAX_LEVEL, level || 1));
  const levelBonus = (clampedLvl - 1) * 12;
  const vitBonus = Math.max(0, vitality || 0) * 5;
  const relicBonus = relics.includes('bastion_pauldron') ? 30 : 0;
  const vestmentBonus =
    resolveEquippedVestmentForClass(heroClass, equippedVestment)?.modifiers.maxHpBonus || 0;
  return baseHp + levelBonus + vitBonus + relicBonus + vestmentBonus;
}

export function computePlayerHpRegenPerTick(
  heroClass: HeroClassId,
  vitality: number,
  equippedVestment?: string | null
): number {
  const vit = Math.max(0, vitality || 0);
  const vitRegen = vit >= 6 ? Math.max(1, Math.floor(vit * 0.1)) : 0;
  const vestmentRegen =
    resolveEquippedVestmentForClass(heroClass, equippedVestment)?.modifiers.hpRegenPerTickBonus ||
    0;
  return vitRegen + vestmentRegen;
}

export function computePlayerHealingMultiplier(
  healer?: {
    heroClass?: HeroClassId;
    level?: number;
    faith?: number;
    equippedWeapon?: string | null;
    equippedVestment?: string | null;
  } | null
): number {
  if (!healer || healer.heroClass !== 'cleric') return 1.0;
  const lvl = Math.max(1, Math.min(MAX_LEVEL, healer.level || 1));
  const fth = Math.max(0, healer.faith || 0);
  const levelMult = 1 + (lvl - 1) * 0.015;
  const faithMult = 1 + fth * 0.006;
  const weaponHealBonus =
    resolveEquippedWeaponForClass('cleric', healer.equippedWeapon)?.modifiers.healingBonusPct || 0;
  const vestmentHealBonus =
    resolveEquippedVestmentForClass('cleric', healer.equippedVestment)?.modifiers
      .auraHealBonusPct || 0;
  return levelMult * faithMult * (1 + weaponHealBonus + vestmentHealBonus);
}

export function computePlayerHealingAmount(
  baseHealing: number,
  healer?: {
    heroClass?: HeroClassId;
    level?: number;
    faith?: number;
    equippedWeapon?: string | null;
    equippedVestment?: string | null;
  } | null,
  target?: { statuses?: PlayerStatusEffect[] } | null
): number {
  if (baseHealing <= 0) return 0;
  let healing = baseHealing * computePlayerHealingMultiplier(healer);
  if (target && target.statuses && target.statuses.some((s) => s.type === 'ashen_curse')) {
    healing *= 0.55;
  }
  return Math.max(1, Math.round(healing));
}

export function isShieldGainLocked(
  p?: Pick<CombatPlayerSubject, 'heroClass' | 'equippedWeapon'> | null
): boolean {
  if (!p) return false;
  return Boolean(
    resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers.shieldGainLocked
  );
}

export function isCrimsonFrenzyActive(
  p?: Pick<CombatPlayerSubject, 'heroClass' | 'equippedWeapon' | 'crimsonFrenzyMs'> | null
): boolean {
  if (!p || !(p.crimsonFrenzyMs && p.crimsonFrenzyMs > 0)) return false;
  return (
    resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers.tacticalId ===
    'crimson_frenzy'
  );
}

export function computePlayerMaxShieldCap(
  p: Pick<CombatPlayerSubject, 'heroClass' | 'equippedVestment' | 'floorBlessings'>
): number {
  const vestmentBonus =
    p.heroClass === 'vanguard'
      ? resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers
          .maxShieldBonus || 0
      : 0;
  return 60 + countFloorBlessingStacks(p.floorBlessings, 'bastion') * 15 + vestmentBonus;
}

export function computePlayerStartingShield(
  p: Pick<CombatPlayerSubject, 'heroClass' | 'equippedWeapon' | 'equippedVestment' | 'floorBlessings'>
): number {
  if (isShieldGainLocked(p)) return 0;
  const startShieldBonus =
    p.heroClass === 'vanguard'
      ? resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers
          .startingShieldBonus || 0
      : 0;
  return Math.min(computePlayerMaxShieldCap(p), 15 + startShieldBonus);
}

export function computePlayerCritChance(
  p: Pick<CombatPlayerSubject, 'heroClass' | 'dexterity' | 'relics' | 'equippedWeapon' | 'equippedVestment'>,
  weaponModsOverride?: WeaponModifiers
): number {
  const wMods =
    weaponModsOverride ??
    resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
  const vMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
  const relics = p.relics || [];
  return Math.min(
    0.45,
    0.1 +
      Math.max(0, p.dexterity || 0) * 0.003 +
      (relics.includes('keen_arrowhead') ? 0.2 : 0) +
      (wMods?.critChanceBonus || 0) +
      (vMods?.critChanceBonus || 0)
  );
}

export function computePlayerCritMultiplier(
  p: Pick<CombatPlayerSubject, 'heroClass' | 'equippedWeapon'>,
  weaponModsOverride?: WeaponModifiers
): number {
  const wMods =
    weaponModsOverride ??
    resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
  return CRIT_DAMAGE_MULTIPLIER + (wMods?.critMultBonus || 0);
}

export function computePlayerAttackSpeedMult(
  p: Pick<
    CombatPlayerSubject,
    | 'heroClass'
    | 'dexterity'
    | 'floorBlessings'
    | 'equippedWeapon'
    | 'equippedVestment'
    | 'rangerMomentum'
    | 'crimsonFrenzyMs'
  >,
  weaponDefOverride?: WeaponDef | null
): number {
  const swiftStacks = countFloorBlessingStacks(p.floorBlessings, 'swiftness');
  const dexSpeedMult = (1 + Math.max(0, p.dexterity || 0) * 0.004) * (1 + swiftStacks * 0.08);
  const wDef =
    weaponDefOverride !== undefined
      ? weaponDefOverride
      : resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
  const weaponAttackSpeedMult = wDef?.modifiers.attackSpeedMult ?? 1.0;
  const vestmentAttackSpeedBonus =
    resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.attackSpeedBonus ||
    0;
  const momentumBonus =
    resolveActiveVestmentPassive(p.heroClass, p.equippedVestment) === 'momentum' &&
    (p.rangerMomentum || 0) > 0
      ? (Math.min(ARMAMENT_TUNING.passives.momentum.cap, p.rangerMomentum || 0) /
          ARMAMENT_TUNING.passives.momentum.cap) *
        ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct
      : 0;
  const crimsonFrenzyBonus = isCrimsonFrenzyActive(p)
    ? ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct
    : 0;
  return (
    dexSpeedMult *
    weaponAttackSpeedMult *
    (1 + vestmentAttackSpeedBonus + momentumBonus + crimsonFrenzyBonus)
  );
}

export function computePlayerAttackCooldownMs(
  p: Pick<
    CombatPlayerSubject,
    | 'heroClass'
    | 'dexterity'
    | 'floorBlessings'
    | 'equippedWeapon'
    | 'equippedVestment'
    | 'rangerMomentum'
    | 'crimsonFrenzyMs'
    | 'hasteMs'
    | 'statuses'
  >,
  weaponDefOverride?: WeaponDef | null
): number {
  const baseAttackCooldownMs = HERO_CLASSES[p.heroClass]?.attackCooldownMs || 400;
  const atkSpeedMult = computePlayerAttackSpeedMult(p, weaponDefOverride);
  let hasteFactor = ((p.hasteMs || 0) > 0 ? 0.8 : 1) / atkSpeedMult;
  if (p.statuses && p.statuses.some((s) => s.type === 'frostbite')) {
    hasteFactor *= 1.25;
  }
  return Math.max(100, Math.round(baseAttackCooldownMs * hasteFactor));
}

export function computePlayerCdrBreakdown(
  p: Pick<
    CombatPlayerSubject,
    'heroClass' | 'intelligence' | 'relics' | 'floorBlessings' | 'equippedVestment'
  >
): {
  intCdr: number;
  relicCdr: number;
  blessingCdr: number;
  vestmentCdr: number;
  totalCdr: number;
  cdrFactor: number;
} {
  const relics = p.relics || [];
  const intCdr = Math.min(0.2, Math.max(0, p.intelligence || 0) * 0.002);
  const relicCdr = relics.includes('hourglass_shard') ? 0.25 : 0;
  const blessingCdr = countFloorBlessingStacks(p.floorBlessings, 'swiftness') * 0.08;
  const vestmentCdr =
    resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.cdrBonus || 0;
  const totalCdr = Math.min(0.5, intCdr + relicCdr + blessingCdr + vestmentCdr);
  return {
    intCdr,
    relicCdr,
    blessingCdr,
    vestmentCdr,
    totalCdr,
    cdrFactor: Math.max(0.5, 1 - totalCdr),
  };
}

export function computePlayerCdrMult(
  p: Pick<
    CombatPlayerSubject,
    'heroClass' | 'intelligence' | 'relics' | 'floorBlessings' | 'equippedVestment'
  >
): number {
  return computePlayerCdrBreakdown(p).cdrFactor;
}

export function computePlayerResistances(
  p: Pick<
    CombatPlayerSubject,
    'heroClass' | 'strength' | 'intelligence' | 'relics' | 'floorBlessings' | 'equippedVestment'
  >
): {
  basePhysical: number;
  strPhysical: number;
  relicPhysical: number;
  physicalTotal: number;
  baseElemental: number;
  intElemental: number;
  relicElemental: number;
  elementalTotal: number;
  bastionBonus: number;
} {
  const def = HERO_CLASSES[p.heroClass];
  const res = def?.resistances || {
    physical: 0,
    fire: 0,
    frost: 0,
    lightning: 0,
    poison: 0,
    bleed: 0,
  };
  const relics = p.relics || [];
  const vestmentMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
  const bastionBonus = countFloorBlessingStacks(p.floorBlessings, 'bastion') * 0.06;

  const basePhysical = res.physical || 0;
  const strPhysical = Math.min(0.15, Math.max(0, p.strength || 0) * 0.0015);
  const relicPhysical =
    (vestmentMods?.physicalResistBonus || 0) +
    (relics.includes('runic_carapace') ? 0.15 : 0) +
    (relics.includes('thorned_aegis') ? 0.1 : 0);
  const physicalTotal = Math.min(
    0.75,
    Math.max(0, basePhysical + strPhysical + relicPhysical + bastionBonus)
  );

  const baseElemental = ((res.fire || 0) + (res.frost || 0) + (res.lightning || 0)) / 3;
  const intElemental = Math.min(0.15, Math.max(0, p.intelligence || 0) * 0.0015);
  const relicElemental =
    (vestmentMods?.elementalResistBonus || 0) + (relics.includes('runic_carapace') ? 0.2 : 0);
  const elementalTotal = Math.min(
    0.75,
    Math.max(0, baseElemental + intElemental + relicElemental + bastionBonus)
  );

  return {
    basePhysical,
    strPhysical,
    relicPhysical,
    physicalTotal,
    baseElemental,
    intElemental,
    relicElemental,
    elementalTotal,
    bastionBonus,
  };
}

export function computeIncomingDamageTypeResistance(
  p: Pick<
    CombatPlayerSubject,
    'heroClass' | 'strength' | 'intelligence' | 'relics' | 'floorBlessings' | 'equippedVestment'
  >,
  damageType: DamageCategory | 'elemental' = 'physical'
): number {
  const def = HERO_CLASSES[p.heroClass];
  const res = def?.resistances || {
    physical: 0,
    fire: 0,
    frost: 0,
    lightning: 0,
    poison: 0,
    bleed: 0,
  };
  const relics = p.relics || [];
  const vestmentMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
  const bastionStacks = countFloorBlessingStacks(p.floorBlessings, 'bastion');

  const avgElemRes = (res.fire + res.frost + res.lightning) / 3;
  let resist = 0;
  if (damageType === 'elemental' || damageType === 'arcane' || damageType === 'divine') {
    resist = avgElemRes;
  } else if (damageType === 'fire') {
    resist = res.fire;
  } else if (damageType === 'frost') {
    resist = res.frost;
  } else if (damageType === 'lightning') {
    resist = res.lightning;
  } else if (damageType === 'poison') {
    resist = res.poison;
  } else if (damageType === 'bleed') {
    resist = res.bleed;
  } else {
    resist = res.physical;
  }

  const isMagicalOrElemental =
    damageType === 'elemental' ||
    damageType === 'fire' ||
    damageType === 'frost' ||
    damageType === 'lightning' ||
    damageType === 'arcane' ||
    damageType === 'divine';

  if (relics.includes('runic_carapace')) {
    resist += damageType === 'physical' ? 0.15 : 0.2;
  }
  if (relics.includes('thorned_aegis') && damageType === 'physical') {
    resist += 0.1;
  }
  if (damageType === 'physical' && (p.strength || 0) > 0) {
    resist += Math.min(0.15, (p.strength || 0) * 0.0015);
  }
  if (isMagicalOrElemental && (p.intelligence || 0) > 0) {
    resist += Math.min(0.15, (p.intelligence || 0) * 0.0015);
  }
  if (damageType === 'physical' && vestmentMods?.physicalResistBonus) {
    resist += vestmentMods.physicalResistBonus;
  }
  if (isMagicalOrElemental && vestmentMods?.elementalResistBonus) {
    resist += vestmentMods.elementalResistBonus;
  }
  if (bastionStacks > 0) {
    resist += bastionStacks * 0.06;
  }
  return Math.min(0.75, Math.max(0, resist));
}

export function computePlayerCcTenacity(
  p: Pick<CombatPlayerSubject, 'heroClass' | 'faith' | 'equippedVestment'>
): number {
  const vestmentTenacity =
    resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.ccTenacityBonus ||
    0;
  return Math.min(0.55, Math.max(0, (p.faith || 0) * 0.003 + vestmentTenacity));
}

export function computePlayerDamageMultiplier(
  p: CombatPlayerSubject,
  category: DamageCategory = 'physical',
  options?: {
    isPrimaryAttack?: boolean;
    useWeaponScaling?: boolean;
    weaponDef?: WeaponDef | null;
    activeStarRift?: boolean;
  }
): number {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
  let mult = 1 + (lvl - 1) * 0.025;
  const weaponInput = options?.weaponDef !== undefined ? options.weaponDef : p.equippedWeapon;
  const profile = resolveWeaponCombatProfile(p.heroClass, weaponInput, p);
  const weaponMods = profile.modifiers;
  const useWeaponScale = Boolean(options?.isPrimaryAttack || options?.useWeaponScaling);

  if (useWeaponScale) {
    // Independent of adaptive damage category: scaling always follows the weapon's configured scalingAttribute
    mult *= 1 + profile.effectiveAttributeValue * 0.008;
  } else if (category === 'physical') {
    if (p.heroClass === 'ranger') {
      const dexFactor = weaponMods?.dexScalingMult ?? 1.0;
      mult *= 1 + Math.max(0, p.dexterity || 0) * 0.008 * dexFactor;
    } else {
      mult *= 1 + Math.max(0, p.strength || 0) * 0.008;
    }
  } else if (category === 'arcane') {
    mult *= 1 + Math.max(0, p.intelligence || 0) * 0.008;
  } else if (category === 'divine') {
    mult *= 1 + Math.max(0, p.faith || 0) * 0.008;
  } else {
    const classDefaultAttr = getClassDefaultScalingAttribute(p.heroClass);
    const rawMain = getPlayerAttributeValue(p, classDefaultAttr);
    const mainStat =
      p.heroClass === 'ranger' && classDefaultAttr === 'dexterity'
        ? rawMain * (weaponMods?.dexScalingMult ?? 1.0)
        : rawMain;
    mult *= 1 + mainStat * 0.008;
  }

  if ((p.relics || []).includes('sunfire_signet')) mult *= 1.12;
  const furyStacks = countFloorBlessingStacks(p.floorBlessings, 'fury');
  if (furyStacks > 0) mult *= 1 + furyStacks * 0.06;
  mult *= weaponMods?.damageMult ?? 1.0;

  if (
    resolveActiveVestmentPassive(p.heroClass, p.equippedVestment) === 'heat' &&
    (p.vanguardHeat || 0) > 0
  ) {
    const heatCfg = ARMAMENT_TUNING.passives.heat;
    mult *=
      1 +
      (Math.min(heatCfg.cap, p.vanguardHeat || 0) / heatCfg.cap) * heatCfg.maxDamageBonusPct;
  }

  if (options?.activeStarRift && weaponMods?.activeRiftBonusPct) {
    mult *= 1 + weaponMods.activeRiftBonusPct;
  }

  if (isCrimsonFrenzyActive(p)) {
    mult *= 1 + ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct;
  }

  return mult;
}

export function computePlayerDotMultiplier(
  p: CombatPlayerSubject | null | undefined,
  options?: { sourceKind?: 'weapon' | 'class'; weaponDef?: WeaponDef | null }
): number {
  if (!p) return 1.0;
  const level = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
  const sourceKind = options?.sourceKind ?? 'weapon';
  let scalingStat = 0;

  if (sourceKind === 'weapon') {
    const weaponInput = options?.weaponDef !== undefined ? options.weaponDef : p.equippedWeapon;
    const profile = resolveWeaponCombatProfile(p.heroClass, weaponInput, p);
    scalingStat = profile.rawAttributeValue;
  } else {
    const defaultAttr = getClassDefaultScalingAttribute(p.heroClass);
    scalingStat = getPlayerAttributeValue(p, defaultAttr);
  }

  return 1 + 0.003 * (level - 1) + 0.001 * Math.max(0, scalingStat);
}

export function computePlayerPierceCount(
  p: Pick<CombatPlayerSubject, 'heroClass' | 'relics' | 'equippedWeapon'>,
  weaponModsOverride?: WeaponModifiers
): number {
  const wMods =
    weaponModsOverride ??
    resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
  let pierce = p.heroClass === 'vanguard' ? 4 : 1;
  if ((p.relics || []).includes('piercing_prism')) pierce += 1;
  if (wMods?.bonusPierce) pierce += wMods.bonusPierce;
  return pierce;
}
