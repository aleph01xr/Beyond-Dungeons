// server.ts
import crypto2 from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";
import { WebSocket, WebSocketServer } from "ws";

// src/shared/types.ts
var MAX_LEVEL = 50;
var MAX_ATTRIBUTE = 100;
var CRIT_DAMAGE_MULTIPLIER = 1.25;
function getDamageTypeFamily(category) {
  if (category === "divine") return "divine";
  if (category === "arcane" || category === "elemental" || category === "fire" || category === "frost" || category === "lightning") {
    return "magic";
  }
  if (category === "poison") return "poison";
  return "physical";
}
function getDamageTypeColor(category, isCrit = false) {
  const family = getDamageTypeFamily(category);
  if (family === "magic") {
    return isCrit ? "#E9D5FF" : "#C084FC";
  }
  if (family === "divine") {
    return isCrit ? "#FEF08A" : "#FDE047";
  }
  if (family === "poison") {
    return isCrit ? "#BEF264" : "#A3E635";
  }
  return isCrit ? "#FCA5A5" : "#F87171";
}
function inferDamageCategoryFromProjectileStyle(style) {
  if (style === "radiant") return "divine";
  if (style === "fireball") return "fire";
  if (style === "frost_lance") return "frost";
  if (style === "arcane" || style === "voidorb" || style === "arcane_orb" || style === "arcane_barrage") {
    return "arcane";
  }
  return "physical";
}
var HERO_CLASSES = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    title: "Ironcrest Bastion",
    role: "Frontline Tank & Bruiser",
    roleBadge: "TANK",
    weapon: "Sunforged Claymore & Tower Shield",
    weaponType: "Heavy Cleave & Shield",
    passiveName: "Iron Will",
    passiveDesc: "-15% incoming damage. Hitting stunned or burning foes restores +3 Shield.",
    maxHp: 155,
    speed: 175,
    damage: 28,
    attackCooldownMs: 670,
    range: 74,
    primaryColor: "#64748B",
    secondaryColor: "#CBD5E1",
    capeColor: "#991B1B",
    accentColor: "#F59E0B",
    glowColor: "#FBBF24",
    lore: "Oathbound knights of the Sunken Bastion, immovable behind eternal steel.",
    stats: { survivability: 5, damage: 3, range: 1, mobility: 2, utility: 4 },
    resistances: { physical: 0.28, fire: 0.15, frost: 0.15, lightning: 0.1, poison: 0.15, bleed: 0.3 },
    tacticalName: "Bulwark Dash",
    tacticalDesc: "Dash and slam: Stuns foes 1.7s and grants nearby allies +28 Shield.",
    tacticalCooldownMs: 4800,
    ultName: "Aegis Sanctuary",
    ultDesc: "Raise a protective dome that blocks enemy shots and boosts party defense.",
    ultCooldownMs: 13e3
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    title: "Thornwood Marksman",
    role: "Long-Range Sniper",
    roleBadge: "MARKSMAN",
    weapon: "Ashwood Recurve & Barbed Quiver",
    weaponType: "Piercing Bow",
    passiveName: "Eagle Keenness",
    passiveDesc: "+25% Crit damage beyond 180 range. Kills grant 2s Haste.",
    maxHp: 110,
    speed: 210,
    damage: 24,
    attackCooldownMs: 320,
    range: 195,
    primaryColor: "#2D5A3C",
    secondaryColor: "#4ADE80",
    capeColor: "#1A3826",
    accentColor: "#FBBF24",
    glowColor: "#34D399",
    lore: "Master trackers of the Thornwood whose arrows never miss their mark.",
    stats: { survivability: 2, damage: 5, range: 5, mobility: 5, utility: 2 },
    resistances: { physical: 0.1, fire: 0.1, frost: 0.25, lightning: 0.15, poison: 0.45, bleed: 0.2 },
    tacticalName: "Frost Volley",
    tacticalDesc: "Fire 5 piercing frost arrows that slow enemies by 50%.",
    tacticalCooldownMs: 4200,
    ultName: "Hunter Quarry",
    ultDesc: "Mark bosses and elites so all allies deal +35% damage.",
    ultCooldownMs: 11500
  },
  arcanist: {
    id: "arcanist",
    name: "Arcanist",
    title: "Astral Conduit",
    role: "AoE Spellweaver",
    roleBadge: "CASTER",
    weapon: "Runebound Spire & Astral Orbs",
    weaponType: "Cosmic Shards & Scrolls",
    passiveName: "Astral Resonance",
    passiveDesc: "Primary attacks home & pierce +1 foe. Spells spawn star rifts.",
    maxHp: 100,
    speed: 188,
    damage: 24,
    attackCooldownMs: 720,
    range: 185,
    primaryColor: "#4338CA",
    secondaryColor: "#818CF8",
    capeColor: "#312E81",
    accentColor: "#38BDF8",
    glowColor: "#60A5FA",
    lore: "Scholars of shattered celestial spires who bend starlight and time.",
    stats: { survivability: 2, damage: 5, range: 4, mobility: 3, utility: 4 },
    resistances: { physical: 0.05, fire: 0.25, frost: 0.35, lightning: 0.45, poison: 0.15, bleed: 0.1 },
    tacticalName: "Astral Nova",
    tacticalDesc: "Fire 8 piercing shards in a ring. Replaced when an Ancient Scroll is equipped.",
    tacticalCooldownMs: 5e3,
    ultName: "Chrono Well",
    ultDesc: "Freeze foes, allies, and all projectiles for 3s while you act freely.",
    ultCooldownMs: 45e3
  },
  cleric: {
    id: "cleric",
    name: "Cleric",
    title: "Sunbrand Prelate",
    role: "Healer & Support",
    roleBadge: "SUPPORT",
    weapon: "Dawnstar Mace & Reliquary",
    weaponType: "Radiant Smite & Heal",
    passiveName: "Radiant Aura",
    passiveDesc: "Heals nearby allies every 2s (scales with Level & Faith) and revives 40% faster.",
    maxHp: 128,
    speed: 185,
    damage: 22,
    attackCooldownMs: 680,
    range: 160,
    primaryColor: "#E2E8F0",
    secondaryColor: "#FDE047",
    capeColor: "#854D0E",
    accentColor: "#FACC15",
    glowColor: "#FEF08A",
    lore: "Devotees of the Eternal Dawn whose sacred light mends allies and sears undead.",
    stats: { survivability: 4, damage: 3, range: 3, mobility: 2, utility: 5 },
    resistances: { physical: 0.15, fire: 0.4, frost: 0.2, lightning: 0.15, poison: 0.35, bleed: 0.25 },
    tacticalName: "Sanctified Pulse",
    tacticalDesc: "Holy wave: heals nearby allies (scales with Level & Faith) and burns nearby foes.",
    tacticalCooldownMs: 6800,
    ultName: "Solar Beacon",
    ultDesc: "Consecrate ground to heal allies over time and rapidly revive downed teammates.",
    ultCooldownMs: 18e3
  }
};
var RELIC_CATALOG = [
  {
    id: "crimson_fang",
    name: "Crimson Fang",
    category: "Offense",
    summary: "Heal +5 HP on each kill.",
    accent: "#D14B4B"
  },
  {
    id: "twinstring_charm",
    name: "Twinstring Charm",
    category: "Offense",
    summary: "+1 extra projectile or wave on primary attacks (35% damage).",
    accent: "#E0A94F"
  },
  {
    id: "zephyr_greaves",
    name: "Zephyr Greaves",
    category: "Mobility",
    summary: "+15% Movement Speed.",
    accent: "#68B89E"
  },
  {
    id: "sunfire_signet",
    name: "Sunfire Signet",
    category: "Offense",
    summary: "+12% attack and skill damage.",
    accent: "#E88348"
  },
  {
    id: "bastion_pauldron",
    name: "Bastion Pauldron",
    category: "Defense",
    summary: "+30 Max HP and +30 HP heal on pickup.",
    accent: "#8D9BB5"
  },
  {
    id: "hourglass_shard",
    name: "Hourglass Shard",
    category: "Mobility",
    summary: "+25% Cooldown Recovery on Tactical & Ultimate.",
    accent: "#76B5E8"
  },
  {
    id: "keen_arrowhead",
    name: "Keen Arrowhead",
    category: "Offense",
    summary: "+20% Crit Chance (45% cap).",
    accent: "#DFC15E"
  },
  {
    id: "oathbound_censer",
    name: "Oathbound Censer",
    category: "Co-op",
    summary: "Tactical skill heals nearby allies for +8 HP.",
    accent: "#E8CE76"
  },
  {
    id: "runic_carapace",
    name: "Runic Carapace",
    category: "Defense",
    summary: "+22 Shield per new room; +15% Phys & +20% Elem/Status Resist.",
    accent: "#6E85C9"
  },
  {
    id: "piercing_prism",
    name: "Piercing Prism",
    category: "Offense",
    summary: "Attacks pierce +1 additional enemy.",
    accent: "#A988E6"
  },
  {
    id: "cinder_heart",
    name: "Cinder Heart",
    category: "Offense",
    summary: "Crits and Tactical skills Burn foes for 4.5s.",
    accent: "#F97316"
  },
  {
    id: "rimefrost_shard",
    name: "Rimefrost Shard",
    category: "Offense",
    summary: "35% Chill on hit; hitting Chilled foes Freezes & shatters for 1.4x + frost AoE.",
    accent: "#38BDF8"
  },
  {
    id: "stormcaller_lodestone",
    name: "Stormcaller Lodestone",
    category: "Offense",
    summary: "Every 3rd hit Shocks (5s); Shocked hits chain to 3 foes.",
    accent: "#FBBF24"
  },
  {
    id: "viper_crucible",
    name: "Viper Crucible",
    category: "Offense",
    summary: "Attacks Poison foes for 6s (-30% enemy damage).",
    accent: "#22C55E"
  },
  {
    id: "bloodletter_talisman",
    name: "Bloodletter Talisman",
    category: "Offense",
    summary: "Attacks inflict Bleed (5s); damage doubles while moving.",
    accent: "#DC2626"
  },
  {
    id: "thorned_aegis",
    name: "Thorned Aegis",
    category: "Defense",
    summary: "Shield hits discharge a shockwave that Stuns nearby foes for 1.8s.",
    accent: "#A855F7"
  }
];
var TILE_SIZE = 32;
var FLOOR_BLESSINGS = {
  fury: {
    id: "fury",
    name: "Warlord's Fury",
    summary: "+6% outgoing attack & skill damage on this floor",
    color: "#F97316",
    shortTag: "+DMG"
  },
  swiftness: {
    id: "swiftness",
    name: "Windrunner's Grace",
    summary: "+8% movement speed & faster cooldowns on this floor",
    color: "#34D399",
    shortTag: "+SPD"
  },
  bastion: {
    id: "bastion",
    name: "Iron Sanctum",
    summary: "+6% damage reduction & instant +20 Shield",
    color: "#60A5FA",
    shortTag: "+DEF"
  }
};

// src/shared/arcanist.ts
var STAR_RIFT_REQUIRED_ATTACKS = 4;
var STAR_RIFT_PROC_COOLDOWN_MS = 8e3;
var ARCANIST_SPELL_ORDER = [
  "fireball",
  "disintegration",
  "frost_lance",
  "chain_lightning",
  "arcane_meteor",
  "arcane_orb",
  "arcane_barrage"
];
var ARCANIST_SPELLS = {
  fireball: {
    id: "fireball",
    name: "Fireball",
    scrollName: "Scroll of Fireball",
    tacticalTitle: "Fireball",
    role: "Burst / Burning AoE",
    baseDamage: 42,
    intCoeff: 0.015,
    cooldownMs: 6e3,
    castTimeMs: 350,
    explosionRadius: 105,
    burnRadius: 88,
    burnTickRatio: 0.22,
    durationMs: 3500,
    hitIntervalMs: 500,
    maxRange: 360,
    projectileSpeed: 380,
    damageCategory: "fire",
    accentColor: "#F97316",
    summary: "0.35s cast; explodes (105u AoE) and leaves a 3.5s burn zone.",
    chronoInteraction: "Projectile & burn zone freeze inside any Chrono Well."
  },
  disintegration: {
    id: "disintegration",
    name: "Disintegration",
    scrollName: "Scroll of Disintegration",
    tacticalTitle: "Disintegration",
    role: "Sustained Beam",
    baseDamage: 10,
    intCoeff: 0.012,
    cooldownMs: 12e3,
    castTimeMs: 0,
    tickIntervalMs: 200,
    beamWidth: 42,
    maxRange: 450,
    activationMs: 150,
    maxRotationRadPerSec: Math.PI,
    // 180 deg/s
    isChannel: true,
    damageCategory: "arcane",
    accentColor: "#A855F7",
    summary: "Hold [Q / RMB] to channel a 450u beam (5 ticks/s, 180\xB0/s turn cap).",
    chronoInteraction: "Blocked by enemy Chrono Wells; own Chrono Well allows free cast."
  },
  frost_lance: {
    id: "frost_lance",
    name: "Frost Lance",
    scrollName: "Scroll of Frost Lance (Ice Lance)",
    tacticalTitle: "Frost Lance",
    role: "Precision / Piercing",
    baseDamage: 36,
    intCoeff: 0.018,
    cooldownMs: 4500,
    castTimeMs: 200,
    pierce: 3,
    maxRange: 420,
    projectileSpeed: 480,
    damageCategory: "frost",
    accentColor: "#38BDF8",
    summary: "0.2s cast; fires a straight lance piercing up to 3 foes.",
    chronoInteraction: "Projectile suspends mid-air inside any Chrono Well."
  },
  chain_lightning: {
    id: "chain_lightning",
    name: "Chain Lightning",
    scrollName: "Scroll of Chain Lightning",
    tacticalTitle: "Chain Lightning",
    role: "Cone Discharge",
    baseDamage: 32,
    intCoeff: 0.015,
    cooldownMs: 7e3,
    castTimeMs: 0,
    maxRange: 340,
    coneHalfAngleRad: 0.56,
    // ~±32 deg (64 deg total cone)
    damageCategory: "lightning",
    accentColor: "#FACC15",
    summary: "Instant 340u lightning cone (64\xB0 arc) shocking all foes inside.",
    chronoInteraction: "Hits suspended foes inside Chrono Well unless caster is frozen."
  },
  arcane_meteor: {
    id: "arcane_meteor",
    name: "Arcane Meteor",
    scrollName: "Scroll of Arcane Meteor",
    tacticalTitle: "Arcane Meteor",
    role: "Heavy AoE Burst",
    baseDamage: 75,
    intCoeff: 0.0195,
    cooldownMs: 11e3,
    castTimeMs: 500,
    impactDelayMs: 1e3,
    explosionRadius: 125,
    maxRange: 280,
    damageCategory: "arcane",
    accentColor: "#E879F9",
    summary: "0.5s cast + 1.0s delay; strikes a 125u zone for heavy AoE burst.",
    chronoInteraction: "Impact timer pauses inside any Chrono Well until time resumes."
  },
  arcane_orb: {
    id: "arcane_orb",
    name: "Arcane Orb",
    scrollName: "Scroll of Arcane Orb",
    tacticalTitle: "Arcane Orb",
    role: "Persistent Pressure",
    baseDamage: 12,
    intCoeff: 0.0105,
    cooldownMs: 9e3,
    castTimeMs: 0,
    durationMs: 4e3,
    hitIntervalMs: 500,
    maxHitsPerEnemy: 2,
    projectileSpeed: 115,
    damageCategory: "arcane",
    accentColor: "#818CF8",
    summary: "4s drifting orb hitting foes every 0.5s (max 2 hits/enemy).",
    chronoInteraction: "Freezes motion & timer completely inside any Chrono Well."
  },
  arcane_barrage: {
    id: "arcane_barrage",
    name: "Arcane Barrage",
    scrollName: "Scroll of Arcane Barrage",
    tacticalTitle: "Arcane Barrage",
    role: "Multi-Wave Barrage",
    baseDamage: 12,
    intCoeff: 675e-5,
    cooldownMs: 8e3,
    castTimeMs: 0,
    projectileCount: 8,
    barrageWaves: 4,
    barrageWaveIntervalMs: 95,
    projectileSpeed: 420,
    maxRange: 450,
    damageCategory: "arcane",
    accentColor: "#60A5FA",
    summary: "4 rapid waves of arcane bolts (8 bolts total) piercing forward.",
    chronoInteraction: "Bolts suspend in any Chrono Well and release together on resume."
  }
};
var ARCANIST_SCROLLS = ARCANIST_SPELL_ORDER.map(
  (id) => ARCANIST_SPELLS[id]
);
function getArcanistScrollDef(scrollId) {
  if (!scrollId) return null;
  return ARCANIST_SPELLS[scrollId] || null;
}
function computeArcanistSpellDamage(baseDamage, params, intCoeff) {
  const level = Math.max(1, Math.min(MAX_LEVEL, params.level || 1));
  const intStat = Math.max(0, params.intelligence || 0);
  const levelMult = 1 + 0.025 * (level - 1);
  const intMult = 1 + intCoeff * intStat;
  let total = baseDamage * levelMult * intMult;
  if (params.relics?.includes("sunfire_signet")) {
    total *= 1.12;
  }
  const fury = Math.max(0, params.furyStacks || 0);
  if (fury > 0) {
    total *= 1 + fury * 0.06;
  }
  return Math.max(1, Math.round(total));
}
function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function rotateAngleToward(currentAngle, targetAngle, maxDeltaRad) {
  const diff = normalizeAngle(targetAngle - currentAngle);
  if (Math.abs(diff) <= maxDeltaRad) {
    return normalizeAngle(targetAngle);
  }
  return normalizeAngle(currentAngle + Math.sign(diff) * maxDeltaRad);
}
function distancePointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-6) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return Math.hypot(px - closestX, py - closestY);
}

// src/shared/armaments.ts
var ARMAMENT_TUNING = {
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
      bastionCooldownMs: 7e3
    },
    crimson: {
      bonusPierce: 3,
      rangeBonusPx: 26,
      frenzyDurationMs: 5e3,
      frenzyCooldownMs: 10500,
      frenzyDamageBonusPct: 0.25,
      frenzyLifestealPct: 0.14,
      frenzyAttackSpeedBonusPct: 0.25,
      frenzyMoveSpeedBonusPct: 0.65
    },
    stormbreaker: {
      slamForwardOffsetPx: 54,
      slamRadiusPx: 62,
      slamDamageRatio: 1.15,
      slamZoneTtlMs: 260
    },
    galewind: {
      counterScope: "per_target",
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
      cycloneCooldownMs: 8500
    },
    eclipse: {
      minChargeMs: 120,
      maxChargeMs: 950,
      minDamageRatio: 0.55,
      maxDamageRatio: 2.15,
      minProjSpeedMult: 1.05,
      maxProjSpeedMult: 1.55,
      scalingStat: "intelligence",
      blackSunRangePx: 240,
      blackSunRadiusPx: 115,
      blackSunZoneDurationMs: 1400,
      blackSunTickIntervalMs: 350,
      blackSunTickBaseDamage: 10,
      blackSunStrikeBaseDamage: 68,
      blackSunBurstZoneTtlMs: 360,
      blackSunCooldownMs: 9e3
    },
    cinderflare: {
      aoeRadiusPx: 64,
      aoeDamageRatio: 0.5,
      blastZoneTtlMs: 240
    },
    chronostar: {
      tacticalSiphonMs: 150,
      ultSiphonMs: 300,
      seekingRadiusPx: 170
    },
    solaris: {
      allyHealBase: 5,
      healRangePx: 180,
      procCooldownMs: 350
    },
    seraphim: {
      tacticalRadiusPx: 110,
      tacticalRangePx: 210,
      tacticalBaseDamage: 56,
      tacticalCooldownMs: 6500,
      holyBurstZoneTtlMs: 340
    }
  },
  passives: {
    warMonger: {
      lowHpThresholdRatio: 0.3,
      thresholdInclusive: true,
      aboveThresholdLifestealPct: 0.06,
      atOrBelowThresholdLifestealPct: 0.5
    },
    heat: {
      cap: 100,
      gainPerHit: 18,
      maxDamageBonusPct: 0.25,
      resetGraceMs: 2400
    },
    momentum: {
      cap: 100,
      buildDurationMs: 2500,
      minMoveSpeedPx: 20,
      maxAttackSpeedBonusPct: 0.24,
      resetOnStop: true,
      resetOnHit: true
    },
    predatorsInstinct: {
      maxStacks: 5,
      damagePerStackPct: 0.06,
      inactivityResetMs: 3500
    },
    temporalAcceleration: {
      tacticalReductionPerBasicHitMs: 120,
      ultReductionPerTacticalHitMs: 250
    },
    voidConsumption: {
      cap: 100,
      gainPerHit: 20,
      empoweredTacticalBonusPct: 0.35
    },
    sharedGrace: {
      storePct: 0.35,
      maxCap: 60,
      triggerHpRatio: 0.6,
      releaseRangePx: 220
    },
    sacredRetribution: {
      sanctityPerHeal: 25,
      cap: 100,
      shockwaveRadiusPx: 145,
      enemyBaseDamage: 38,
      allyBaseHeal: 18,
      shockwaveZoneTtlMs: 320
    }
  }
};
var DEFAULT_WEAPON_BY_CLASS = {
  vanguard: "vanguard_sunforged_claymore",
  ranger: "ranger_ashwood_recurve",
  arcanist: "arcanist_runebound_spire",
  cleric: "cleric_dawnstar_mace"
};
var DEFAULT_VESTMENT_BY_CLASS = {
  vanguard: "vanguard_ironcrest_plate",
  ranger: "ranger_thornwood_brigandine",
  arcanist: "arcanist_astral_vestments",
  cleric: "cleric_prelate_raiment"
};
var WEAPON_CATALOG = [
  // ================= VANGUARD WEAPONS =================
  {
    id: "vanguard_sunforged_claymore",
    slot: "weapon",
    heroClass: "vanguard",
    name: HERO_CLASSES.vanguard.weapon,
    rarity: "Ascendant",
    archetype: "Shield-Wave Bastion Greatsword",
    summary: "Sunforged greatsword releasing golden forward shockwaves with Shield, and replacing Bulwark Dash with Bastion Counter.",
    effectLines: [
      "+10px primary cleave reach & +3% Critical Chance",
      "Sunforged Shockwave: While Shield > 0, swings release a golden cone shockwave (55% dmg, 118px)",
      `Bastion Counter (Tactical): Brace ${(ARMAMENT_TUNING.weapons.sunforged.bastionBraceMs / 1e3).toFixed(1)}s (-${Math.round(ARMAMENT_TUNING.weapons.sunforged.bastionDamageReduction * 100)}% incoming dmg), then retaliate with a ${ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx}px golden cleave (${(ARMAMENT_TUNING.weapons.sunforged.bastionCooldownMs / 1e3).toFixed(1)}s CD)`,
      "Restores +2 Shield when primary cleave hits a foe"
    ],
    unlockHint: "Starter Vanguard armament",
    isDefault: true,
    accent: "#F59E0B",
    modifiers: {
      scalingAttribute: "strength",
      damageCategory: "physical",
      damageTypeMode: "fixed",
      damageMult: 1,
      attackSpeedMult: 1,
      critChanceBonus: 0.03,
      rangeBonusPx: 10,
      shieldOnPrimaryHit: 2,
      sunforgedShockwave: true,
      tacticalId: "bastion_counter"
    }
  },
  {
    id: "vanguard_crimson_halberd",
    slot: "weapon",
    heroClass: "vanguard",
    name: "Crimson War Axe",
    rarity: "Ascendant",
    archetype: "Shield-Locked Berserker Great-Axe",
    summary: "Extended-reach war axe that permanently locks all Shield gain in exchange for piercing cleaves, Bleed, and Crimson Frenzy.",
    effectLines: [
      `+10% Offensive Damage, +${ARMAMENT_TUNING.weapons.crimson.rangeBonusPx}px Reach & +${ARMAMENT_TUNING.weapons.crimson.bonusPierce} Pierce (-6% cadence); 45% Bleed (4s)`,
      "Permanent Shield Lock: While equipped, you cannot gain Shield from any source (existing Shield stays; unequipping restores Shield gain)",
      `Crimson Frenzy (Tactical): For ${(ARMAMENT_TUNING.weapons.crimson.frenzyDurationMs / 1e3).toFixed(1)}s, gain +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct * 100)}% Damage, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyLifestealPct * 100)}% Lifesteal, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct * 100)}% Attack Speed & a fading +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyMoveSpeedBonusPct * 100)}% Movement Speed buff (${(ARMAMENT_TUNING.weapons.crimson.frenzyCooldownMs / 1e3).toFixed(1)}s CD)`
    ],
    unlockHint: "Defeat Floor Bosses as Vanguard",
    accent: "#EF4444",
    modifiers: {
      scalingAttribute: "strength",
      damageCategory: "physical",
      damageTypeMode: "fixed",
      damageMult: 1.1,
      attackSpeedMult: 0.94,
      bonusPierce: ARMAMENT_TUNING.weapons.crimson.bonusPierce,
      rangeBonusPx: ARMAMENT_TUNING.weapons.crimson.rangeBonusPx,
      bleedChance: 0.45,
      shieldGainLocked: true,
      tacticalId: "crimson_frenzy"
    }
  },
  {
    id: "vanguard_stormbreaker_flail",
    slot: "weapon",
    heroClass: "vanguard",
    name: "Stormbreaker Flail & Bastion Wall",
    rarity: "Forged",
    archetype: "Heavy Slam War Flail",
    summary: "Thunder-forged flail smashing downward into a localized forward Shock AoE while retaining Bulwark Dash.",
    effectLines: [
      `Heavy Slam: Downward overhead slam crushes a localized ${ARMAMENT_TUNING.weapons.stormbreaker.slamRadiusPx}px forward AoE (${Math.round(ARMAMENT_TUNING.weapons.stormbreaker.slamDamageRatio * 100)}% dmg, ${ARMAMENT_TUNING.weapons.stormbreaker.slamForwardOffsetPx}px ahead)`,
      "+5% Damage, +12% Attack Speed, +5% Crit Chance & +3 Shield on hit (retains Bulwark Dash)",
      "25% chance on primary hit to Shock foes (3.5s)"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Vanguard",
    accent: "#FBBF24",
    modifiers: {
      scalingAttribute: "strength",
      damageCategory: "physical",
      damageTypeMode: "fixed",
      damageMult: 1.05,
      attackSpeedMult: 1.12,
      critChanceBonus: 0.05,
      shieldOnPrimaryHit: 3,
      shockChance: 0.25,
      heavySlamAoe: true
    }
  },
  // ================= RANGER WEAPONS =================
  {
    id: "ranger_ashwood_recurve",
    slot: "weapon",
    heroClass: "ranger",
    name: HERO_CLASSES.ranger.weapon,
    rarity: "Forged",
    archetype: "Precision Hunter Recurve",
    summary: "Supple Thornwood recurve strung with barbed arrows that punish slowed or poisoned prey while retaining Frost Volley.",
    effectLines: [
      "+4% Critical Chance & +10% Arrow Velocity (retains Frost Volley)",
      "Barbed Broadheads: +15% arrow damage vs Slowed, Frozen, or Poisoned foes",
      "+5% bonus Longshot damage beyond 180u"
    ],
    unlockHint: "Starter Ranger armament",
    isDefault: true,
    accent: "#34D399",
    modifiers: {
      scalingAttribute: "dexterity",
      damageCategory: "physical",
      damageTypeMode: "fixed",
      damageMult: 1,
      attackSpeedMult: 1,
      critChanceBonus: 0.04,
      projectileSpeedMult: 1.1,
      longshotBonusPct: 0.05,
      impairedTargetBonusPct: 0.15
    }
  },
  {
    id: "ranger_galewind_twinbow",
    slot: "weapon",
    heroClass: "ranger",
    name: "Galewind Twinbow & Split Quiver",
    rarity: "Ascendant",
    archetype: "Galeburst Cyclone Twinbow",
    summary: "Twin-limbed composite bow triggering 3-hit Galeburst wind bursts and replacing Frost Volley with Cyclone Break.",
    effectLines: [
      `Galeburst: Every ${ARMAMENT_TUNING.weapons.galewind.hitsToTrigger}rd confirmed hit on a target triggers an ${ARMAMENT_TUNING.weapons.galewind.aoeRadiusPx}px wind AoE (${Math.round(ARMAMENT_TUNING.weapons.galewind.aoeDamageRatio * 100)}% dmg) & primes Cyclone Break`,
      `Cyclone Break (Tactical): Shoot a straight Cyclone Greatarrow that drags hit foes forward and erupts into a ${ARMAMENT_TUNING.weapons.galewind.cycloneRadiusPx}px whirlwind (${(ARMAMENT_TUNING.weapons.galewind.cycloneDurationMs / 1e3).toFixed(1)}s), strongly pulling enemies inward & detonating Galeburst marks (${(ARMAMENT_TUNING.weapons.galewind.cycloneCooldownMs / 1e3).toFixed(1)}s CD)`,
      `+12% Arrow Velocity & +4% Crit Chance (${Math.round(ARMAMENT_TUNING.weapons.galewind.attackSpeedMult * 100)}% cadence, ${Math.round(ARMAMENT_TUNING.weapons.galewind.dexScalingMult * 100)}% DEX scaling)`
    ],
    unlockHint: "Defeat Floor Bosses as Ranger",
    accent: "#38BDF8",
    modifiers: {
      scalingAttribute: "dexterity",
      damageCategory: "physical",
      damageTypeMode: "fixed",
      damageMult: 0.95,
      attackSpeedMult: ARMAMENT_TUNING.weapons.galewind.attackSpeedMult,
      projectileSpeedMult: 1.12,
      critChanceBonus: 0.04,
      dexScalingMult: ARMAMENT_TUNING.weapons.galewind.dexScalingMult,
      galeburstTriggerHits: ARMAMENT_TUNING.weapons.galewind.hitsToTrigger,
      galeburstRadiusPx: ARMAMENT_TUNING.weapons.galewind.aoeRadiusPx,
      galeburstDamageRatio: ARMAMENT_TUNING.weapons.galewind.aoeDamageRatio,
      tacticalId: "cyclone_break"
    }
  },
  {
    id: "ranger_eclipse_longbow",
    slot: "weapon",
    heroClass: "ranger",
    name: "Eclipse Siege Longbow & Bodkins",
    rarity: "Ascendant",
    archetype: "INT-Scaled Eclipse Siege Bow",
    summary: "Heavy arcane-sinew bow with hold-to-charge INT shots that replaces Frost Volley with Black Sun.",
    effectLines: [
      `Hold-to-Charge (${ARMAMENT_TUNING.weapons.eclipse.minChargeMs}-${ARMAMENT_TUNING.weapons.eclipse.maxChargeMs}ms): Deals ${Math.round(ARMAMENT_TUNING.weapons.eclipse.minDamageRatio * 100)}%-${Math.round(ARMAMENT_TUNING.weapons.eclipse.maxDamageRatio * 100)}% Arcane arrow damage (+2 Pierce, +6% Crit, +10% Crit Mult)`,
      `Black Sun (Tactical): Create a ${ARMAMENT_TUNING.weapons.eclipse.blackSunRadiusPx}px eclipse zone (${(ARMAMENT_TUNING.weapons.eclipse.blackSunZoneDurationMs / 1e3).toFixed(1)}s) before a celestial arrow strike & explosion (${(ARMAMENT_TUNING.weapons.eclipse.blackSunCooldownMs / 1e3).toFixed(1)}s CD)`,
      "Arcane Sinew: Deals Arcane damage and scales with Intelligence (INT) instead of Dexterity"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Ranger",
    accent: "#FBBF24",
    modifiers: {
      scalingAttribute: "intelligence",
      damageCategory: "arcane",
      damageTypeMode: "fixed",
      damageMult: 1,
      attackSpeedMult: 1,
      bonusPierce: 2,
      critChanceBonus: 0.06,
      critMultBonus: 0.1,
      projectileSpeedMult: 1.2,
      chargeToFire: true,
      usesIntScaling: true,
      tacticalId: "black_sun"
    }
  },
  // ================= ARCANIST WEAPONS =================
  {
    id: "arcanist_runebound_spire",
    slot: "weapon",
    heroClass: "arcanist",
    name: HERO_CLASSES.arcanist.weapon,
    rarity: "Forged",
    archetype: "Astral Rift Conduit",
    summary: "Crystalline focus rod attuned with orbiting astral spheres that draw power from Star Rifts; retains Astral Nova and Scroll spells.",
    effectLines: [
      "+1 Cosmic Bolt Pierce & +3% Critical Chance",
      "Rift Resonance: +12% primary bolt damage while your Star Rift is active",
      "+15% Star Rift Zone resonance damage"
    ],
    unlockHint: "Starter Arcanist armament",
    isDefault: true,
    accent: "#818CF8",
    modifiers: {
      scalingAttribute: "intelligence",
      damageCategory: "arcane",
      damageTypeMode: "fixed",
      damageMult: 1,
      attackSpeedMult: 1,
      bonusPierce: 1,
      critChanceBonus: 0.03,
      starRiftBonusDamagePct: 0.15,
      activeRiftBonusPct: 0.12
    }
  },
  {
    id: "arcanist_cinderflare_rod",
    slot: "weapon",
    heroClass: "arcanist",
    name: "Cinderflare Catalyst & Ember Crown",
    rarity: "Forged",
    archetype: "Detonating Pyromancy Catalyst",
    summary: "Obsidian-gold catalyst firing volatile ember bolts that erupt into fiery AoE blasts on hit; retains Astral Nova and Scroll spells.",
    effectLines: [
      "+8% Arcane Bolt Damage, +1 Pierce & +10% Crit Multiplier",
      `Ember Detonation: Confirmed hits trigger a ${ARMAMENT_TUNING.weapons.cinderflare.aoeRadiusPx}px Fire AoE blast (${Math.round(ARMAMENT_TUNING.weapons.cinderflare.aoeDamageRatio * 100)}% dmg)`,
      "35% chance on primary hit to Ignite foes (4s Burn)"
    ],
    unlockHint: "Defeat Floor Bosses as Arcanist",
    accent: "#F97316",
    modifiers: {
      scalingAttribute: "intelligence",
      damageCategory: "arcane",
      damageTypeMode: "fixed",
      damageMult: 1.08,
      attackSpeedMult: 1,
      bonusPierce: 1,
      critMultBonus: 0.1,
      burnChance: 0.35,
      emberSplashRadiusPx: ARMAMENT_TUNING.weapons.cinderflare.aoeRadiusPx,
      emberSplashRatio: ARMAMENT_TUNING.weapons.cinderflare.aoeDamageRatio
    }
  },
  {
    id: "arcanist_chronostar_scepter",
    slot: "weapon",
    heroClass: "arcanist",
    name: "Chronostar Scepter & Twin Orbs",
    rarity: "Forged",
    archetype: "Seeking Temporal Star-Orb Scepter",
    summary: "Celestial astrolabe scepter launching homing Star-Orbs that siphon spell cooldowns while retaining Astral Nova and Scroll spells.",
    effectLines: [
      `Seeking Star-Orb: Curves toward foes within ${ARMAMENT_TUNING.weapons.chronostar.seekingRadiusPx}px (+8% dmg, +8% cadence)`,
      `Temporal Siphon: Confirmed orb hits trim -${ARMAMENT_TUNING.weapons.chronostar.tacticalSiphonMs}ms Tactical & -${ARMAMENT_TUNING.weapons.chronostar.ultSiphonMs}ms Ultimate CD once per orb`,
      "+1 Pierce, +5% Crit Chance, 35% Chill & +25% Star Rift resonance damage"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Arcanist",
    accent: "#38BDF8",
    modifiers: {
      scalingAttribute: "intelligence",
      damageCategory: "arcane",
      damageTypeMode: "fixed",
      damageMult: 1.08,
      attackSpeedMult: 1.08,
      bonusPierce: 1,
      critChanceBonus: 0.05,
      projectileSpeedMult: 1.15,
      starRiftBonusDamagePct: 0.25,
      seekingRadiusPx: ARMAMENT_TUNING.weapons.chronostar.seekingRadiusPx,
      tacticalSiphonMs: ARMAMENT_TUNING.weapons.chronostar.tacticalSiphonMs,
      ultSiphonMs: ARMAMENT_TUNING.weapons.chronostar.ultSiphonMs,
      chillChance: 0.35
    }
  },
  // ================= CLERIC WEAPONS =================
  {
    id: "cleric_dawnstar_mace",
    slot: "weapon",
    heroClass: "cleric",
    name: HERO_CLASSES.cleric.weapon,
    rarity: "Forged",
    archetype: "Consecrated Sanctuary Mace",
    summary: "Flanged sun-gold mace paired with a consecrated reliquary of undead-banishing judgment; retains Sanctified Pulse.",
    effectLines: [
      "+20% Smite damage vs Undead, Cultists & Bosses",
      "+4% Critical Strike Chance (retains Sanctified Pulse)",
      "Sanctuary Judgment: Pure radiant Smite attacks without Shield mechanics"
    ],
    unlockHint: "Starter Cleric armament",
    isDefault: true,
    accent: "#FACC15",
    modifiers: {
      scalingAttribute: "faith",
      damageCategory: "divine",
      damageTypeMode: "fixed",
      damageMult: 1,
      attackSpeedMult: 1,
      critChanceBonus: 0.04,
      undeadBossBonusPct: 0.2
    }
  },
  {
    id: "cleric_solaris_censer",
    slot: "weapon",
    heroClass: "cleric",
    name: "Solaris War-Censer & Thurible",
    rarity: "Forged",
    archetype: "Mending Incense Focus",
    summary: "Swinging emerald-gold war-censer whose confirmed hits mend the lowest-HP nearby injured ally while retaining Sanctified Pulse.",
    effectLines: [
      "+16% Healing Power, +6% Divine Damage & +1 Radiant Bolt Pierce (retains Sanctified Pulse)",
      `Incense Mending: Confirmed hits heal lowest-HP injured ally within ${ARMAMENT_TUNING.weapons.solaris.healRangePx}px (+${ARMAMENT_TUNING.weapons.solaris.allyHealBase} scaled HP, ${ARMAMENT_TUNING.weapons.solaris.procCooldownMs}ms CD)`,
      "30% chance on primary hit to Chill targets (2.5s)"
    ],
    unlockHint: "Defeat Floor Bosses as Cleric",
    accent: "#34D399",
    modifiers: {
      scalingAttribute: "faith",
      damageCategory: "divine",
      damageTypeMode: "fixed",
      damageMult: 1.06,
      attackSpeedMult: 1,
      bonusPierce: 1,
      healingBonusPct: 0.16,
      chillChance: 0.3,
      allyHealOnHitBase: ARMAMENT_TUNING.weapons.solaris.allyHealBase,
      allyHealOnHitRangePx: ARMAMENT_TUNING.weapons.solaris.healRangePx,
      allyHealProcCooldownMs: ARMAMENT_TUNING.weapons.solaris.procCooldownMs
    }
  },
  {
    id: "cleric_seraphim_crozier",
    slot: "weapon",
    heroClass: "cleric",
    name: "Seraphim Judgment Crozier & Sun-Relic",
    rarity: "Ascendant",
    archetype: "Seraphic Burst Battle-Crozier",
    summary: "High-choir crozier that retains steady Smite bolts while transforming your Tactical Skill into a targeted Holy Burst.",
    effectLines: [
      "+12% Divine Damage, +1 Pierce & +5% Critical Chance",
      `Seraphic Judgment (Tactical): Targeted ${ARMAMENT_TUNING.weapons.seraphim.tacticalRadiusPx}px AoE Holy Burst (${ARMAMENT_TUNING.weapons.seraphim.tacticalBaseDamage} scaled Divine dmg, no heal, ${(ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs / 1e3).toFixed(1)}s CD)`,
      "+10% Healing Power & +15% Smite damage vs Undead/Bosses"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Cleric",
    accent: "#FDE047",
    modifiers: {
      scalingAttribute: "faith",
      damageCategory: "divine",
      damageTypeMode: "fixed",
      damageMult: 1.12,
      attackSpeedMult: 1,
      bonusPierce: 1,
      critChanceBonus: 0.05,
      healingBonusPct: 0.1,
      undeadBossBonusPct: 0.15,
      seraphimTacticalBurst: true,
      tacticalId: "seraphic_judgment"
    }
  }
];
var WEAPON_TACTICALS = {
  bastion_counter: {
    id: "bastion_counter",
    weaponTacticalId: "bastion_counter",
    name: "Bastion Counter",
    shortTitle: "Bastion Counter",
    description: `Brace ${(ARMAMENT_TUNING.weapons.sunforged.bastionBraceMs / 1e3).toFixed(1)}s (-${Math.round(ARMAMENT_TUNING.weapons.sunforged.bastionDamageReduction * 100)}% dmg taken), then cleave ${ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx}px (+${Math.round(ARMAMENT_TUNING.weapons.sunforged.bastionBlockedBonusPerHitRatio * 100)}% dmg/block).`,
    cooldownMs: ARMAMENT_TUNING.weapons.sunforged.bastionCooldownMs,
    accentColor: "#FBBF24",
    secondaryColor: "#FEF08A",
    damageCategory: "physical"
  },
  crimson_frenzy: {
    id: "crimson_frenzy",
    weaponTacticalId: "crimson_frenzy",
    name: "Crimson Frenzy",
    shortTitle: "Crimson Frenzy",
    description: `Frenzy ${(ARMAMENT_TUNING.weapons.crimson.frenzyDurationMs / 1e3).toFixed(1)}s: +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct * 100)}% DMG, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyLifestealPct * 100)}% Lifesteal, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct * 100)}% Atk Spd, +${Math.round(ARMAMENT_TUNING.weapons.crimson.frenzyMoveSpeedBonusPct * 100)}% Move Spd. Shield gain locked.`,
    cooldownMs: ARMAMENT_TUNING.weapons.crimson.frenzyCooldownMs,
    accentColor: "#EF4444",
    secondaryColor: "#FCA5A5",
    damageCategory: "physical"
  },
  cyclone_break: {
    id: "cyclone_break",
    weaponTacticalId: "cyclone_break",
    name: "Cyclone Break",
    shortTitle: "Cyclone Break",
    description: `Fire a dragging Greatarrow that erupts into a ${ARMAMENT_TUNING.weapons.galewind.cycloneRadiusPx}px whirlwind (${(ARMAMENT_TUNING.weapons.galewind.cycloneDurationMs / 1e3).toFixed(1)}s), pulling foes and popping Galeburst marks.`,
    cooldownMs: ARMAMENT_TUNING.weapons.galewind.cycloneCooldownMs,
    accentColor: "#38BDF8",
    secondaryColor: "#6EE7B7",
    damageCategory: "physical"
  },
  black_sun: {
    id: "black_sun",
    weaponTacticalId: "black_sun",
    name: "Black Sun",
    shortTitle: "Black Sun",
    description: `Summon a ${ARMAMENT_TUNING.weapons.eclipse.blackSunRadiusPx}px eclipse zone (${(ARMAMENT_TUNING.weapons.eclipse.blackSunZoneDurationMs / 1e3).toFixed(1)}s Arcane pulses) before a celestial arrow detonates it.`,
    cooldownMs: ARMAMENT_TUNING.weapons.eclipse.blackSunCooldownMs,
    accentColor: "#A855F7",
    secondaryColor: "#FBBF24",
    damageCategory: "arcane"
  },
  seraphic_judgment: {
    id: "seraphic_judgment",
    weaponTacticalId: "seraphic_judgment",
    name: "Seraphic Judgment",
    shortTitle: "Seraphic Judgment",
    description: `Targeted ${ARMAMENT_TUNING.weapons.seraphim.tacticalRadiusPx}px Divine AoE burst (scales with Faith, no healing).`,
    cooldownMs: ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs,
    accentColor: "#FDE047",
    secondaryColor: "#F59E0B",
    damageCategory: "divine"
  }
};
var CLASS_DEFAULT_TACTICAL_BY_CLASS = {
  vanguard: {
    id: "bulwark_dash",
    name: HERO_CLASSES.vanguard.tacticalName,
    shortTitle: "Bulwark Dash",
    description: HERO_CLASSES.vanguard.tacticalDesc,
    cooldownMs: HERO_CLASSES.vanguard.tacticalCooldownMs,
    accentColor: "#F59E0B",
    secondaryColor: "#93C5FD",
    source: "class",
    damageCategory: "physical"
  },
  ranger: {
    id: "frost_volley",
    name: HERO_CLASSES.ranger.tacticalName,
    shortTitle: "Frost Volley",
    description: HERO_CLASSES.ranger.tacticalDesc,
    cooldownMs: HERO_CLASSES.ranger.tacticalCooldownMs,
    accentColor: "#38BDF8",
    secondaryColor: "#BAE6FD",
    source: "class",
    damageCategory: "frost"
  },
  arcanist: {
    id: "astral_nova",
    name: HERO_CLASSES.arcanist.tacticalName,
    shortTitle: "Astral Nova",
    description: HERO_CLASSES.arcanist.tacticalDesc,
    cooldownMs: HERO_CLASSES.arcanist.tacticalCooldownMs,
    accentColor: "#818CF8",
    secondaryColor: "#38BDF8",
    source: "class",
    damageCategory: "arcane"
  },
  cleric: {
    id: "sanctified_pulse",
    name: HERO_CLASSES.cleric.tacticalName,
    shortTitle: "Sanctified Pulse",
    description: HERO_CLASSES.cleric.tacticalDesc,
    cooldownMs: HERO_CLASSES.cleric.tacticalCooldownMs,
    accentColor: "#34D399",
    secondaryColor: "#FACC15",
    source: "class",
    damageCategory: "divine"
  }
};
function resolveActiveTacticalDef(heroClass, equippedWeaponId, equippedScrollId) {
  if (heroClass === "arcanist" && equippedScrollId) {
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
        secondaryColor: "#E9D5FF",
        source: "scroll",
        damageCategory: scroll.damageCategory
      };
    }
  }
  const equippedWeapon = resolveEquippedWeaponForClass(heroClass, equippedWeaponId);
  const tacticalId = equippedWeapon?.modifiers.tacticalId ?? (equippedWeapon?.modifiers.seraphimTacticalBurst ? "seraphic_judgment" : void 0);
  if (equippedWeapon && tacticalId && WEAPON_TACTICALS[tacticalId]) {
    const def = WEAPON_TACTICALS[tacticalId];
    return {
      ...def,
      source: "weapon",
      weaponId: equippedWeapon.id,
      weaponName: equippedWeapon.name
    };
  }
  return {
    ...CLASS_DEFAULT_TACTICAL_BY_CLASS[heroClass],
    weaponId: equippedWeapon?.id ?? null,
    weaponName: equippedWeapon?.name ?? null
  };
}
function getWeaponTacticalDef(weapon) {
  const def = typeof weapon === "string" ? getWeaponDef(weapon) : weapon;
  if (!def) return null;
  const tacticalId = def.modifiers.tacticalId ?? (def.modifiers.seraphimTacticalBurst ? "seraphic_judgment" : void 0);
  if (!tacticalId || !WEAPON_TACTICALS[tacticalId]) return null;
  return {
    ...WEAPON_TACTICALS[tacticalId],
    source: "weapon",
    weaponId: def.id,
    weaponName: def.name
  };
}
var VESTMENT_CATALOG = [
  // ================= VANGUARD VESTMENTS =================
  {
    id: "vanguard_ironcrest_plate",
    slot: "vestment",
    heroClass: "vanguard",
    name: "Ironcrest Bastion Plate",
    rarity: "Standard",
    archetype: "Linebreaker Knight Armor",
    passiveId: "iron_will",
    passiveName: "Iron Will",
    passiveSummary: "Absorbs 15% of all incoming damage. Striking stunned, burned, or frozen foes restores +3 Shield.",
    summary: "Layered bastion steel sustaining the classic Vanguard Iron Will passive and extra Shield capacity.",
    effectLines: [
      "Passive \u2014 Iron Will: -15% incoming damage; +3 Shield on hitting Stunned/Burned/Frozen foes",
      "+10 Maximum Shield Cap & +5 Starting Shield",
      "+4% Elemental Resistance"
    ],
    unlockHint: "Starter Vanguard vestment",
    isDefault: true,
    accent: "#94A3B8",
    modifiers: {
      elementalResistBonus: 0.04,
      maxShieldBonus: 10,
      startingShieldBonus: 5
    }
  },
  {
    id: "vanguard_obsidian_juggernaut",
    slot: "vestment",
    heroClass: "vanguard",
    name: "Obsidian Juggernaut Harness",
    rarity: "Forged",
    archetype: "Berserker Juggernaut Plate",
    passiveId: "war_monger",
    passiveName: "War Monger",
    passiveSummary: `Above 30% HP, direct hits heal ${Math.round(ARMAMENT_TUNING.passives.warMonger.aboveThresholdLifestealPct * 100)}% Lifesteal. At or below 30% HP, Lifesteal surges to 50%.`,
    summary: "Heavy obsidian warplate trading mobility for brutal desperate Lifesteal when battered.",
    effectLines: [
      `Passive \u2014 War Monger: ${Math.round(ARMAMENT_TUNING.passives.warMonger.aboveThresholdLifestealPct * 100)}% Lifesteal above 30% HP; 50% Lifesteal at/below 30% HP (replaces Iron Will)`,
      "+25 Maximum HP & +8% Physical Resistance",
      "-5% Movement Speed"
    ],
    unlockHint: "Defeat Floor Bosses as Vanguard",
    accent: "#CBD5E1",
    modifiers: {
      maxHpBonus: 25,
      physicalResistBonus: 0.08,
      moveSpeedMult: 0.95
    }
  },
  {
    id: "vanguard_aegis_sovereign_mail",
    slot: "vestment",
    heroClass: "vanguard",
    name: "Sovereign Aegis Warplate",
    rarity: "Ascendant",
    archetype: "Thermal Furnace Warplate",
    passiveId: "heat",
    passiveName: "Heat",
    passiveSummary: `Confirmed Basic Attack hits build Heat (+${ARMAMENT_TUNING.passives.heat.gainPerHit}/hit up to ${ARMAMENT_TUNING.passives.heat.cap}), boosting damage up to +${Math.round(ARMAMENT_TUNING.passives.heat.maxDamageBonusPct * 100)}%. Resets after ${(ARMAMENT_TUNING.passives.heat.resetGraceMs / 1e3).toFixed(1)}s without hits.`,
    summary: "Gilded sanctum warplate stoking an escalating Heat gauge during relentless melee pressure.",
    effectLines: [
      `Passive \u2014 Heat: Basic hits build Heat (up to +${Math.round(ARMAMENT_TUNING.passives.heat.maxDamageBonusPct * 100)}% dmg); resets when idle (replaces Iron Will)`,
      "+15 Maximum HP & +5% Physical Resistance",
      "+5% Attack Speed"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Vanguard",
    accent: "#F59E0B",
    modifiers: {
      maxHpBonus: 15,
      physicalResistBonus: 0.05,
      attackSpeedBonus: 0.05
    }
  },
  // ================= RANGER VESTMENTS =================
  {
    id: "ranger_thornwood_brigandine",
    slot: "vestment",
    heroClass: "ranger",
    name: "Thornwood Stalker Brigandine",
    rarity: "Standard",
    archetype: "Scout Leather & Cloak",
    passiveId: "eagle_keenness",
    passiveName: "Eagle Keenness",
    passiveSummary: "Arrows hitting foes at 180u+ trigger Longshot (+25% guaranteed Crit). Kills grant +22% Haste for 2.5s.",
    summary: "Oil-treated forest brigandine preserving classic Eagle Keenness sniping and kill-haste.",
    effectLines: [
      "Passive \u2014 Eagle Keenness: Longshot Crits at 180u+ (+25% dmg) & 2.5s Haste on kill",
      "+5% Movement Speed & +4% Elemental Resistance",
      "+5 Maximum HP"
    ],
    unlockHint: "Starter Ranger vestment",
    isDefault: true,
    accent: "#4ADE80",
    modifiers: {
      maxHpBonus: 5,
      moveSpeedMult: 1.05,
      elementalResistBonus: 0.04
    }
  },
  {
    id: "ranger_windrunner_mantle",
    slot: "vestment",
    heroClass: "ranger",
    name: "Windrunner Mistcloak",
    rarity: "Forged",
    archetype: "Gale-Charged Skirmisher Cloak",
    passiveId: "momentum",
    passiveName: "Momentum",
    passiveSummary: `Continuous movement builds Momentum (up to +${Math.round(ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct * 100)}% Attack Speed). Standing still or taking damage resets it.`,
    summary: "Featherlight mistcloak converting sustained kiting movement directly into rapid bow cadence.",
    effectLines: [
      `Passive \u2014 Momentum: Moving builds up to +${Math.round(ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct * 100)}% Attack Speed; stopping or hit resets (replaces Eagle Keenness)`,
      "+10% Movement Speed & +5% Attack Speed",
      "+10 Maximum HP"
    ],
    unlockHint: "Defeat Floor Bosses as Ranger",
    accent: "#38BDF8",
    modifiers: {
      maxHpBonus: 10,
      moveSpeedMult: 1.1,
      attackSpeedBonus: 0.05
    }
  },
  {
    id: "ranger_briarheart_leather",
    slot: "vestment",
    heroClass: "ranger",
    name: "Briarheart Sentinel Hauberk",
    rarity: "Ascendant",
    archetype: "Apex Tracker Brigandine",
    passiveId: "predators_instinct",
    passiveName: "Predator's Instinct",
    passiveSummary: `Repeated attacks against the same foe build up to ${ARMAMENT_TUNING.passives.predatorsInstinct.maxStacks} stacks (+${Math.round(ARMAMENT_TUNING.passives.predatorsInstinct.damagePerStackPct * 100)}%/stack, max +${ARMAMENT_TUNING.passives.predatorsInstinct.maxStacks * Math.round(ARMAMENT_TUNING.passives.predatorsInstinct.damagePerStackPct * 100)}%). Switching targets or stopping resets.`,
    summary: "Briar-woven sentinel leather locking focus onto a single quarry until brought down.",
    effectLines: [
      `Passive \u2014 Predator's Instinct: Focusing one target stacks up to +${ARMAMENT_TUNING.passives.predatorsInstinct.maxStacks * Math.round(ARMAMENT_TUNING.passives.predatorsInstinct.damagePerStackPct * 100)}% damage (replaces Eagle Keenness)`,
      "+20 Maximum HP & +6% Physical Resistance",
      "+5% Critical Strike Chance"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Ranger",
    accent: "#10B981",
    modifiers: {
      maxHpBonus: 20,
      physicalResistBonus: 0.06,
      critChanceBonus: 0.05
    }
  },
  // ================= ARCANIST VESTMENTS =================
  {
    id: "arcanist_astral_vestments",
    slot: "vestment",
    heroClass: "arcanist",
    name: "Spireweaver Astral Vestments",
    rarity: "Standard",
    archetype: "Runed Scholar Robes",
    passiveId: "astral_resonance",
    passiveName: "Astral Resonance",
    passiveSummary: "Every 4th cosmic bolt unleashes a pulsing Star Rift zone (8s CD) dealing continuous AoE Arcane damage.",
    summary: "Indigo vestments threaded with silver astrolabe wire channeling classic Astral Resonance rifts.",
    effectLines: [
      "Passive \u2014 Astral Resonance: Every 4th Basic Attack summons a pulsing Star Rift",
      "+5% Elemental Resistance & +3% Cooldown Reduction",
      "+5 Maximum HP"
    ],
    unlockHint: "Starter Arcanist vestment",
    isDefault: true,
    accent: "#818CF8",
    modifiers: {
      maxHpBonus: 5,
      elementalResistBonus: 0.05,
      cdrBonus: 0.03
    }
  },
  {
    id: "arcanist_chronomancer_shroud",
    slot: "vestment",
    heroClass: "arcanist",
    name: "Chronomancer Silk Shroud",
    rarity: "Forged",
    archetype: "Temporal Conduit Robes",
    passiveId: "temporal_acceleration",
    passiveName: "Temporal Acceleration",
    passiveSummary: `Basic hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.tacticalReductionPerBasicHitMs}ms Tactical CD; Tactical hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.ultReductionPerTacticalHitMs}ms Ultimate CD.`,
    summary: "Quicksilver-lined shroud cycling Scrolls and Chrono Wells at blinding speed.",
    effectLines: [
      `Passive \u2014 Temporal Acceleration: Basic hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.tacticalReductionPerBasicHitMs}ms Tactical & Tactical hits trim -${ARMAMENT_TUNING.passives.temporalAcceleration.ultReductionPerTacticalHitMs}ms Ult CD (replaces Astral Resonance)`,
      "+8% Cooldown Reduction & +5% Movement Speed",
      "+10 Maximum HP"
    ],
    unlockHint: "Defeat Floor Bosses as Arcanist",
    accent: "#38BDF8",
    modifiers: {
      maxHpBonus: 10,
      cdrBonus: 0.08,
      moveSpeedMult: 1.05
    }
  },
  {
    id: "arcanist_voidward_robes",
    slot: "vestment",
    heroClass: "arcanist",
    name: "Voidward Battlemage Robes",
    rarity: "Ascendant",
    archetype: "Void-Empowered Battle Robes",
    passiveId: "void_consumption",
    passiveName: "Void Consumption",
    passiveSummary: `Basic hits build Void Energy (+${ARMAMENT_TUNING.passives.voidConsumption.gainPerHit}/${ARMAMENT_TUNING.passives.voidConsumption.cap}). At max Energy, your next Tactical/Scroll consumes it for +${Math.round(ARMAMENT_TUNING.passives.voidConsumption.empoweredTacticalBonusPct * 100)}% damage.`,
    summary: "Runic void-cloth storing raw eldritch charge to overcharge your next Tactical or Scroll cast.",
    effectLines: [
      `Passive \u2014 Void Consumption: Basic hits fill Void Energy to empower next Tactical/Scroll by +${Math.round(ARMAMENT_TUNING.passives.voidConsumption.empoweredTacticalBonusPct * 100)}% (replaces Astral Resonance)`,
      "+25 Maximum HP & +8% Elemental Resistance",
      "+5% Cooldown Reduction"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Arcanist",
    accent: "#A855F7",
    modifiers: {
      maxHpBonus: 25,
      elementalResistBonus: 0.08,
      cdrBonus: 0.05
    }
  },
  // ================= CLERIC VESTMENTS =================
  {
    id: "cleric_prelate_raiment",
    slot: "vestment",
    heroClass: "cleric",
    name: "Sunbrand Prelate Raiment",
    rarity: "Standard",
    archetype: "Consecrated Choir Vestments",
    passiveId: "radiant_aura",
    passiveName: "Radiant Aura",
    passiveSummary: "Pulses healing light every 2.0s to nearby allies and revives fallen allies 40% faster.",
    summary: "Gold-embroidered vestments channeling classic Radiant Aura party sustenance.",
    effectLines: [
      "Passive \u2014 Radiant Aura: 2.0s party healing pulse & +40% Ally Revive Speed",
      "+5% Healing Power & +3% Physical Resistance",
      "+5 Maximum HP"
    ],
    unlockHint: "Starter Cleric vestment",
    isDefault: true,
    accent: "#FACC15",
    modifiers: {
      maxHpBonus: 5,
      auraHealBonusPct: 0.05,
      physicalResistBonus: 0.03
    }
  },
  {
    id: "cleric_martyr_surplice",
    slot: "vestment",
    heroClass: "cleric",
    name: "Hallowed Martyr Surplice",
    rarity: "Forged",
    archetype: "Lifewell Reservoir Vestments",
    passiveId: "shared_grace",
    passiveName: "Shared Grace",
    passiveSummary: `Stores ${Math.round(ARMAMENT_TUNING.passives.sharedGrace.storePct * 100)}% of effective ally healing as Grace (cap ${ARMAMENT_TUNING.passives.sharedGrace.maxCap}). Automatically heals allies dropping below ${Math.round(ARMAMENT_TUNING.passives.sharedGrace.triggerHpRatio * 100)}% HP.`,
    summary: "Sunlit surplice banking overflow devotion to rescue injured allies the moment danger strikes.",
    effectLines: [
      `Passive \u2014 Shared Grace: Stores ${Math.round(ARMAMENT_TUNING.passives.sharedGrace.storePct * 100)}% ally healing (cap ${ARMAMENT_TUNING.passives.sharedGrace.maxCap}) & auto-mends injured allies (replaces Radiant Aura)`,
      "+15% Healing Power & +5% Cooldown Reduction",
      "+15 Maximum HP"
    ],
    unlockHint: "Defeat Floor Bosses as Cleric",
    accent: "#34D399",
    modifiers: {
      maxHpBonus: 15,
      auraHealBonusPct: 0.15,
      cdrBonus: 0.05
    }
  },
  {
    id: "cleric_templar_cassock",
    slot: "vestment",
    heroClass: "cleric",
    name: "Arch-Templar Sanctum Plate",
    rarity: "Ascendant",
    archetype: "Sanctified Battle-Plate",
    passiveId: "sacred_retribution",
    passiveName: "Sacred Retribution",
    passiveSummary: `Ally heals build Sanctity (+${ARMAMENT_TUNING.passives.sacredRetribution.sanctityPerHeal}/${ARMAMENT_TUNING.passives.sacredRetribution.cap}). At max Sanctity, your next Basic Attack emits a holy shockwave damaging enemies & healing allies.`,
    summary: "Sacred steel-lined plate converting battlefield triage into punishing holy shockwaves.",
    effectLines: [
      `Passive \u2014 Sacred Retribution: Ally heals build Sanctity; at ${ARMAMENT_TUNING.passives.sacredRetribution.cap}, next Basic Attack triggers Holy Shockwave (replaces Radiant Aura)`,
      "+25 Maximum HP & +8% Physical Resistance",
      "+8% Elemental Resistance"
    ],
    unlockHint: "Defeat Floor 3+ Bosses as Cleric",
    accent: "#FDE047",
    modifiers: {
      maxHpBonus: 25,
      physicalResistBonus: 0.08,
      elementalResistBonus: 0.08
    }
  }
];
var WEAPONS_BY_ID = new Map(
  WEAPON_CATALOG.map((w) => [w.id, w])
);
var VESTMENTS_BY_ID = new Map(
  VESTMENT_CATALOG.map((v) => [v.id, v])
);
function getDefaultWeaponIdForClass(heroClass) {
  return DEFAULT_WEAPON_BY_CLASS[heroClass] || DEFAULT_WEAPON_BY_CLASS.vanguard;
}
function getDefaultVestmentIdForClass(heroClass) {
  return DEFAULT_VESTMENT_BY_CLASS[heroClass] || DEFAULT_VESTMENT_BY_CLASS.vanguard;
}
function getWeaponDef(weaponId) {
  if (!weaponId || typeof weaponId !== "string") return null;
  return WEAPONS_BY_ID.get(weaponId) ?? null;
}
function getVestmentDef(vestmentId) {
  if (!vestmentId || typeof vestmentId !== "string") return null;
  return VESTMENTS_BY_ID.get(vestmentId) ?? null;
}
function getArmamentDef(slot, itemId) {
  return slot === "weapon" ? getWeaponDef(itemId) : getVestmentDef(itemId);
}
function resolveEquippedWeaponForClass(heroClass, weaponId) {
  const def = getWeaponDef(weaponId);
  if (!def || def.heroClass !== heroClass) return null;
  return def;
}
function resolveEquippedVestmentForClass(heroClass, vestmentId) {
  const def = getVestmentDef(vestmentId);
  if (!def || def.heroClass !== heroClass) return null;
  return def;
}
function resolveActiveVestmentPassive(heroClass, vestmentId) {
  const equipped = resolveEquippedVestmentForClass(heroClass, vestmentId);
  if (equipped) return equipped.passiveId;
  const fallback = getVestmentDef(getDefaultVestmentIdForClass(heroClass));
  return fallback?.passiveId ?? "iron_will";
}
function getClassDefaultScalingAttribute(heroClass) {
  switch (heroClass) {
    case "ranger":
      return "dexterity";
    case "arcanist":
      return "intelligence";
    case "cleric":
      return "faith";
    case "vanguard":
    default:
      return "strength";
  }
}
function getClassDefaultDamageCategory(heroClass) {
  if (heroClass === "arcanist") return "arcane";
  if (heroClass === "cleric") return "divine";
  return "physical";
}
function getAttributeLabel(attr) {
  switch (attr) {
    case "dexterity":
      return "Dexterity";
    case "intelligence":
      return "Intelligence";
    case "faith":
      return "Faith";
    case "strength":
    default:
      return "Strength";
  }
}
function getAttributeShortLabel(attr) {
  switch (attr) {
    case "dexterity":
      return "DEX";
    case "intelligence":
      return "INT";
    case "faith":
      return "FTH";
    case "strength":
    default:
      return "STR";
  }
}
function getPlayerAttributeValue(stats, attr) {
  switch (attr) {
    case "dexterity":
      return Math.max(0, stats.dexterity || 0);
    case "intelligence":
      return Math.max(0, stats.intelligence || 0);
    case "faith":
      return Math.max(0, stats.faith || 0);
    case "strength":
    default:
      return Math.max(0, stats.strength || 0);
  }
}
function resolveWeaponDamageCategory(defaultCategory, mode, stats) {
  if (mode === "adaptive") {
    const str = Math.max(0, stats?.strength || 0);
    const intStat = Math.max(0, stats?.intelligence || 0);
    if (str > intStat) return "physical";
    if (intStat > str) return "arcane";
    return defaultCategory;
  }
  return defaultCategory;
}
function resolveWeaponCombatProfile(heroClass, weaponInput, stats) {
  const weaponDef = weaponInput && typeof weaponInput === "object" ? weaponInput.heroClass === heroClass ? weaponInput : null : resolveEquippedWeaponForClass(heroClass, weaponInput);
  const modifiers = weaponDef?.modifiers || {};
  const scalingAttribute = modifiers.scalingAttribute ?? (modifiers.usesIntScaling ? "intelligence" : getClassDefaultScalingAttribute(heroClass));
  const defaultDamageCategory = modifiers.damageCategory ?? getClassDefaultDamageCategory(heroClass);
  const damageTypeMode = modifiers.damageTypeMode ?? "fixed";
  const damageCategory = resolveWeaponDamageCategory(defaultDamageCategory, damageTypeMode, stats);
  const rawAttributeValue = getPlayerAttributeValue(stats || {}, scalingAttribute);
  const attributeScalingMult = scalingAttribute === "dexterity" && modifiers.dexScalingMult !== void 0 ? modifiers.dexScalingMult : 1;
  return {
    weaponDef,
    modifiers,
    scalingAttribute,
    scalingAttributeLabel: getAttributeLabel(scalingAttribute),
    scalingAttributeShort: getAttributeShortLabel(scalingAttribute),
    defaultDamageCategory,
    damageTypeMode,
    damageCategory,
    isAdaptive: damageTypeMode === "adaptive",
    rawAttributeValue,
    attributeScalingMult,
    effectiveAttributeValue: rawAttributeValue * attributeScalingMult
  };
}
function parseArmamentIdArray(raw, slot) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const valid = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const def = slot === "weapon" ? WEAPONS_BY_ID.get(entry) : VESTMENTS_BY_ID.get(entry);
    if (def && !seen.has(entry)) {
      seen.add(entry);
      valid.push(entry);
    }
  }
  return valid;
}
function normalizeArmamentLoadout(heroClass, input, forceEquipDefaultsIfEmpty = false) {
  const defaultWeapon = getDefaultWeaponIdForClass(heroClass);
  const defaultVestment = getDefaultVestmentIdForClass(heroClass);
  const ownedWeapons = parseArmamentIdArray(input?.ownedWeapons, "weapon");
  if (!ownedWeapons.includes(defaultWeapon)) {
    ownedWeapons.unshift(defaultWeapon);
  }
  const ownedVestments = parseArmamentIdArray(input?.ownedVestments, "vestment");
  if (!ownedVestments.includes(defaultVestment)) {
    ownedVestments.unshift(defaultVestment);
  }
  let equippedWeapon;
  if (input?.equippedWeapon === void 0) {
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
  let equippedVestment;
  if (input?.equippedVestment === void 0 || input.equippedVestment === null) {
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
    equippedVestment
  };
}
function applyAccountArmamentMigration(acc, isFirstTimeMigration = false) {
  const heroClass = HERO_CLASSES[acc.lockedClass] ? acc.lockedClass : HERO_CLASSES[acc.preferredClass] ? acc.preferredClass : "vanguard";
  const forceDefaults = isFirstTimeMigration && acc.equippedWeapon === void 0 && acc.equippedVestment === void 0;
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
      equippedVestment: acc.equippedVestment
    },
    forceDefaults
  );
  acc.ownedWeapons = normalized.ownedWeapons;
  acc.ownedVestments = normalized.ownedVestments;
  acc.equippedWeapon = normalized.equippedWeapon;
  acc.equippedVestment = normalized.equippedVestment;
  return JSON.stringify(acc.ownedWeapons) !== beforeW || JSON.stringify(acc.ownedVestments) !== beforeV || acc.equippedWeapon !== beforeEqW || acc.equippedVestment !== beforeEqV;
}
function pickNextUnlockableArmamentForClass(heroClass, ownedWeapons, ownedVestments, floor) {
  const classItems = [
    ...WEAPON_CATALOG.filter((w) => w.heroClass === heroClass && !w.isDefault),
    ...VESTMENT_CATALOG.filter((v) => v.heroClass === heroClass && !v.isDefault)
  ];
  const unowned = classItems.filter(
    (item) => item.slot === "weapon" ? !ownedWeapons.includes(item.id) : !ownedVestments.includes(item.id)
  );
  if (unowned.length === 0) return null;
  const forgedPool = unowned.filter((i) => i.rarity === "Forged");
  const pool = floor < 3 && forgedPool.length > 0 ? forgedPool : unowned;
  return pool[Math.floor(Math.random() * pool.length)] ?? unowned[0];
}
var PRIMARY_COMBO_RESET_WINDOW_MS = 1400;
function getWeaponComboStepCount(_heroClass, _equippedWeapon) {
  return 3;
}

// src/shared/playerMovement.ts
var propGateCache = /* @__PURE__ */ new WeakMap();
function getWardenGateProps(props) {
  const cached = propGateCache.get(props);
  if (cached && cached.len === props.length) {
    return cached.gates;
  }
  const gates = [];
  for (let i = 0; i < props.length; i++) {
    if (props[i].kind === "warden_gate") {
      gates.push(props[i]);
    }
  }
  propGateCache.set(props, { len: props.length, gates });
  return gates;
}
function isWallAtWorld(map, props, wx, wy, npcs) {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) {
    return true;
  }
  const code = map.tiles[ty * map.width + tx];
  if (code === 0 || code === 2 || code === 3) return true;
  if (props.length > 0) {
    const gates = getWardenGateProps(props);
    for (let i = 0; i < gates.length; i++) {
      const prop = gates[i];
      if (!prop.opened && Math.abs(wx - prop.x) <= 88 && wy >= prop.y - 50 && wy <= prop.y + 20) {
        return true;
      }
    }
  }
  if (npcs && npcs.length > 0) {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const dx = wx - npc.x;
      const dy = wy - npc.y;
      if (dx * dx + dy * dy <= 400) {
        return true;
      }
    }
  }
  return false;
}
function hasLineOfSight(map, props, x1, y1, x2, y2, npcs) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist <= TILE_SIZE) return true;
  const steps = Math.ceil(dist / 14);
  const stepX = dx / steps;
  const stepY = dy / steps;
  for (let i = 1; i < steps; i++) {
    if (isWallAtWorld(map, props, x1 + stepX * i, y1 + stepY * i, npcs)) {
      return false;
    }
  }
  return true;
}
var COLLISION_COS = [
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
  0,
  Math.SQRT1_2
];
var COLLISION_SIN = [
  0,
  Math.SQRT1_2,
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2
];
function collidesCircle(map, props, wx, wy, radius, npcs) {
  if (isWallAtWorld(map, props, wx, wy, npcs)) return true;
  for (let i = 0; i < 8; i++) {
    const cx = wx + COLLISION_COS[i] * radius;
    const cy = wy + COLLISION_SIN[i] * radius;
    if (isWallAtWorld(map, props, cx, cy, npcs)) return true;
  }
  return false;
}
function moveWithCollision(map, props, entity, dx, dy, radius, npcs) {
  if (collidesCircle(map, props, entity.x, entity.y, radius * 0.75, npcs)) {
    let escapeX = 0;
    let escapeY = 0;
    const probeDist = radius + 8;
    for (let i = 0; i < 8; i++) {
      const testX = entity.x + COLLISION_COS[i] * probeDist;
      const testY = entity.y + COLLISION_SIN[i] * probeDist;
      if (!isWallAtWorld(map, props, testX, testY, npcs)) {
        escapeX += COLLISION_COS[i];
        escapeY += COLLISION_SIN[i];
      }
    }
    if (escapeX !== 0 || escapeY !== 0) {
      const len = Math.hypot(escapeX, escapeY);
      entity.x += escapeX / len * 4;
      entity.y += escapeY / len * 4;
    }
  }
  const targetX = entity.x + dx;
  const targetY = entity.y + dy;
  if (hasLineOfSight(map, props, entity.x, entity.y, targetX, targetY, npcs) && !collidesCircle(map, props, targetX, targetY, radius, npcs)) {
    entity.x = targetX;
    entity.y = targetY;
    return;
  }
  if (dx !== 0 && !collidesCircle(map, props, targetX, entity.y, radius, npcs)) {
    entity.x = targetX;
  } else if (dx !== 0 && !collidesCircle(map, props, entity.x + dx * 0.5, entity.y, radius, npcs)) {
    entity.x += dx * 0.5;
  }
  if (dy !== 0 && !collidesCircle(map, props, entity.x, targetY, radius, npcs)) {
    entity.y = targetY;
  } else if (dy !== 0 && !collidesCircle(map, props, entity.x, entity.y + dy * 0.5, radius, npcs)) {
    entity.y += dy * 0.5;
  }
}
function computePlayerMoveSpeed(player) {
  const def = HERO_CLASSES[player.heroClass];
  let moveSpeed = def.speed * (1 + (player.dexterity || 0) * 25e-4);
  const equippedVestment = resolveEquippedVestmentForClass(player.heroClass, player.equippedVestment);
  if (equippedVestment?.modifiers.moveSpeedMult && equippedVestment.modifiers.moveSpeedMult !== 1) {
    moveSpeed *= equippedVestment.modifiers.moveSpeedMult;
  }
  if (player.relics.includes("zephyr_greaves")) moveSpeed *= 1.15;
  if ((player.hasteMs || 0) > 0) moveSpeed *= 1.22;
  if ((player.crimsonFrenzyMs || 0) > 0) {
    const maxMs = player.crimsonFrenzyMaxMs || ARMAMENT_TUNING.weapons.crimson.frenzyDurationMs;
    const ratio = Math.max(0, Math.min(1, player.crimsonFrenzyMs / maxMs));
    moveSpeed *= 1 + ARMAMENT_TUNING.weapons.crimson.frenzyMoveSpeedBonusPct * ratio;
  }
  if (player.floorBlessings && player.floorBlessings.length > 0) {
    let swiftStacks = 0;
    for (let i = 0; i < player.floorBlessings.length; i++) {
      if (player.floorBlessings[i] === "swiftness") swiftStacks++;
    }
    if (swiftStacks > 0) moveSpeed *= 1 + swiftStacks * 0.08;
  }
  if (player.speedBoost) moveSpeed *= 1.8;
  if (player.statuses && player.statuses.length > 0) {
    if (player.statuses.some((s) => s.type === "frostbite")) {
      moveSpeed *= 0.55;
    }
    if (player.statuses.some((s) => s.type === "impaled")) {
      moveSpeed *= 0.75;
    }
  }
  return moveSpeed;
}
function normalizePlayerInputDirection(input, disoriented = false, timeMs = 0) {
  let mx = 0;
  let my = 0;
  if (typeof input.stickX === "number" && typeof input.stickY === "number" && (Math.abs(input.stickX) > 0.05 || Math.abs(input.stickY) > 0.05)) {
    const len = Math.hypot(input.stickX, input.stickY);
    const clampedLen = Math.min(1, len);
    mx = input.stickX / len * clampedLen;
    my = input.stickY / len * clampedLen;
  } else {
    mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    }
  }
  if (disoriented) {
    const drift = timeMs * 3e-3;
    mx += Math.cos(drift) * 0.25;
    my += Math.sin(drift * 0.8) * 0.25;
  }
  if (mx !== 0 || my !== 0) {
    const inputLen = Math.hypot(mx, my);
    if (inputLen > 1) {
      mx /= inputLen;
      my /= inputLen;
    }
  }
  return { mx, my };
}

// src/shared/abilityTargeting.ts
var DASH_TARGET_SPEC = {
  action: "dash",
  label: "Dash",
  kind: "dash",
  range: 110,
  aoeRadius: 18,
  defaultDist: 110,
  collisionRadius: 14,
  accentColor: "#F59E0B",
  secondaryColor: "#FEF08A"
};
var CLASS_ABILITY_SPECS = {
  vanguard: {
    tactical: {
      action: "tactical",
      label: "Bulwark Dash",
      kind: "dash",
      range: 92,
      aoeRadius: 84,
      secondaryRadius: 170,
      defaultDist: 92,
      collisionRadius: 12,
      accentColor: "#F59E0B",
      secondaryColor: "#93C5FD"
    },
    ult: {
      action: "ult",
      label: "Aegis Sanctuary",
      kind: "self_aoe",
      range: 0,
      aoeRadius: 105,
      defaultDist: 0,
      accentColor: "#60A5FA",
      secondaryColor: "#FDE047"
    }
  },
  ranger: {
    tactical: {
      action: "tactical",
      label: "Frost Volley",
      kind: "cone_volley",
      range: 210,
      aoeRadius: 0,
      defaultDist: 210,
      coneRayOffsets: [-0.28, -0.14, 0, 0.14, 0.28],
      accentColor: "#38BDF8",
      secondaryColor: "#BAE6FD"
    },
    ult: {
      action: "ult",
      label: "Hunter Quarry",
      kind: "self_aoe",
      range: 0,
      aoeRadius: 340,
      defaultDist: 0,
      accentColor: "#FBBF24",
      secondaryColor: "#FDE68A"
    }
  },
  arcanist: {
    tactical: {
      action: "tactical",
      label: "Astral Nova",
      kind: "self_aoe",
      range: 165,
      aoeRadius: 165,
      defaultDist: 0,
      radialRays: 8,
      accentColor: "#818CF8",
      secondaryColor: "#38BDF8"
    },
    ult: {
      action: "ult",
      label: "Chrono Well",
      kind: "ground_aoe",
      range: 220,
      aoeRadius: 115,
      defaultDist: 110,
      accentColor: "#38BDF8",
      secondaryColor: "#C084FC"
    }
  },
  cleric: {
    tactical: {
      action: "tactical",
      label: "Sanctified Pulse",
      kind: "self_aoe",
      range: 0,
      aoeRadius: 210,
      secondaryRadius: 135,
      defaultDist: 0,
      accentColor: "#34D399",
      secondaryColor: "#FACC15"
    },
    ult: {
      action: "ult",
      label: "Solar Beacon",
      kind: "ground_aoe",
      range: 180,
      aoeRadius: 115,
      defaultDist: 0,
      accentColor: "#FACC15",
      secondaryColor: "#34D399"
    }
  }
};
var ARCANIST_SCROLL_TARGET_SPECS = {
  fireball: {
    action: "tactical",
    label: "Fireball",
    kind: "line",
    range: 360,
    aoeRadius: 105,
    lineWidth: 28,
    defaultDist: 220,
    accentColor: "#F97316",
    secondaryColor: "#FDBA74"
  },
  disintegration: {
    action: "tactical",
    label: "Disintegration",
    kind: "line",
    range: 450,
    aoeRadius: 0,
    lineWidth: 42,
    defaultDist: 450,
    accentColor: "#A855F7",
    secondaryColor: "#E9D5FF"
  },
  frost_lance: {
    action: "tactical",
    label: "Frost Lance",
    kind: "line",
    range: 420,
    aoeRadius: 0,
    lineWidth: 16,
    defaultDist: 420,
    accentColor: "#38BDF8",
    secondaryColor: "#BAE6FD"
  },
  chain_lightning: {
    action: "tactical",
    label: "Chain Lightning",
    kind: "cone",
    range: 340,
    aoeRadius: 0,
    coneHalfAngleRad: 0.56,
    defaultDist: 340,
    accentColor: "#FACC15",
    secondaryColor: "#38BDF8"
  },
  arcane_meteor: {
    action: "tactical",
    label: "Arcane Meteor",
    kind: "ground_aoe",
    range: 280,
    aoeRadius: 125,
    defaultDist: 180,
    accentColor: "#E879F9",
    secondaryColor: "#F5D0FE"
  },
  arcane_orb: {
    action: "tactical",
    label: "Arcane Orb",
    kind: "line",
    range: 460,
    aoeRadius: 22,
    lineWidth: 44,
    defaultDist: 280,
    accentColor: "#818CF8",
    secondaryColor: "#C7D2FE"
  },
  arcane_barrage: {
    action: "tactical",
    label: "Arcane Barrage",
    kind: "line",
    range: 450,
    aoeRadius: 0,
    lineWidth: 28,
    defaultDist: 450,
    accentColor: "#60A5FA",
    secondaryColor: "#BFDBFE"
  }
};
var WEAPON_TACTICAL_TARGET_SPECS = {
  bastion_counter: {
    action: "tactical",
    label: "Bastion Counter",
    kind: "cone",
    range: ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx,
    aoeRadius: ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx,
    coneHalfAngleRad: ARMAMENT_TUNING.weapons.sunforged.bastionCleaveHalfAngleRad,
    defaultDist: ARMAMENT_TUNING.weapons.sunforged.bastionCleaveRadiusPx,
    accentColor: "#FBBF24",
    secondaryColor: "#FEF08A"
  },
  crimson_frenzy: {
    action: "tactical",
    label: "Crimson Frenzy",
    kind: "self_aoe",
    range: 0,
    aoeRadius: 56,
    defaultDist: 0,
    accentColor: "#EF4444",
    secondaryColor: "#FCA5A5"
  },
  cyclone_break: {
    action: "tactical",
    label: "Cyclone Break",
    kind: "line",
    range: ARMAMENT_TUNING.weapons.galewind.cycloneArrowRangePx,
    aoeRadius: ARMAMENT_TUNING.weapons.galewind.cycloneRadiusPx,
    lineWidth: 34,
    defaultDist: ARMAMENT_TUNING.weapons.galewind.cycloneArrowRangePx,
    accentColor: "#38BDF8",
    secondaryColor: "#6EE7B7"
  },
  black_sun: {
    action: "tactical",
    label: "Black Sun",
    kind: "ground_aoe",
    range: ARMAMENT_TUNING.weapons.eclipse.blackSunRangePx,
    aoeRadius: ARMAMENT_TUNING.weapons.eclipse.blackSunRadiusPx,
    defaultDist: 155,
    accentColor: "#A855F7",
    secondaryColor: "#FBBF24"
  },
  seraphic_judgment: {
    action: "tactical",
    label: "Seraphic Judgment",
    kind: "ground_aoe",
    range: ARMAMENT_TUNING.weapons.seraphim.tacticalRangePx,
    aoeRadius: ARMAMENT_TUNING.weapons.seraphim.tacticalRadiusPx,
    defaultDist: 120,
    accentColor: "#FDE047",
    secondaryColor: "#F59E0B"
  }
};
function getAbilityTargetSpec(heroClass, action, equippedScrollId, equippedWeaponId) {
  if (action === "dash") return DASH_TARGET_SPEC;
  if (action === "tactical") {
    const active = resolveActiveTacticalDef(heroClass, equippedWeaponId, equippedScrollId);
    if (active.source === "scroll" && active.scrollId) {
      const scrollSpec = ARCANIST_SCROLL_TARGET_SPECS[active.scrollId];
      if (scrollSpec) return scrollSpec;
    }
    if (active.source === "weapon" && active.weaponTacticalId) {
      return WEAPON_TACTICAL_TARGET_SPECS[active.weaponTacticalId];
    }
  }
  return CLASS_ABILITY_SPECS[heroClass][action];
}
function clampGroundTargetDistance(rawDistance, spec) {
  if (typeof rawDistance !== "number" || !Number.isFinite(rawDistance)) {
    return spec.defaultDist;
  }
  return Math.max(0, Math.min(spec.range, rawDistance));
}
function computeGroundTargetPosition(playerX, playerY, aimAngle, rawDistance, spec) {
  const dist = clampGroundTargetDistance(rawDistance, spec);
  return {
    x: playerX + Math.cos(aimAngle) * dist,
    y: playerY + Math.sin(aimAngle) * dist,
    distance: dist
  };
}
var PRIMARY_ATTACK_RANGES = {
  vanguard: 81,
  ranger: 210,
  arcanist: 195,
  cleric: 175
};
function getPrimaryAttackRange(heroClass) {
  return PRIMARY_ATTACK_RANGES[heroClass] ?? 175;
}
function findBestAutoTarget(opts) {
  const hasPref = typeof opts.preferredAngle === "number" && Number.isFinite(opts.preferredAngle);
  const prefCos = hasPref ? Math.cos(opts.preferredAngle) : 1;
  const prefSin = hasPref ? Math.sin(opts.preferredAngle) : 0;
  const minDot = typeof opts.minDot === "number" ? opts.minDot : -1;
  const pickFrom = (list) => {
    let bestTarget = null;
    let bestScore = Infinity;
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = Infinity;
    const maxRangeSq = opts.maxRange * opts.maxRange;
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      if (typeof candidate.hp === "number" && candidate.hp <= 0) continue;
      const dx = candidate.x - opts.playerX;
      const dy = candidate.y - opts.playerY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 1e-6 || distSq > maxRangeSq) continue;
      const dist = Math.sqrt(distSq);
      const dot = hasPref ? (dx * prefCos + dy * prefSin) / dist : 0;
      if (minDot > -1 && dot < minDot) continue;
      if (opts.map && opts.props && !hasLineOfSight(
        opts.map,
        opts.props,
        opts.playerX,
        opts.playerY,
        candidate.x,
        candidate.y
      )) {
        continue;
      }
      const score = dist - Math.max(0, dot) * 16;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = candidate;
        bestDx = dx;
        bestDy = dy;
        bestDist = dist;
      }
    }
    if (!bestTarget) return null;
    return { target: bestTarget, angle: Math.atan2(bestDy, bestDx), distance: bestDist };
  };
  const enemyMatch = pickFrom(opts.enemies);
  if (enemyMatch) return enemyMatch;
  if (opts.trainingDummies && opts.trainingDummies.length > 0) {
    return pickFrom(opts.trainingDummies);
  }
  return null;
}
function resolveSkillSmartTarget(opts) {
  const { spec, playerX, playerY, fallbackAngle } = opts;
  const fallbackDist = typeof opts.fallbackDistance === "number" && Number.isFinite(opts.fallbackDistance) ? Math.max(0, Math.min(spec.range, opts.fallbackDistance)) : spec.defaultDist;
  if (spec.action === "dash" || spec.kind === "self_aoe") {
    return {
      target: null,
      aimAngle: fallbackAngle,
      aimDistance: fallbackDist
    };
  }
  const acquireRange = spec.kind === "ground_aoe" ? spec.range + Math.min(44, spec.aoeRadius * 0.35) : spec.kind === "dash" ? spec.range + Math.min(56, spec.aoeRadius * 0.6) : spec.range + 28;
  const hasCursor = typeof opts.cursorWorldX === "number" && Number.isFinite(opts.cursorWorldX) && typeof opts.cursorWorldY === "number" && Number.isFinite(opts.cursorWorldY);
  let match = null;
  if (opts.preferCursorCone && hasCursor) {
    const cx = opts.cursorWorldX;
    const cy = opts.cursorWorldY;
    const cursorDist = Math.hypot(cx - playerX, cy - playerY);
    const cursorAngle = cursorDist > 1 ? Math.atan2(cy - playerY, cx - playerX) : fallbackAngle;
    let closestNearCursor = null;
    let closestCursorDist = Math.max(96, spec.aoeRadius * 0.9);
    const scanList = (list) => {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (typeof c.hp === "number" && c.hp <= 0) continue;
        const pDist = Math.hypot(c.x - playerX, c.y - playerY);
        if (pDist <= 1e-3 || pDist > acquireRange) continue;
        const cDist = Math.hypot(c.x - cx, c.y - cy);
        if (cDist > closestCursorDist) continue;
        if (opts.map && opts.props && !hasLineOfSight(opts.map, opts.props, playerX, playerY, c.x, c.y)) {
          continue;
        }
        closestCursorDist = cDist;
        closestNearCursor = c;
      }
    };
    scanList(opts.enemies);
    if (!closestNearCursor && opts.trainingDummies) {
      scanList(opts.trainingDummies);
    }
    if (closestNearCursor) {
      const c = closestNearCursor;
      const dist = Math.hypot(c.x - playerX, c.y - playerY);
      match = { target: c, angle: Math.atan2(c.y - playerY, c.x - playerX), distance: dist };
    } else {
      match = findBestAutoTarget({
        playerX,
        playerY,
        maxRange: acquireRange,
        preferredAngle: cursorAngle,
        minDot: 0.7,
        map: opts.map,
        props: opts.props,
        enemies: opts.enemies,
        trainingDummies: opts.trainingDummies
      });
    }
  }
  if (!match && (!opts.preferCursorCone || opts.allowFullRangeFallback)) {
    match = findBestAutoTarget({
      playerX,
      playerY,
      maxRange: acquireRange,
      preferredAngle: fallbackAngle,
      minDot: -1,
      map: opts.map,
      props: opts.props,
      enemies: opts.enemies,
      trainingDummies: opts.trainingDummies
    });
  }
  if (!match) {
    return {
      target: null,
      aimAngle: fallbackAngle,
      aimDistance: fallbackDist
    };
  }
  const clampedDist = spec.kind === "ground_aoe" ? Math.max(0, Math.min(spec.range, match.distance)) : spec.kind === "dash" ? spec.range : Math.max(0, Math.min(spec.range, match.distance));
  return {
    target: match.target,
    aimAngle: match.angle,
    aimDistance: clampedDist
  };
}

// src/server/dungeonGenerator.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var BIOMES = [
  {
    id: "courtyard",
    title: "Highkeep Outer Bailey",
    bossNames: ["Warden Malakor"]
  },
  {
    id: "catacombs",
    title: "Sunken Crypt",
    bossNames: ["Archlich Vaelor"]
  },
  {
    id: "ember",
    title: "Cindervault Bastion",
    bossNames: ["Ignis, Cinder Sovereign"]
  },
  {
    id: "void",
    title: "Abyssal Shadow Chasm",
    bossNames: ["Void-Eater Malice"]
  },
  {
    id: "astral",
    title: "Aetherial Void Spire",
    bossNames: ["Archon of Nothingness"]
  },
  {
    id: "hymns",
    title: "Hall of Forgotten Hymns",
    bossNames: ["Elyndor, Keeper of the Last Hymn"]
  },
  {
    id: "reliquary",
    title: "Reliquary of the Departed",
    bossNames: ["Zadkiel, Keeper of the Ashen Reliquary"]
  },
  {
    id: "scripture",
    title: "Chapel of Severed Light",
    bossNames: ["Sariel, Warden of the Veiled Scripture"]
  },
  {
    id: "nave",
    title: "Celestial Nave",
    bossNames: ["Seraphel, Sentinel of the Final Seal"]
  },
  {
    id: "wardengate",
    title: "Warden's Gate",
    bossNames: ["Oriphiel, The Last Warden"]
  }
];
function generateDungeonFloor(floor, baseSeed, difficulty, partySize) {
  const floorSeed = (baseSeed >>> 0) + floor * 7919 >>> 0;
  const rng = mulberry32(floorSeed);
  const width = 64;
  const height = 48;
  const tiles = new Array(width * height).fill(0);
  const biomeIndex = Math.max(0, Math.min(BIOMES.length - 1, floor - 1));
  const biomeSpec = BIOMES[biomeIndex];
  const setTile = (tx, ty, code) => {
    if (tx >= 1 && tx < width - 1 && ty >= 1 && ty < height - 1) {
      tiles[ty * width + tx] = code;
    }
  };
  const getTile = (tx, ty) => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return 0;
    return tiles[ty * width + tx];
  };
  const rooms2 = [];
  const targetRoomCount = 8;
  const startW = 8;
  const startH = 8;
  const startX = 4;
  const startY = Math.floor(height / 2 - startH / 2);
  rooms2.push({
    id: 0,
    x: startX,
    y: startY,
    w: startW,
    h: startH,
    cx: Math.floor(startX + startW / 2),
    cy: Math.floor(startY + startH / 2),
    type: "start",
    cleared: true,
    discovered: true
  });
  const bossW = 24 + Math.floor(rng() * 6);
  const bossH = 20 + Math.floor(rng() * 6);
  const bossX = width - bossW - 4;
  const bossY = Math.max(
    4,
    Math.min(
      height - bossH - 4,
      Math.floor(height / 2 - bossH / 2) + Math.floor(rng() * 7) - 3
    )
  );
  rooms2.push({
    id: 1,
    x: bossX,
    y: bossY,
    w: bossW,
    h: bossH,
    cx: Math.floor(bossX + bossW / 2),
    cy: Math.floor(bossY + bossH / 2),
    type: "combat",
    cleared: false,
    discovered: false
  });
  let attempts = 0;
  while (rooms2.length < targetRoomCount && attempts < 320) {
    attempts++;
    const rw = 7 + Math.floor(rng() * 5);
    const rh = 7 + Math.floor(rng() * 4);
    const rx = 4 + Math.floor(rng() * (width - rw - 8));
    const ry = 4 + Math.floor(rng() * (height - rh - 8));
    const overlaps = rooms2.some(
      (r) => rx < r.x + r.w + 3 && rx + rw + 3 > r.x && ry < r.y + r.h + 3 && ry + rh + 3 > r.y
    );
    if (!overlaps) {
      rooms2.push({
        id: rooms2.length,
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2),
        type: "combat",
        cleared: false,
        discovered: false
      });
    }
  }
  const startRoom = rooms2[0];
  const sortedByDist = rooms2.slice(1).sort(
    (a, b) => Math.hypot(a.cx - startRoom.cx, a.cy - startRoom.cy) - Math.hypot(b.cx - startRoom.cx, b.cy - startRoom.cy)
  );
  if (sortedByDist.length >= 3) {
    const bossRoom = sortedByDist[sortedByDist.length - 1];
    bossRoom.type = "boss";
    if (bossRoom.w < 24 || bossRoom.h < 20) {
      bossRoom.w = Math.max(24, bossRoom.w);
      bossRoom.h = Math.max(20, bossRoom.h);
      if (bossRoom.x + bossRoom.w >= width - 2) {
        bossRoom.x = Math.max(2, width - bossRoom.w - 2);
      }
      if (bossRoom.y + bossRoom.h >= height - 2) {
        bossRoom.y = Math.max(2, height - bossRoom.h - 2);
      }
      bossRoom.cx = Math.floor(bossRoom.x + bossRoom.w / 2);
      bossRoom.cy = Math.floor(bossRoom.y + bossRoom.h / 2);
    }
    const treasureRoom = sortedByDist[Math.floor(sortedByDist.length / 2)];
    if (treasureRoom.id !== bossRoom.id) {
      treasureRoom.type = "treasure";
      treasureRoom.cleared = true;
    }
    const shrineRoom = sortedByDist[1];
    if (shrineRoom.id !== bossRoom.id && shrineRoom.id !== treasureRoom.id) {
      shrineRoom.type = "shrine";
      shrineRoom.cleared = true;
    }
    const combatCandidates = sortedByDist.filter((r) => r.type === "combat");
    if (combatCandidates.length > 0) {
      const targetGuardians = floor >= 5 && combatCandidates.length >= 3 ? 2 : 1;
      for (let g = 0; g < targetGuardians; g++) {
        const gRoom = combatCandidates[combatCandidates.length - 1 - g];
        if (gRoom) gRoom.guardian = true;
      }
    }
  }
  for (const room of rooms2) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setTile(x, y, 1);
      }
    }
  }
  const connected = /* @__PURE__ */ new Set([0]);
  const remaining = new Set(rooms2.slice(1).map((r) => r.id));
  const edges = [];
  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestPair = null;
    for (const cId of connected) {
      const rc = rooms2[cId];
      for (const uId of remaining) {
        const ru = rooms2[uId];
        const d = Math.hypot(rc.cx - ru.cx, rc.cy - ru.cy);
        if (d < bestDist) {
          bestDist = d;
          bestPair = [rc, ru];
        }
      }
    }
    if (!bestPair) break;
    edges.push(bestPair);
    connected.add(bestPair[1].id);
    remaining.delete(bestPair[1].id);
  }
  if (rooms2.length >= 5) {
    edges.push([rooms2[1], rooms2[3]]);
  }
  const carveCorridor = (ax, ay, bx, by) => {
    let cx = ax;
    let cy = ay;
    const horizFirst = rng() > 0.5;
    const stampFloor = (px, py) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          setTile(px + dx, py + dy, 1);
        }
      }
    };
    if (horizFirst) {
      while (cx !== bx) {
        stampFloor(cx, cy);
        cx += cx < bx ? 1 : -1;
      }
      while (cy !== by) {
        stampFloor(cx, cy);
        cy += cy < by ? 1 : -1;
      }
    } else {
      while (cy !== by) {
        stampFloor(cx, cy);
        cy += cy < by ? 1 : -1;
      }
      while (cx !== bx) {
        stampFloor(cx, cy);
        cx += cx < bx ? 1 : -1;
      }
    }
    stampFloor(bx, by);
  };
  for (const [ra, rb] of edges) {
    carveCorridor(ra.cx, ra.cy, rb.cx, rb.cy);
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (getTile(x, y) === 0) {
        let touchesFloor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (getTile(x + dx, y + dy) === 1) {
              touchesFloor = true;
            }
          }
        }
        if (touchesFloor) {
          tiles[y * width + x] = 2;
        }
      }
    }
  }
  const torches = [];
  const enemies = [];
  const props = [];
  const npcs = [];
  let propSeq = 1;
  let enemySeq = 1;
  const diffMult = difficulty === "Abyssal" ? 1.45 : difficulty === "Heroic" ? 1.2 : 1;
  const partyMult = 1 + Math.max(0, partySize - 1) * 0.5;
  const floorMult = 1 + (floor - 1) * 0.28;
  const hpScale = diffMult * partyMult * floorMult;
  let portalPos = {
    x: (startRoom.cx + 1) * TILE_SIZE + TILE_SIZE / 2,
    y: startRoom.cy * TILE_SIZE + TILE_SIZE / 2
  };
  for (const room of rooms2) {
    const torchCandidates = [
      { tx: room.x + 1, ty: room.y + 1 },
      { tx: room.x + room.w - 2, ty: room.y + 1 },
      { tx: room.x + 1, ty: room.y + room.h - 2 },
      { tx: room.x + room.w - 2, ty: room.y + room.h - 2 }
    ];
    for (const tc of torchCandidates) {
      if (getTile(tc.tx, tc.ty) === 1 && rng() > 0.22) {
        torches.push({
          x: tc.tx * TILE_SIZE + TILE_SIZE / 2,
          y: tc.ty * TILE_SIZE + TILE_SIZE / 2
        });
      }
    }
    if ((room.type === "combat" || room.type === "boss") && room.w >= 9 && room.h >= 9) {
      const pOffsets = [
        [room.x + 2, room.y + 2],
        [room.x + room.w - 3, room.y + 2],
        [room.x + 2, room.y + room.h - 3],
        [room.x + room.w - 3, room.y + room.h - 3]
      ];
      for (const [px, py] of pOffsets) {
        if (getTile(px, py) === 1) {
          setTile(px, py, 3);
        }
      }
    }
    const centerWorldX = room.cx * TILE_SIZE + TILE_SIZE / 2;
    const centerWorldY = room.cy * TILE_SIZE + TILE_SIZE / 2;
    if (room.type === "start") {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "crate",
        x: (room.x + 2) * TILE_SIZE + 16,
        y: (room.y + 2) * TILE_SIZE + 16,
        opened: false,
        value: 12
      });
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "potion",
        x: (room.x + room.w - 2) * TILE_SIZE + 16,
        y: (room.y + 2) * TILE_SIZE + 16,
        opened: false,
        value: 1
      });
    } else if (room.type === "treasure") {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "relic_chest",
        x: centerWorldX,
        y: centerWorldY,
        opened: false,
        value: 1
      });
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "chest",
        x: centerWorldX - 48,
        y: centerWorldY + 28,
        opened: false,
        value: 35
      });
    } else if (room.type === "shrine") {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "shrine",
        x: centerWorldX,
        y: centerWorldY,
        opened: false,
        value: 55
      });
    } else if (room.type === "combat") {
      const baseEnemyCount = 3 + Math.floor(rng() * 3) + Math.min(2, Math.floor(floor / 2));
      const enemyCount = room.guardian ? Math.max(4, baseEnemyCount) : baseEnemyCount;
      const pool = floor === 1 ? ["slime", "goblin", "skeleton"] : floor === 2 ? ["goblin", "skeleton", "cultist"] : floor === 3 ? ["skeleton", "knight", "cultist"] : floor === 4 ? ["cultist", "shadow_stalker", "skeleton"] : floor === 5 ? ["astral_sentinel", "cultist", "shadow_stalker"] : floor === 6 ? ["skeleton", "cultist", "hymn_phantom"] : floor === 7 ? ["knight", "relic_golem", "skeleton"] : floor === 8 ? ["cultist", "shadow_stalker", "veiled_heretic"] : floor === 9 ? ["astral_sentinel", "knight", "celestial_arbiter"] : ["astral_sentinel", "shadow_stalker", "warden_enforcer"];
      for (let i = 0; i < enemyCount; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
        let spawnTx = Math.floor(room.cx);
        let spawnTy = Math.floor(room.cy);
        for (let attempt = 0; attempt < 12; attempt++) {
          const candTx = Math.floor(room.x + 2 + rng() * (room.w - 4));
          const candTy = Math.floor(room.y + 2 + rng() * (room.h - 4));
          if (getTile(candTx, candTy) === 1) {
            spawnTx = candTx;
            spawnTy = candTy;
            break;
          }
        }
        const ex = spawnTx * TILE_SIZE + TILE_SIZE / 2;
        const ey = spawnTy * TILE_SIZE + TILE_SIZE / 2;
        const isRoomGuardian = Boolean(room.guardian && i === 0);
        const elite = isRoomGuardian || rng() < 0.16 + floor * 0.04;
        const enemy = makeEnemy(`en_${floor}_${enemySeq++}`, kind, room.id, ex, ey, hpScale, elite, floor, biomeSpec.id);
        if (isRoomGuardian) {
          enemy.name = `Guardian ${enemy.name.replace(/^Elite /, "")}`;
          enemy.maxHp = Math.round(enemy.maxHp * 1.25);
          enemy.hp = enemy.maxHp;
          enemy.radius += 2;
        }
        enemies.push(enemy);
      }
      if (room.guardian) {
        props.push({
          id: `prop_${floor}_${propSeq++}`,
          kind: "totem",
          x: centerWorldX,
          y: centerWorldY,
          opened: false,
          locked: true,
          roomId: room.id,
          value: floor
        });
      } else if (rng() > 0.35) {
        const propKind = rng() > 0.65 ? "chest" : "crate";
        props.push({
          id: `prop_${floor}_${propSeq++}`,
          kind: propKind,
          x: (room.x + 1.8) * TILE_SIZE,
          y: (room.y + room.h - 1.8) * TILE_SIZE,
          opened: false,
          locked: propKind === "chest",
          roomId: room.id,
          value: 20 + floor * 8
        });
      }
    } else if (room.type === "boss") {
      const bossName = biomeSpec.bossNames[Math.floor(rng() * biomeSpec.bossNames.length)];
      const boss = makeEnemy(
        `boss_${floor}_${enemySeq++}`,
        "boss",
        room.id,
        centerWorldX,
        centerWorldY,
        hpScale,
        true,
        floor,
        biomeSpec.id
      );
      boss.name = bossName;
      enemies.push(boss);
      const bossMinion1 = floor === 1 ? "skeleton" : floor === 2 ? "cultist" : floor === 3 ? "knight" : floor === 4 ? "shadow_stalker" : floor === 5 ? "astral_sentinel" : floor === 6 ? "hymn_phantom" : floor === 7 ? "relic_golem" : floor === 8 ? "veiled_heretic" : floor === 9 ? "celestial_arbiter" : "warden_enforcer";
      const bossMinion2 = floor === 1 ? "goblin" : floor === 2 ? "skeleton" : floor === 3 ? "cultist" : floor === 4 ? "cultist" : floor === 5 ? "shadow_stalker" : floor === 6 ? "skeleton" : floor === 7 ? "knight" : floor === 8 ? "cultist" : floor === 9 ? "astral_sentinel" : "shadow_stalker";
      enemies.push(
        makeEnemy(
          `en_${floor}_${enemySeq++}`,
          bossMinion1,
          room.id,
          centerWorldX - 86,
          centerWorldY - 56,
          hpScale,
          false,
          floor,
          biomeSpec.id
        )
      );
      enemies.push(
        makeEnemy(
          `en_${floor}_${enemySeq++}`,
          bossMinion2,
          room.id,
          centerWorldX + 86,
          centerWorldY + 56,
          hpScale,
          false,
          floor,
          biomeSpec.id
        )
      );
      if (floor === 10 || biomeSpec.id === "wardengate") {
        props.push({
          id: `prop_${floor}_gate`,
          kind: "warden_gate",
          x: centerWorldX,
          y: centerWorldY - 90,
          opened: false,
          value: 100
        });
      }
      portalPos = {
        x: centerWorldX,
        y: centerWorldY
      };
      setTile(room.cx, room.cy, 5);
    }
  }
  const map = {
    floor,
    seed: baseSeed,
    biome: biomeSpec.id,
    biomeTitle: biomeSpec.title,
    width,
    height,
    tiles,
    rooms: rooms2,
    torches,
    portalPos,
    portalActive: false
  };
  return {
    map,
    enemies,
    props,
    npcs,
    spawnPoint: {
      x: startRoom.cx * TILE_SIZE + TILE_SIZE / 2,
      y: startRoom.cy * TILE_SIZE + TILE_SIZE / 2
    }
  };
}
function getEnemyResistances(kind, elite, floor, biome) {
  switch (kind) {
    case "slime":
      return {
        physical: 0.2,
        fire: -0.15,
        frost: 0.1,
        lightning: 0.2,
        poison: 0.6,
        bleed: 0.9,
        // slimes cannot bleed
        tenacity: 0.05,
        arcane: 0.15,
        divine: 0.1
      };
    case "goblin":
      return {
        physical: elite ? 0.12 : 0.05,
        fire: 0.05,
        frost: 0.05,
        lightning: 0.05,
        poison: 0.2,
        bleed: 0.1,
        tenacity: elite ? 0.15 : 0.05,
        arcane: 0.05,
        divine: 0.05
      };
    case "skeleton":
      return {
        physical: -0.1,
        // brittle bones take more blunt damage
        fire: 0.1,
        frost: 0.4,
        lightning: 0.1,
        poison: 0.95,
        // undead has no poison susceptibility
        bleed: 0.95,
        // cannot bleed
        tenacity: elite ? 0.2 : 0.1,
        arcane: 0.15,
        divine: -0.25
        // undead vulnerable to divine holy light
      };
    case "cultist":
      return {
        physical: 0.05,
        fire: 0.25,
        frost: 0.25,
        lightning: 0.35,
        poison: 0.25,
        bleed: 0.1,
        tenacity: elite ? 0.25 : 0.15,
        arcane: 0.3,
        divine: -0.15
        // dark cultist vulnerable to holy light
      };
    case "knight":
      return {
        physical: elite ? 0.42 : 0.32,
        // plate armor
        fire: 0.15,
        frost: 0.1,
        lightning: -0.1,
        // metal conducts shock
        poison: 0.2,
        bleed: 0.3,
        tenacity: elite ? 0.35 : 0.25,
        arcane: 0.1,
        divine: 0.1
      };
    case "shadow_stalker":
      return {
        physical: elite ? 0.25 : 0.18,
        fire: 0.1,
        frost: 0.2,
        lightning: -0.15,
        // fragile to shock
        poison: 0.5,
        bleed: 0.65,
        // spectral shadow substance
        tenacity: elite ? 0.45 : 0.3,
        arcane: 0.25,
        divine: -0.2
        // shadow entity vulnerable to divine light
      };
    case "astral_sentinel":
      return {
        physical: elite ? 0.45 : 0.38,
        // hardened celestial crystal armor
        fire: 0.3,
        frost: 0.3,
        lightning: 0.4,
        poison: 0.7,
        // stone/crystal construct
        bleed: 0.9,
        // cannot bleed
        tenacity: elite ? 0.55 : 0.4,
        arcane: 0.4,
        divine: 0.3
      };
    case "hymn_phantom":
      return {
        physical: elite ? 0.3 : 0.22,
        fire: 0.15,
        frost: 0.25,
        lightning: 0.15,
        poison: 0.8,
        // spectral choir spirit
        bleed: 0.85,
        tenacity: elite ? 0.45 : 0.3,
        arcane: 0.3,
        divine: -0.1
      };
    case "relic_golem":
      return {
        physical: elite ? 0.5 : 0.42,
        // ancient bronze reliquary armor
        fire: 0.35,
        frost: 0.35,
        lightning: -0.1,
        // metal structure conducts electricity
        poison: 0.95,
        // stone/bronze construct
        bleed: 0.95,
        tenacity: elite ? 0.65 : 0.5,
        arcane: 0.3,
        divine: 0.25
      };
    case "veiled_heretic":
      return {
        physical: elite ? 0.28 : 0.2,
        fire: 0.2,
        frost: 0.2,
        lightning: 0.2,
        poison: 0.4,
        bleed: 0.35,
        tenacity: elite ? 0.45 : 0.32,
        arcane: 0.35,
        divine: 0.35
      };
    case "celestial_arbiter":
      return {
        physical: elite ? 0.45 : 0.36,
        fire: 0.35,
        frost: 0.35,
        lightning: 0.45,
        poison: 0.7,
        bleed: 0.8,
        tenacity: elite ? 0.6 : 0.45,
        arcane: 0.45,
        divine: 0.4
      };
    case "warden_enforcer":
      return {
        physical: elite ? 0.52 : 0.44,
        // plate armor of the Warden's guard
        fire: 0.3,
        frost: 0.3,
        lightning: 0.25,
        poison: 0.5,
        bleed: 0.5,
        tenacity: elite ? 0.65 : 0.5,
        arcane: 0.35,
        divine: 0.35
      };
    case "boss": {
      if (biome === "ember" || floor === 3) {
        return {
          physical: 0.3,
          fire: 0.75,
          // molten behemoth heavily resists fire
          frost: -0.15,
          // quenched by frost
          lightning: 0.25,
          poison: 0.4,
          bleed: 0.35,
          tenacity: 0.65,
          // 65% CC duration reduction
          arcane: 0.2,
          divine: 0.15
        };
      } else if (biome === "catacombs" || floor === 2) {
        return {
          physical: 0.22,
          fire: -0.05,
          frost: 0.65,
          // spectral arch-lich resists frost
          lightning: 0.3,
          poison: 0.85,
          // undead
          bleed: 0.85,
          // undead
          tenacity: 0.6,
          arcane: 0.25,
          divine: -0.3
          // Arch-Lich vulnerable to divine holy light
        };
      } else if (biome === "void" || floor === 4) {
        return {
          physical: 0.35,
          fire: 0.3,
          frost: 0.3,
          lightning: 0.3,
          poison: 0.6,
          bleed: 0.7,
          // shadowy void entity resists bleed
          tenacity: 0.7,
          // 70% CC duration reduction
          arcane: 0.35,
          divine: -0.2
          // Void boss vulnerable to divine light
        };
      } else if (biome === "astral" || floor === 5) {
        return {
          physical: 0.4,
          fire: 0.45,
          frost: 0.45,
          lightning: 0.5,
          // celestial entity resists elemental magic
          poison: 0.5,
          bleed: 0.4,
          tenacity: 0.75,
          // 75% CC duration reduction
          arcane: 0.45,
          divine: 0.4
        };
      } else if (biome === "hymns" || floor === 6) {
        return {
          physical: 0.32,
          fire: 0.25,
          frost: 0.35,
          lightning: 0.25,
          poison: 0.65,
          bleed: 0.6,
          tenacity: 0.7,
          arcane: 0.4,
          divine: 0.3
        };
      } else if (biome === "reliquary" || floor === 7) {
        return {
          physical: 0.48,
          // armored reliquary guardian
          fire: 0.35,
          frost: 0.35,
          lightning: 0.2,
          poison: 0.75,
          bleed: 0.75,
          tenacity: 0.75,
          arcane: 0.35,
          divine: 0.35
        };
      } else if (biome === "scripture" || floor === 8) {
        return {
          physical: 0.38,
          fire: 0.3,
          frost: 0.3,
          lightning: 0.3,
          poison: 0.55,
          bleed: 0.5,
          tenacity: 0.75,
          arcane: 0.45,
          divine: 0.4
        };
      } else if (biome === "nave" || floor === 9) {
        return {
          physical: 0.45,
          fire: 0.4,
          frost: 0.4,
          lightning: 0.45,
          poison: 0.7,
          bleed: 0.7,
          tenacity: 0.8,
          arcane: 0.5,
          divine: 0.45
        };
      } else if (biome === "wardengate" || floor === 10) {
        return {
          physical: 0.52,
          // Oriphiel, The Last Warden
          fire: 0.45,
          frost: 0.45,
          lightning: 0.45,
          poison: 0.75,
          bleed: 0.75,
          tenacity: 0.85,
          arcane: 0.5,
          divine: 0.5
        };
      } else {
        return {
          physical: 0.25,
          fire: 0.2,
          frost: 0.25,
          lightning: 0.2,
          poison: 0.45,
          bleed: 0.3,
          tenacity: 0.55,
          arcane: 0.2,
          divine: 0.1
        };
      }
    }
  }
}
function makeEnemy(id, kind, roomId, x, y, hpScale, elite, floor = 1, biome = "courtyard") {
  const baseStats = {
    slime: { name: "Mire Slime", hp: 46, radius: 13 },
    goblin: { name: "Grimalkin Raider", hp: 56, radius: 13 },
    skeleton: { name: "Bone Marksman", hp: 52, radius: 13 },
    cultist: { name: "Void Acolyte", hp: 68, radius: 14 },
    knight: { name: "Dread Halberdier", hp: 105, radius: 16 },
    shadow_stalker: { name: "Abyssal Stalker", hp: 88, radius: 15 },
    astral_sentinel: { name: "Celestial Sentinel", hp: 122, radius: 17 },
    hymn_phantom: { name: "Hymn Phantom", hp: 96, radius: 15 },
    relic_golem: { name: "Relic Golem", hp: 135, radius: 17 },
    veiled_heretic: { name: "Veiled Heretic", hp: 110, radius: 15 },
    celestial_arbiter: { name: "Celestial Arbiter", hp: 145, radius: 16 },
    warden_enforcer: { name: "Warden Enforcer", hp: 160, radius: 18 },
    boss: { name: "Warden Malakor", hp: 950, radius: 28 }
  };
  const spec = baseStats[kind];
  let maxHp;
  if (kind === "boss") {
    const baseScale = floor > 1 ? hpScale / (1 + (floor - 1) * 0.28) : hpScale;
    maxHp = Math.round(spec.hp * baseScale * (1 + (floor - 1) * 0.35));
  } else {
    const eliteMult = elite ? 1.55 : 1;
    maxHp = Math.round(spec.hp * hpScale * eliteMult);
  }
  return {
    id,
    kind,
    name: elite && kind !== "boss" ? `Elite ${spec.name.trim()}` : spec.name.trim(),
    roomId,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: maxHp,
    maxHp,
    radius: kind === "boss" ? 28 : elite ? spec.radius + 3 : spec.radius,
    state: "idle",
    windupMs: kind === "boss" ? 700 : 800 + Math.floor(Math.random() * 600),
    targetX: x,
    targetY: y,
    markedMs: 0,
    slowedMs: 0,
    stunnedMs: 0,
    burnedMs: 0,
    frozenMs: 0,
    shockedMs: 0,
    poisonedMs: 0,
    bleedingMs: 0,
    silencedMs: 0,
    elite,
    resistances: getEnemyResistances(kind, elite, floor, biome),
    enraged: false,
    charging: false,
    chargeTimerMs: 0
  };
}
function generateTavernFloor() {
  const width = 48;
  const height = 34;
  const tiles = new Array(width * height).fill(0);
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      tiles[y * width + x] = 1;
    }
  }
  for (let x = 3; x < width - 3; x++) {
    tiles[3 * width + x] = 2;
    tiles[(height - 4) * width + x] = 2;
  }
  for (let y = 3; y < height - 3; y++) {
    tiles[y * width + 3] = 2;
    tiles[y * width + (width - 4)] = 2;
  }
  tiles[15 * width + 3] = 1;
  tiles[16 * width + 3] = 1;
  for (let y = 4; y <= 6; y++) {
    for (let x = 20; x <= 26; x++) {
      tiles[y * width + x] = 5;
    }
  }
  tiles[3 * width + 21] = 2;
  tiles[3 * width + 22] = 2;
  tiles[3 * width + 24] = 2;
  tiles[3 * width + 25] = 2;
  for (let x = 11; x <= 22; x++) {
    tiles[8 * width + x] = 2;
  }
  for (let y = 8; y <= 11; y++) {
    tiles[y * width + 22] = 2;
  }
  for (let y = 14; y <= 21; y++) {
    for (let x = 14; x <= 28; x++) {
      tiles[y * width + x] = 4;
    }
  }
  for (let y = 12; y <= 28; y++) {
    for (let x = 33; x <= 43; x++) {
      tiles[y * width + x] = 6;
    }
  }
  for (let y = 12; y <= 28; y += 4) {
    tiles[y * width + 32] = 3;
  }
  tiles[18 * width + 32] = 6;
  tiles[19 * width + 32] = 6;
  const pillars = [
    { x: 10, y: 14 },
    { x: 10, y: 24 },
    { x: 30, y: 14 },
    { x: 30, y: 24 }
  ];
  for (const p of pillars) {
    tiles[p.y * width + p.x] = 3;
  }
  const rooms2 = [
    {
      id: 0,
      x: 3,
      y: 3,
      w: width - 6,
      h: height - 6,
      cx: Math.floor(width / 2),
      cy: Math.floor(height / 2),
      type: "start",
      cleared: true,
      discovered: true
    }
  ];
  const torches = [
    { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE },
    { x: 19 * TILE_SIZE, y: 4 * TILE_SIZE },
    { x: 27 * TILE_SIZE, y: 4 * TILE_SIZE },
    { x: 31 * TILE_SIZE, y: 5 * TILE_SIZE },
    { x: 5 * TILE_SIZE, y: 28 * TILE_SIZE },
    { x: 30 * TILE_SIZE, y: 28 * TILE_SIZE },
    { x: 43 * TILE_SIZE, y: 13 * TILE_SIZE },
    { x: 43 * TILE_SIZE, y: 27 * TILE_SIZE }
  ];
  const props = [
    { id: "prop_tav_1", kind: "crate", x: 6 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 10 },
    { id: "prop_tav_2", kind: "crate", x: 7 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 10 },
    { id: "prop_tav_3", kind: "chest", x: 42 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 50 }
  ];
  const npcs = [
    {
      id: "npc_lena",
      name: "Barkeep Lena",
      x: 16.5 * TILE_SIZE,
      y: 6.2 * TILE_SIZE,
      dialogue: "Honeyed mead or spiced cider? Take a seat.",
      spriteKind: "barkeep"
    },
    {
      id: "npc_bram",
      name: "Innkeeper Bram",
      x: 8.5 * TILE_SIZE,
      y: 13.5 * TILE_SIZE,
      dialogue: "Warm your hands by the hearth, hero.",
      spriteKind: "innkeeper"
    },
    {
      id: "npc_jorah",
      name: "Veteran Jorah",
      x: 31 * TILE_SIZE,
      y: 18.5 * TILE_SIZE,
      dialogue: "Test your steel on my dummies.",
      spriteKind: "veteran"
    },
    {
      id: "npc_aleph",
      name: "Aleph",
      x: 18 * TILE_SIZE,
      y: 28 * TILE_SIZE,
      dialogue: "Your path shifts. Seek a new focus?",
      spriteKind: "mysterious_cloak",
      options: [
        { id: "reset_stats", label: "Reset Stats" },
        { id: "lore", label: "Who are you?" }
      ]
    }
  ];
  const trainingDummies = [
    {
      id: "dummy_1",
      x: 38 * TILE_SIZE,
      y: 16 * TILE_SIZE,
      hp: 9999,
      maxHp: 9999,
      hitAnimMs: 0
    },
    {
      id: "dummy_2",
      x: 38 * TILE_SIZE,
      y: 24 * TILE_SIZE,
      hp: 9999,
      maxHp: 9999,
      hitAnimMs: 0
    }
  ];
  const map = {
    floor: 0,
    seed: 99999,
    biome: "courtyard",
    biomeTitle: "The Rusty Tankard Tavern",
    width,
    height,
    tiles,
    rooms: rooms2,
    torches,
    portalPos: { x: 42 * TILE_SIZE, y: 9 * TILE_SIZE },
    portalActive: true
  };
  return {
    map,
    enemies: [],
    props,
    npcs,
    trainingDummies,
    spawnPoint: {
      x: 21 * TILE_SIZE,
      y: 18 * TILE_SIZE
    }
  };
}

// src/shared/combatMechanics.ts
function computeEclipseChargeProfile(holdDurationMs) {
  const cfg = ARMAMENT_TUNING.weapons.eclipse;
  const clampedHoldMs = Math.max(0, Math.min(cfg.maxChargeMs, holdDurationMs));
  const chargeT = clampedHoldMs <= cfg.minChargeMs ? 0 : (clampedHoldMs - cfg.minChargeMs) / Math.max(1, cfg.maxChargeMs - cfg.minChargeMs);
  const damageRatio = cfg.minDamageRatio + chargeT * (cfg.maxDamageRatio - cfg.minDamageRatio);
  const projSpeedMult = cfg.minProjSpeedMult + chargeT * (cfg.maxProjSpeedMult - cfg.minProjSpeedMult);
  return { clampedHoldMs, chargeT, damageRatio, projSpeedMult };
}
function countFloorBlessingStacks(floorBlessings, kind) {
  if (!floorBlessings || floorBlessings.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < floorBlessings.length; i++) {
    if (floorBlessings[i] === kind) count++;
  }
  return count;
}
function resolveEnemyResistance(res, category) {
  if (!res) return 0;
  let rawRes = 0;
  switch (category) {
    case "physical":
      rawRes = res.physical ?? 0;
      break;
    case "arcane":
      rawRes = res.arcane ?? ((res.fire ?? 0) + (res.frost ?? 0) + (res.lightning ?? 0)) / 3;
      break;
    case "divine":
      rawRes = res.divine ?? ((res.fire ?? 0) + (res.lightning ?? 0)) / 2;
      break;
    case "fire":
      rawRes = res.fire ?? 0;
      break;
    case "frost":
      rawRes = res.frost ?? 0;
      break;
    case "lightning":
      rawRes = res.lightning ?? 0;
      break;
    case "poison":
      rawRes = res.poison ?? 0;
      break;
    case "bleed":
      rawRes = res.bleed ?? 0;
      break;
    default:
      rawRes = res.physical ?? 0;
      break;
  }
  return Number(Math.min(0.75, Math.max(-0.5, rawRes)).toFixed(6));
}
function computePlayerMaxHp(heroClass, level, vitality, relics = [], equippedVestment) {
  const def = HERO_CLASSES[heroClass];
  const baseHp = def ? def.maxHp : 100;
  const clampedLvl = Math.max(1, Math.min(MAX_LEVEL, level || 1));
  const levelBonus = (clampedLvl - 1) * 12;
  const vitBonus = Math.max(0, vitality || 0) * 5;
  const relicBonus = relics.includes("bastion_pauldron") ? 30 : 0;
  const vestmentBonus = resolveEquippedVestmentForClass(heroClass, equippedVestment)?.modifiers.maxHpBonus || 0;
  return baseHp + levelBonus + vitBonus + relicBonus + vestmentBonus;
}
function computePlayerHpRegenPerTick(heroClass, vitality, equippedVestment) {
  const vit = Math.max(0, vitality || 0);
  const vitRegen = vit >= 6 ? Math.max(1, Math.floor(vit * 0.1)) : 0;
  const vestmentRegen = resolveEquippedVestmentForClass(heroClass, equippedVestment)?.modifiers.hpRegenPerTickBonus || 0;
  return vitRegen + vestmentRegen;
}
function computePlayerHealingMultiplier(healer) {
  if (!healer || healer.heroClass !== "cleric") return 1;
  const lvl = Math.max(1, Math.min(MAX_LEVEL, healer.level || 1));
  const fth = Math.max(0, healer.faith || 0);
  const levelMult = 1 + (lvl - 1) * 0.015;
  const faithMult = 1 + fth * 6e-3;
  const weaponHealBonus = resolveEquippedWeaponForClass("cleric", healer.equippedWeapon)?.modifiers.healingBonusPct || 0;
  const vestmentHealBonus = resolveEquippedVestmentForClass("cleric", healer.equippedVestment)?.modifiers.auraHealBonusPct || 0;
  return levelMult * faithMult * (1 + weaponHealBonus + vestmentHealBonus);
}
function computePlayerHealingAmount(baseHealing, healer, target) {
  if (baseHealing <= 0) return 0;
  let healing = baseHealing * computePlayerHealingMultiplier(healer);
  if (target && target.statuses && target.statuses.some((s) => s.type === "ashen_curse")) {
    healing *= 0.55;
  }
  return Math.max(1, Math.round(healing));
}
function isShieldGainLocked(p) {
  if (!p) return false;
  return Boolean(
    resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers.shieldGainLocked
  );
}
function isCrimsonFrenzyActive(p) {
  if (!p || !(p.crimsonFrenzyMs && p.crimsonFrenzyMs > 0)) return false;
  return resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers.tacticalId === "crimson_frenzy";
}
function computePlayerMaxShieldCap(p) {
  const vestmentBonus = p.heroClass === "vanguard" ? resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.maxShieldBonus || 0 : 0;
  return 60 + countFloorBlessingStacks(p.floorBlessings, "bastion") * 15 + vestmentBonus;
}
function computePlayerStartingShield(p) {
  if (isShieldGainLocked(p)) return 0;
  const startShieldBonus = p.heroClass === "vanguard" ? resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.startingShieldBonus || 0 : 0;
  return Math.min(computePlayerMaxShieldCap(p), 15 + startShieldBonus);
}
function computePlayerCritChance(p, weaponModsOverride) {
  const wMods = weaponModsOverride ?? resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
  const vMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
  const relics = p.relics || [];
  return Math.min(
    0.45,
    0.1 + Math.max(0, p.dexterity || 0) * 3e-3 + (relics.includes("keen_arrowhead") ? 0.2 : 0) + (wMods?.critChanceBonus || 0) + (vMods?.critChanceBonus || 0)
  );
}
function computePlayerCritMultiplier(p, weaponModsOverride) {
  const wMods = weaponModsOverride ?? resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
  return CRIT_DAMAGE_MULTIPLIER + (wMods?.critMultBonus || 0);
}
function computePlayerAttackSpeedMult(p, weaponDefOverride) {
  const swiftStacks = countFloorBlessingStacks(p.floorBlessings, "swiftness");
  const dexSpeedMult = (1 + Math.max(0, p.dexterity || 0) * 4e-3) * (1 + swiftStacks * 0.08);
  const wDef = weaponDefOverride !== void 0 ? weaponDefOverride : resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
  const weaponAttackSpeedMult = wDef?.modifiers.attackSpeedMult ?? 1;
  const vestmentAttackSpeedBonus = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.attackSpeedBonus || 0;
  const momentumBonus = resolveActiveVestmentPassive(p.heroClass, p.equippedVestment) === "momentum" && (p.rangerMomentum || 0) > 0 ? Math.min(ARMAMENT_TUNING.passives.momentum.cap, p.rangerMomentum || 0) / ARMAMENT_TUNING.passives.momentum.cap * ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct : 0;
  const crimsonFrenzyBonus = isCrimsonFrenzyActive(p) ? ARMAMENT_TUNING.weapons.crimson.frenzyAttackSpeedBonusPct : 0;
  return dexSpeedMult * weaponAttackSpeedMult * (1 + vestmentAttackSpeedBonus + momentumBonus + crimsonFrenzyBonus);
}
function computePlayerAttackCooldownMs(p, weaponDefOverride) {
  const baseAttackCooldownMs = HERO_CLASSES[p.heroClass]?.attackCooldownMs || 400;
  const atkSpeedMult = computePlayerAttackSpeedMult(p, weaponDefOverride);
  let hasteFactor = ((p.hasteMs || 0) > 0 ? 0.8 : 1) / atkSpeedMult;
  if (p.statuses && p.statuses.some((s) => s.type === "frostbite")) {
    hasteFactor *= 1.25;
  }
  return Math.max(100, Math.round(baseAttackCooldownMs * hasteFactor));
}
function computePlayerCdrBreakdown(p) {
  const relics = p.relics || [];
  const intCdr = Math.min(0.2, Math.max(0, p.intelligence || 0) * 2e-3);
  const relicCdr = relics.includes("hourglass_shard") ? 0.25 : 0;
  const blessingCdr = countFloorBlessingStacks(p.floorBlessings, "swiftness") * 0.08;
  const vestmentCdr = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.cdrBonus || 0;
  const totalCdr = Math.min(0.5, intCdr + relicCdr + blessingCdr + vestmentCdr);
  return {
    intCdr,
    relicCdr,
    blessingCdr,
    vestmentCdr,
    totalCdr,
    cdrFactor: Math.max(0.5, 1 - totalCdr)
  };
}
function computePlayerCdrMult(p) {
  return computePlayerCdrBreakdown(p).cdrFactor;
}
function computeIncomingDamageTypeResistance(p, damageType = "physical") {
  const def = HERO_CLASSES[p.heroClass];
  const res = def?.resistances || {
    physical: 0,
    fire: 0,
    frost: 0,
    lightning: 0,
    poison: 0,
    bleed: 0
  };
  const relics = p.relics || [];
  const vestmentMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
  const bastionStacks = countFloorBlessingStacks(p.floorBlessings, "bastion");
  const avgElemRes = (res.fire + res.frost + res.lightning) / 3;
  let resist = 0;
  if (damageType === "elemental" || damageType === "arcane" || damageType === "divine") {
    resist = avgElemRes;
  } else if (damageType === "fire") {
    resist = res.fire;
  } else if (damageType === "frost") {
    resist = res.frost;
  } else if (damageType === "lightning") {
    resist = res.lightning;
  } else if (damageType === "poison") {
    resist = res.poison;
  } else if (damageType === "bleed") {
    resist = res.bleed;
  } else {
    resist = res.physical;
  }
  const isMagicalOrElemental = damageType === "elemental" || damageType === "fire" || damageType === "frost" || damageType === "lightning" || damageType === "arcane" || damageType === "divine";
  if (relics.includes("runic_carapace")) {
    resist += damageType === "physical" ? 0.15 : 0.2;
  }
  if (relics.includes("thorned_aegis") && damageType === "physical") {
    resist += 0.1;
  }
  if (damageType === "physical" && (p.strength || 0) > 0) {
    resist += Math.min(0.15, (p.strength || 0) * 15e-4);
  }
  if (isMagicalOrElemental && (p.intelligence || 0) > 0) {
    resist += Math.min(0.15, (p.intelligence || 0) * 15e-4);
  }
  if (damageType === "physical" && vestmentMods?.physicalResistBonus) {
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
function computePlayerCcTenacity(p) {
  const vestmentTenacity = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.ccTenacityBonus || 0;
  return Math.min(0.55, Math.max(0, (p.faith || 0) * 3e-3 + vestmentTenacity));
}
function computePlayerDamageMultiplier(p, category = "physical", options) {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
  let mult = 1 + (lvl - 1) * 0.025;
  const weaponInput = options?.weaponDef !== void 0 ? options.weaponDef : p.equippedWeapon;
  const profile = resolveWeaponCombatProfile(p.heroClass, weaponInput, p);
  const weaponMods = profile.modifiers;
  const useWeaponScale = Boolean(options?.isPrimaryAttack || options?.useWeaponScaling);
  if (useWeaponScale) {
    mult *= 1 + profile.effectiveAttributeValue * 8e-3;
  } else if (category === "physical") {
    if (p.heroClass === "ranger") {
      const dexFactor = weaponMods?.dexScalingMult ?? 1;
      mult *= 1 + Math.max(0, p.dexterity || 0) * 8e-3 * dexFactor;
    } else {
      mult *= 1 + Math.max(0, p.strength || 0) * 8e-3;
    }
  } else if (category === "arcane") {
    mult *= 1 + Math.max(0, p.intelligence || 0) * 8e-3;
  } else if (category === "divine") {
    mult *= 1 + Math.max(0, p.faith || 0) * 8e-3;
  } else {
    const classDefaultAttr = getClassDefaultScalingAttribute(p.heroClass);
    const rawMain = getPlayerAttributeValue(p, classDefaultAttr);
    const mainStat = p.heroClass === "ranger" && classDefaultAttr === "dexterity" ? rawMain * (weaponMods?.dexScalingMult ?? 1) : rawMain;
    mult *= 1 + mainStat * 8e-3;
  }
  if ((p.relics || []).includes("sunfire_signet")) mult *= 1.12;
  const furyStacks = countFloorBlessingStacks(p.floorBlessings, "fury");
  if (furyStacks > 0) mult *= 1 + furyStacks * 0.06;
  mult *= weaponMods?.damageMult ?? 1;
  if (resolveActiveVestmentPassive(p.heroClass, p.equippedVestment) === "heat" && (p.vanguardHeat || 0) > 0) {
    const heatCfg = ARMAMENT_TUNING.passives.heat;
    mult *= 1 + Math.min(heatCfg.cap, p.vanguardHeat || 0) / heatCfg.cap * heatCfg.maxDamageBonusPct;
  }
  if (options?.activeStarRift && weaponMods?.activeRiftBonusPct) {
    mult *= 1 + weaponMods.activeRiftBonusPct;
  }
  if (isCrimsonFrenzyActive(p)) {
    mult *= 1 + ARMAMENT_TUNING.weapons.crimson.frenzyDamageBonusPct;
  }
  return mult;
}
function computePlayerDotMultiplier(p, options) {
  if (!p) return 1;
  const level = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
  const sourceKind = options?.sourceKind ?? "weapon";
  let scalingStat = 0;
  if (sourceKind === "weapon") {
    const weaponInput = options?.weaponDef !== void 0 ? options.weaponDef : p.equippedWeapon;
    const profile = resolveWeaponCombatProfile(p.heroClass, weaponInput, p);
    scalingStat = profile.rawAttributeValue;
  } else {
    const defaultAttr = getClassDefaultScalingAttribute(p.heroClass);
    scalingStat = getPlayerAttributeValue(p, defaultAttr);
  }
  return 1 + 3e-3 * (level - 1) + 1e-3 * Math.max(0, scalingStat);
}
function computePlayerPierceCount(p, weaponModsOverride) {
  const wMods = weaponModsOverride ?? resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
  let pierce = p.heroClass === "vanguard" ? 4 : 1;
  if ((p.relics || []).includes("piercing_prism")) pierce += 1;
  if (wMods?.bonusPierce) pierce += wMods.bonusPierce;
  return pierce;
}

// src/server/gameEngine.ts
var MAX_FLOORS_FOR_VICTORY = 10;
var GameRoom = class _GameRoom {
  constructor(opts) {
    this.status = "playing";
    this.floor = 1;
    this.enemies = [];
    this.projectiles = [];
    this.props = [];
    this.zones = [];
    this.npcs = [];
    this.trainingDummies = [];
    this.pendingEvents = [];
    this.chat = [];
    this.spawnPoint = { x: 256, y: 256 };
    this.lastRunSummary = null;
    this.players = /* @__PURE__ */ new Map();
    this.enemyMeta = /* @__PURE__ */ new Map();
    this.zoneHitPlayers = /* @__PURE__ */ new Map();
    this.arcaneOrbHits = /* @__PURE__ */ new Map();
    this.entitySeq = 1;
    this.simTimeMs = 0;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.zoneTickAccumMs = 0;
    this.statusDotAccumMs = 0;
    this.clericAuraAccumMs = 0;
    this.floorMasteryAwarded = false;
    this.runEndRecorded = false;
    this.entityStatusTextCooldowns = /* @__PURE__ */ new Map();
    this.primaryAttackProjIds = /* @__PURE__ */ new Set();
    this.tacticalProjIds = /* @__PURE__ */ new Set();
    this.voidCreditedProjIds = /* @__PURE__ */ new Set();
    this.temporalCreditedProjIds = /* @__PURE__ */ new Set();
    this.triggeredOnceProjIds = /* @__PURE__ */ new Set();
    this.weaponZoneTickAccum = /* @__PURE__ */ new Map();
    this.cycloneArrowStates = /* @__PURE__ */ new Map();
    this.recentStatusEvents = /* @__PURE__ */ new Map();
    this.roomId = opts.roomId;
    this.name = opts.name;
    this.hostId = opts.hostId || "";
    this.hostName = opts.hostName;
    this.difficulty = opts.difficulty;
    this.maxPlayers = opts.roomId === "TAVERN-HUB" ? 50 : 4;
    this.baseSeed = opts.seed && opts.seed > 0 ? Math.floor(opts.seed) : Math.floor(1e5 + Math.random() * 899999);
    const startFloor = opts.initialFloor !== void 0 ? opts.initialFloor : opts.roomId === "TAVERN-HUB" ? 0 : 1;
    this.status = opts.roomId === "TAVERN-HUB" ? "playing" : opts.initialStatus ?? "playing";
    if (this.status === "waiting") {
      this.floor = startFloor;
      const preview = generateDungeonFloor(startFloor, this.baseSeed, this.difficulty, 1);
      this.map = preview.map;
      this.spawnPoint = preview.spawnPoint;
      this.enemies = [];
      this.props = [];
      this.npcs = [];
      this.trainingDummies = [];
      this.projectiles = [];
      this.zones = [];
    } else {
      this.loadFloor(startFloor, 1);
    }
  }
  static computePlayerMaxHp(heroClass, level, vitality, relics = [], equippedVestment) {
    return computePlayerMaxHp(heroClass, level, vitality, relics, equippedVestment);
  }
  static computeHealingAmount(baseHealing, healer, target) {
    return computePlayerHealingAmount(baseHealing, healer, target);
  }
  getActivePassive(p) {
    return resolveActiveVestmentPassive(p.heroClass, p.equippedVestment);
  }
  syncPassiveMetadata(pr) {
    pr.state.activePassiveId = this.getActivePassive(pr.state);
  }
  clearEclipseCharge(pr) {
    pr.eclipseHoldActive = false;
    pr.eclipseHoldStartMs = 0;
    pr.pendingEclipseReleaseMs = null;
    pr.state.eclipseChargeRatio = 0;
  }
  clearGaleburstForPlayer(playerId) {
    const pr = this.players.get(playerId);
    if (pr) {
      pr.dummyGaleburstStacks.clear();
    }
    for (const enemy of this.enemies) {
      const meta = this.enemyMeta.get(enemy.id);
      if (meta?.galeburstByOwner?.delete(playerId)) {
        this.syncEnemyGaleburstMarks(enemy, meta);
      }
    }
  }
  syncEnemyGaleburstMarks(enemy, meta) {
    let maxStacks = 0;
    if (meta.galeburstByOwner) {
      for (const count of meta.galeburstByOwner.values()) {
        if (count > maxStacks) maxStacks = count;
      }
    }
    enemy.galeburstMarks = maxStacks;
  }
  clearPlayerTacticalState(pr, opts) {
    const p = pr.state;
    p.bastionCounterMs = 0;
    p.bastionCounterMaxMs = 0;
    pr.bastionBlockedHits = 0;
    pr.bastionAimAngle = p.aimAngle || 0;
    p.crimsonFrenzyMs = 0;
    p.crimsonFrenzyMaxMs = 0;
    if (opts?.removeOwnedZones) {
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        if (z.ownerId === p.id && (z.kind === "cyclone_break" || z.kind === "black_sun_zone" || z.kind === "bastion_counter_cleave" || z.kind === "bulwark_dash_shockwave" || z.kind === "frost_volley_cone" || z.kind === "sanctified_pulse_wave")) {
          this.weaponZoneTickAccum.delete(z.id);
          this.zones.splice(i, 1);
        }
      }
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const proj = this.projectiles[i];
        if (proj.ownerId === p.id && proj.style === "cyclone_arrow") {
          this.cleanupProjectileTracking(proj.id);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }
  syncPlayerTacticalCooldownOnEquipmentChange(p) {
    const cdrMult = this.getPlayerCdrMult(p);
    const activeTac = resolveActiveTacticalDef(
      p.heroClass,
      p.equippedWeapon,
      p.equippedScrollId
    );
    p.maxSkillCooldownMs = Math.round(activeTac.cooldownMs * cdrMult);
    p.skillCooldownMs = Math.min(p.skillCooldownMs, p.maxSkillCooldownMs);
  }
  resetPassiveState(pr) {
    const p = pr.state;
    p.vanguardHeat = 0;
    p.rangerMomentum = 0;
    p.predatorTargetId = null;
    p.predatorStacks = 0;
    p.voidEnergy = 0;
    p.storedGrace = 0;
    p.clericSanctity = 0;
    p.eclipseChargeRatio = 0;
    pr.starRiftAttackCount = 0;
    pr.heatLastHitAtMs = 0;
    pr.momentumHoldMs = 0;
    pr.predatorLastHitAtMs = 0;
    pr.solarisLastHealAtMs = 0;
    this.clearEclipseCharge(pr);
    this.clearGaleburstForPlayer(p.id);
    this.clearPlayerTacticalState(pr, { removeOwnedZones: true });
    this.syncPassiveMetadata(pr);
  }
  getPlayerCritChance(p, weaponMods) {
    return computePlayerCritChance(p, weaponMods);
  }
  getPlayerAttackSpeedMult(p) {
    return computePlayerAttackSpeedMult(p);
  }
  consumeVoidEnergyForTactical(p) {
    if (this.getActivePassive(p) !== "void_consumption") return 1;
    const cfg = ARMAMENT_TUNING.passives.voidConsumption;
    if ((p.voidEnergy || 0) < cfg.cap) return 1;
    p.voidEnergy = 0;
    this.emitEvent("status", p.x, p.y - 26, "VOID EMPOWERED!", "#A855F7");
    return 1 + cfg.empoweredTacticalBonusPct;
  }
  grantVoidEnergyFromPrimary(p, projId) {
    if (this.getActivePassive(p) !== "void_consumption") return;
    if (projId) {
      if (this.voidCreditedProjIds.has(projId)) return;
      this.voidCreditedProjIds.add(projId);
    }
    const cfg = ARMAMENT_TUNING.passives.voidConsumption;
    p.voidEnergy = Math.min(cfg.cap, (p.voidEnergy || 0) + cfg.gainPerHit);
  }
  onTacticalHitConfirmed(attacker) {
    if (!attacker || attacker.downed) return;
    if (this.getActivePassive(attacker) === "temporal_acceleration" && attacker.ultCooldownMs > 0) {
      attacker.ultCooldownMs = Math.max(
        0,
        attacker.ultCooldownMs - ARMAMENT_TUNING.passives.temporalAcceleration.ultReductionPerTacticalHitMs
      );
    }
  }
  onConfirmedPrimaryHit(owner, projId) {
    if (!owner || owner.downed) return;
    this.grantVoidEnergyFromPrimary(owner, projId);
    const activePassive = this.getActivePassive(owner);
    if (activePassive === "temporal_acceleration") {
      if (!projId || !this.temporalCreditedProjIds.has(projId)) {
        if (projId) this.temporalCreditedProjIds.add(projId);
        if (owner.skillCooldownMs > 0) {
          owner.skillCooldownMs = Math.max(
            0,
            owner.skillCooldownMs - ARMAMENT_TUNING.passives.temporalAcceleration.tacticalReductionPerBasicHitMs
          );
        }
      }
    } else if (activePassive === "heat") {
      const hCfg = ARMAMENT_TUNING.passives.heat;
      const pr = this.players.get(owner.id);
      owner.vanguardHeat = Math.min(hCfg.cap, (owner.vanguardHeat || 0) + hCfg.gainPerHit);
      if (pr) pr.heatLastHitAtMs = this.simTimeMs;
    }
  }
  cleanupProjectileTracking(projId) {
    this.arcaneOrbHits.delete(projId);
    this.primaryAttackProjIds.delete(projId);
    this.tacticalProjIds.delete(projId);
    this.voidCreditedProjIds.delete(projId);
    this.temporalCreditedProjIds.delete(projId);
    this.triggeredOnceProjIds.delete(projId);
    this.cycloneArrowStates.delete(projId);
  }
  getActiveSingularityAt(x, y, extraRadius = 0) {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.kind !== "singularity" || z.ttlMs <= 0) continue;
      const d = Math.hypot(x - z.x, y - z.y);
      if (d <= z.radius + extraRadius && d < bestDist) {
        best = z;
        bestDist = d;
      }
    }
    return best;
  }
  spawnCycloneBreakWhirlwind(ownerId, x, y) {
    const ownerPr = this.players.get(ownerId);
    const ownerState = ownerPr?.state ?? null;
    if (!ownerState || resolveActiveTacticalDef(
      ownerState.heroClass,
      ownerState.equippedWeapon,
      ownerState.equippedScrollId
    ).id !== "cyclone_break") {
      return;
    }
    const gwCfg = ARMAMENT_TUNING.weapons.galewind;
    const zoneId = this.nextId("zone");
    this.zones.push({
      id: zoneId,
      kind: "cyclone_break",
      x,
      y,
      radius: gwCfg.cycloneRadiusPx,
      ttlMs: gwCfg.cycloneDurationMs,
      maxTtlMs: gwCfg.cycloneDurationMs,
      ownerId
    });
    this.weaponZoneTickAccum.set(zoneId, gwCfg.cycloneTickIntervalMs);
    this.emitEvent("status", x, y - 24, "CYCLONE BREAK!", "#38BDF8");
  }
  applyEffectiveHealing(healer, target, preComputedAmount, source) {
    if (!target || target.downed || preComputedAmount <= 0) return 0;
    const missing = Math.max(0, target.maxHp - target.hp);
    const effective = Math.min(missing, Math.max(0, Math.round(preComputedAmount)));
    if (effective <= 0) return 0;
    target.hp += effective;
    this.emitEvent("heal", target.x, target.y - 20, `+${effective}`, "#34D399");
    if (healer && !healer.downed && healer.connected && healer.id !== target.id) {
      const passive = this.getActivePassive(healer);
      if (passive === "shared_grace" && source !== "shared_grace" && source !== "sacred_retribution") {
        const sgCfg = ARMAMENT_TUNING.passives.sharedGrace;
        const storedGain = effective * sgCfg.storePct;
        healer.storedGrace = Math.min(
          sgCfg.maxCap,
          Number(((healer.storedGrace || 0) + storedGain).toFixed(2))
        );
      } else if (passive === "sacred_retribution" && source !== "sacred_retribution" && source !== "shared_grace") {
        const srCfg = ARMAMENT_TUNING.passives.sacredRetribution;
        healer.clericSanctity = Math.min(
          srCfg.cap,
          (healer.clericSanctity || 0) + srCfg.sanctityPerHeal
        );
      }
    }
    return effective;
  }
  triggerSharedGraceForAlly(ally) {
    if (!ally || ally.downed || !ally.connected || ally.hp <= 0 || ally.hp >= ally.maxHp) return;
    const cfg = ARMAMENT_TUNING.passives.sharedGrace;
    if (ally.hp / Math.max(1, ally.maxHp) >= cfg.triggerHpRatio) return;
    for (const pr of this.players.values()) {
      const cleric = pr.state;
      if (cleric.id === ally.id || cleric.downed || !cleric.connected) continue;
      if (this.getActivePassive(cleric) !== "shared_grace") continue;
      if ((cleric.storedGrace || 0) < 1) continue;
      if (Math.hypot(ally.x - cleric.x, ally.y - cleric.y) > cfg.releaseRangePx) continue;
      const missing = Math.max(0, ally.maxHp - ally.hp);
      if (missing <= 0) break;
      const curseMult = ally.statuses && ally.statuses.some((s) => s.type === "ashen_curse") ? 0.55 : 1;
      const rawPool = Math.min(Math.floor(cleric.storedGrace || 0), Math.ceil(missing / curseMult));
      if (rawPool <= 0) continue;
      const healToApply = Math.min(missing, Math.max(1, Math.round(rawPool * curseMult)));
      cleric.storedGrace = Math.max(
        0,
        Number(((cleric.storedGrace || 0) - rawPool).toFixed(2))
      );
      this.applyEffectiveHealing(cleric, ally, healToApply, "shared_grace");
      this.emitEvent("status", ally.x, ally.y - 32, "SHARED GRACE!", "#34D399");
    }
  }
  triggerSharedGraceTick() {
    const cfg = ARMAMENT_TUNING.passives.sharedGrace;
    for (const pr of this.players.values()) {
      const cleric = pr.state;
      if (cleric.downed || !cleric.connected) continue;
      if (this.getActivePassive(cleric) !== "shared_grace") continue;
      if ((cleric.storedGrace || 0) < 1) continue;
      for (const allyPr of this.players.values()) {
        const ally = allyPr.state;
        if (ally.id === cleric.id || ally.downed || !ally.connected) continue;
        if (ally.hp <= 0 || ally.hp >= ally.maxHp) continue;
        if (ally.hp / Math.max(1, ally.maxHp) >= cfg.triggerHpRatio) continue;
        if (Math.hypot(ally.x - cleric.x, ally.y - cleric.y) > cfg.releaseRangePx) continue;
        this.triggerSharedGraceForAlly(ally);
        if ((cleric.storedGrace || 0) < 1) break;
      }
    }
  }
  static computeNextXp(level) {
    if (level >= MAX_LEVEL) return 999999;
    const lvl = Math.max(1, level);
    return Math.round(80 + (lvl - 1) * 60 + Math.pow(lvl - 1, 1.75) * 12);
  }
  computeEnemyDamage(baseHit, enemy) {
    const diffMult = this.difficulty === "Abyssal" ? 1.4 : this.difficulty === "Heroic" ? 1.18 : 1;
    const floorBonus = (this.floor - 1) * 2;
    const partyScale = 1 + Math.max(0, this.players.size - 1) * 0.1;
    let dmg = (baseHit + floorBonus) * diffMult * partyScale;
    if (enemy && enemy.kind === "boss" && this.floor > 0) {
      const wards = this.getBossWards();
      if (wards > 0) {
        dmg *= 1 + Math.min(0.28, wards * 0.07);
      }
    }
    if (enemy && (enemy.poisonedMs || 0) > 0) {
      dmg *= 0.7;
    }
    return Math.max(1, Math.round(dmg));
  }
  getBlessingStacks(p, kind) {
    return (p.floorBlessings || []).filter((b) => b === kind).length;
  }
  getMaxBossWards() {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === "combat").length;
  }
  getBossWards() {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === "combat" && !r.cleared).length;
  }
  getGuardiansTotal() {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === "combat" && r.guardian).length;
  }
  getGuardiansRemaining() {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === "combat" && r.guardian && !r.cleared).length;
  }
  computeHealingAmount(baseHealing, healer, target) {
    return _GameRoom.computeHealingAmount(baseHealing, healer, target);
  }
  static getEnemyResistance(res, category) {
    return resolveEnemyResistance(res, category);
  }
  getEnemyResistance(res, category) {
    return _GameRoom.getEnemyResistance(res, category);
  }
  nextId(prefix) {
    return `${prefix}_${this.entitySeq++}`;
  }
  loadFloor(floorNum, partySize) {
    if (this.roomId === "TAVERN-HUB") {
      floorNum = 0;
    }
    this.floor = floorNum;
    this.enemyMeta.clear();
    this.zoneHitPlayers.clear();
    this.arcaneOrbHits.clear();
    this.primaryAttackProjIds.clear();
    this.tacticalProjIds.clear();
    this.voidCreditedProjIds.clear();
    this.temporalCreditedProjIds.clear();
    this.triggeredOnceProjIds.clear();
    if (floorNum === 0) {
      const tav = generateTavernFloor();
      this.map = tav.map;
      this.enemies = tav.enemies;
      this.props = tav.props;
      this.npcs = tav.npcs;
      this.trainingDummies = tav.trainingDummies;
      this.projectiles = [];
      this.zones = [];
      this.spawnPoint = tav.spawnPoint;
    } else {
      const generated = generateDungeonFloor(
        floorNum,
        this.baseSeed,
        this.difficulty,
        Math.max(1, partySize)
      );
      this.map = generated.map;
      this.enemies = generated.enemies;
      this.props = generated.props;
      this.npcs = [];
      this.trainingDummies = [];
      this.projectiles = [];
      this.zones = [];
      this.spawnPoint = generated.spawnPoint;
    }
    this.floorMasteryAwarded = false;
    let idx = 0;
    for (const pr of this.players.values()) {
      const offsetAngle = idx * Math.PI / 2;
      pr.state.x = this.spawnPoint.x + Math.cos(offsetAngle) * 20;
      pr.state.y = this.spawnPoint.y + Math.sin(offsetAngle) * 20;
      pr.state.readyNextFloor = false;
      pr.state.statuses = [];
      pr.state.floorBlessings = [];
      pr.state.spellCastState = null;
      pr.state.disintegrationState = null;
      pr.state.chronoSuspendedMs = 0;
      pr.state.activeChestPropId = null;
      pr.state.pendingRelicChoices = [];
      pr.state.pendingScrollChoices = [];
      pr.state.predatorTargetId = null;
      pr.state.predatorStacks = 0;
      pr.dummyGaleburstStacks.clear();
      this.clearEclipseCharge(pr);
      this.syncPassiveMetadata(pr);
      pr.pendingBarrage = null;
      pr.enteredRooms.clear();
      pr.enteredRooms.add(0);
      if (pr.state.downed) {
        pr.state.downed = false;
        pr.state.hp = Math.round(pr.state.maxHp * 0.5);
      } else {
        pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + 25);
      }
      idx++;
    }
  }
  applyPlayerStatus(p, statusType, durationMs, value, sourceId) {
    if (p.downed || p.godMode) return;
    const classDef = HERO_CLASSES[p.heroClass];
    const res = classDef?.resistances || {
      physical: 0,
      fire: 0,
      frost: 0,
      lightning: 0,
      poison: 0,
      bleed: 0
    };
    let resMult = 1;
    if (statusType === "frostbite") resMult = 1 - (res.frost || 0);
    if (statusType === "scorched") resMult = 1 - (res.fire || 0);
    if (statusType === "ashen_curse") resMult = 1 - (res.poison || 0);
    const faithTenacity = computePlayerCcTenacity(p);
    const effectiveDuration = Math.round(durationMs * Math.max(0.2, resMult * (1 - faithTenacity)));
    const existing = p.statuses.find((s) => s.type === statusType);
    if (existing) {
      existing.durationMs = Math.max(existing.durationMs, effectiveDuration);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, effectiveDuration);
      if (value !== void 0) existing.value = value;
      return;
    }
    const id = this.nextId("status");
    p.statuses.push({
      id,
      type: statusType,
      durationMs: effectiveDuration,
      maxDurationMs: effectiveDuration,
      value,
      sourceId,
      detonationTimerMs: statusType === "voidmarked" || statusType === "condemned" ? 3e3 : void 0
    });
    let label = statusType.toUpperCase().replace("_", " ");
    let color = "#CBD5E1";
    switch (statusType) {
      case "guard_broken":
        color = "#60A5FA";
        break;
      case "frostbite":
        color = "#38BDF8";
        break;
      case "scorched":
        color = "#EF4444";
        break;
      case "voidmarked":
        color = "#A855F7";
        break;
      case "disoriented":
        color = "#818CF8";
        break;
      case "charmed":
        color = "#FDE68A";
        break;
      case "ashen_curse":
        color = "#D9AA52";
        break;
      case "silenced":
        color = "#A855F7";
        break;
      case "impaled":
        color = "#FBBF24";
        break;
      case "condemned":
        color = "#FDE047";
        break;
    }
    this.emitEvent("status", p.x, p.y - 32, `[${label}]`, color);
  }
  detonateVoidmark(p, s) {
    this.emitEvent("status", p.x, p.y - 20, "VOID DETONATION!", "#A855F7");
    const dmg = 35 + this.floor * 5;
    this.damagePlayer(p, dmg, "arcane");
    for (const other of this.players.values()) {
      if (other.state.id !== p.id && !other.state.downed && Math.hypot(other.state.x - p.x, other.state.y - p.y) <= 95) {
        this.damagePlayer(other.state, Math.round(dmg * 0.75), "arcane");
        this.emitEvent("status", other.state.x, other.state.y - 14, "VOID BLAST!", "#A855F7");
      }
    }
  }
  detonateCondemned(p, s) {
    this.emitEvent("status", p.x, p.y - 20, "DIVINE JUDGMENT!", "#FDE047");
    const dmg = 65 + this.floor * 8;
    this.damagePlayer(p, dmg, "divine");
  }
  updatePlayerStatuses(p, dtMs, pulseDotNow) {
    if (!p.statuses) p.statuses = [];
    if (p.downed) {
      if (p.statuses.length > 0) p.statuses = [];
      return;
    }
    for (let i = p.statuses.length - 1; i >= 0; i--) {
      const s = p.statuses[i];
      s.durationMs -= dtMs;
      if (s.type === "scorched" && pulseDotNow) {
        this.damagePlayer(p, 6 + this.floor * 1.5, "fire");
      }
      if (s.detonationTimerMs !== void 0) {
        s.detonationTimerMs -= dtMs;
        if (s.detonationTimerMs <= 0) {
          if (s.type === "voidmarked") this.detonateVoidmark(p, s);
          if (s.type === "condemned") this.detonateCondemned(p, s);
          s.detonationTimerMs = void 0;
        }
      }
      if (s.durationMs <= 0) {
        p.statuses.splice(i, 1);
        if (s.type === "silenced") {
          this.emitEvent("status", p.x, p.y - 20, "SKILLS READY", "#34D399");
        }
      }
    }
  }
  static getPrimaryAttributeValue(p, sourceKind = "weapon") {
    if (sourceKind === "weapon") {
      return resolveWeaponCombatProfile(p.heroClass, p.equippedWeapon, p).rawAttributeValue;
    }
    return getPlayerAttributeValue(p, getClassDefaultScalingAttribute(p.heroClass));
  }
  static computeDotMultiplier(p, options) {
    return computePlayerDotMultiplier(p, options);
  }
  getEnemyMeta(enemy) {
    let meta = this.enemyMeta.get(enemy.id);
    if (!meta) {
      meta = {
        hardCcStage: 0,
        lastHardCcAtMs: -999999,
        burnOwnerId: null,
        burnMultiplier: null,
        burnBaseTick: null,
        poisonOwnerId: null,
        poisonMultiplier: null,
        poisonBaseTick: null,
        bleedOwnerId: null,
        bleedMultiplier: null,
        bossPhase: 1,
        lastBossAbility: -1,
        bossTargetId: null,
        bossTargetSwitchAtMs: 0,
        bossAbilityCooldowns: {},
        chargeHitPlayerIds: /* @__PURE__ */ new Set(),
        bossStrafeDir: Math.random() < 0.5 ? 1 : -1,
        bossStrafeFlipAtMs: 0,
        bossRecentDmgTaken: 0,
        bossRecentDmgAtMs: 0
      };
      this.enemyMeta.set(enemy.id, meta);
    }
    return meta;
  }
  clearEnemyChargeState(enemy) {
    enemy.charging = false;
    enemy.chargeWindupMs = 0;
    enemy.chargeTimerMs = 0;
    enemy.chargeAngle = void 0;
    const meta = this.enemyMeta.get(enemy.id);
    if (meta) {
      meta.chargeHitPlayerIds.clear();
    }
  }
  removeEntityZones(entityId, kinds) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.ownerId === entityId && (!kinds || kinds.includes(z.kind))) {
        this.zoneHitPlayers.delete(z.id);
        this.zones.splice(i, 1);
      }
    }
  }
  getEnemyCcState(enemy) {
    const meta = this.getEnemyMeta(enemy);
    const effectiveStage = meta.hardCcStage > 0 && this.simTimeMs - meta.lastHardCcAtMs >= 8e3 ? 0 : meta.hardCcStage;
    return {
      stage: effectiveStage,
      lastHardCcAtMs: meta.lastHardCcAtMs,
      simTimeMs: this.simTimeMs
    };
  }
  getBossRuntimeInfo(boss) {
    const meta = this.getEnemyMeta(boss);
    return {
      phase: meta.bossPhase,
      summonWave: boss.summonWave || 0,
      lastAbility: meta.lastBossAbility
    };
  }
  applyHardCc(enemy, kind, baseDurationMs) {
    if (!enemy || enemy.hp <= 0 || baseDurationMs <= 0) return 0;
    const meta = this.getEnemyMeta(enemy);
    if (meta.hardCcStage > 0 && this.simTimeMs - meta.lastHardCcAtMs >= 8e3) {
      meta.hardCcStage = 0;
    }
    const isBoss = enemy.kind === "boss";
    const isElite = !isBoss && Boolean(enemy.elite);
    const profileMult = isBoss ? 0.3 : isElite ? 0.75 : 1;
    const drStages = isBoss ? [1, 0.4, 0] : [1, 0.5, 0.25, 0];
    const stageIdx = Math.min(meta.hardCcStage, drStages.length - 1);
    const drMult = drStages[stageIdx];
    if (drMult <= 0) {
      this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 14, "CC IMMUNE!", "#94A3B8");
      return 0;
    }
    const effectiveDuration = Math.max(0, Math.round(baseDurationMs * profileMult * drMult));
    if (effectiveDuration <= 0) return 0;
    meta.hardCcStage = Math.min(drStages.length - 1, meta.hardCcStage + 1);
    meta.lastHardCcAtMs = this.simTimeMs;
    if (kind === "stun") {
      enemy.stunnedMs = Math.max(enemy.stunnedMs, effectiveDuration);
    } else {
      enemy.frozenMs = Math.max(enemy.frozenMs, effectiveDuration);
    }
    if (enemy.charging || (enemy.chargeWindupMs || 0) > 0 || enemy.chargeAngle !== void 0) {
      this.clearEnemyChargeState(enemy);
      if (enemy.state === "charge") enemy.state = "recover";
    }
    if (enemy.kind === "boss") {
      const hadParry = this.zones.some((z) => z.kind === "warden_parry" && z.ownerId === enemy.id);
      if (hadParry) {
        this.removeEntityZones(enemy.id, ["warden_parry"]);
        this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, "PARRY BROKEN!", "#38BDF8");
      }
    }
    return effectiveDuration;
  }
  applySoftCc(enemy, baseDurationMs) {
    if (!enemy || enemy.hp <= 0 || baseDurationMs <= 0) return 0;
    const effectiveDuration = Math.max(0, Math.round(baseDurationMs));
    enemy.slowedMs = Math.max(enemy.slowedMs, effectiveDuration);
    return effectiveDuration;
  }
  applyDotStatus(enemy, kind, attacker, durationMs, sourceKind = "weapon") {
    if (!enemy || enemy.hp <= 0 || durationMs <= 0) return;
    const meta = this.getEnemyMeta(enemy);
    const mult = _GameRoom.computeDotMultiplier(attacker, { sourceKind });
    const ownerId = attacker ? attacker.id : null;
    const effectiveDur = Math.max(0, Math.round(durationMs));
    if (kind === "burn") {
      enemy.burnedMs = effectiveDur;
      meta.burnOwnerId = ownerId;
      meta.burnMultiplier = mult;
      meta.burnBaseTick = (7 + this.floor) * mult;
    } else if (kind === "poison") {
      enemy.poisonedMs = effectiveDur;
      meta.poisonOwnerId = ownerId;
      meta.poisonMultiplier = mult;
      meta.poisonBaseTick = (5 + this.floor) * mult;
    } else {
      enemy.bleedingMs = effectiveDur;
      meta.bleedOwnerId = ownerId;
      meta.bleedMultiplier = mult;
    }
  }
  applyDotDamageTick(enemy, kind, rawScaledTick, ownerId, color) {
    if (enemy.hp <= 0) return false;
    const resCat = kind === "burn" ? "fire" : kind === "poison" ? "poison" : "bleed";
    const res = _GameRoom.getEnemyResistance(enemy.resistances, resCat);
    const finalDmg = Math.max(1, Math.round(rawScaledTick * (1 - res)));
    enemy.hp -= finalDmg;
    const ownerState = ownerId ? this.players.get(ownerId)?.state ?? null : null;
    if (ownerState) {
      ownerState.damageDealt += finalDmg;
    }
    this.emitEvent(
      "damage",
      enemy.x + (Math.random() * 12 - 6),
      enemy.y - enemy.radius - 8,
      `${finalDmg}`,
      color ?? getDamageTypeColor(resCat, false),
      resCat
    );
    if (enemy.hp <= 0) {
      this.processEnemyDeath(enemy, ownerState);
      return true;
    }
    return false;
  }
  applyStatusEffect(target, kind, durationMs, attacker = null) {
    if ("heroClass" in target) {
      if (kind === "slow") this.applyPlayerStatus(target, "frostbite", durationMs);
      else if (kind === "burn") this.applyPlayerStatus(target, "scorched", durationMs);
      else if (kind === "silence") this.applyPlayerStatus(target, "silenced", durationMs);
      else {
        const faithTenacity = computePlayerCcTenacity(target);
        const reducedDuration = Math.max(0, Math.round(durationMs * (1 - faithTenacity)));
        target.stunnedMs = Math.max(target.stunnedMs, reducedDuration);
      }
      return;
    }
    switch (kind) {
      case "slow":
        this.applySoftCc(target, durationMs);
        break;
      case "stun":
        this.applyHardCc(target, "stun", durationMs);
        break;
      case "freeze":
        this.applyHardCc(target, "freeze", durationMs);
        break;
      case "burn":
        this.applyDotStatus(target, "burn", attacker, durationMs);
        break;
      case "poison":
        this.applyDotStatus(target, "poison", attacker, durationMs);
        break;
      case "bleed":
        this.applyDotStatus(target, "bleed", attacker, durationMs);
        break;
      case "shock":
        target.shockedMs = Math.max(target.shockedMs, Math.max(0, Math.round(durationMs)));
        break;
      case "silence":
        target.silencedMs = Math.max(target.silencedMs || 0, Math.max(0, Math.round(durationMs)));
        break;
    }
  }
  spawnEnemyForTesting(kind, x, y, elite = false) {
    const biome = this.map?.biome || "courtyard";
    const en = makeEnemy(`test_${this.entitySeq++}`, kind, 0, x, y, 1, elite, this.floor, biome);
    this.enemies.push(en);
    return en;
  }
  teleportPlayerToFloor(playerId, floorNum) {
    const targetFloor = Math.max(1, Math.min(10, floorNum));
    this.loadFloor(targetFloor, this.players.size);
    this.pushSystemChat(`[ADMIN] Teleported party to Floor ${targetFloor} (${this.map.biomeTitle}).`);
  }
  spawnEntitiesForAdmin(playerId, kind, count) {
    const p = this.players.get(playerId)?.state;
    if (!p) return;
    const clampedCount = Math.max(1, Math.min(25, count));
    const biome = this.map?.biome || "courtyard";
    for (let i = 0; i < clampedCount; i++) {
      const angle = i * Math.PI * 2 / clampedCount;
      const dist = 55 + i % 3 * 20;
      const sx = p.x + Math.cos(angle) * dist;
      const sy = p.y + Math.sin(angle) * dist;
      const en = makeEnemy(`adm_${this.entitySeq++}`, kind, 0, sx, sy, 1, kind === "boss", this.floor, biome);
      this.enemies.push(en);
    }
    this.pushSystemChat(`[ADMIN] Spawned ${clampedCount}x ${kind} near ${p.username}.`);
  }
  despawnEntity(entityId) {
    const idx = this.enemies.findIndex((e) => e.id === entityId);
    if (idx >= 0) {
      const removed = this.enemies.splice(idx, 1)[0];
      this.removeEntityZones(removed.id);
      this.enemyMeta.delete(removed.id);
      this.pushSystemChat(`[ADMIN] Despawned entity ${removed.name} (${removed.id}).`);
    }
  }
  clearAllEnemies() {
    const count = this.enemies.length;
    for (const en of this.enemies) {
      this.removeEntityZones(en.id);
    }
    this.enemies = [];
    this.enemyMeta.clear();
    this.pushSystemChat(`[ADMIN] Cleared all ${count} active enemies from the room.`);
  }
  clearSummonedEntities() {
    const before = this.enemies.length;
    this.enemies = this.enemies.filter((e) => {
      if (e.kind === "boss") return true;
      this.removeEntityZones(e.id);
      this.enemyMeta.delete(e.id);
      return false;
    });
    const cleared = before - this.enemies.length;
    this.pushSystemChat(`[ADMIN] Cleared ${cleared} summoned entities (retained primary bosses).`);
  }
  healPlayer(playerId) {
    const p = this.players.get(playerId)?.state;
    if (!p) return;
    p.hp = p.maxHp;
    this.grantShield(p, 50, "floor_to");
    this.emitEvent("heal", p.x, p.y - 18, "ADMIN HEAL", "#34D399");
    this.pushSystemChat(`[ADMIN] Fully restored health & shield for ${p.username}.`);
  }
  restoreEnergy(playerId) {
    const p = this.players.get(playerId)?.state;
    if (!p) return;
    p.skillCooldownMs = 0;
    p.ultCooldownMs = 0;
    this.emitEvent("status", p.x, p.y - 18, "COOLDOWNS RESET", "#38BDF8");
    this.pushSystemChat(`[ADMIN] Reset skill & ultimate cooldowns for ${p.username}.`);
  }
  reviveAllPlayers() {
    for (const pr of this.players.values()) {
      pr.state.downed = false;
      pr.state.hp = pr.state.maxHp;
      this.emitEvent("heal", pr.state.x, pr.state.y - 18, "ADMIN REVIVE", "#6EE7B7");
    }
    this.pushSystemChat(`[ADMIN] Revived and restored all downed party members.`);
  }
  summonBossForFloor(floorNum) {
    const targetFloor = Math.max(1, Math.min(10, floorNum));
    this.loadFloor(targetFloor, this.players.size);
    this.pushSystemChat(`[ADMIN] Summoned Floor ${targetFloor} Guardian Boss encounter.`);
  }
  resetBossEncounter() {
    for (const en of this.enemies) {
      if (en.kind === "boss") {
        en.hp = en.maxHp;
        en.enraged = false;
        en.shieldWallMs = 0;
        en.stunnedMs = 0;
        en.frozenMs = 0;
        en.summonWave = 0;
        this.clearEnemyChargeState(en);
        this.removeEntityZones(en.id);
        const meta = this.getEnemyMeta(en);
        meta.hardCcStage = 0;
        meta.lastHardCcAtMs = -999999;
        meta.bossPhase = 1;
        meta.lastBossAbility = -1;
        meta.bossAbilityCooldowns = {};
      }
      en.chronoSuspendedMs = 0;
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i].kind === "chrono_well") {
        this.zones.splice(i, 1);
      }
    }
    this.refreshChronoSuspensionState();
    this.pushSystemChat(`[ADMIN] Reset active boss encounter (HP restored, phase/enrage/CC cleared).`);
  }
  resetCurrentRoom() {
    this.loadFloor(this.floor, this.players.size);
    this.pushSystemChat(`[ADMIN] Reset current room state.`);
  }
  toggleEnemyAI(enabled) {
    const state = enabled ?? true;
    this.pushSystemChat(`[ADMIN] Enemy AI processing ${state ? "RESUMED" : "PAUSED"}.`);
  }
  resetPlayersForNewRun() {
    for (const pr of this.players.values()) {
      pr.state.shield = 0;
      pr.state.gold = 0;
      pr.state.potions = 2;
      pr.state.relics = [];
      pr.state.pendingRelicChoices = [];
      pr.state.statuses = [];
      pr.state.floorBlessings = [];
      pr.state.downed = false;
      pr.state.downedTimerMs = 0;
      pr.state.reviveProgress = 0;
      pr.state.skillCooldownMs = 0;
      pr.state.ultCooldownMs = 0;
      pr.state.dashCooldownMs = 0;
      pr.state.kills = 0;
      pr.state.damageDealt = 0;
      pr.state.revives = 0;
      pr.state.readyNextFloor = false;
      pr.state.ready = false;
      pr.state.attackAnimMs = 0;
      pr.state.attackComboStep = 0;
      pr.lastPrimaryAttackAtMs = -99999;
      pr.state.hasteMs = 0;
      pr.state.slowedMs = 0;
      pr.state.stunnedMs = 0;
      pr.state.burnedMs = 0;
      pr.state.frozenMs = 0;
      pr.state.shockedMs = 0;
      pr.state.poisonedMs = 0;
      pr.state.bleedingMs = 0;
      pr.state.silencedMs = 0;
      pr.state.spellCastState = null;
      pr.state.disintegrationState = null;
      pr.state.equippedScrollId = null;
      pr.state.pendingScrollChoices = [];
      pr.state.activeChestPropId = null;
      pr.state.starRiftCooldownMs = pr.state.heroClass === "arcanist" ? 0 : void 0;
      pr.state.chronoSuspendedMs = 0;
      pr.pendingBarrage = null;
      this.resetPassiveState(pr);
      this.syncPlayerTacticalCooldownOnEquipmentChange(pr.state);
      pr.input = {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: 0
      };
      pr.state.shield = computePlayerStartingShield(pr.state);
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = pr.state.maxHp;
    }
  }
  startExpedition() {
    this.lastRunSummary = null;
    this.status = "playing";
    this.startedAt = Date.now();
    this.endedAt = null;
    this.runEndRecorded = false;
    this.resetPlayersForNewRun();
    this.loadFloor(1, Math.max(1, this.players.size));
    this.pushSystemChat(`Host ${this.hostName} started the expedition! Entering Floor 1.`);
    return this.map;
  }
  returnToWaitingLobby() {
    if (this.roomId === "TAVERN-HUB") return;
    if (this.status === "victory" || this.status === "defeat") {
      this.lastRunSummary = {
        outcome: this.status,
        floor: this.floor,
        elapsedSec: this.getElapsedSec(),
        players: Array.from(this.players.values()).map((r) => ({
          id: r.state.id,
          username: r.state.username,
          heroClass: r.state.heroClass,
          level: r.state.level,
          kills: r.state.kills,
          revives: r.state.revives
        }))
      };
    }
    for (const [pid, pr] of Array.from(this.players.entries())) {
      if (!pr.state.connected) {
        this.players.delete(pid);
      }
    }
    if (this.players.size > 0 && !this.isPlayerConnected(this.hostId)) {
      this.transferHostToConnectedMember();
    }
    this.resetPlayersForNewRun();
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.props = [];
    this.npcs = [];
    this.trainingDummies = [];
    this.pendingEvents = [];
    this.floor = 1;
    this.status = "waiting";
    this.startedAt = Date.now();
    this.endedAt = null;
    this.runEndRecorded = false;
    let idx = 0;
    for (const pr of this.players.values()) {
      const offsetAngle = idx * Math.PI / 2;
      pr.state.x = this.spawnPoint.x + Math.cos(offsetAngle) * 20;
      pr.state.y = this.spawnPoint.y + Math.sin(offsetAngle) * 20;
      pr.state.vx = 0;
      pr.state.vy = 0;
      pr.enteredRooms.clear();
      pr.enteredRooms.add(0);
      idx++;
    }
    this.pushSystemChat("Party returned to waiting lobby. The party is now open for new members.");
  }
  restartRun() {
    this.lastRunSummary = null;
    this.status = "playing";
    this.startedAt = Date.now();
    this.endedAt = null;
    this.runEndRecorded = false;
    this.resetPlayersForNewRun();
    const restartFloor = this.roomId === "TAVERN-HUB" ? 0 : 1;
    this.loadFloor(restartFloor, Math.max(1, this.players.size));
    this.pushSystemChat(
      this.roomId === "TAVERN-HUB" ? `Sanctuary Tavern refreshed.` : `Host ${this.hostName} restarted the expedition on Seed ${this.baseSeed}.`
    );
    return this.map;
  }
  isHost(playerId) {
    return Boolean(playerId && this.hostId === playerId);
  }
  isPartyLocked() {
    return this.roomId !== "TAVERN-HUB" && this.status === "playing";
  }
  isPlayerConnected(playerId) {
    return Boolean(this.players.get(playerId)?.state.connected);
  }
  getConnectedPlayerCount() {
    let count = 0;
    for (const pr of this.players.values()) {
      if (pr.state.connected) count++;
    }
    return count;
  }
  setPlayerReady(playerId, ready) {
    if (this.roomId === "TAVERN-HUB") {
      return { ok: false, reason: "Ready status is only used in expedition party lobbies." };
    }
    if (this.status !== "waiting") {
      return { ok: false, reason: "Ready status can only be toggled while in the waiting lobby." };
    }
    const pr = this.players.get(playerId);
    if (!pr) {
      return { ok: false, reason: "Player is not a member of this party." };
    }
    const nextReady = ready === void 0 ? !Boolean(pr.state.ready) : Boolean(ready);
    pr.state.ready = nextReady;
    return { ok: true, ready: nextReady };
  }
  canAcceptJoin(playerId) {
    if (this.roomId === "TAVERN-HUB") {
      if (this.hasPlayer(playerId)) return { allowed: true, isReconnect: true };
      if (this.players.size >= this.maxPlayers) {
        return { allowed: false, code: "full", reason: "Sanctuary Tavern is currently full." };
      }
      return { allowed: true, isReconnect: false };
    }
    if (this.hasPlayer(playerId)) {
      return { allowed: true, isReconnect: true };
    }
    if (this.status === "playing") {
      return {
        allowed: false,
        code: "in_progress",
        reason: "This expedition is already in progress."
      };
    }
    if (this.status === "victory" || this.status === "defeat") {
      return {
        allowed: false,
        code: "ended",
        reason: "This expedition has ended. Wait for the host to return to the waiting lobby."
      };
    }
    if (this.players.size >= this.maxPlayers) {
      return {
        allowed: false,
        code: "full",
        reason: "That expedition party is already full (4/4)."
      };
    }
    return { allowed: true, isReconnect: false };
  }
  tryJoinOrReconnectPlayer(playerId, username, heroClass, isAdmin = false, savedStats) {
    const check = this.canAcceptJoin(playerId);
    if (!check.allowed) {
      return { ok: false, code: check.code, reason: check.reason };
    }
    const player = this.addOrReconnectPlayer(playerId, username, heroClass, isAdmin, savedStats);
    return { ok: true, isReconnect: check.isReconnect, player };
  }
  addOrReconnectPlayer(playerId, username, heroClass, isAdmin = false, savedStats) {
    const existing = this.players.get(playerId);
    if (existing) {
      const wasDisconnected = !existing.state.connected;
      existing.state.connected = true;
      existing.state.username = username;
      existing.state.isAdmin = isAdmin || Boolean(existing.state.isAdmin);
      if (!existing.state.storage) existing.state.storage = [];
      if (!existing.state.ownedWeapons || !existing.state.ownedVestments) {
        const normalizedExisting = normalizeArmamentLoadout(existing.state.heroClass, {
          ownedWeapons: existing.state.ownedWeapons ?? savedStats?.ownedWeapons,
          ownedVestments: existing.state.ownedVestments ?? savedStats?.ownedVestments,
          equippedWeapon: existing.state.equippedWeapon !== void 0 ? existing.state.equippedWeapon : savedStats?.equippedWeapon,
          equippedVestment: existing.state.equippedVestment !== void 0 ? existing.state.equippedVestment : savedStats?.equippedVestment
        });
        existing.state.ownedWeapons = normalizedExisting.ownedWeapons;
        existing.state.ownedVestments = normalizedExisting.ownedVestments;
        existing.state.equippedWeapon = normalizedExisting.equippedWeapon;
        existing.state.equippedVestment = normalizedExisting.equippedVestment;
      }
      if (existing.state.heroClass === "arcanist") {
        if (!existing.state.pendingScrollChoices) existing.state.pendingScrollChoices = [];
        if (existing.state.starRiftCooldownMs === void 0) existing.state.starRiftCooldownMs = 0;
      }
      this.clearEclipseCharge(existing);
      const expectedPassive = this.getActivePassive(existing.state);
      if (existing.state.activePassiveId !== expectedPassive) {
        this.resetPassiveState(existing);
      } else {
        existing.state.vanguardHeat = existing.state.vanguardHeat ?? 0;
        existing.state.rangerMomentum = existing.state.rangerMomentum ?? 0;
        existing.state.predatorTargetId = existing.state.predatorTargetId ?? null;
        existing.state.predatorStacks = existing.state.predatorStacks ?? 0;
        existing.state.voidEnergy = existing.state.voidEnergy ?? 0;
        existing.state.storedGrace = existing.state.storedGrace ?? 0;
        existing.state.clericSanctity = existing.state.clericSanctity ?? 0;
        existing.state.eclipseChargeRatio = 0;
        existing.state.attackComboStep = existing.state.attackComboStep ?? 0;
        existing.state.bastionCounterMs = existing.state.bastionCounterMs ?? 0;
        existing.state.bastionCounterMaxMs = existing.state.bastionCounterMaxMs ?? 0;
        existing.state.crimsonFrenzyMs = existing.state.crimsonFrenzyMs ?? 0;
        existing.state.crimsonFrenzyMaxMs = existing.state.crimsonFrenzyMaxMs ?? 0;
        this.syncPlayerTacticalCooldownOnEquipmentChange(existing.state);
        this.syncPassiveMetadata(existing);
      }
      if (wasDisconnected && this.roomId !== "TAVERN-HUB") {
        this.pushSystemChat(`${username} reconnected.`);
      }
      return existing.state;
    }
    const def = HERO_CLASSES[heroClass];
    const idx = this.players.size;
    let sx = this.spawnPoint.x + (idx % 2 === 0 ? -18 : 18);
    let sy = this.spawnPoint.y + (idx < 2 ? -14 : 14);
    for (const ally of this.players.values()) {
      if (ally.state.connected && !ally.state.downed) {
        sx = ally.state.x + 22;
        sy = ally.state.y;
        break;
      }
    }
    const clampedLevel = Math.max(1, Math.min(MAX_LEVEL, Number(savedStats?.level) || 1));
    const clampedXp = clampedLevel >= MAX_LEVEL ? 0 : Math.max(0, Number(savedStats?.xp) || 0);
    const armaments = normalizeArmamentLoadout(heroClass, savedStats);
    const initialShield = computePlayerStartingShield({
      heroClass,
      equippedWeapon: armaments.equippedWeapon,
      equippedVestment: armaments.equippedVestment,
      floorBlessings: []
    });
    const initialTacticalCd = resolveActiveTacticalDef(
      heroClass,
      armaments.equippedWeapon,
      null
    ).cooldownMs;
    const state = {
      id: playerId,
      username,
      heroClass,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: def.maxHp,
      maxHp: def.maxHp,
      shield: initialShield,
      level: clampedLevel,
      xp: clampedXp,
      nextXp: _GameRoom.computeNextXp(clampedLevel),
      gold: 0,
      potions: 2,
      relics: [],
      storage: savedStats?.storage ? [...savedStats.storage] : [],
      ownedWeapons: armaments.ownedWeapons,
      ownedVestments: armaments.ownedVestments,
      equippedWeapon: armaments.equippedWeapon,
      equippedVestment: armaments.equippedVestment,
      activePassiveId: resolveActiveVestmentPassive(heroClass, armaments.equippedVestment),
      vanguardHeat: 0,
      rangerMomentum: 0,
      predatorTargetId: null,
      predatorStacks: 0,
      voidEnergy: 0,
      storedGrace: 0,
      clericSanctity: 0,
      eclipseChargeRatio: 0,
      attackComboStep: 0,
      bastionCounterMs: 0,
      bastionCounterMaxMs: 0,
      crimsonFrenzyMs: 0,
      crimsonFrenzyMaxMs: 0,
      downed: false,
      downedTimerMs: 0,
      reviveProgress: 0,
      skillCooldownMs: 0,
      maxSkillCooldownMs: initialTacticalCd,
      ultCooldownMs: 0,
      maxUltCooldownMs: def.ultCooldownMs,
      dashCooldownMs: 0,
      maxDashCooldownMs: 2600,
      attackAnimMs: 0,
      hasteMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      kills: 0,
      damageDealt: 0,
      revives: 0,
      readyNextFloor: false,
      ready: false,
      pendingRelicChoices: [],
      connected: true,
      isAdmin,
      godMode: false,
      speedBoost: false,
      noCooldownMode: false,
      dexterity: savedStats?.dexterity || 0,
      vitality: savedStats?.vitality || 0,
      strength: savedStats?.strength || 0,
      intelligence: savedStats?.intelligence || 0,
      faith: savedStats?.faith || 0,
      attributePoints: savedStats?.attributePoints || 0,
      statuses: [],
      floorBlessings: [],
      ...heroClass === "arcanist" ? {
        spellCastState: null,
        disintegrationState: null,
        equippedScrollId: null,
        pendingScrollChoices: [],
        starRiftCooldownMs: 0
      } : {},
      chronoSuspendedMs: 0,
      activeChestPropId: null,
      npcDialogue: null
    };
    if (state.level >= MAX_LEVEL) {
      state.nextXp = 999999;
      state.xp = 0;
    }
    state.maxHp = _GameRoom.computePlayerMaxHp(
      state.heroClass,
      state.level,
      state.vitality,
      state.relics,
      state.equippedVestment
    );
    state.hp = state.maxHp;
    this.players.set(playerId, {
      state,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: 0
      },
      attackCooldownMs: 0,
      enteredRooms: /* @__PURE__ */ new Set([0]),
      attackCount: 0,
      starRiftAttackCount: 0,
      heatLastHitAtMs: 0,
      momentumHoldMs: 0,
      predatorLastHitAtMs: 0,
      solarisLastHealAtMs: 0,
      eclipseHoldActive: false,
      eclipseHoldStartMs: 0,
      pendingEclipseReleaseMs: null,
      dummyGaleburstStacks: /* @__PURE__ */ new Map(),
      bastionBlockedHits: 0,
      bastionAimAngle: 0,
      lastPrimaryAttackAtMs: -99999,
      npcSpeechIndices: {},
      dialogueSeq: 0
    });
    if (!this.hostId && this.roomId !== "TAVERN-HUB") {
      this.hostId = playerId;
      this.hostName = username;
    }
    this.pushSystemChat(
      `${username} (${def.name}) joined the ${this.status === "waiting" ? "party lobby" : "expedition"}.`
    );
    return state;
  }
  markPlayerDisconnected(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    pr.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: pr.input.aimAngle,
      stickX: 0,
      stickY: 0
    };
    this.clearEclipseCharge(pr);
    pr.state.vx = 0;
    pr.state.vy = 0;
    if (pr.state.disintegrationState?.active) {
      this.stopDisintegrationChannel(playerId);
    }
    pr.state.spellCastState = null;
    this.cleanupChronoWellsForOwner(playerId);
    if (pr.state.connected) {
      pr.state.connected = false;
      if (this.roomId !== "TAVERN-HUB") {
        this.pushSystemChat(`${pr.state.username} disconnected.`);
      }
      return true;
    }
    return false;
  }
  transferHostToConnectedMember(excludePlayerId) {
    let candidate;
    for (const pr of this.players.values()) {
      if (pr.state.id !== excludePlayerId && pr.state.connected) {
        candidate = pr;
        break;
      }
    }
    if (!candidate) return null;
    const prevName = this.hostName;
    this.hostId = candidate.state.id;
    this.hostName = candidate.state.username;
    this.pushSystemChat(`Host ownership transferred to ${this.hostName}.`);
    return {
      previousHostName: prevName,
      newHostId: this.hostId,
      newHostName: this.hostName
    };
  }
  removePlayer(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (pr.state.disintegrationState?.active) {
      this.stopDisintegrationChannel(playerId);
    }
    this.cleanupChronoWellsForOwner(playerId);
    const wasHost = playerId === this.hostId || pr.state.username === this.hostName;
    this.players.delete(playerId);
    this.pushSystemChat(`${pr.state.username} departed the party.`);
    if (this.players.size > 0 && wasHost) {
      const transferred = this.transferHostToConnectedMember();
      if (!transferred) {
        const first = this.players.values().next().value;
        if (first) {
          this.hostId = first.state.id;
          this.hostName = first.state.username;
          this.pushSystemChat(`Host ownership transferred to ${this.hostName}.`);
        }
      }
    }
  }
  getPlayerCount() {
    return this.players.size;
  }
  hasPlayer(playerId) {
    return this.players.has(playerId);
  }
  getPlayerState(playerId) {
    return this.players.get(playerId)?.state;
  }
  isPlayerNearNpc(playerId, npcIdOrName, maxDistance = 85) {
    const p = this.players.get(playerId)?.state;
    if (!p) return false;
    const target = this.npcs.find(
      (n) => n.id === npcIdOrName || n.name.toLowerCase() === npcIdOrName.toLowerCase()
    );
    if (!target) return false;
    return Math.hypot(target.x - p.x, target.y - p.y) <= maxDistance;
  }
  pushChat(sender, text, system = false) {
    const msg = {
      id: this.nextId("chat"),
      sender,
      text: text.slice(0, 180),
      timestamp: Date.now(),
      system
    };
    this.chat.push(msg);
    if (this.chat.length > 40) this.chat.shift();
    if (this.onChatMessageCallback) {
      this.onChatMessageCallback(msg);
    }
    return msg;
  }
  pushSystemChat(text) {
    return this.pushChat("Sanctuary", text, true);
  }
  updateInput(playerId, input, seq) {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== "playing") return;
    const prevAttack = Boolean(pr.input.attack);
    const nextAttack = Boolean(input.attack);
    const p = pr.state;
    const isEclipse = p.heroClass === "ranger" && p.equippedWeapon === "ranger_eclipse_longbow";
    if (isEclipse && !p.downed && !p.spellCastState && !p.disintegrationState?.active && (p.chronoSuspendedMs || 0) <= 0) {
      if (!prevAttack && nextAttack && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
        pr.eclipseHoldActive = true;
        pr.eclipseHoldStartMs = this.simTimeMs;
        pr.pendingEclipseReleaseMs = null;
      } else if (prevAttack && !nextAttack && pr.eclipseHoldActive) {
        pr.pendingEclipseReleaseMs = Math.max(0, this.simTimeMs - pr.eclipseHoldStartMs);
        pr.eclipseHoldActive = false;
        pr.eclipseHoldStartMs = 0;
      }
    } else if (!isEclipse) {
      this.clearEclipseCharge(pr);
    }
    pr.input = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      attack: nextAttack,
      aimAngle: Number.isFinite(input.aimAngle) ? input.aimAngle : 0,
      stickX: typeof input.stickX === "number" ? input.stickX : void 0,
      stickY: typeof input.stickY === "number" ? input.stickY : void 0
    };
    pr.state.aimAngle = pr.input.aimAngle;
    if (typeof seq === "number" && Number.isFinite(seq)) {
      pr.state.lastInputSeq = seq;
    }
  }
  getMaxShieldCap(p) {
    return computePlayerMaxShieldCap(p);
  }
  /**
   * Centralized server-authoritative Shield grant gate.
   * Enforces Permanent Shield Lock (e.g. Crimson War Axe) across ALL Shield-gain sources
   * without automatically wiping pre-existing Shield.
   */
  grantShield(p, amount, mode = "add") {
    if (amount <= 0 || isShieldGainLocked(p) || p.downed) return 0;
    const cap = this.getMaxShieldCap(p);
    const before = Math.max(0, p.shield || 0);
    if (before >= cap) return 0;
    const target = mode === "floor_to" ? Math.max(before, amount) : before + amount;
    const next = Math.min(cap, target);
    const gained = Math.max(0, next - before);
    if (gained > 0) {
      p.shield = next;
    }
    return gained;
  }
  changeClass(playerId, heroClass) {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.downed) return;
    const def = HERO_CLASSES[heroClass];
    if (!def) return;
    const hpRatio = pr.state.hp / Math.max(1, pr.state.maxHp);
    pr.state.heroClass = heroClass;
    const defaultWpn = getDefaultWeaponIdForClass(heroClass);
    const defaultVest = getDefaultVestmentIdForClass(heroClass);
    if (!pr.state.ownedWeapons) pr.state.ownedWeapons = [];
    if (!pr.state.ownedVestments) pr.state.ownedVestments = [];
    if (!pr.state.ownedWeapons.includes(defaultWpn)) pr.state.ownedWeapons.push(defaultWpn);
    if (!pr.state.ownedVestments.includes(defaultVest)) pr.state.ownedVestments.push(defaultVest);
    if (pr.state.equippedWeapon !== null && !resolveEquippedWeaponForClass(heroClass, pr.state.equippedWeapon)) {
      pr.state.equippedWeapon = defaultWpn;
    }
    if (!resolveEquippedVestmentForClass(heroClass, pr.state.equippedVestment)) {
      pr.state.equippedVestment = defaultVest;
    }
    pr.state.maxHp = _GameRoom.computePlayerMaxHp(
      heroClass,
      pr.state.level,
      pr.state.vitality,
      pr.state.relics,
      pr.state.equippedVestment
    );
    pr.state.hp = Math.max(1, Math.min(pr.state.maxHp, Math.round(pr.state.maxHp * hpRatio)));
    pr.state.shield = Math.min(this.getMaxShieldCap(pr.state), pr.state.shield);
    pr.state.maxUltCooldownMs = def.ultCooldownMs;
    pr.state.disintegrationState = null;
    pr.state.spellCastState = null;
    pr.state.equippedScrollId = null;
    pr.state.pendingScrollChoices = [];
    pr.state.activeChestPropId = null;
    pr.state.starRiftCooldownMs = heroClass === "arcanist" ? 0 : void 0;
    pr.pendingBarrage = null;
    this.resetPassiveState(pr);
    this.syncPlayerTacticalCooldownOnEquipmentChange(pr.state);
    this.emitEvent("status", pr.state.x, pr.state.y - 22, def.name, def.accentColor);
  }
  equipArmament(playerId, slot, itemId) {
    const pr = this.players.get(playerId);
    if (!pr) return { ok: false, error: "Player not found in active room." };
    const p = pr.state;
    const def = getArmamentDef(slot, itemId);
    if (!def) {
      return { ok: false, error: "Unknown permanent armament." };
    }
    if (def.heroClass !== p.heroClass) {
      return {
        ok: false,
        error: `${def.name} belongs to ${HERO_CLASSES[def.heroClass].name} and cannot be equipped by ${HERO_CLASSES[p.heroClass].name}.`
      };
    }
    const ownedList = slot === "weapon" ? p.ownedWeapons || [] : p.ownedVestments || [];
    if (!ownedList.includes(itemId)) {
      return { ok: false, error: `You do not own ${def.name}.` };
    }
    if (slot === "weapon") {
      p.equippedWeapon = itemId;
      p.attackComboStep = 0;
      pr.lastPrimaryAttackAtMs = -99999;
      this.clearEclipseCharge(pr);
      this.clearGaleburstForPlayer(p.id);
      this.clearPlayerTacticalState(pr, { removeOwnedZones: true });
      this.syncPlayerTacticalCooldownOnEquipmentChange(p);
    } else {
      const oldMaxHp = p.maxHp;
      p.equippedVestment = itemId;
      this.resetPassiveState(pr);
      p.maxHp = _GameRoom.computePlayerMaxHp(
        p.heroClass,
        p.level,
        p.vitality,
        p.relics,
        p.equippedVestment
      );
      if (p.maxHp > oldMaxHp) {
        p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMaxHp));
      } else {
        p.hp = Math.min(p.hp, p.maxHp);
      }
      p.shield = Math.min(p.shield, this.getMaxShieldCap(p));
    }
    this.emitEvent("status", p.x, p.y - 26, `Equipped: ${def.name}`, def.accent);
    this.pushSystemChat(`${p.username} equipped ${def.slot}: ${def.name}.`);
    return { ok: true };
  }
  unequipArmament(playerId, slot) {
    const pr = this.players.get(playerId);
    if (!pr) return { ok: false, error: "Player not found in active room." };
    const p = pr.state;
    if (slot === "weapon") {
      if (!p.equippedWeapon) return { ok: true };
      const prev2 = getArmamentDef("weapon", p.equippedWeapon);
      p.equippedWeapon = null;
      p.attackComboStep = 0;
      pr.lastPrimaryAttackAtMs = -99999;
      this.clearEclipseCharge(pr);
      this.clearGaleburstForPlayer(p.id);
      this.clearPlayerTacticalState(pr, { removeOwnedZones: true });
      this.syncPlayerTacticalCooldownOnEquipmentChange(p);
      this.emitEvent("status", p.x, p.y - 26, "Weapon Unequipped", "#94A3B8");
      this.pushSystemChat(`${p.username} unequipped ${prev2 ? prev2.name : "Weapon"}.`);
      return { ok: true };
    }
    const defaultVestId = getDefaultVestmentIdForClass(p.heroClass);
    const prev = getArmamentDef("vestment", p.equippedVestment);
    p.equippedVestment = defaultVestId;
    this.resetPassiveState(pr);
    p.maxHp = _GameRoom.computePlayerMaxHp(
      p.heroClass,
      p.level,
      p.vitality,
      p.relics,
      defaultVestId
    );
    p.hp = Math.min(p.hp, p.maxHp);
    p.shield = Math.min(p.shield, this.getMaxShieldCap(p));
    const defaultDef = getArmamentDef("vestment", defaultVestId);
    this.emitEvent(
      "status",
      p.x,
      p.y - 26,
      defaultDef ? `Restored: ${defaultDef.name}` : "Default Vestment Restored",
      defaultDef?.accent || "#94A3B8"
    );
    this.pushSystemChat(
      `${p.username} restored default Vestment (${defaultDef ? defaultDef.name : defaultVestId})${prev && prev.id !== defaultVestId ? ` from ${prev.name}` : ""}.`
    );
    return { ok: true };
  }
  grantArmament(playerId, slot, itemId) {
    const pr = this.players.get(playerId);
    if (!pr) return { ok: false, error: "Player not found in active room." };
    const p = pr.state;
    const def = getArmamentDef(slot, itemId);
    if (!def) return { ok: false, error: "Unknown armament." };
    if (!p.ownedWeapons) p.ownedWeapons = [];
    if (!p.ownedVestments) p.ownedVestments = [];
    const list = slot === "weapon" ? p.ownedWeapons : p.ownedVestments;
    let added = false;
    if (!list.includes(itemId)) {
      list.push(itemId);
      added = true;
    }
    this.emitEvent("status", p.x, p.y - 28, `Armory + ${def.name}`, def.accent);
    this.pushSystemChat(`${p.username} obtained permanent ${slot}: ${def.name}.`);
    return { ok: true, added };
  }
  syncPlayerProgression(playerId, level, xp, attributePoints) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const clampedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
    p.level = clampedLevel;
    p.xp = clampedLevel >= MAX_LEVEL ? 0 : Math.max(0, Math.floor(xp) || 0);
    p.nextXp = _GameRoom.computeNextXp(clampedLevel);
    p.attributePoints = Math.max(0, Math.floor(attributePoints) || 0);
    const oldMax = p.maxHp;
    p.maxHp = _GameRoom.computePlayerMaxHp(
      p.heroClass,
      p.level,
      p.vitality,
      p.relics,
      p.equippedVestment
    );
    if (p.maxHp > oldMax) {
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMax));
    } else {
      p.hp = Math.min(p.maxHp, p.hp);
    }
  }
  addPing(playerId, label, x, y) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    this.emitEvent(
      "ping",
      x,
      y,
      `${pr.state.username}: ${label.slice(0, 24)}`,
      "#F4D378"
    );
  }
  hasUnclaimedChestLootForPlayer(prop, p) {
    if (prop.kind === "relic_chest") {
      const relicClaimed = Boolean(prop.claimedRelicPlayerIds?.includes(p.id));
      const storedScrolls = prop.scrollChoicesByPlayer?.[p.id];
      const scrollClaimed = Boolean(prop.claimedScrollPlayerIds?.includes(p.id));
      const hasUnclaimedScroll = Boolean(storedScrolls && storedScrolls.length > 0 && !scrollClaimed);
      return !relicClaimed || hasUnclaimedScroll;
    }
    if (prop.kind === "chest") {
      if (!prop.chestGoldClaimed) return true;
      const storedScrolls = prop.scrollChoicesByPlayer?.[p.id];
      const scrollClaimed = Boolean(prop.claimedScrollPlayerIds?.includes(p.id));
      return Boolean(p.heroClass === "arcanist" && storedScrolls && storedScrolls.length > 0 && !scrollClaimed);
    }
    return !prop.opened;
  }
  syncChestOpenedState(prop) {
    if (prop.kind !== "chest" && prop.kind !== "relic_chest") return;
    const anyInspecting = Array.from(this.players.values()).some(
      (ally) => ally.state.connected && ally.state.activeChestPropId === prop.id
    );
    if (anyInspecting) {
      prop.opened = true;
      return;
    }
    const connectedPlayers = Array.from(this.players.values()).filter((ally) => ally.state.connected);
    if (prop.kind === "chest") {
      const anyPendingScroll = connectedPlayers.some((ally) => {
        const sc = prop.scrollChoicesByPlayer?.[ally.state.id];
        return Boolean(
          ally.state.heroClass === "arcanist" && sc && sc.length > 0 && !prop.claimedScrollPlayerIds?.includes(ally.state.id)
        );
      });
      prop.opened = Boolean(prop.chestGoldClaimed) && !anyPendingScroll;
      return;
    }
    const anyUnclaimed = connectedPlayers.length > 0 ? connectedPlayers.some((ally) => this.hasUnclaimedChestLootForPlayer(prop, ally.state)) : !prop.claimedRelicPlayerIds || prop.claimedRelicPlayerIds.length === 0;
    prop.opened = !anyUnclaimed;
  }
  openChest(playerId, prop) {
    const pr = this.players.get(playerId);
    if (!pr || prop.kind !== "chest" && prop.kind !== "relic_chest") return false;
    const p = pr.state;
    if (p.activeChestPropId === prop.id) {
      this.closeChest(playerId);
      return true;
    }
    if (p.activeChestPropId) {
      this.closeChest(playerId);
    }
    if (prop.kind === "chest") {
      if (!prop.chestGoldClaimed) {
        prop.chestGoldClaimed = true;
        for (const ally of this.players.values()) {
          ally.state.gold += prop.value;
        }
        if (Math.random() < 0.45) {
          p.potions = Math.min(5, p.potions + 1);
          this.emitEvent("heal", prop.x, prop.y - 18, "+1 Potion", "#6EE7B7");
        }
        if (p.heroClass === "arcanist" && !p.equippedScrollId && Math.random() < 0.3) {
          if (!prop.scrollChoicesByPlayer) prop.scrollChoicesByPlayer = {};
          const rolled = this.rollScrollChoices(p.equippedScrollId);
          if (rolled.length > 0) {
            prop.scrollChoicesByPlayer[p.id] = rolled;
          }
        }
        this.emitEvent("gold", prop.x, prop.y - 8, `+${prop.value} Gold`, "#F4D378");
      }
      const storedScrolls = prop.scrollChoicesByPlayer?.[p.id];
      const scrollClaimed2 = Boolean(prop.claimedScrollPlayerIds?.includes(p.id));
      if (p.heroClass === "arcanist" && storedScrolls && storedScrolls.length > 0 && !scrollClaimed2) {
        p.pendingScrollChoices = [...storedScrolls];
        p.activeChestPropId = prop.id;
        prop.opened = true;
      } else {
        this.syncChestOpenedState(prop);
      }
      return true;
    }
    if (!prop.relicChoicesByPlayer) prop.relicChoicesByPlayer = {};
    if (!prop.scrollChoicesByPlayer) prop.scrollChoicesByPlayer = {};
    if (!prop.claimedRelicPlayerIds) prop.claimedRelicPlayerIds = [];
    if (!prop.claimedScrollPlayerIds) prop.claimedScrollPlayerIds = [];
    const relicClaimed = prop.claimedRelicPlayerIds.includes(p.id);
    if (!relicClaimed) {
      if (!prop.relicChoicesByPlayer[p.id] || prop.relicChoicesByPlayer[p.id].length === 0) {
        prop.relicChoicesByPlayer[p.id] = this.rollRelicChoices(p.relics);
      }
      p.pendingRelicChoices = [...prop.relicChoicesByPlayer[p.id]];
    } else {
      p.pendingRelicChoices = [];
    }
    const scrollClaimed = prop.claimedScrollPlayerIds.includes(p.id);
    if (p.heroClass === "arcanist" && !scrollClaimed) {
      if (!(p.id in prop.scrollChoicesByPlayer)) {
        if (!p.equippedScrollId || Math.random() < 0.45) {
          prop.scrollChoicesByPlayer[p.id] = this.rollScrollChoices(p.equippedScrollId);
        } else {
          prop.scrollChoicesByPlayer[p.id] = [];
        }
      }
      const savedScrolls = prop.scrollChoicesByPlayer[p.id];
      if (savedScrolls && savedScrolls.length > 0) {
        p.pendingScrollChoices = [...savedScrolls];
      }
    }
    const hasChoicesToShow = p.pendingRelicChoices.length > 0 || (p.pendingScrollChoices?.length ?? 0) > 0;
    if (hasChoicesToShow) {
      p.activeChestPropId = prop.id;
      prop.opened = true;
      if (!prop.chestGoldClaimed) {
        prop.chestGoldClaimed = true;
        this.emitEvent("status", prop.x, prop.y - 20, "Relic Vault Opened", "#E8CE76");
        this.pushSystemChat(`${p.username} opened an Ancient Relic Chest.`);
      }
      return true;
    }
    this.syncChestOpenedState(prop);
    return false;
  }
  closeChest(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const chestPropId = p.activeChestPropId;
    p.pendingRelicChoices = [];
    p.pendingScrollChoices = [];
    p.activeChestPropId = null;
    if (chestPropId) {
      const prop = this.props.find((x) => x.id === chestPropId);
      if (prop) {
        this.syncChestOpenedState(prop);
      }
    }
  }
  selectRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (!pr.state.pendingRelicChoices.includes(relicId)) return;
    if (!pr.state.storage) pr.state.storage = [];
    let placedInInventoryOrVault = false;
    if (!pr.state.relics.includes(relicId)) {
      if (pr.state.relics.length >= 5) {
        if (pr.state.storage.length < 12 && !pr.state.storage.includes(relicId)) {
          pr.state.storage.push(relicId);
          placedInInventoryOrVault = true;
          pr.state.pendingRelicChoices = [];
          const relic2 = RELIC_CATALOG.find((r) => r.id === relicId);
          const relicName = relic2 ? relic2.name : relicId;
          this.emitEvent("status", pr.state.x, pr.state.y - 24, `+ ${relicName} (Vault)`, relic2 ? relic2.accent : "#FCD34D");
          this.pushSystemChat(`${pr.state.username}'s active loadout is full. ${relicName} was placed in Storage Vault.`);
        } else {
          pr.state.pendingRelicChoices = [];
          this.emitEvent("status", pr.state.x, pr.state.y - 24, "Inventory Full (Max 5)", "#EF4444");
          this.pushSystemChat(`${pr.state.username} could not claim ${relicId}: Inventory and Vault are both full.`);
          if (pr.state.activeChestPropId && (!pr.state.pendingScrollChoices || pr.state.pendingScrollChoices.length === 0)) {
            const chest = this.props.find((x) => x.id === pr.state.activeChestPropId);
            pr.state.activeChestPropId = null;
            if (chest) this.syncChestOpenedState(chest);
          }
          return;
        }
      } else {
        pr.state.relics.push(relicId);
        placedInInventoryOrVault = true;
      }
    } else {
      placedInInventoryOrVault = true;
    }
    pr.state.pendingRelicChoices = [];
    if (placedInInventoryOrVault && pr.state.activeChestPropId) {
      const chest = this.props.find((x) => x.id === pr.state.activeChestPropId);
      if (chest) {
        if (!chest.claimedRelicPlayerIds) chest.claimedRelicPlayerIds = [];
        if (!chest.claimedRelicPlayerIds.includes(playerId)) {
          chest.claimedRelicPlayerIds.push(playerId);
        }
        if (chest.relicChoicesByPlayer) {
          delete chest.relicChoicesByPlayer[playerId];
        }
        if (!pr.state.pendingScrollChoices || pr.state.pendingScrollChoices.length === 0) {
          pr.state.activeChestPropId = null;
          this.syncChestOpenedState(chest);
        }
      } else {
        pr.state.activeChestPropId = null;
      }
    }
    if (relicId === "bastion_pauldron") {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + (pr.state.maxHp - oldMax));
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (relic && !pr.state.storage.includes(relicId)) {
      this.emitEvent("status", pr.state.x, pr.state.y - 24, `+ ${relic.name}`, relic.accent);
      this.pushSystemChat(`${pr.state.username} claimed relic: ${relic.name}.`);
    }
  }
  unequipRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (!pr.state.storage) pr.state.storage = [];
    const idx = pr.state.relics.indexOf(relicId);
    if (idx >= 0) {
      pr.state.relics.splice(idx, 1);
      let storedInVault = false;
      if (pr.state.storage.length < 12 && !pr.state.storage.includes(relicId)) {
        pr.state.storage.push(relicId);
        storedInVault = true;
      }
      if (relicId === "bastion_pauldron") {
        const oldMax = pr.state.maxHp;
        pr.state.maxHp = _GameRoom.computePlayerMaxHp(
          pr.state.heroClass,
          pr.state.level,
          pr.state.vitality,
          pr.state.relics,
          pr.state.equippedVestment
        );
        pr.state.hp = Math.min(pr.state.hp, pr.state.maxHp);
      }
      const relic = RELIC_CATALOG.find((r) => r.id === relicId);
      const relicName = relic ? relic.name : relicId;
      this.emitEvent("status", pr.state.x, pr.state.y - 24, storedInVault ? `Stored ${relicName}` : `- ${relicName}`, "#94A3B8");
      this.pushSystemChat(
        storedInVault ? `${pr.state.username} moved relic to Storage Vault: ${relicName}.` : `${pr.state.username} unequipped relic: ${relicName}.`
      );
    }
  }
  storeRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (!pr.state.storage) pr.state.storage = [];
    if (pr.state.storage.length >= 12) {
      this.emitEvent("status", pr.state.x, pr.state.y - 24, "Storage Vault Full (12/12)", "#EF4444");
      return false;
    }
    const idx = pr.state.relics.indexOf(relicId);
    if (idx < 0) return false;
    pr.state.relics.splice(idx, 1);
    pr.state.storage.push(relicId);
    if (relicId === "bastion_pauldron") {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.hp, pr.state.maxHp);
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    const relicName = relic ? relic.name : relicId;
    this.emitEvent("status", pr.state.x, pr.state.y - 24, `Stored ${relicName}`, "#38BDF8");
    this.pushSystemChat(`${pr.state.username} stored ${relicName} in Storage Vault.`);
    return true;
  }
  equipStoredRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (!pr.state.storage) pr.state.storage = [];
    if (pr.state.relics.length >= 5) {
      this.emitEvent("status", pr.state.x, pr.state.y - 24, "Equipped Slots Full (Max 5)", "#EF4444");
      return false;
    }
    const idx = pr.state.storage.indexOf(relicId);
    if (idx < 0) return false;
    pr.state.storage.splice(idx, 1);
    if (!pr.state.relics.includes(relicId)) {
      pr.state.relics.push(relicId);
    }
    if (relicId === "bastion_pauldron") {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + (pr.state.maxHp - oldMax));
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    const relicName = relic ? relic.name : relicId;
    this.emitEvent("status", pr.state.x, pr.state.y - 24, `Equipped ${relicName}`, relic ? relic.accent : "#FCD34D");
    this.pushSystemChat(`${pr.state.username} equipped ${relicName} from Storage Vault.`);
    return true;
  }
  deleteRelic(playerId, relicId, fromStorage) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (!pr.state.storage) pr.state.storage = [];
    let removed = false;
    let wasEquipped = false;
    if (fromStorage) {
      const idx = pr.state.storage.indexOf(relicId);
      if (idx >= 0) {
        pr.state.storage.splice(idx, 1);
        removed = true;
      }
    } else {
      const idx = pr.state.relics.indexOf(relicId);
      if (idx >= 0) {
        pr.state.relics.splice(idx, 1);
        removed = true;
        wasEquipped = true;
      } else {
        const sIdx = pr.state.storage.indexOf(relicId);
        if (sIdx >= 0) {
          pr.state.storage.splice(sIdx, 1);
          removed = true;
        }
      }
    }
    if (!removed) return false;
    if (wasEquipped && relicId === "bastion_pauldron") {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.hp, pr.state.maxHp);
    }
    const salvageGold = 40;
    pr.state.gold = (pr.state.gold || 0) + salvageGold;
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    const relicName = relic ? relic.name : relicId;
    this.emitEvent("status", pr.state.x, pr.state.y - 24, `+${salvageGold}g (Dismantled)`, "#E0A94F");
    this.pushSystemChat(`${pr.state.username} dismantled ${relicName} for ${salvageGold} gold.`);
    return true;
  }
  discardPotion(playerId, count = 1) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (pr.state.potions <= 0) return false;
    const discardAmount = Math.min(pr.state.potions, Math.max(1, count));
    pr.state.potions -= discardAmount;
    this.emitEvent("status", pr.state.x, pr.state.y - 24, `-${discardAmount} Potion`, "#94A3B8");
    this.pushSystemChat(`${pr.state.username} discarded ${discardAmount} health potion(s).`);
    return true;
  }
  togglePlayerGodMode(playerId, enabled) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== void 0 ? enabled : !pr.state.godMode;
    pr.state.godMode = nextState;
    if (nextState) {
      pr.state.hp = pr.state.maxHp;
    }
    this.emitEvent(
      "status",
      pr.state.x,
      pr.state.y - 28,
      nextState ? "GOD MODE ON" : "GOD MODE OFF",
      nextState ? "#F59E0B" : "#64748B"
    );
    return nextState;
  }
  togglePlayerSpeedBoost(playerId, enabled) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== void 0 ? enabled : !pr.state.speedBoost;
    pr.state.speedBoost = nextState;
    this.emitEvent(
      "status",
      pr.state.x,
      pr.state.y - 28,
      nextState ? " SPEED BOOST ON" : " SPEED NORMAL",
      nextState ? "#10B981" : "#64748B"
    );
    return nextState;
  }
  togglePlayerNoCooldown(playerId, enabled) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== void 0 ? enabled : !pr.state.noCooldownMode;
    pr.state.noCooldownMode = nextState;
    if (nextState) {
      pr.state.skillCooldownMs = 0;
      pr.state.ultCooldownMs = 0;
      pr.state.dashCooldownMs = 0;
      pr.attackCooldownMs = 0;
    }
    this.emitEvent(
      "status",
      pr.state.x,
      pr.state.y - 28,
      nextState ? "NO COOLDOWN ON" : "NO COOLDOWN OFF",
      nextState ? "#38BDF8" : "#64748B"
    );
    return nextState;
  }
  addPlayerGold(playerId, amount) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.gold += amount;
    this.emitEvent("gold", pr.state.x, pr.state.y - 22, `+${amount}g`, "#F4D378");
  }
  addPlayerPotions(playerId, amount) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.potions += amount;
    this.emitEvent("heal", pr.state.x, pr.state.y - 22, `+${amount} Potions`, "#EF4444");
  }
  setPlayerLevel(playerId, targetLevel) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const def = HERO_CLASSES[p.heroClass];
    p.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(targetLevel) || 1));
    p.xp = 0;
    p.nextXp = _GameRoom.computeNextXp(p.level);
    p.strength = 0;
    p.vitality = 0;
    p.dexterity = 0;
    p.intelligence = 0;
    p.faith = 0;
    p.attributePoints = (p.level - 1) * 3;
    p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
    p.hp = p.maxHp;
    this.emitEvent("status", p.x, p.y - 26, `Level ${p.level} Set!`, "#F4D378");
    if (this.onProgressionUpdateCallback) this.onProgressionUpdateCallback(p.id, p);
  }
  addPlayerRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (!relic) return;
    if (!p.relics.includes(relicId)) {
      p.relics.push(relicId);
    }
    if (relicId === "bastion_pauldron") {
      const oldMax = p.maxHp;
      p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMax));
    }
    this.emitEvent("status", p.x, p.y - 24, `+ ${relic.name}`, relic.accent);
  }
  addPlayerAttributePoints(playerId, amount) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.attributePoints += amount;
    this.emitEvent("status", pr.state.x, pr.state.y - 24, `+${amount} Attribute Pts`, "#D9AA52");
  }
  updatePlayerAttributes(playerId, strength, vitality, dexterity, intelligence, faith, attributePoints) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    p.strength = strength;
    p.vitality = vitality;
    p.dexterity = dexterity;
    p.intelligence = intelligence;
    p.faith = faith;
    p.attributePoints = attributePoints;
    const oldMax = p.maxHp;
    p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
    p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.maxHp, p.hp);
    if (this.onProgressionUpdateCallback) this.onProgressionUpdateCallback(p.id, p);
  }
  spawnDummyAtPlayer(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const dummy = {
      id: this.nextId("dummy"),
      x: pr.state.x + 40 * Math.cos(pr.state.aimAngle),
      y: pr.state.y + 40 * Math.sin(pr.state.aimAngle),
      hp: 1e4,
      maxHp: 1e4,
      hitAnimMs: 0,
      totalDamageTaken: 0,
      lastHitTimerMs: 0
    };
    this.trainingDummies.push(dummy);
    this.emitEvent("status", dummy.x, dummy.y - 20, "Training Dummy Spawned", "#FBBF24");
  }
  rollRelicChoices(owned) {
    const unowned = RELIC_CATALOG.filter((r) => !owned.includes(r.id));
    const unownedPool = [...unowned];
    const picked = [];
    while (picked.length < 3 && unownedPool.length > 0) {
      const idx = Math.floor(Math.random() * unownedPool.length);
      picked.push(unownedPool[idx].id);
      unownedPool.splice(idx, 1);
    }
    if (picked.length < 3) {
      const fallbackPool = RELIC_CATALOG.filter((r) => !picked.includes(r.id));
      while (picked.length < 3 && fallbackPool.length > 0) {
        const idx = Math.floor(Math.random() * fallbackPool.length);
        picked.push(fallbackPool[idx].id);
        fallbackPool.splice(idx, 1);
      }
    }
    return picked;
  }
  rollScrollChoices(equippedId) {
    const pool = ARCANIST_SCROLLS.filter((s) => s.id !== equippedId);
    const copy = [...pool];
    const picked = [];
    while (picked.length < 3 && copy.length > 0) {
      const idx = Math.floor(Math.random() * copy.length);
      picked.push(copy[idx].id);
      copy.splice(idx, 1);
    }
    return picked;
  }
  grantScrollChoices(playerId) {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.heroClass !== "arcanist") return false;
    if (pr.state.pendingScrollChoices && pr.state.pendingScrollChoices.length > 0) return false;
    const choices = this.rollScrollChoices(pr.state.equippedScrollId);
    if (choices.length === 0) return false;
    pr.state.pendingScrollChoices = choices;
    return true;
  }
  selectArcanistScroll(playerId, scrollId) {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.heroClass !== "arcanist") return;
    const p = pr.state;
    if (!p.pendingScrollChoices || !p.pendingScrollChoices.includes(scrollId)) return;
    const scrollDef = getArcanistScrollDef(scrollId);
    if (!scrollDef) return;
    p.pendingScrollChoices = [];
    if (p.disintegrationState?.active) {
      p.disintegrationState = null;
    }
    p.spellCastState = null;
    p.equippedScrollId = scrollId;
    if (p.activeChestPropId) {
      const chest = this.props.find((x) => x.id === p.activeChestPropId);
      if (chest) {
        if (!chest.claimedScrollPlayerIds) chest.claimedScrollPlayerIds = [];
        if (!chest.claimedScrollPlayerIds.includes(playerId)) {
          chest.claimedScrollPlayerIds.push(playerId);
        }
        if (chest.scrollChoicesByPlayer) {
          delete chest.scrollChoicesByPlayer[playerId];
        }
        if (p.pendingRelicChoices.length === 0) {
          p.activeChestPropId = null;
          this.syncChestOpenedState(chest);
        }
      } else {
        p.activeChestPropId = null;
      }
    }
    const cdrMult = this.getPlayerCdrMult(p);
    p.maxSkillCooldownMs = Math.round(scrollDef.cooldownMs * cdrMult);
    p.skillCooldownMs = Math.min(p.skillCooldownMs, p.maxSkillCooldownMs);
    this.emitEvent("status", p.x, p.y - 26, `Scroll: ${scrollDef.tacticalTitle}`, scrollDef.accentColor);
    this.pushSystemChat(`${p.username} inscribed ${scrollDef.scrollName}, replacing Astral Nova.`);
  }
  adminEquipScroll(playerId, scrollId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const scrollDef = getArcanistScrollDef(scrollId);
    if (!scrollDef) return;
    if (p.disintegrationState?.active) {
      p.disintegrationState = null;
    }
    p.spellCastState = null;
    p.equippedScrollId = scrollId;
    const cdrMult = this.getPlayerCdrMult(p);
    p.maxSkillCooldownMs = Math.round(scrollDef.cooldownMs * cdrMult);
    p.skillCooldownMs = 0;
    this.emitEvent("status", p.x, p.y - 26, `Admin Scroll: ${scrollDef.tacticalTitle}`, scrollDef.accentColor);
    this.pushSystemChat(`[ADMIN] ${p.username} equipped ${scrollDef.scrollName}.`);
  }
  getPlayerCdrMult(p) {
    return computePlayerCdrMult(p);
  }
  getArcanistSpellDamage(p, spellId) {
    const spec = ARCANIST_SPELLS[spellId];
    return computeArcanistSpellDamage(
      spec.baseDamage,
      {
        level: p.level,
        intelligence: p.intelligence,
        relics: p.relics,
        furyStacks: this.getBlessingStacks(p, "fury")
      },
      spec.intCoeff
    );
  }
  isPlayerCcInterrupted(p) {
    if (p.downed || !p.connected) return true;
    if ((p.stunnedMs || 0) > 0 || (p.frozenMs || 0) > 0 || (p.chronoSuspendedMs || 0) > 0) return true;
    return Boolean(
      p.statuses && p.statuses.some((s) => s.type === "silenced" || s.type === "charmed" || s.type === "impaled")
    );
  }
  triggerArcanistScrollTactical(p, scrollId, aimAngle, aimDistance) {
    if (p.heroClass !== "arcanist" || this.isPlayerCcInterrupted(p)) return false;
    const spec = ARCANIST_SPELLS[scrollId];
    if (!spec) return false;
    if (p.spellCastState || p.disintegrationState?.active) return false;
    if (p.skillCooldownMs > 0 && !p.noCooldownMode) return false;
    const cleanAngle = Number.isFinite(aimAngle) ? normalizeAngle(aimAngle) : p.aimAngle;
    p.aimAngle = cleanAngle;
    if (scrollId === "disintegration") {
      return this.startDisintegrationChannel(p.id, cleanAngle);
    }
    const maxRange = spec.maxRange ?? 280;
    const dist = typeof aimDistance === "number" && Number.isFinite(aimDistance) ? Math.max(0, Math.min(maxRange, aimDistance)) : Math.min(maxRange, 180);
    const targetX = p.x + Math.cos(cleanAngle) * dist;
    const targetY = p.y + Math.sin(cleanAngle) * dist;
    if (spec.castTimeMs > 0) {
      p.spellCastState = {
        spellId: scrollId,
        remainingMs: spec.castTimeMs,
        totalMs: spec.castTimeMs,
        aimAngle: cleanAngle,
        targetX,
        targetY
      };
      p.attackAnimMs = Math.max(p.attackAnimMs, spec.castTimeMs);
      return true;
    }
    return this.executeArcanistSpell(p, scrollId, cleanAngle, targetX, targetY);
  }
  executeArcanistSpell(p, spellId, aimAngle, targetX, targetY) {
    const spec = ARCANIST_SPELLS[spellId];
    const cdrMult = this.getPlayerCdrMult(p);
    const applyScrollCooldown = () => {
      p.skillCooldownMs = p.noCooldownMode ? 0 : Math.round(spec.cooldownMs * cdrMult);
      p.maxSkillCooldownMs = p.skillCooldownMs;
    };
    const voidMult = this.consumeVoidEnergyForTactical(p);
    const critChance = this.getPlayerCritChance(p);
    const rollSpellCrit = () => {
      const baseScaled = Math.round(this.getArcanistSpellDamage(p, spellId) * voidMult);
      const hasCrit = Math.random() < critChance;
      return {
        hasCrit,
        dmg: hasCrit ? Math.round(baseScaled * CRIT_DAMAGE_MULTIPLIER) : baseScaled
      };
    };
    if (spellId === "fireball") {
      applyScrollCooldown();
      p.attackAnimMs = 220;
      const speed = spec.projectileSpeed ?? 380;
      const range = spec.maxRange ?? 360;
      const { hasCrit, dmg } = rollSpellCrit();
      const spawned = this.spawnProjectile({
        ownerType: "player",
        ownerId: p.id,
        style: "fireball",
        spellId: "fireball",
        damageCategory: "fire",
        explosionRadius: spec.explosionRadius ?? 105,
        x: p.x + Math.cos(aimAngle) * 16,
        y: p.y + Math.sin(aimAngle) * 16,
        vx: Math.cos(aimAngle) * speed,
        vy: Math.sin(aimAngle) * speed,
        angle: aimAngle,
        radius: 14,
        damage: dmg,
        pierce: 1,
        crit: hasCrit,
        ttlMs: Math.round(range / speed * 1e3)
      });
      this.tacticalProjIds.add(spawned.id);
      return true;
    }
    if (spellId === "frost_lance") {
      applyScrollCooldown();
      p.attackAnimMs = 200;
      const speed = spec.projectileSpeed ?? 480;
      const range = spec.maxRange ?? 420;
      const { hasCrit, dmg } = rollSpellCrit();
      const spawned = this.spawnProjectile({
        ownerType: "player",
        ownerId: p.id,
        style: "frost_lance",
        spellId: "frost_lance",
        damageCategory: "frost",
        x: p.x + Math.cos(aimAngle) * 16,
        y: p.y + Math.sin(aimAngle) * 16,
        vx: Math.cos(aimAngle) * speed,
        vy: Math.sin(aimAngle) * speed,
        angle: aimAngle,
        radius: 8,
        damage: dmg,
        pierce: spec.pierce ?? 3,
        crit: hasCrit,
        ttlMs: Math.round(range / speed * 1e3)
      });
      this.tacticalProjIds.add(spawned.id);
      return true;
    }
    if (spellId === "chain_lightning") {
      const maxRange = spec.maxRange ?? 340;
      const halfAngle = spec.coneHalfAngleRad ?? 0.56;
      const hitTargets = [];
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRange + e.radius * 0.5) continue;
        const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - aimAngle));
        if (diff > halfAngle) continue;
        if (dist > 20 && !this.hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
        hitTargets.push({ kind: "enemy", id: e.id, x: e.x, y: e.y, dist, enemy: e });
      }
      for (const d of this.trainingDummies) {
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRange + 16) continue;
        const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - aimAngle));
        if (diff > halfAngle) continue;
        if (dist > 20 && !this.hasLineOfSight(p.x, p.y, d.x, d.y)) continue;
        hitTargets.push({ kind: "dummy", id: d.id, x: d.x, y: d.y, dist, dummy: d });
      }
      hitTargets.sort((a, b) => a.dist - b.dist);
      applyScrollCooldown();
      p.attackAnimMs = 210;
      const { hasCrit, dmg: coneDmg } = rollSpellCrit();
      const chainPoints = [{ x: p.x, y: p.y }];
      for (const tgt of hitTargets) {
        chainPoints.push({ x: tgt.x, y: tgt.y });
        if (tgt.kind === "enemy") {
          this.damageEnemy(tgt.enemy, coneDmg, p, hasCrit, "lightning");
        } else {
          this.damageDummy(tgt.dummy, coneDmg, p, hasCrit, false, "lightning");
        }
        this.onTacticalHitConfirmed(p);
      }
      this.zones.push({
        id: this.nextId("zone"),
        kind: "chain_lightning_arc",
        x: p.x,
        y: p.y,
        angle: aimAngle,
        radius: maxRange,
        coneHalfAngleRad: halfAngle,
        ttlMs: 360,
        maxTtlMs: 360,
        ownerId: p.id,
        chainPoints
      });
      return true;
    }
    if (spellId === "arcane_meteor") {
      applyScrollCooldown();
      p.attackAnimMs = 260;
      const delayMs = spec.impactDelayMs ?? 1e3;
      const radius = spec.explosionRadius ?? 125;
      const { dmg } = rollSpellCrit();
      this.zones.push({
        id: this.nextId("zone"),
        kind: "arcane_meteor",
        x: targetX,
        y: targetY,
        radius,
        ttlMs: delayMs,
        maxTtlMs: delayMs,
        ownerId: p.id,
        damage: dmg,
        chronoSuspendedMs: this.isPositionInChronoWell(targetX, targetY, 0)
      });
      this.emitEvent("status", targetX, targetY - 22, "Arcane Meteor!", "#E879F9");
      return true;
    }
    if (spellId === "arcane_orb") {
      applyScrollCooldown();
      p.attackAnimMs = 220;
      const speed = spec.projectileSpeed ?? 115;
      const durationMs = spec.durationMs ?? 4e3;
      const dmg = Math.round(this.getArcanistSpellDamage(p, "arcane_orb") * voidMult);
      const orb = this.spawnProjectile({
        ownerType: "player",
        ownerId: p.id,
        style: "arcane_orb",
        spellId: "arcane_orb",
        damageCategory: "arcane",
        x: p.x + Math.cos(aimAngle) * 18,
        y: p.y + Math.sin(aimAngle) * 18,
        vx: Math.cos(aimAngle) * speed,
        vy: Math.sin(aimAngle) * speed,
        angle: aimAngle,
        radius: 22,
        damage: dmg,
        pierce: 999,
        ttlMs: durationMs
      });
      this.arcaneOrbHits.set(orb.id, /* @__PURE__ */ new Map());
      this.tacticalProjIds.add(orb.id);
      return true;
    }
    if (spellId === "arcane_barrage") {
      applyScrollCooldown();
      p.attackAnimMs = 380;
      const totalWaves = spec.barrageWaves ?? 4;
      const waveIntervalMs = spec.barrageWaveIntervalMs ?? 95;
      const range = spec.maxRange ?? 450;
      const lockTarget = findBestAutoTarget({
        playerX: p.x,
        playerY: p.y,
        maxRange: range,
        preferredAngle: aimAngle,
        minDot: 0.72,
        map: this.map,
        props: this.props,
        enemies: this.enemies,
        trainingDummies: this.trainingDummies
      })?.target;
      this.fireArcaneBarrageWave(p, aimAngle, 0, lockTarget?.id, voidMult);
      const ownerPr = this.players.get(p.id);
      if (ownerPr && totalWaves > 1) {
        ownerPr.pendingBarrage = {
          wavesRemaining: totalWaves - 1,
          waveIndex: 1,
          timerMs: waveIntervalMs,
          waveIntervalMs,
          aimAngle,
          targetEnemyId: lockTarget?.id,
          empoweredMult: voidMult
        };
      }
      return true;
    }
    return false;
  }
  fireArcaneBarrageWave(p, aimAngle, waveIndex, targetEnemyId, empoweredMult = 1) {
    const spec = ARCANIST_SPELLS.arcane_barrage;
    const speed = spec.projectileSpeed ?? 420;
    const range = spec.maxRange ?? 450;
    const ttlMs = Math.round(range / speed * 1e3);
    const critChance = this.getPlayerCritChance(p);
    const baseScaled = Math.round(this.getArcanistSpellDamage(p, "arcane_barrage") * empoweredMult);
    let fireAngle = aimAngle;
    if (targetEnemyId) {
      const targetEntity = this.enemies.find((e) => e.id === targetEnemyId && e.hp > 0) || this.trainingDummies.find((d) => d.id === targetEnemyId);
      if (targetEntity) {
        fireAngle = Math.atan2(targetEntity.y - p.y, targetEntity.x - p.x);
      }
    }
    const ox = p.x + Math.cos(fireAngle) * 16;
    const oy = p.y + Math.sin(fireAngle) * 16;
    for (let b = 0; b < 2; b++) {
      const hasCrit = Math.random() < critChance;
      const dmg = hasCrit ? Math.round(baseScaled * CRIT_DAMAGE_MULTIPLIER) : baseScaled;
      const isFocusedBolt = b === 0;
      const boltAngle = isFocusedBolt ? fireAngle : fireAngle + (waveIndex % 2 === 0 ? 0.045 : -0.045);
      const helixSign = (waveIndex + b) % 2 === 0 ? 1 : -1;
      const helixPhase = isFocusedBolt ? 0 : waveIndex * Math.PI / 2;
      const spawned = this.spawnProjectile({
        ownerType: "player",
        ownerId: p.id,
        style: "arcane_barrage",
        spellId: "arcane_barrage",
        damageCategory: "arcane",
        targetEnemyId: isFocusedBolt ? targetEnemyId : void 0,
        x: ox,
        y: oy,
        originX: ox,
        originY: oy,
        elapsedMs: 0,
        helixSign,
        helixPhase: isFocusedBolt ? void 0 : helixPhase,
        vx: Math.cos(boltAngle) * speed,
        vy: Math.sin(boltAngle) * speed,
        angle: boltAngle,
        radius: 8,
        damage: dmg,
        pierce: 1,
        crit: hasCrit,
        ttlMs
      });
      this.tacticalProjIds.add(spawned.id);
    }
  }
  startDisintegrationChannel(playerId, aimAngle) {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== "playing") return false;
    const p = pr.state;
    if (p.heroClass !== "arcanist" || p.equippedScrollId !== "disintegration") return false;
    if (this.isPlayerCcInterrupted(p)) return false;
    if (p.skillCooldownMs > 0 || p.spellCastState) return false;
    if (p.disintegrationState?.active) return true;
    const spec = ARCANIST_SPELLS.disintegration;
    const cleanAngle = Number.isFinite(aimAngle) ? normalizeAngle(aimAngle) : p.aimAngle;
    const voidMult = this.consumeVoidEnergyForTactical(p);
    p.aimAngle = cleanAngle;
    p.spellCastState = null;
    p.vx = 0;
    p.vy = 0;
    p.disintegrationState = {
      active: true,
      angle: cleanAngle,
      targetAngle: cleanAngle,
      activationRemainingMs: spec.activationMs ?? 150,
      tickAccumMs: 0,
      startedAtMs: this.simTimeMs,
      empoweredByVoid: voidMult > 1
    };
    return true;
  }
  updateDisintegrationTarget(playerId, aimAngle) {
    const pr = this.players.get(playerId);
    if (!pr || !pr.state.disintegrationState?.active) return;
    if (!Number.isFinite(aimAngle)) return;
    const clean = normalizeAngle(aimAngle);
    pr.state.disintegrationState.targetAngle = clean;
    pr.state.aimAngle = clean;
  }
  stopDisintegrationChannel(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    if (!p.disintegrationState?.active) return;
    p.disintegrationState = null;
    const cdrMult = this.getPlayerCdrMult(p);
    p.skillCooldownMs = Math.round(ARCANIST_SPELLS.disintegration.cooldownMs * cdrMult);
    p.maxSkillCooldownMs = p.skillCooldownMs;
  }
  getDisintegrationEndpoint(x, y, angle, maxRange) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const step = 14;
    let dist = 0;
    while (dist + step <= maxRange) {
      const nx = x + cos * (dist + step);
      const ny = y + sin * (dist + step);
      if (this.isWallAtWorld(nx, ny)) {
        break;
      }
      dist += step;
    }
    const finalDist = Math.min(maxRange, dist);
    return {
      endX: x + cos * finalDist,
      endY: y + sin * finalDist
    };
  }
  stepDisintegrationChannel(p, dtMs, dtSec) {
    const ch = p.disintegrationState;
    if (!ch || !ch.active) return;
    if (this.isPlayerCcInterrupted(p)) {
      this.stopDisintegrationChannel(p.id);
      this.emitEvent("status", p.x, p.y - 24, "CHANNEL INTERRUPTED!", "#EF4444");
      return;
    }
    p.vx = 0;
    p.vy = 0;
    const spec = ARCANIST_SPELLS.disintegration;
    const maxRotPerSec = spec.maxRotationRadPerSec ?? Math.PI;
    ch.angle = rotateAngleToward(ch.angle, ch.targetAngle, maxRotPerSec * dtSec);
    p.aimAngle = ch.angle;
    p.attackAnimMs = 120;
    let remainingDt = dtMs;
    if (ch.activationRemainingMs > 0) {
      if (remainingDt < ch.activationRemainingMs) {
        ch.activationRemainingMs -= remainingDt;
        return;
      }
      remainingDt -= ch.activationRemainingMs;
      ch.activationRemainingMs = 0;
    }
    const tickInterval = spec.tickIntervalMs ?? 200;
    ch.tickAccumMs += remainingDt;
    if (ch.tickAccumMs < tickInterval) return;
    const beamHalfWidth = (spec.beamWidth ?? 42) / 2;
    const maxRange = spec.maxRange ?? 450;
    const { endX, endY } = this.getDisintegrationEndpoint(p.x, p.y, ch.angle, maxRange);
    const voidMult = ch.empoweredByVoid ? 1 + ARMAMENT_TUNING.passives.voidConsumption.empoweredTacticalBonusPct : 1;
    const tickDmg = Math.round(this.getArcanistSpellDamage(p, "disintegration") * voidMult);
    while (ch.tickAccumMs >= tickInterval) {
      ch.tickAccumMs -= tickInterval;
      const candidateEnemies = [...this.enemies];
      for (const enemy of candidateEnemies) {
        if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
        const d = distancePointToSegment(enemy.x, enemy.y, p.x, p.y, endX, endY);
        if (d <= beamHalfWidth + enemy.radius) {
          this.damageEnemy(enemy, tickDmg, p, false, "arcane");
          this.onTacticalHitConfirmed(p);
        }
      }
      for (const dummy of this.trainingDummies) {
        const d = distancePointToSegment(dummy.x, dummy.y, p.x, p.y, endX, endY);
        if (d <= beamHalfWidth + 18) {
          this.damageDummy(dummy, tickDmg, p, false, false, "arcane");
          this.onTacticalHitConfirmed(p);
        }
      }
    }
  }
  explodeFireball(proj) {
    const fbSpec = ARCANIST_SPELLS.fireball;
    const radius = proj.explosionRadius ?? fbSpec.explosionRadius ?? 105;
    const ownerPr = this.players.get(proj.ownerId);
    const attacker = ownerPr ? ownerPr.state : null;
    const targets = [...this.enemies];
    const isTacticalProj = this.tacticalProjIds.has(proj.id);
    for (const enemy of targets) {
      if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
      if (Math.hypot(enemy.x - proj.x, enemy.y - proj.y) <= radius + enemy.radius * 0.35) {
        const dealt = this.damageEnemy(enemy, proj.damage, attacker, Boolean(proj.crit), "fire");
        if (dealt > 0 && isTacticalProj) {
          this.onTacticalHitConfirmed(attacker);
        }
      }
    }
    for (const dummy of this.trainingDummies) {
      if (Math.hypot(dummy.x - proj.x, dummy.y - proj.y) <= radius + 18) {
        this.damageDummy(dummy, proj.damage, attacker, Boolean(proj.crit), false, "fire");
        if (isTacticalProj) {
          this.onTacticalHitConfirmed(attacker);
        }
      }
    }
    const burnRadius = fbSpec.burnRadius ?? Math.round(radius * 0.85);
    const burnDuration = fbSpec.durationMs ?? 3500;
    const baseSpellDmg = attacker ? this.getArcanistSpellDamage(attacker, "fireball") : proj.damage;
    const burnTickDmg = Math.max(4, Math.round(baseSpellDmg * (fbSpec.burnTickRatio ?? 0.22)));
    this.zones.push({
      id: this.nextId("zone"),
      kind: "fireball_burn",
      x: proj.x,
      y: proj.y,
      radius: burnRadius,
      ttlMs: burnDuration,
      maxTtlMs: burnDuration,
      ownerId: proj.ownerId,
      damage: burnTickDmg,
      chronoSuspendedMs: this.isPositionInChronoWell(proj.x, proj.y, 0)
    });
    this.emitEvent("status", proj.x, proj.y - 16, "FIREBALL BLAST!", "#F97316");
  }
  isPositionInChronoWell(x, y, radius = 0, excludeOwnerId) {
    let maxRemain = 0;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.kind !== "chrono_well" || z.ttlMs <= 0) continue;
      if (excludeOwnerId && z.ownerId === excludeOwnerId) continue;
      if (Math.hypot(x - z.x, y - z.y) <= z.radius + radius) {
        if (z.ttlMs > maxRemain) maxRemain = z.ttlMs;
      }
    }
    return maxRemain;
  }
  refreshChronoSuspensionState() {
    for (const pr of this.players.values()) {
      const p = pr.state;
      if (p.downed) {
        p.chronoSuspendedMs = 0;
      } else {
        p.chronoSuspendedMs = this.isPositionInChronoWell(p.x, p.y, 10, p.id);
      }
    }
    for (const enemy of this.enemies) {
      enemy.chronoSuspendedMs = this.isPositionInChronoWell(enemy.x, enemy.y, enemy.radius * 0.35);
    }
    for (const proj of this.projectiles) {
      proj.chronoSuspendedMs = this.isPositionInChronoWell(proj.x, proj.y, proj.radius);
    }
    for (const z of this.zones) {
      if (z.kind === "chrono_well" || z.kind === "chain_lightning_arc") {
        z.chronoSuspendedMs = 0;
        continue;
      }
      const isSupportZone = z.kind === "aegis_dome" || z.kind === "solar_beacon";
      const isOffensivePlayerZone = z.kind === "star_rift" || z.kind === "arcane_meteor" || z.kind === "fireball_burn";
      let susp = this.isPositionInChronoWell(
        z.x,
        z.y,
        0,
        isSupportZone ? z.ownerId : void 0
      );
      if (susp === 0 && !isSupportZone && !isOffensivePlayerZone) {
        const ownerEnemy = this.enemies.find((e) => e.id === z.ownerId);
        if (ownerEnemy && (ownerEnemy.chronoSuspendedMs || 0) > 0) {
          susp = ownerEnemy.chronoSuspendedMs || 0;
        }
      }
      z.chronoSuspendedMs = susp;
    }
  }
  cleanupChronoWellsForOwner(ownerId) {
    let removedAny = false;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i].kind === "chrono_well" && this.zones[i].ownerId === ownerId) {
        this.zones.splice(i, 1);
        removedAny = true;
      }
    }
    if (removedAny) {
      this.refreshChronoSuspensionState();
    }
  }
  performAction(playerId, action, aimAngle = 0, options) {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== "playing") return {};
    const p = pr.state;
    if (p.downed || (p.chronoSuspendedMs || 0) > 0) return {};
    p.aimAngle = Number.isFinite(aimAngle) ? aimAngle : p.aimAngle;
    const def = HERO_CLASSES[p.heroClass];
    const cdrMult = this.getPlayerCdrMult(p);
    const isSilenced = p.statuses && p.statuses.some((s) => s.type === "silenced");
    if (action === "dash") {
      if (p.dashCooldownMs > 0 && !p.noCooldownMode) return {};
      const trappedSingularity = this.getActiveSingularityAt(p.x, p.y, 10);
      if (trappedSingularity) {
        p.dashCooldownMs = p.noCooldownMode ? 0 : Math.round(1100 * cdrMult);
        p.maxDashCooldownMs = p.dashCooldownMs;
        const dx = trappedSingularity.x - p.x;
        const dy = trappedSingularity.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
          this.moveWithCollision(
            p,
            dx / dist * Math.min(dist - 4, 24),
            dy / dist * Math.min(dist - 4, 24),
            14
          );
        }
        this.emitEvent("status", p.x, p.y - 22, "GRAVITY LOCKED!", "#E879F9");
        return {};
      }
      p.dashCooldownMs = p.noCooldownMode ? 0 : Math.round(2600 * cdrMult);
      p.maxDashCooldownMs = p.dashCooldownMs;
      let dashAngle = p.aimAngle;
      if (!options?.explicitAim && Math.hypot(p.vx, p.vy) > 0.1) {
        dashAngle = Math.atan2(p.vy, p.vx);
      }
      const dashSpec = getAbilityTargetSpec(p.heroClass, "dash");
      const dashDist = typeof options?.aimDistance === "number" && Number.isFinite(options.aimDistance) ? Math.max(24, Math.min(dashSpec.range, options.aimDistance)) : dashSpec.defaultDist;
      this.moveWithCollision(
        p,
        Math.cos(dashAngle) * dashDist,
        Math.sin(dashAngle) * dashDist,
        14
      );
      p.hasteMs = Math.max(p.hasteMs || 0, 600);
      this.emitEvent("status", p.x, p.y - 22, "Dash!", "#F59E0B");
      return {};
    }
    if (action === "potion") {
      if (p.potions > 0 && p.hp < p.maxHp) {
        p.potions -= 1;
        const cursedMult = p.statuses && p.statuses.some((s) => s.type === "ashen_curse") ? 0.55 : 1;
        const healAmt = Math.max(1, Math.round(p.maxHp * 0.3 * cursedMult));
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        this.emitEvent("heal", p.x, p.y - 20, `+${healAmt}`, "#34D399");
      }
      return {};
    }
    if (action === "interact") {
      for (const npc of this.npcs) {
        const dist = Math.hypot(npc.x - p.x, npc.y - p.y);
        if (dist <= 110) {
          let lines = [];
          let options2;
          if (npc.id === "npc_bram") {
            lines = [
              `Welcome, ${p.username}! Warm yourself by the hearth.`,
              "Party coordination keeps heroes alive below.",
              "Lena just brewed fresh stew by the fire.",
              "Watch Floor 1\u2014Malakor's shield stun hurts.",
              "Smash every crate for hidden relics and gold.",
              "Cleric Solar Beacon can revive downed allies fast."
            ];
          } else if (npc.id === "npc_lena") {
            const classTip = p.heroClass === "vanguard" ? "Vanguard! Hold the front and shield boss slams." : p.heroClass === "ranger" ? "Ranger! Kite far and mark bosses with Quarry." : p.heroClass === "arcanist" ? "Arcanist! Drop Chrono Well in tight chokes." : "Cleric! Save Solar Beacon for heavy party damage.";
            lines = [
              `Hey ${p.username}! Honeyed mead or spiced cider?`,
              classTip,
              "F1 Highkeep: Warden Malakor guards with his shield.",
              "F2 Crypt: Archlich Vaelor casts freezing frost.",
              "F3 Cindervault: Ignis burns everything\u2014pack resistance.",
              "F4 Abyss: Malice spawns gravity black holes.",
              "F5 Spire: The Archon unleashes starlight novas.",
              "F6 Hymns: Elyndor weaves lethal sound lanes.",
              "F7 Reliquary: Zadkiel guards with ashen curses.",
              "F8 Chapel: Sariel silences unwary casters.",
              "F9 Nave: Seraphel rains divine lances.",
              "F10 Gate: Defeat Oriphiel to claim the Warden key.",
              "Warm up on the training dummies to the East!"
            ];
          } else if (npc.id === "npc_aleph") {
            lines = [
              "Your path shifts. Seek a new focus?",
              "Know your build, and steel obeys.",
              "Begin anew whenever you are ready."
            ];
            options2 = [
              { id: "reset_stats", label: "Reset Stats" },
              { id: "lore", label: "Who are you?" }
            ];
          } else {
            const combatTip = p.heroClass === "vanguard" ? "Vanguard: Bulwark Dash stuns elites for 1.7s." : p.heroClass === "ranger" ? "Ranger: Frost Volley slows packs by 50%." : p.heroClass === "arcanist" ? "Arcanist: Astral Nova clears surrounding swarms." : "Cleric: Sanctified Pulse heals allies and burns undead.";
            lines = [
              `Stay sharp, ${p.username}. Hesitation kills.`,
              combatTip,
              "Orange glow = heavy windup. Dodge clear!",
              "Pair Stormcaller Lodestone with Viper Crucible.",
              "Test your DPS on my dummies anytime."
            ];
          }
          const nextIdx = ((pr.npcSpeechIndices[npc.id] ?? -1) + 1) % lines.length;
          pr.npcSpeechIndices[npc.id] = nextIdx;
          const spoken = lines[nextIdx];
          const persistent = Boolean(options2 && options2.length > 0);
          const ttlMs = persistent ? 6e5 : 5200;
          p.npcDialogue = {
            npcId: npc.id,
            npcName: npc.name,
            x: npc.x,
            y: npc.y,
            text: spoken,
            ttlMs,
            maxTtlMs: ttlMs,
            persistent,
            seq: ++pr.dialogueSeq,
            ...options2 ? { options: options2 } : {}
          };
          return {};
        }
      }
      for (const dummy of this.trainingDummies) {
        const dist = Math.hypot(dummy.x - p.x, dummy.y - p.y);
        if (dist <= 72) {
          dummy.totalDamageTaken = 0;
          dummy.lastHitTimerMs = 0;
          this.emitEvent("status", dummy.x, dummy.y - 44, " Counter Reset", "#38BDF8");
          this.pushSystemChat(` ${p.username} reset the Training Dummy damage tracker.`);
          return {};
        }
      }
      for (const prop of this.props) {
        if (prop.kind === "warden_gate") {
          const dist2 = Math.hypot(prop.x - p.x, prop.y - p.y);
          if (dist2 <= 65) {
            p.npcDialogue = {
              npcId: prop.id,
              npcName: "Warden's Gate",
              x: prop.x,
              y: prop.y,
              text: "You are not worthy.",
              ttlMs: 3600,
              maxTtlMs: 3600,
              persistent: false,
              seq: ++pr.dialogueSeq
            };
            return {};
          }
        }
        const isToggleableChest = prop.kind === "chest" || prop.kind === "relic_chest";
        if (prop.opened && !isToggleableChest) continue;
        const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
        if (dist <= 62) {
          if (isToggleableChest && prop.opened && p.activeChestPropId !== prop.id && !this.hasUnclaimedChestLootForPlayer(prop, p)) {
            continue;
          }
          if (prop.locked && prop.roomId !== void 0) {
            const lockedRoom = this.map.rooms.find((r) => r.id === prop.roomId);
            const stillAlive = lockedRoom && !lockedRoom.cleared || this.enemies.some((e) => e.roomId === prop.roomId && e.hp > 0);
            if (stillAlive) {
              this.emitEvent("status", prop.x, prop.y - 24, "LOCKED \xB7 CLEAR ROOM!", "#EF4444");
              return {};
            }
            prop.locked = false;
          }
          if (isToggleableChest) {
            this.openChest(p.id, prop);
            return {};
          }
          prop.opened = true;
          if (prop.kind === "crate") {
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            if (Math.random() < 0.45) {
              p.potions = Math.min(5, p.potions + 1);
              this.emitEvent("heal", prop.x, prop.y - 18, "+1 Potion", "#6EE7B7");
            }
            this.emitEvent("gold", prop.x, prop.y - 8, `+${prop.value} Gold`, "#F4D378");
          } else if (prop.kind === "potion") {
            p.potions = Math.min(5, p.potions + 1);
            this.emitEvent("heal", prop.x, prop.y - 12, "+1 Potion", "#6EE7B7");
          } else if (prop.kind === "shrine") {
            for (const ally of this.players.values()) {
              if (ally.state.downed) {
                ally.state.downed = false;
                ally.state.hp = Math.round(ally.state.maxHp * 0.6);
              } else {
                ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + prop.value);
              }
              this.grantShield(ally.state, 25, "floor_to");
              this.emitEvent(
                "heal",
                ally.state.x,
                ally.state.y - 20,
                `+${prop.value} Shrine Blessing`,
                "#7CE8A6"
              );
            }
            this.pushSystemChat(`${p.username} invoked a Sanctuary Shrine, restoring the party.`);
          }
          return {};
        }
      }
      if (this.floor > 0 && this.roomId !== "TAVERN-HUB" && this.map.portalActive) {
        const portalDist = Math.hypot(
          this.map.portalPos.x - p.x,
          this.map.portalPos.y - p.y
        );
        if (portalDist <= 68) {
          p.readyNextFloor = true;
          const activePlayers = Array.from(this.players.values()).filter(
            (r) => r.state.connected && !r.state.downed
          );
          const readyPlayers = activePlayers.filter((r) => r.state.readyNextFloor);
          if (readyPlayers.length >= activePlayers.length) {
            if (this.onFloorClearedCallback) {
              this.onFloorClearedCallback(
                Array.from(this.players.keys()),
                this.floor
              );
            }
            if (this.floor >= MAX_FLOORS_FOR_VICTORY) {
              this.status = "victory";
              this.endedAt = Date.now();
              if (!this.runEndRecorded && this.roomId !== "TAVERN-HUB") {
                this.runEndRecorded = true;
                this.onRunEndedCallback?.(
                  Array.from(this.players.keys()),
                  "victory",
                  this.floor
                );
              }
              if (this.roomId !== "TAVERN-HUB" && !this.isPlayerConnected(this.hostId)) {
                this.transferHostToConnectedMember();
              }
              this.pushSystemChat(
                `Victory! The party conquered Floor ${this.floor} and reclaimed Beyond!`
              );
              return {};
            }
            this.loadFloor(this.floor + 1, this.players.size);
            this.pushSystemChat(
              `Descending to Floor ${this.floor}: ${this.map.biomeTitle}.`
            );
            return { floorChanged: this.map };
          } else {
            this.emitEvent(
              "status",
              this.map.portalPos.x,
              this.map.portalPos.y - 26,
              `Portal Ready (${readyPlayers.length}/${activePlayers.length})`,
              "#7CC6FE"
            );
          }
        }
      }
      return {};
    }
    if (action === "tactical") {
      if (isSilenced) {
        this.emitEvent("status", p.x, p.y - 24, "[SILENCED]", "#C084FC");
        return {};
      }
      if (p.skillCooldownMs > 0 && !p.noCooldownMode) return {};
      let resolvedTacticalDist = options?.aimDistance;
      const tacticalSpec = getAbilityTargetSpec(
        p.heroClass,
        "tactical",
        p.equippedScrollId,
        p.equippedWeapon
      );
      if (!options?.explicitAim) {
        const smart = resolveSkillSmartTarget({
          spec: tacticalSpec,
          playerX: p.x,
          playerY: p.y,
          fallbackAngle: p.aimAngle,
          fallbackDistance: options?.aimDistance,
          preferCursorCone: false,
          map: this.map,
          props: this.props,
          enemies: this.enemies,
          trainingDummies: this.trainingDummies
        });
        if (smart.target) {
          p.aimAngle = smart.aimAngle;
          if (resolvedTacticalDist === void 0) {
            resolvedTacticalDist = smart.aimDistance;
          }
        }
      }
      if (p.heroClass === "arcanist" && p.equippedScrollId) {
        const scrollActivated = this.triggerArcanistScrollTactical(
          p,
          p.equippedScrollId,
          p.aimAngle,
          resolvedTacticalDist
        );
        if (scrollActivated && p.relics.includes("oathbound_censer")) {
          for (const ally of this.players.values()) {
            if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 180) {
              const censerCurseMult = ally.state.statuses && ally.state.statuses.some((s) => s.type === "ashen_curse") ? 0.55 : 1;
              const censerHeal = Math.max(1, Math.round(8 * censerCurseMult));
              ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + censerHeal);
            }
          }
        }
        return {};
      }
      const activeTactical = resolveActiveTacticalDef(
        p.heroClass,
        p.equippedWeapon,
        p.equippedScrollId
      );
      p.skillCooldownMs = p.noCooldownMode ? 0 : Math.round(activeTactical.cooldownMs * cdrMult);
      p.maxSkillCooldownMs = p.skillCooldownMs;
      p.attackAnimMs = 240;
      if (p.relics.includes("oathbound_censer")) {
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 180) {
            const censerCurseMult = ally.state.statuses && ally.state.statuses.some((s) => s.type === "ashen_curse") ? 0.55 : 1;
            const censerHeal = Math.max(1, Math.round(8 * censerCurseMult));
            ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + censerHeal);
          }
        }
      }
      if (activeTactical.id === "bastion_counter") {
        const sfCfg = ARMAMENT_TUNING.weapons.sunforged;
        const bPr = this.players.get(p.id);
        p.bastionCounterMs = sfCfg.bastionBraceMs;
        p.bastionCounterMaxMs = sfCfg.bastionBraceMs;
        if (bPr) {
          bPr.bastionBlockedHits = 0;
          bPr.bastionAimAngle = p.aimAngle;
        }
        this.emitEvent("status", p.x, p.y - 26, "BASTION BRACE!", "#FBBF24");
      } else if (activeTactical.id === "crimson_frenzy") {
        const crCfg = ARMAMENT_TUNING.weapons.crimson;
        p.crimsonFrenzyMs = crCfg.frenzyDurationMs;
        p.crimsonFrenzyMaxMs = crCfg.frenzyDurationMs;
        this.emitEvent("status", p.x, p.y - 26, "CRIMSON FRENZY!", "#EF4444");
      } else if (activeTactical.id === "cyclone_break") {
        const gwCfg = ARMAMENT_TUNING.weapons.galewind;
        const dmgMult = this.computeDamageMult(p, "physical");
        const arrowDmg = Math.max(1, Math.round(gwCfg.cycloneArrowBaseDamage * dmgMult));
        const speed = gwCfg.cycloneArrowSpeedPx;
        const ttlMs = Math.round(gwCfg.cycloneArrowRangePx / speed * 1e3);
        const spawned = this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "cyclone_arrow",
          damageCategory: "physical",
          x: p.x + Math.cos(p.aimAngle) * 16,
          y: p.y + Math.sin(p.aimAngle) * 16,
          vx: Math.cos(p.aimAngle) * speed,
          vy: Math.sin(p.aimAngle) * speed,
          angle: p.aimAngle,
          radius: gwCfg.cycloneArrowRadiusPx,
          damage: arrowDmg,
          pierce: 99,
          ttlMs,
          weaponId: p.equippedWeapon ?? void 0
        });
        this.tacticalProjIds.add(spawned.id);
        this.cycloneArrowStates.set(spawned.id, {
          carryMsRemaining: null,
          draggedEnemyIds: /* @__PURE__ */ new Set()
        });
        this.emitEvent("status", p.x, p.y - 24, "CYCLONE ARROW!", "#38BDF8");
      } else if (activeTactical.id === "black_sun") {
        const ecCfg = ARMAMENT_TUNING.weapons.eclipse;
        const targetPos = computeGroundTargetPosition(
          p.x,
          p.y,
          p.aimAngle,
          resolvedTacticalDist,
          tacticalSpec
        );
        const zoneId = this.nextId("zone");
        this.zones.push({
          id: zoneId,
          kind: "black_sun_zone",
          x: targetPos.x,
          y: targetPos.y,
          radius: ecCfg.blackSunRadiusPx,
          angle: Math.atan2(targetPos.y - p.y, targetPos.x - p.x),
          ttlMs: ecCfg.blackSunZoneDurationMs,
          maxTtlMs: ecCfg.blackSunZoneDurationMs,
          ownerId: p.id
        });
        this.weaponZoneTickAccum.set(zoneId, ecCfg.blackSunTickIntervalMs);
        this.emitEvent("status", targetPos.x, targetPos.y - 24, "BLACK SUN!", "#A855F7");
      } else if (activeTactical.id === "seraphic_judgment") {
        const serCfg = ARMAMENT_TUNING.weapons.seraphim;
        const targetPos = computeGroundTargetPosition(
          p.x,
          p.y,
          p.aimAngle,
          resolvedTacticalDist,
          tacticalSpec
        );
        const dmgMult = this.computeDamageMult(p, "divine");
        const critChance = this.getPlayerCritChance(p);
        const hasCrit = Math.random() < critChance;
        const critMult = hasCrit ? CRIT_DAMAGE_MULTIPLIER : 1;
        const burstDmg = Math.max(1, Math.round(serCfg.tacticalBaseDamage * dmgMult * critMult));
        const burstRadius = serCfg.tacticalRadiusPx;
        this.zones.push({
          id: this.nextId("zone"),
          kind: "seraphim_holy_burst",
          x: targetPos.x,
          y: targetPos.y,
          radius: burstRadius,
          ttlMs: serCfg.holyBurstZoneTtlMs,
          maxTtlMs: serCfg.holyBurstZoneTtlMs,
          ownerId: p.id
        });
        const burstTargets = [...this.enemies];
        for (const enemy of burstTargets) {
          if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
          if (Math.hypot(enemy.x - targetPos.x, enemy.y - targetPos.y) <= burstRadius + enemy.radius * 0.35) {
            this.damageEnemy(enemy, burstDmg, p, hasCrit, "divine");
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - targetPos.x, dummy.y - targetPos.y) <= burstRadius + 18) {
            this.damageDummy(dummy, burstDmg, p, hasCrit, false, "divine");
          }
        }
        this.emitEvent("status", targetPos.x, targetPos.y - 24, "SERAPHIC JUDGMENT!", "#FDE047");
      } else if (p.heroClass === "vanguard") {
        const dmgMult = this.computeDamageMult(p, "physical");
        const trappedSingularity = this.getActiveSingularityAt(p.x, p.y, 10);
        const dashDist = trappedSingularity ? 0 : 92;
        if (dashDist > 0) {
          this.moveWithCollision(
            p,
            Math.cos(p.aimAngle) * dashDist,
            Math.sin(p.aimAngle) * dashDist,
            12
          );
        } else {
          this.emitEvent("status", p.x, p.y - 24, "GRAVITY LOCKED!", "#E879F9");
        }
        this.zones.push({
          id: this.nextId("zone"),
          kind: "bulwark_dash_shockwave",
          x: p.x,
          y: p.y,
          radius: 84,
          width: 170,
          angle: p.aimAngle,
          ttlMs: 320,
          maxTtlMs: 320,
          ownerId: p.id
        });
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 170) {
            const shieldGained = this.grantShield(ally.state, 28, "add");
            if (shieldGained > 0) {
              this.emitEvent("status", ally.state.x, ally.state.y - 22, "+28 Shield", "#93C5FD");
            } else if (isShieldGainLocked(ally.state)) {
              this.emitEvent("status", ally.state.x, ally.state.y - 22, "SHIELD LOCKED", "#EF4444");
            }
          }
        }
        const bashTargets = [...this.enemies];
        for (const enemy of bashTargets) {
          if (enemy && enemy.hp > 0 && this.enemies.includes(enemy) && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 84) {
            this.applyHardCc(enemy, "stun", 1700);
            this.damageEnemy(enemy, Math.round(32 * dmgMult), p, false, "physical");
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 84) {
            this.damageDummy(dummy, Math.round(32 * dmgMult), p, false, false, "physical");
          }
        }
      } else if (p.heroClass === "ranger") {
        const dmgMult = this.computeDamageMult(p, "physical");
        const baseDmg = Math.round(18 * dmgMult);
        this.zones.push({
          id: this.nextId("zone"),
          kind: "frost_volley_cone",
          x: p.x,
          y: p.y,
          radius: 190,
          angle: p.aimAngle,
          coneHalfAngleRad: 0.34,
          ttlMs: 240,
          maxTtlMs: 240,
          ownerId: p.id
        });
        for (let i = -2; i <= 2; i++) {
          const ang = p.aimAngle + i * 0.14;
          this.spawnProjectile({
            ownerType: "player",
            ownerId: p.id,
            style: "arrow",
            damageCategory: "physical",
            x: p.x + Math.cos(ang) * 16,
            y: p.y + Math.sin(ang) * 16,
            vx: Math.cos(ang) * 430,
            vy: Math.sin(ang) * 430,
            angle: ang,
            radius: 5,
            damage: baseDmg,
            pierce: 2,
            slowOnHit: true,
            ttlMs: 460
          });
        }
      } else if (p.heroClass === "arcanist") {
        const voidMult = this.consumeVoidEnergyForTactical(p);
        const dmgMult = this.computeDamageMult(p, "arcane");
        const baseDmg = Math.round(24 * dmgMult * voidMult);
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4;
          const spawned = this.spawnProjectile({
            ownerType: "player",
            ownerId: p.id,
            style: "arcane",
            damageCategory: "arcane",
            x: p.x + Math.cos(ang) * 14,
            y: p.y + Math.sin(ang) * 14,
            vx: Math.cos(ang) * 340,
            vy: Math.sin(ang) * 340,
            angle: ang,
            radius: 7,
            damage: baseDmg,
            pierce: 2,
            ttlMs: 450
          });
          this.tacticalProjIds.add(spawned.id);
        }
      } else if (p.heroClass === "cleric") {
        const dmgMult = this.computeDamageMult(p, "divine");
        const baseHeal = 24;
        this.zones.push({
          id: this.nextId("zone"),
          kind: "sanctified_pulse_wave",
          x: p.x,
          y: p.y,
          radius: 210,
          width: 135,
          ttlMs: 380,
          maxTtlMs: 380,
          ownerId: p.id
        });
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 210) {
            const heal = _GameRoom.computeHealingAmount(baseHeal, p, ally.state);
            this.applyEffectiveHealing(p, ally.state, heal, "tactical");
          }
        }
        const smiteTargets = [...this.enemies];
        for (const enemy of smiteTargets) {
          if (enemy && enemy.hp > 0 && this.enemies.includes(enemy) && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 135) {
            this.damageEnemy(enemy, Math.round(28 * dmgMult), p, false, "divine");
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 135) {
            this.damageDummy(dummy, Math.round(28 * dmgMult), p, false, false, "divine");
          }
        }
      }
      return {};
    }
    if (action === "ult") {
      if (isSilenced) {
        this.emitEvent("status", p.x, p.y - 24, "[SILENCED]", "#C084FC");
        return {};
      }
      if (p.ultCooldownMs > 0 && !p.noCooldownMode) return {};
      let resolvedUltDist = options?.aimDistance;
      if (!options?.explicitAim) {
        const ultSpec = getAbilityTargetSpec(p.heroClass, "ult");
        const smart = resolveSkillSmartTarget({
          spec: ultSpec,
          playerX: p.x,
          playerY: p.y,
          fallbackAngle: p.aimAngle,
          fallbackDistance: options?.aimDistance,
          preferCursorCone: false,
          map: this.map,
          props: this.props,
          enemies: this.enemies,
          trainingDummies: this.trainingDummies
        });
        if (smart.target) {
          p.aimAngle = smart.aimAngle;
          if (resolvedUltDist === void 0) {
            resolvedUltDist = smart.aimDistance;
          }
        }
      }
      p.ultCooldownMs = p.noCooldownMode ? 0 : Math.round(def.ultCooldownMs * cdrMult);
      p.maxUltCooldownMs = p.ultCooldownMs;
      p.attackAnimMs = 280;
      if (p.heroClass === "vanguard") {
        this.zones.push({
          id: this.nextId("zone"),
          kind: "aegis_dome",
          x: p.x,
          y: p.y,
          radius: 105,
          ttlMs: 5500,
          maxTtlMs: 5500,
          ownerId: p.id
        });
        this.emitEvent("status", p.x, p.y - 26, "Aegis Ward Active", "#93C5FD");
      } else if (p.heroClass === "ranger") {
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 340) {
            enemy.markedMs = 6500;
          }
        }
        for (const ally of this.players.values()) {
          ally.state.hasteMs = 5e3;
        }
        this.emitEvent("status", p.x, p.y - 26, "Hunter Quarry Marked", "#FBBF24");
      } else if (p.heroClass === "arcanist") {
        const ultSpec = getAbilityTargetSpec("arcanist", "ult");
        const targetPos = computeGroundTargetPosition(
          p.x,
          p.y,
          p.aimAngle,
          resolvedUltDist,
          ultSpec
        );
        this.zones.push({
          id: this.nextId("zone"),
          kind: "chrono_well",
          x: targetPos.x,
          y: targetPos.y,
          radius: 115,
          ttlMs: 3e3,
          maxTtlMs: 3e3,
          ownerId: p.id
        });
        this.refreshChronoSuspensionState();
        this.emitEvent("status", targetPos.x, targetPos.y - 20, "Chrono Well", "#7CC6FE");
      } else if (p.heroClass === "cleric") {
        const ultSpec = getAbilityTargetSpec("cleric", "ult");
        const targetPos = computeGroundTargetPosition(
          p.x,
          p.y,
          p.aimAngle,
          resolvedUltDist,
          ultSpec
        );
        this.zones.push({
          id: this.nextId("zone"),
          kind: "solar_beacon",
          x: targetPos.x,
          y: targetPos.y,
          radius: 115,
          ttlMs: 5e3,
          maxTtlMs: 5e3,
          ownerId: p.id
        });
        this.emitEvent("status", targetPos.x, targetPos.y - 26, "Solar Beacon", "#FDE68A");
      }
      return {};
    }
    return {};
  }
  computeDamageMult(p, category = "physical", options) {
    return computePlayerDamageMultiplier(p, category, options);
  }
  tick(dtMs) {
    if (this.status !== "playing" || this.players.size === 0) return;
    this.simTimeMs += dtMs;
    const dtSec = dtMs / 1e3;
    this.zoneTickAccumMs += dtMs;
    const pulseZonesNow = this.zoneTickAccumMs >= 500;
    if (pulseZonesNow) {
      this.zoneTickAccumMs = 0;
      if (this.zoneHitPlayers.size > 0) {
        for (const zid of this.zoneHitPlayers.keys()) {
          if (!this.zones.some((z) => z.id === zid)) {
            this.zoneHitPlayers.delete(zid);
          }
        }
      }
    }
    this.statusDotAccumMs += dtMs;
    const pulseDotNow = this.statusDotAccumMs >= 650;
    if (pulseDotNow) this.statusDotAccumMs = 0;
    for (const npc of this.npcs) {
      if (npc.speakingMs && npc.speakingMs > 0) {
        npc.speakingMs = Math.max(0, npc.speakingMs - dtMs);
      }
    }
    for (const pr of this.players.values()) {
      const dlg = pr.state.npcDialogue;
      if (!dlg) continue;
      if (!pr.state.connected || Math.hypot(dlg.x - pr.state.x, dlg.y - pr.state.y) > 250) {
        pr.state.npcDialogue = null;
        continue;
      }
      if (!dlg.persistent) {
        dlg.ttlMs = Math.max(0, dlg.ttlMs - dtMs);
        if (dlg.ttlMs <= 0) {
          pr.state.npcDialogue = null;
        }
      }
    }
    for (const dummy of this.trainingDummies) {
      if (dummy.hitAnimMs > 0) {
        dummy.hitAnimMs = Math.max(0, dummy.hitAnimMs - dtMs);
      }
      if (dummy.hp < dummy.maxHp) {
        dummy.hp = Math.min(dummy.maxHp, dummy.hp + Math.round(500 * dtSec));
      }
      if (dummy.lastHitTimerMs && dummy.lastHitTimerMs > 0) {
        dummy.lastHitTimerMs = Math.max(0, dummy.lastHitTimerMs - dtMs);
        if (dummy.lastHitTimerMs === 0 && dummy.totalDamageTaken && dummy.totalDamageTaken > 0) {
          dummy.totalDamageTaken = 0;
          this.emitEvent("status", dummy.x, dummy.y - 44, " Counter Reset", "#94A3B8");
        }
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.kind !== "chrono_well") continue;
      const owner = this.players.get(z.ownerId);
      z.ttlMs -= dtMs;
      if (z.ttlMs <= 0 || !owner || !owner.state.connected) {
        this.zones.splice(i, 1);
      }
    }
    this.refreshChronoSuspensionState();
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.kind === "chrono_well") {
        continue;
      }
      if ((z.chronoSuspendedMs || 0) > 0) {
        continue;
      }
      z.ttlMs -= dtMs;
      if (z.kind === "chain_lightning_arc" || z.kind === "bulwark_dash_shockwave" || z.kind === "frost_volley_cone" || z.kind === "sanctified_pulse_wave") {
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
        }
        continue;
      }
      if (z.kind === "arcane_meteor" && z.ttlMs <= 0) {
        const ownerPr = this.players.get(z.ownerId);
        const attacker = ownerPr ? ownerPr.state : null;
        const meteorDmg = z.damage ?? 75;
        const meteorRadSq = z.radius * z.radius;
        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          if (eIdx >= this.enemies.length) continue;
          const enemy = this.enemies[eIdx];
          if (enemy && enemy.hp > 0) {
            const dx = enemy.x - z.x;
            const dy = enemy.y - z.y;
            if (dx * dx + dy * dy <= meteorRadSq) {
              const dealt = this.damageEnemy(enemy, meteorDmg, attacker, false, "arcane");
              if (dealt > 0) this.onTacticalHitConfirmed(attacker);
            }
          }
        }
        for (const dummy of this.trainingDummies) {
          const dx = dummy.x - z.x;
          const dy = dummy.y - z.y;
          if (dx * dx + dy * dy <= meteorRadSq) {
            this.damageDummy(dummy, meteorDmg, attacker, false, false, "arcane");
            this.onTacticalHitConfirmed(attacker);
          }
        }
        this.emitEvent("status", z.x, z.y - 20, "METEOR IMPACT!", "#E879F9");
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "fireball_burn") {
        if (pulseZonesNow) {
          const ownerPr = this.players.get(z.ownerId);
          const attacker = ownerPr ? ownerPr.state : null;
          const burnDmg = z.damage ?? 9;
          for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
            if (eIdx >= this.enemies.length) continue;
            const enemy = this.enemies[eIdx];
            if (enemy && enemy.hp > 0) {
              const dx = enemy.x - z.x;
              const dy = enemy.y - z.y;
              const hitR = z.radius + enemy.radius * 0.35;
              if (dx * dx + dy * dy <= hitR * hitR) {
                this.damageEnemy(enemy, burnDmg, attacker, false, "fire");
              }
            }
          }
          const dummyHitR = z.radius + 18;
          const dummyHitRSq = dummyHitR * dummyHitR;
          for (const dummy of this.trainingDummies) {
            const dx = dummy.x - z.x;
            const dy = dummy.y - z.y;
            if (dx * dx + dy * dy <= dummyHitRSq) {
              this.damageDummy(dummy, burnDmg, attacker, false, false, "fire");
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
        }
        continue;
      }
      if (z.kind === "sound_lane" && z.ttlMs <= 0) {
        const w = z.width || 320;
        const h = z.height || 40;
        const ang = z.angle || 0;
        const cosA = Math.cos(-ang);
        const sinA = Math.sin(-ang);
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
              this.damagePlayer(pr.state, 26 + this.floor * 4, "divine");
              this.emitEvent("status", pr.state.x, pr.state.y - 14, " RESONANT WAVE!", "#F59E0B");
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "lament_mark" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, "divine");
            this.applyPlayerStatus(pr.state, "charmed", 3e3);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "ashen_cloud") {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            pr.state.hasteMs = Math.min(pr.state.hasteMs, 0);
            this.applyPlayerStatus(pr.state, "ashen_curse", 1500);
            if (pulseZonesNow) {
              this.damagePlayer(pr.state, 12 + this.floor * 2, "elemental");
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
      }
      if (z.kind === "censer_sweep" && z.ttlMs <= 0) {
        const ang = z.angle || 0;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (dist <= z.radius) {
              const pAng = Math.atan2(pr.state.y - z.y, pr.state.x - z.x);
              let diff = pAng - ang;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              if (Math.abs(diff) <= Math.PI * 3 / 4) {
                this.damagePlayer(pr.state, 34 + this.floor * 4, "physical");
                this.emitEvent("status", pr.state.x, pr.state.y - 14, " CENSER SWEEP!", "#F59E0B");
              }
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "scripture_line" && z.ttlMs <= 0) {
        const w = z.width || 400;
        const h = z.height || 24;
        const ang = z.angle || 0;
        const cosA = Math.cos(-ang);
        const sinA = Math.sin(-ang);
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
              this.damagePlayer(pr.state, 30 + this.floor * 4, "arcane");
              this.emitEvent("status", pr.state.x, pr.state.y - 14, " SCRIPTURE BINDING!", "#E879F9");
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "silence_seal" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, "arcane");
            this.applyPlayerStatus(pr.state, "silenced", 4500);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "lance_thrust" && z.ttlMs <= 0) {
        const w = z.width || 360;
        const h = z.height || 40;
        const ang = z.angle || 0;
        const cosA = Math.cos(-ang);
        const sinA = Math.sin(-ang);
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            if (localX >= 0 && localX <= w && Math.abs(localY) <= h / 2) {
              this.damagePlayer(pr.state, 36 + this.floor * 4, "divine");
              this.applyPlayerStatus(pr.state, "impaled", 4e3);
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "lancefall_mark" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 32 + this.floor * 4, "divine");
            this.applyPlayerStatus(pr.state, "impaled", 4e3);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "warden_edict" && z.ttlMs <= 0) {
        const q = z.quadrant ?? 0;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= z.radius) {
              let pAng = Math.atan2(dy, dx);
              if (pAng < 0) pAng += Math.PI * 2;
              const pQuad = Math.floor(pAng / (Math.PI / 2)) % 4;
              if (pQuad === q) {
                this.damagePlayer(pr.state, 40 + this.floor * 5, "physical");
                this.applyPlayerStatus(pr.state, "condemned", 5e3);
              }
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "warden_parry") {
        const owner = this.enemies.find((e) => e.id === z.ownerId && e.hp > 0);
        if (!owner || owner.stunnedMs > 0 || owner.frozenMs > 0 || z.ttlMs <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
        z.x = owner.x;
        z.y = owner.y;
      }
      if (z.kind === "verdict_combo" && z.ttlMs <= 0) {
        const stage = z.stage || 1;
        const dmg = 30 + stage * 6 + this.floor * 4;
        for (const pr of this.players.values()) {
          if (pr.state.downed) continue;
          if (Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, dmg, "physical");
            this.applyPlayerStatus(pr.state, "condemned", 4500);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "frost_nova" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 24 + this.floor * 4, "elemental");
            this.applyPlayerStatus(pr.state, "frostbite", 4500);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "magma_pillar" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, "elemental");
            this.applyPlayerStatus(pr.state, "scorched", 5e3);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "singularity") {
        const maxCaptureR = z.radius + 85;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = z.x - pr.state.x;
            const dy = z.y - pr.state.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 6 && dist <= maxCaptureR) {
              let pullSpd;
              if (dist <= z.radius) {
                pullSpd = 380 + 180 * (1 - dist / Math.max(1, z.radius));
              } else {
                const outerT = 1 - (dist - z.radius) / 85;
                pullSpd = 215 + 165 * outerT;
              }
              const stepDist = Math.min(Math.max(0, dist - 4), pullSpd * dtSec);
              this.moveWithCollision(
                pr.state,
                dx / dist * stepDist,
                dy / dist * stepDist,
                9
              );
            }
          }
        }
        if (z.ttlMs <= 0) {
          for (const pr of this.players.values()) {
            if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
              this.damagePlayer(pr.state, 32 + this.floor * 4, "elemental");
              this.applyPlayerStatus(pr.state, "voidmarked", 4e3);
            }
          }
          this.zones.splice(i, 1);
          continue;
        }
      }
      if (z.kind === "supernova") {
        const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
        const currentRadius = z.radius * progress;
        let hitSet = this.zoneHitPlayers.get(z.id);
        if (!hitSet) {
          hitSet = /* @__PURE__ */ new Set();
          this.zoneHitPlayers.set(z.id, hitSet);
        }
        for (const pr of this.players.values()) {
          if (!pr.state.downed && !hitSet.has(pr.state.id)) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (Math.abs(dist - currentRadius) <= 18) {
              hitSet.add(pr.state.id);
              this.damagePlayer(pr.state, 26 + this.floor * 4, "elemental");
              this.applyPlayerStatus(pr.state, "disoriented", 3e3);
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zoneHitPlayers.delete(z.id);
          this.zones.splice(i, 1);
          continue;
        }
      }
      if (z.kind === "warden_shatter" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 36 + this.floor * 4, "physical");
            this.emitEvent("status", pr.state.x, pr.state.y - 14, " BASTION SHATTER!", "#FBBF24");
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "starlight_beam" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 30 + this.floor * 4, "elemental");
            this.emitEvent("status", pr.state.x, pr.state.y - 14, " STARBEAM!", "#38BDF8");
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "boss_slam" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 30 + this.floor * 6, "physical");
            if (this.floor === 1) {
              this.applyPlayerStatus(pr.state, "guard_broken", 4e3);
            } else {
              this.applyStatusEffect(pr.state, "stun", 1200);
            }
          }
        }
        const isEmber = this.map.biome === "ember" || this.floor === 3;
        const isCatacombs = this.map.biome === "catacombs" || this.floor === 2;
        const isVoid = this.map.biome === "void" || this.floor === 4;
        const isAstral = this.map.biome === "astral" || this.floor === 5;
        const slamStyle = isEmber ? "fireball" : isVoid ? "voidorb" : isAstral ? "arcane" : isCatacombs ? "voidorb" : "bone";
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: z.ownerId,
            style: slamStyle,
            x: z.x,
            y: z.y,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            angle: a,
            radius: 7,
            damage: 16 + this.floor * 3,
            pierce: 1,
            ttlMs: 1400
          });
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "cyclone_break") {
        const gwCfg = ARMAMENT_TUNING.weapons.galewind;
        const ownerPr = this.players.get(z.ownerId);
        const ownerState = ownerPr?.state ?? null;
        if (!ownerState || resolveActiveTacticalDef(
          ownerState.heroClass,
          ownerState.equippedWeapon,
          ownerState.equippedScrollId
        ).id !== "cyclone_break") {
          this.weaponZoneTickAccum.delete(z.id);
          this.zones.splice(i, 1);
          continue;
        }
        const pullPerSec = gwCfg.cyclonePullSpeedPxPerSec;
        const captureR = z.radius + 45;
        for (const enemy of this.enemies) {
          if (!enemy || enemy.hp <= 0 || enemy.kind === "boss") continue;
          const dx = z.x - enemy.x;
          const dy = z.y - enemy.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 6 && dist <= captureR) {
            this.applySoftCc(enemy, 300);
            const radialFactor = 0.85 + 0.35 * (dist / captureR);
            const stepDist = Math.min(dist - 4, pullPerSec * radialFactor * dtSec);
            const nx = dx / dist;
            const ny = dy / dist;
            const swirlRatio = dist > 16 ? 0.24 : 0;
            const moveX = (nx - ny * swirlRatio) * stepDist;
            const moveY = (ny + nx * swirlRatio) * stepDist;
            moveWithCollision(
              this.map,
              this.props,
              enemy,
              moveX,
              moveY,
              enemy.radius
            );
          }
        }
        const accum = (this.weaponZoneTickAccum.get(z.id) || 0) + dtMs;
        if (accum >= gwCfg.cycloneTickIntervalMs) {
          this.weaponZoneTickAccum.set(z.id, accum - gwCfg.cycloneTickIntervalMs);
          const dmgMult = this.computeDamageMult(ownerState, "physical");
          const tickDmg = Math.max(1, Math.round(gwCfg.cycloneTickBaseDamage * dmgMult));
          const detDmg = Math.max(1, Math.round(gwCfg.cycloneDetonationBaseDamage * dmgMult));
          const enemiesSnap = [...this.enemies];
          for (const enemy of enemiesSnap) {
            if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
            if (Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius + enemy.radius * 0.35) {
              this.applySoftCc(enemy, 700);
              this.damageEnemy(enemy, tickDmg, ownerState, false, "physical", false);
              if (enemy.hp > 0 && this.enemies.includes(enemy)) {
                const meta = this.enemyMeta.get(enemy.id);
                const ownerMarks = meta?.galeburstByOwner?.get(z.ownerId) || 0;
                const totalMarks = enemy.galeburstMarks || 0;
                if (ownerMarks > 0 || totalMarks > 0) {
                  if (meta?.galeburstByOwner) {
                    if (ownerMarks > 0) {
                      meta.galeburstByOwner.set(z.ownerId, 0);
                    } else {
                      meta.galeburstByOwner.clear();
                    }
                    this.syncEnemyGaleburstMarks(enemy, meta);
                  }
                  enemy.galeburstMarks = 0;
                  this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, "CYCLONE DETONATION!", "#6EE7B7");
                  this.triggerGaleburstExplosion(
                    ownerState,
                    enemy.x,
                    enemy.y,
                    detDmg,
                    gwCfg.aoeRadiusPx,
                    1
                  );
                }
              }
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius + 18) {
              this.damageDummy(dummy, tickDmg, ownerState, false, false, "physical");
              const dStacks = ownerPr?.dummyGaleburstStacks.get(dummy.id) || 0;
              if (dStacks > 0 && ownerPr) {
                ownerPr.dummyGaleburstStacks.set(dummy.id, 0);
                this.emitEvent("status", dummy.x, dummy.y - 36, "CYCLONE DETONATION!", "#6EE7B7");
                this.triggerGaleburstExplosion(
                  ownerState,
                  dummy.x,
                  dummy.y,
                  detDmg,
                  gwCfg.aoeRadiusPx,
                  1
                );
              }
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.weaponZoneTickAccum.delete(z.id);
          this.zones.splice(i, 1);
          continue;
        }
      }
      if (z.kind === "black_sun_zone") {
        const ecCfg = ARMAMENT_TUNING.weapons.eclipse;
        const ownerPr = this.players.get(z.ownerId);
        const ownerState = ownerPr?.state ?? null;
        if (!ownerState || resolveActiveTacticalDef(
          ownerState.heroClass,
          ownerState.equippedWeapon,
          ownerState.equippedScrollId
        ).id !== "black_sun") {
          this.weaponZoneTickAccum.delete(z.id);
          this.zones.splice(i, 1);
          continue;
        }
        const accum = (this.weaponZoneTickAccum.get(z.id) || 0) + dtMs;
        if (accum >= ecCfg.blackSunTickIntervalMs && z.ttlMs > 0) {
          this.weaponZoneTickAccum.set(z.id, accum - ecCfg.blackSunTickIntervalMs);
          const dmgMult = this.computeDamageMult(ownerState, "arcane");
          const tickDmg = Math.max(1, Math.round(ecCfg.blackSunTickBaseDamage * dmgMult));
          const enemiesSnap = [...this.enemies];
          for (const enemy of enemiesSnap) {
            if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
            if (Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius + enemy.radius * 0.35) {
              this.applySoftCc(enemy, 700);
              this.damageEnemy(enemy, tickDmg, ownerState, false, "arcane", false);
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius + 18) {
              this.damageDummy(dummy, tickDmg, ownerState, false, false, "arcane");
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.weaponZoneTickAccum.delete(z.id);
          this.zones.splice(i, 1);
          const dmgMult = this.computeDamageMult(ownerState, "arcane");
          const weaponMods = resolveEquippedWeaponForClass(
            ownerState.heroClass,
            ownerState.equippedWeapon
          )?.modifiers;
          const critChance = this.getPlayerCritChance(ownerState, weaponMods);
          const hasCrit = Math.random() < critChance;
          const critMult = hasCrit ? computePlayerCritMultiplier(ownerState, weaponMods) : 1;
          const strikeDmg = Math.max(
            1,
            Math.round(ecCfg.blackSunStrikeBaseDamage * dmgMult * critMult)
          );
          this.zones.push({
            id: this.nextId("zone"),
            kind: "black_sun_burst",
            x: z.x,
            y: z.y,
            radius: z.radius,
            angle: z.angle,
            ttlMs: ecCfg.blackSunBurstZoneTtlMs,
            maxTtlMs: ecCfg.blackSunBurstZoneTtlMs,
            ownerId: z.ownerId
          });
          const enemiesSnap = [...this.enemies];
          for (const enemy of enemiesSnap) {
            if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
            if (Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius + enemy.radius * 0.35) {
              this.damageEnemy(enemy, strikeDmg, ownerState, hasCrit, "arcane", false);
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius + 18) {
              this.damageDummy(dummy, strikeDmg, ownerState, hasCrit, false, "arcane");
            }
          }
          this.emitEvent("status", z.x, z.y - 26, "CELESTIAL STRIKE!", "#FBBF24");
          continue;
        }
      }
      if (z.ttlMs <= 0) {
        this.weaponZoneTickAccum.delete(z.id);
        this.zones.splice(i, 1);
        continue;
      }
      if (pulseZonesNow) {
        if (z.kind === "solar_beacon") {
          const ownerPr = this.players.get(z.ownerId);
          const ownerState = ownerPr ? ownerPr.state : null;
          for (const pr of this.players.values()) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (dist <= z.radius) {
              if (pr.state.downed) {
                pr.state.reviveProgress = Math.min(1, pr.state.reviveProgress + 0.38);
                if (pr.state.reviveProgress >= 1) {
                  this.completeRevive(pr.state, z.ownerId);
                }
              } else if (pr.state.hp < pr.state.maxHp) {
                const beaconHeal = this.computeHealingAmount(4, ownerState, pr.state);
                this.applyEffectiveHealing(ownerState, pr.state, beaconHeal, "ult");
              }
            }
          }
        } else if (z.kind === "star_rift") {
          const ownerPr = this.players.get(z.ownerId);
          const starRiftBonus = ownerPr ? resolveEquippedWeaponForClass(ownerPr.state.heroClass, ownerPr.state.equippedWeapon)?.modifiers.starRiftBonusDamagePct || 0 : 0;
          const riftDmg = Math.round((14 + this.floor * 2) * (1 + starRiftBonus));
          for (const enemy of this.enemies) {
            if (enemy.hp > 0 && Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius) {
              const pullAngle = Math.atan2(z.y - enemy.y, z.x - enemy.x);
              enemy.x += Math.cos(pullAngle) * 5;
              enemy.y += Math.sin(pullAngle) * 5;
              this.damageEnemy(enemy, riftDmg, ownerPr ? ownerPr.state : null, false, "arcane");
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius) {
              this.damageDummy(dummy, riftDmg, ownerPr ? ownerPr.state : null, false, false, "arcane");
            }
          }
        }
      }
    }
    for (const pr of this.players.values()) {
      if ((pr.state.chronoSuspendedMs || 0) > 0) continue;
      this.updatePlayerStatuses(pr.state, dtMs, pulseDotNow);
    }
    this.clericAuraAccumMs += dtMs;
    if (this.clericAuraAccumMs >= 2e3) {
      this.clericAuraAccumMs = 0;
      for (const pr of this.players.values()) {
        const cleric = pr.state;
        if (this.getActivePassive(cleric) === "radiant_aura" && !cleric.downed && cleric.connected) {
          let anyMissingHp = false;
          const targetsInRange = [];
          for (const allyPr of this.players.values()) {
            const ally = allyPr.state;
            if (!ally.downed && ally.connected && Math.hypot(ally.x - cleric.x, ally.y - cleric.y) <= 140) {
              targetsInRange.push(ally);
              if (ally.hp < ally.maxHp) {
                anyMissingHp = true;
              }
            }
          }
          if (anyMissingHp) {
            this.emitEvent("cleric_pulse", cleric.x, cleric.y, "Radiant Aura", "#22C55E");
            for (const ally of targetsInRange) {
              if (ally.hp < ally.maxHp) {
                const baseHeal = ally.hp < ally.maxHp * 0.5 ? 3 : 2;
                const healAmt = this.computeHealingAmount(baseHeal, cleric, ally);
                this.applyEffectiveHealing(cleric, ally, healAmt, "aura");
              }
            }
          }
        }
      }
      this.triggerSharedGraceTick();
    }
    if (this.clericAuraAccumMs === 0) {
      for (const pr of this.players.values()) {
        const p = pr.state;
        if (!p.downed && p.connected && p.hp < p.maxHp) {
          const regenAmt = computePlayerHpRegenPerTick(p.heroClass, p.vitality, p.equippedVestment);
          if (regenAmt > 0) {
            p.hp = Math.min(p.maxHp, p.hp + regenAmt);
          }
        }
      }
    }
    for (const pr of this.players.values()) {
      const p = pr.state;
      if ((p.chronoSuspendedMs || 0) > 0) {
        if (p.disintegrationState?.active) {
          this.stopDisintegrationChannel(p.id);
          this.emitEvent("status", p.x, p.y - 24, "TIME SUSPENDED!", "#38BDF8");
        }
        p.spellCastState = null;
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      if (p.noCooldownMode) {
        pr.attackCooldownMs = 0;
        p.skillCooldownMs = 0;
        p.ultCooldownMs = 0;
        p.dashCooldownMs = 0;
      } else {
        pr.attackCooldownMs = Math.max(0, pr.attackCooldownMs - dtMs);
        p.skillCooldownMs = Math.max(0, p.skillCooldownMs - dtMs);
        p.ultCooldownMs = Math.max(0, p.ultCooldownMs - dtMs);
        p.dashCooldownMs = Math.max(0, p.dashCooldownMs - dtMs);
      }
      if (p.starRiftCooldownMs && p.starRiftCooldownMs > 0) {
        p.starRiftCooldownMs = Math.max(0, p.starRiftCooldownMs - dtMs);
      }
      p.attackAnimMs = Math.max(0, p.attackAnimMs - dtMs);
      p.hasteMs = Math.max(0, p.hasteMs - dtMs);
      if (p.downed) {
        if (p.disintegrationState?.active) {
          this.stopDisintegrationChannel(p.id);
        }
        p.spellCastState = null;
        pr.pendingBarrage = null;
        this.clearEclipseCharge(pr);
        this.clearPlayerTacticalState(pr, { removeOwnedZones: false });
        p.vx = 0;
        p.vy = 0;
        p.downedTimerMs = Math.max(0, p.downedTimerMs - dtMs);
        let reviver = null;
        for (const ally of this.players.values()) {
          if (ally.state.id !== p.id && !ally.state.downed && ally.state.connected && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 56) {
            reviver = ally.state;
            break;
          }
        }
        if (reviver) {
          const reviverPassive = this.getActivePassive(reviver);
          const vestmentReviveBonus = resolveEquippedVestmentForClass(reviver.heroClass, reviver.equippedVestment)?.modifiers.reviveSpeedBonus || 0;
          const reviveSpeedMult = (reviverPassive === "radiant_aura" ? 1.4 : 1) + vestmentReviveBonus;
          p.reviveProgress = Math.min(1, p.reviveProgress + dtSec / 2.2 * reviveSpeedMult);
          if (p.reviveProgress >= 1) {
            this.completeRevive(p, reviver.id);
          }
        } else {
          p.reviveProgress = Math.max(0, p.reviveProgress - dtSec * 0.25);
        }
        continue;
      }
      if (p.bastionCounterMs && p.bastionCounterMs > 0) {
        p.bastionCounterMs = Math.max(0, p.bastionCounterMs - dtMs);
        if (p.bastionCounterMs === 0) {
          this.triggerBastionCounterCleave(pr);
        }
      }
      if (p.crimsonFrenzyMs && p.crimsonFrenzyMs > 0) {
        p.crimsonFrenzyMs = Math.max(0, p.crimsonFrenzyMs - dtMs);
        if (p.crimsonFrenzyMs === 0) {
          p.crimsonFrenzyMaxMs = 0;
        }
      }
      const activePassive = this.getActivePassive(p);
      if (activePassive === "heat" && (p.vanguardHeat || 0) > 0 && this.simTimeMs - pr.heatLastHitAtMs >= ARMAMENT_TUNING.passives.heat.resetGraceMs) {
        p.vanguardHeat = 0;
      }
      if (activePassive === "predators_instinct" && (p.predatorStacks || 0) > 0) {
        const targetAlive = Boolean(p.predatorTargetId) && (this.enemies.some((e) => e.id === p.predatorTargetId && e.hp > 0) || this.trainingDummies.some((d) => d.id === p.predatorTargetId));
        if (!targetAlive || this.simTimeMs - pr.predatorLastHitAtMs >= ARMAMENT_TUNING.passives.predatorsInstinct.inactivityResetMs) {
          p.predatorTargetId = null;
          p.predatorStacks = 0;
        }
      }
      if (pr.pendingBarrage) {
        if (p.heroClass !== "arcanist" || p.equippedScrollId !== "arcane_barrage") {
          pr.pendingBarrage = null;
        } else {
          pr.pendingBarrage.timerMs -= dtMs;
          while (pr.pendingBarrage && pr.pendingBarrage.timerMs <= 0 && pr.pendingBarrage.wavesRemaining > 0) {
            const b = pr.pendingBarrage;
            this.fireArcaneBarrageWave(p, b.aimAngle, b.waveIndex, b.targetEnemyId, b.empoweredMult);
            b.wavesRemaining -= 1;
            b.waveIndex += 1;
            if (b.wavesRemaining <= 0) {
              pr.pendingBarrage = null;
            } else {
              b.timerMs += b.waveIntervalMs;
            }
          }
        }
      }
      if (p.spellCastState) {
        if (this.isPlayerCcInterrupted(p)) {
          p.spellCastState = null;
        } else {
          p.spellCastState.remainingMs = Math.max(0, p.spellCastState.remainingMs - dtMs);
          if (p.spellCastState.remainingMs <= 0) {
            const cast = p.spellCastState;
            p.spellCastState = null;
            this.executeArcanistSpell(p, cast.spellId, cast.aimAngle, cast.targetX, cast.targetY);
          }
        }
      }
      if (p.disintegrationState?.active) {
        this.stepDisintegrationChannel(p, dtMs, dtSec);
      }
      const def = HERO_CLASSES[p.heroClass];
      const moveSpeed = computePlayerMoveSpeed(p);
      const isDisoriented = p.statuses.some((s) => s.type === "disoriented");
      const { mx, my } = normalizePlayerInputDirection(pr.input, isDisoriented, Date.now());
      const charmed = p.statuses.find((s) => s.type === "charmed");
      let charmVx = 0;
      let charmVy = 0;
      if (charmed) {
        const boss = this.enemies.find((e) => e.kind === "boss");
        if (boss) {
          const dx = boss.x - p.x;
          const dy = boss.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 20) {
            charmVx = dx / dist * moveSpeed * 0.75;
            charmVy = dy / dist * moveSpeed * 0.75;
          }
        }
      }
      const prevX = p.x;
      const prevY = p.y;
      if (p.disintegrationState?.active) {
        p.vx = 0;
        p.vy = 0;
      } else {
        if (mx !== 0 || my !== 0) {
          p.vx = mx * moveSpeed + charmVx;
          p.vy = my * moveSpeed + charmVy;
        } else {
          p.vx = charmVx;
          p.vy = charmVy;
        }
        const activeSing = this.getActiveSingularityAt(p.x, p.y, 12);
        if (activeSing) {
          const toCenterX = activeSing.x - p.x;
          const toCenterY = activeSing.y - p.y;
          const sDist = Math.hypot(toCenterX, toCenterY);
          if (sDist > 1) {
            const outNx = -toCenterX / sDist;
            const outNy = -toCenterY / sDist;
            const outDot = p.vx * outNx + p.vy * outNy;
            if (outDot > 0) {
              p.vx -= outNx * outDot * 0.78;
              p.vy -= outNy * outDot * 0.78;
            }
          }
        }
        if (p.vx !== 0 || p.vy !== 0) {
          this.moveWithCollision(p, p.vx * dtSec, p.vy * dtSec, 9);
        }
      }
      if (activePassive === "momentum") {
        const mCfg = ARMAMENT_TUNING.passives.momentum;
        const movedDist = Math.hypot(p.x - prevX, p.y - prevY);
        const actualSpeed = dtSec > 0 ? movedDist / dtSec : 0;
        if (actualSpeed >= mCfg.minMoveSpeedPx && !p.disintegrationState?.active) {
          pr.momentumHoldMs = Math.min(mCfg.buildDurationMs, pr.momentumHoldMs + dtMs);
          p.rangerMomentum = Math.min(
            mCfg.cap,
            Math.round(pr.momentumHoldMs / mCfg.buildDurationMs * mCfg.cap)
          );
        } else if (mCfg.resetOnStop) {
          pr.momentumHoldMs = 0;
          p.rangerMomentum = 0;
        }
      }
      const room = this.findRoomContaining(p.x, p.y);
      if (room) {
        room.discovered = true;
        if (!pr.enteredRooms.has(room.id)) {
          pr.enteredRooms.add(room.id);
          if (!room.cleared && p.relics.includes("runic_carapace")) {
            this.grantShield(p, 22, "floor_to");
          }
        }
        if (room.cleared) {
          for (const prp of this.props) {
            if (prp.roomId === room.id && prp.kind === "totem" && prp.locked) {
              prp.locked = false;
              this.emitEvent("status", prp.x, prp.y - 22, "TOTEM AWAKENED!", "#38BDF8");
              this.pushSystemChat(`Ancient Guardian Totem awakened in Chamber ${room.id}! Approach to claim your blessing.`);
            }
          }
        }
      }
      for (const prop of this.props) {
        if (prop.opened) continue;
        if (prop.kind === "totem" && !prop.locked) {
          const dx = prop.x - p.x;
          const dy = prop.y - p.y;
          if (dx * dx + dy * dy <= 3136) {
            prop.opened = true;
            const blessingOrder = ["fury", "swiftness", "bastion", "swiftness", "fury"];
            const blessing = blessingOrder[((prop.roomId || 1) + this.floor + (prop.value || 1)) % blessingOrder.length];
            const blessingMeta = FLOOR_BLESSINGS[blessing];
            for (const ally of this.players.values()) {
              const st = ally.state;
              if (!st.floorBlessings) st.floorBlessings = [];
              st.floorBlessings.push(blessing);
              if (blessing === "bastion") {
                this.grantShield(st, 25, "add");
              }
              if (!st.downed) {
                st.hp = Math.min(st.maxHp, st.hp + 20);
              }
              this.emitEvent("status", st.x, st.y - 34, `TOTEM: ${blessingMeta.name}!`, blessingMeta.color);
            }
            this.emitEvent("status", prop.x, prop.y - 28, `${blessingMeta.name} CLAIMED!`, blessingMeta.color);
            this.pushSystemChat(`Ancient Guardian Totem claimed! Entire party received ${blessingMeta.name} blessing.`);
          }
        } else if (prop.kind === "coin") {
          const dx = prop.x - p.x;
          const dy = prop.y - p.y;
          if (dx * dx + dy * dy <= 1156) {
            prop.opened = true;
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            this.emitEvent("gold", prop.x, prop.y - 10, `+${prop.value}g`, "#F4D378");
          }
        }
      }
      const activeWeaponDef = resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
      const isEclipseBow = Boolean(activeWeaponDef?.modifiers.chargeToFire);
      const isHardCc = (p.stunnedMs || 0) > 0 || (p.frozenMs || 0) > 0;
      const canActAttack = p.pendingRelicChoices.length === 0 && (!p.pendingScrollChoices || p.pendingScrollChoices.length === 0) && !p.disintegrationState?.active && !p.spellCastState && !isHardCc;
      if (!canActAttack) {
        if (pr.eclipseHoldActive || pr.pendingEclipseReleaseMs !== null || (p.eclipseChargeRatio || 0) > 0) {
          this.clearEclipseCharge(pr);
        }
      } else if (isEclipseBow) {
        if (pr.input.attack && !pr.eclipseHoldActive && pr.pendingEclipseReleaseMs === null && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
          pr.eclipseHoldActive = true;
          pr.eclipseHoldStartMs = this.simTimeMs;
        }
        if (pr.eclipseHoldActive) {
          if (!pr.input.attack && pr.pendingEclipseReleaseMs === null) {
            pr.pendingEclipseReleaseMs = Math.max(0, this.simTimeMs - pr.eclipseHoldStartMs);
            pr.eclipseHoldActive = false;
            pr.eclipseHoldStartMs = 0;
          } else {
            const heldMs = Math.max(0, this.simTimeMs - pr.eclipseHoldStartMs);
            p.eclipseChargeRatio = Math.max(
              0,
              Math.min(1, heldMs / ARMAMENT_TUNING.weapons.eclipse.maxChargeMs)
            );
          }
        }
        if (pr.pendingEclipseReleaseMs !== null && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
          const releaseHoldMs = pr.pendingEclipseReleaseMs;
          this.clearEclipseCharge(pr);
          pr.attackCooldownMs = p.noCooldownMode ? 0 : computePlayerAttackCooldownMs(p, activeWeaponDef);
          p.attackAnimMs = 190;
          this.fireEclipseChargedShot(p, releaseHoldMs);
        }
      } else {
        if (pr.eclipseHoldActive || pr.pendingEclipseReleaseMs !== null || (p.eclipseChargeRatio || 0) > 0) {
          this.clearEclipseCharge(pr);
        }
        if (pr.input.attack && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
          pr.attackCooldownMs = p.noCooldownMode ? 0 : computePlayerAttackCooldownMs(p, activeWeaponDef);
          p.attackAnimMs = 190;
          this.firePrimaryAttack(p);
        }
      }
    }
    const connectedPlayers = Array.from(this.players.values()).filter(
      (r) => r.state.connected
    );
    if (connectedPlayers.length > 0) {
      const anyAlive = connectedPlayers.some(
        (r) => !r.state.downed || connectedPlayers.length > 1 && r.state.downedTimerMs > 0 && connectedPlayers.some((other) => !other.state.downed)
      );
      if (!anyAlive) {
        this.status = "defeat";
        this.endedAt = Date.now();
        if (!this.runEndRecorded && this.roomId !== "TAVERN-HUB") {
          this.runEndRecorded = true;
          this.onRunEndedCallback?.(
            Array.from(this.players.keys()),
            "defeat",
            this.floor
          );
        }
        if (this.roomId !== "TAVERN-HUB" && !this.isPlayerConnected(this.hostId)) {
          this.transferHostToConnectedMember();
        }
        this.pushSystemChat(`The expedition has fallen on Floor ${this.floor}.`);
        return;
      }
    }
    const alivePlayersWithRoom = [];
    for (let pIdx = 0; pIdx < connectedPlayers.length; pIdx++) {
      const st = connectedPlayers[pIdx].state;
      if (!st.downed) {
        const pRoom = this.findRoomContaining(st.x, st.y);
        alivePlayersWithRoom.push({ state: st, roomId: pRoom?.id });
      }
    }
    for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
      const enemy = this.enemies[eIdx];
      if ((enemy.chronoSuspendedMs || 0) > 0) {
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }
      enemy.markedMs = Math.max(0, enemy.markedMs - dtMs);
      enemy.slowedMs = Math.max(0, enemy.slowedMs - dtMs);
      enemy.stunnedMs = Math.max(0, enemy.stunnedMs - dtMs);
      enemy.burnedMs = Math.max(0, enemy.burnedMs - dtMs);
      enemy.frozenMs = Math.max(0, enemy.frozenMs - dtMs);
      enemy.shockedMs = Math.max(0, enemy.shockedMs - dtMs);
      enemy.poisonedMs = Math.max(0, enemy.poisonedMs - dtMs);
      enemy.bleedingMs = Math.max(0, enemy.bleedingMs - dtMs);
      enemy.silencedMs = Math.max(0, (enemy.silencedMs || 0) - dtMs);
      enemy.shieldWallMs = Math.max(0, (enemy.shieldWallMs || 0) - dtMs);
      const meta = this.getEnemyMeta(enemy);
      if (pulseDotNow && enemy.hp > 0) {
        let enemyDied = false;
        if (enemy.burnedMs > 0) {
          const ownerId = meta.burnOwnerId ?? enemy.burnInflicterId ?? null;
          const ownerState = ownerId ? this.players.get(ownerId)?.state ?? null : null;
          const mult = meta.burnMultiplier ?? _GameRoom.computeDotMultiplier(ownerState);
          const rawBurn = meta.burnBaseTick ?? (7 + this.floor) * mult;
          enemyDied = this.applyDotDamageTick(enemy, "burn", rawBurn, ownerId, getDamageTypeColor("fire", false));
        }
        if (!enemyDied && enemy.poisonedMs > 0) {
          const ownerId = meta.poisonOwnerId ?? null;
          const ownerState = ownerId ? this.players.get(ownerId)?.state ?? null : null;
          const mult = meta.poisonMultiplier ?? _GameRoom.computeDotMultiplier(ownerState);
          const rawPoison = meta.poisonBaseTick ?? (5 + this.floor) * mult;
          enemyDied = this.applyDotDamageTick(enemy, "poison", rawPoison, ownerId, getDamageTypeColor("poison", false));
        }
        if (!enemyDied && enemy.bleedingMs > 0) {
          const ownerId = meta.bleedOwnerId ?? null;
          const ownerState = ownerId ? this.players.get(ownerId)?.state ?? null : null;
          const mult = meta.bleedMultiplier ?? _GameRoom.computeDotMultiplier(ownerState);
          const moving = Math.hypot(enemy.vx, enemy.vy) > 8;
          const baseBleed = (moving ? 14 : 7) + this.floor;
          const rawBleed = baseBleed * mult;
          enemyDied = this.applyDotDamageTick(enemy, "bleed", rawBleed, ownerId, getDamageTypeColor("bleed", false));
        }
        if (enemyDied) {
          continue;
        }
      }
      if (enemy.burnedMs <= 0 && meta.burnOwnerId !== null) {
        meta.burnOwnerId = null;
        meta.burnMultiplier = null;
        meta.burnBaseTick = null;
      }
      if (enemy.poisonedMs <= 0 && meta.poisonOwnerId !== null) {
        meta.poisonOwnerId = null;
        meta.poisonMultiplier = null;
        meta.poisonBaseTick = null;
      }
      if (enemy.bleedingMs <= 0 && meta.bleedOwnerId !== null) {
        meta.bleedOwnerId = null;
        meta.bleedMultiplier = null;
      }
      if (enemy.stunnedMs > 0 || enemy.frozenMs > 0) {
        if (enemy.charging || (enemy.chargeWindupMs || 0) > 0 || enemy.chargeAngle !== void 0) {
          this.clearEnemyChargeState(enemy);
        }
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }
      let nearest = null;
      let nearestDist = Infinity;
      let enemyRoom = void 0;
      if (alivePlayersWithRoom.length > 0) {
        let nearestDistSq = Infinity;
        enemyRoom = this.findRoomContaining(enemy.x, enemy.y);
        const enemyRoomId = enemyRoom?.id;
        const isBoss = enemy.kind === "boss";
        const isRanged = enemy.kind === "skeleton" || enemy.kind === "cultist" || enemy.kind === "hymn_phantom" || enemy.kind === "veiled_heretic" || enemy.kind === "astral_sentinel";
        const isAlerted = enemy.markedMs > 0 || enemy.hp < enemy.maxHp;
        for (let pIdx = 0; pIdx < alivePlayersWithRoom.length; pIdx++) {
          const pInfo = alivePlayersWithRoom[pIdx];
          const pState = pInfo.state;
          const inSameRoom = enemyRoomId !== void 0 && pInfo.roomId === enemyRoomId;
          let maxDetectDist = isBoss ? 380 : inSameRoom ? isRanged ? 220 : 190 : isRanged ? 175 : 145;
          if (isAlerted) maxDetectDist += 45;
          const dxP = pState.x - enemy.x;
          const dyP = pState.y - enemy.y;
          const distSq = dxP * dxP + dyP * dyP;
          if (distSq > maxDetectDist * maxDetectDist || distSq >= nearestDistSq) continue;
          if (!inSameRoom && !isBoss && !isAlerted) {
            if (!this.hasLineOfSight(enemy.x, enemy.y, pState.x, pState.y)) {
              continue;
            }
          }
          nearestDistSq = distSq;
          nearest = pState;
        }
        if (nearest) {
          nearestDist = Math.sqrt(nearestDistSq);
        }
      }
      if (!nearest) {
        if (enemy.charging || (enemy.chargeWindupMs || 0) > 0 || enemy.chargeAngle !== void 0) {
          this.clearEnemyChargeState(enemy);
        }
        enemy.state = "idle";
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }
      enemy.state = "chase";
      const slowFactor = enemy.slowedMs > 0 ? 0.55 : 1;
      const dx = nearest.x - enemy.x;
      const dy = nearest.y - enemy.y;
      const directAngle = Math.atan2(dy, dx);
      const angle = directAngle;
      let moveAngle = directAngle;
      const stepProbe = enemy.radius + 6;
      if (this.collidesCircle(enemy.x + Math.cos(directAngle) * stepProbe, enemy.y + Math.sin(directAngle) * stepProbe, enemy.radius - 2)) {
        const leftAng = directAngle + 0.65;
        const rightAng = directAngle - 0.65;
        const leftClear = !this.collidesCircle(enemy.x + Math.cos(leftAng) * stepProbe, enemy.y + Math.sin(leftAng) * stepProbe, enemy.radius - 2);
        const rightClear = !this.collidesCircle(enemy.x + Math.cos(rightAng) * stepProbe, enemy.y + Math.sin(rightAng) * stepProbe, enemy.radius - 2);
        if (leftClear && !rightClear) {
          moveAngle = leftAng;
        } else if (rightClear && !leftClear) {
          moveAngle = rightAng;
        } else if (leftClear && rightClear) {
          moveAngle = enemy.id.charCodeAt(0) % 2 === 0 ? leftAng : rightAng;
        }
      }
      for (let oIdx = eIdx - 1; oIdx >= Math.max(0, eIdx - 6); oIdx--) {
        const other = this.enemies[oIdx];
        if (other.hp <= 0) continue;
        const edx = enemy.x - other.x;
        const edy = enemy.y - other.y;
        const minDist = enemy.radius + other.radius + 2;
        const distSq = edx * edx + edy * edy;
        if (distSq > 0 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const push = (minDist - dist) * 0.4;
          const nx = edx / dist * push;
          const ny = edy / dist * push;
          if (!this.collidesCircle(enemy.x + nx, enemy.y + ny, enemy.radius - 2)) {
            enemy.x += nx;
            enemy.y += ny;
          }
        }
      }
      enemy.windupMs -= dtMs;
      const moveStartX = enemy.x;
      const moveStartY = enemy.y;
      if (enemy.kind === "slime" || enemy.kind === "goblin" || enemy.kind === "knight") {
        const baseSpd = enemy.kind === "goblin" ? 128 : enemy.kind === "knight" ? 96 : 86;
        const spd = baseSpd * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 22 && enemy.windupMs <= 0) {
          const baseHit = enemy.kind === "knight" ? 19 : enemy.kind === "goblin" ? 13 : 11;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy));
          enemy.windupMs = enemy.kind === "goblin" ? 850 : 1100;
        }
      } else if (enemy.kind === "shadow_stalker") {
        const spd = 138 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 24 && enemy.windupMs <= 0) {
          const baseHit = 22;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), "physical");
          nearest.hasteMs = Math.min(nearest.hasteMs, 0);
          enemy.windupMs = 800;
        }
      } else if (enemy.kind === "astral_sentinel") {
        const spd = 72 * slowFactor;
        if (nearestDist < 140) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 240) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }
        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "[SILENCED]", "#C084FC");
            enemy.windupMs = 1200;
          } else {
            for (let k = -0.18; k <= 0.18; k += 0.36) {
              const a = angle + k;
              this.spawnProjectile({
                ownerType: "enemy",
                ownerId: enemy.id,
                style: "arcane",
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 230,
                vy: Math.sin(a) * 230,
                angle: a,
                radius: 6,
                damage: 18 + this.floor * 2,
                pierce: 1,
                ttlMs: 2e3
              });
            }
            enemy.windupMs = 1850;
          }
        }
      } else if (enemy.kind === "skeleton" || enemy.kind === "cultist") {
        const spd = 82 * slowFactor;
        if (nearestDist < 120) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 215) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }
        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "[SILENCED]", "#C084FC");
            enemy.windupMs = 1200;
          } else if (enemy.kind === "skeleton") {
            this.spawnProjectile({
              ownerType: "enemy",
              ownerId: enemy.id,
              style: "bone",
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(angle) * 245,
              vy: Math.sin(angle) * 245,
              angle,
              radius: 5,
              damage: 13 + this.floor * 2,
              pierce: 1,
              ttlMs: 1700
            });
            enemy.windupMs = 1550;
          } else {
            for (let k = -1; k <= 1; k++) {
              const a = angle + k * 0.25;
              this.spawnProjectile({
                ownerType: "enemy",
                ownerId: enemy.id,
                style: "voidorb",
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 195,
                vy: Math.sin(a) * 195,
                angle: a,
                radius: 6,
                damage: 14 + this.floor * 2,
                pierce: 1,
                ttlMs: 1900
              });
            }
            enemy.windupMs = 2100;
          }
        }
      } else if (enemy.kind === "hymn_phantom") {
        const spd = 92 * slowFactor;
        if (nearestDist < 130) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 220) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }
        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "[SILENCED]", "#C084FC");
            enemy.windupMs = 1200;
          } else {
            for (let k = -1; k <= 1; k += 2) {
              const a = angle + k * 0.18;
              this.spawnProjectile({
                ownerType: "enemy",
                ownerId: enemy.id,
                style: "arcane",
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 220,
                vy: Math.sin(a) * 220,
                angle: a,
                radius: 6,
                damage: 18 + this.floor * 2,
                pierce: 1,
                ttlMs: 2e3
              });
            }
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "CHORAL WAIL", "#C084FC");
            enemy.windupMs = 1750;
          }
        }
      } else if (enemy.kind === "relic_golem") {
        const spd = 74 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 28 && enemy.windupMs <= 0) {
          const baseHit = 26;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), "physical");
          this.emitEvent("status", nearest.x, nearest.y - 14, "SEISMIC SLAM!", "#F59E0B");
          for (let k = 0; k < 6; k++) {
            const sa = k * Math.PI * 2 / 6;
            this.spawnProjectile({
              ownerType: "enemy",
              ownerId: enemy.id,
              style: "slash",
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(sa) * 160,
              vy: Math.sin(sa) * 160,
              angle: sa,
              radius: 6,
              damage: 14 + this.floor,
              pierce: 1,
              ttlMs: 800
            });
          }
          enemy.windupMs = 1800;
        }
      } else if (enemy.kind === "veiled_heretic") {
        const spd = 84 * slowFactor;
        if (nearestDist < 140) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 230) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }
        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "[SILENCED]", "#C084FC");
            enemy.windupMs = 1200;
          } else {
            for (let k = -1; k <= 1; k++) {
              const a = angle + k * 0.22;
              this.spawnProjectile({
                ownerType: "enemy",
                ownerId: enemy.id,
                style: "voidorb",
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 215,
                vy: Math.sin(a) * 215,
                angle: a,
                radius: 7,
                damage: 19 + this.floor * 2,
                pierce: 1,
                ttlMs: 1900
              });
            }
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "CORRUPTED SCRIPTURE", "#A855F7");
            enemy.windupMs = 1950;
          }
        }
      } else if (enemy.kind === "celestial_arbiter") {
        const spd = 112 * slowFactor;
        if (nearestDist > enemy.radius + 16) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (enemy.windupMs <= 0) {
          if (nearestDist <= enemy.radius + 24) {
            const baseHit = 24;
            this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), "divine");
            this.emitEvent("status", nearest.x, nearest.y - 14, "JUDGEMENT!", "#FDE047");
            enemy.windupMs = 1100;
          } else if (nearestDist <= 220) {
            if (enemy.silencedMs > 0) {
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "[SILENCED]", "#C084FC");
              enemy.windupMs = 1200;
            } else {
              this.spawnProjectile({
                ownerType: "enemy",
                ownerId: enemy.id,
                style: "radiant",
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(angle) * 310,
                vy: Math.sin(angle) * 310,
                angle,
                radius: 8,
                damage: 22 + this.floor * 2,
                pierce: 1,
                ttlMs: 1600
              });
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 12, "SOLAR THRUST", "#FBBF24");
              enemy.windupMs = 1400;
            }
          }
        }
      } else if (enemy.kind === "warden_enforcer") {
        const spd = 94 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 26 && enemy.windupMs <= 0) {
          const baseHit = 25;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), "physical");
          this.emitEvent("status", nearest.x, nearest.y - 14, "HALBERD CLEAVE!", "#38BDF8");
          enemy.shieldWallMs = 1200;
          for (let off = -0.22; off <= 0.22; off += 0.44) {
            const a = angle + off;
            this.spawnProjectile({
              ownerType: "enemy",
              ownerId: enemy.id,
              style: "slash",
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(a) * 230,
              vy: Math.sin(a) * 230,
              angle: a,
              radius: 8,
              damage: 18 + this.floor * 2,
              pierce: 1,
              ttlMs: 1200
            });
          }
          enemy.windupMs = 1500;
        }
      } else if (enemy.kind === "boss") {
        this.updateBossAi(enemy, enemyRoom, nearest, dtMs, dtSec, slowFactor);
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if ((proj.chronoSuspendedMs || 0) > 0) {
        if (proj.style === "arcane_orb") {
          const orbMap = this.arcaneOrbHits.get(proj.id);
          if (orbMap) {
            for (const entry of orbMap.values()) {
              entry.lastHitAtMs += dtMs;
            }
          }
        }
        continue;
      }
      const cycState = proj.style === "cyclone_arrow" ? this.cycloneArrowStates.get(proj.id) : void 0;
      const prevProjX = proj.x;
      const prevProjY = proj.y;
      proj.ttlMs -= dtMs;
      if (cycState && cycState.carryMsRemaining !== null) {
        cycState.carryMsRemaining -= dtMs;
      }
      if (proj.ttlMs <= 0 || cycState && cycState.carryMsRemaining !== null && cycState.carryMsRemaining <= 0) {
        if (proj.spellId === "fireball") {
          this.explodeFireball(proj);
        } else if (proj.style === "cyclone_arrow") {
          this.spawnCycloneBreakWhirlwind(proj.ownerId, proj.x, proj.y);
        }
        this.cleanupProjectileTracking(proj.id);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (proj.ownerType === "player" && proj.weaponId === "arcanist_chronostar_scepter" && !proj.targetEnemyId) {
        const seekRange = 170;
        let bestSeekDist = seekRange;
        let bestSeekId;
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (proj.hitEntityIds?.includes(e.id)) continue;
          const d = Math.hypot(e.x - proj.x, e.y - proj.y);
          if (d <= bestSeekDist) {
            bestSeekDist = d;
            bestSeekId = e.id;
          }
        }
        if (!bestSeekId) {
          for (const dummy of this.trainingDummies) {
            if (proj.hitEntityIds?.includes(dummy.id)) continue;
            const d = Math.hypot(dummy.x - proj.x, dummy.y - proj.y);
            if (d <= bestSeekDist) {
              bestSeekDist = d;
              bestSeekId = dummy.id;
            }
          }
        }
        if (bestSeekId) {
          proj.targetEnemyId = bestSeekId;
        }
      }
      if (proj.ownerType === "player" && proj.targetEnemyId) {
        let target = this.enemies.find(
          (e) => e.id === proj.targetEnemyId && e.hp > 0
        );
        if (!target) {
          target = this.trainingDummies.find((d) => d.id === proj.targetEnemyId);
        }
        if (target && !proj.hitEntityIds?.includes(proj.targetEnemyId)) {
          const tdx = target.x - proj.x;
          const tdy = target.y - proj.y;
          const dist = Math.hypot(tdx, tdy);
          if (dist > 4 && dist < 380) {
            const desiredAngle = Math.atan2(tdy, tdx);
            const currentSpeed = Math.hypot(proj.vx, proj.vy);
            const curAngle = Math.atan2(proj.vy, proj.vx);
            const diff = Math.atan2(Math.sin(desiredAngle - curAngle), Math.cos(desiredAngle - curAngle));
            const steer = proj.weaponId === "arcanist_chronostar_scepter" ? 0.34 : 0.22;
            const newAngle = curAngle + diff * steer;
            proj.vx = Math.cos(newAngle) * currentSpeed;
            proj.vy = Math.sin(newAngle) * currentSpeed;
            proj.angle = newAngle;
          }
        }
      }
      if (proj.style === "arcane_barrage") {
        proj.elapsedMs = (proj.elapsedMs || 0) + dtMs;
        const tSec = proj.elapsedMs / 1e3;
        const baseX = (proj.originX ?? proj.x) + proj.vx * dtSec;
        const baseY = (proj.originY ?? proj.y) + proj.vy * dtSec;
        proj.originX = baseX;
        proj.originY = baseY;
        const amp = proj.helixPhase !== void 0 ? 10 : 4;
        const latOffset = (proj.helixSign || 1) * amp * Math.sin(tSec * 16 + (proj.helixPhase || 0));
        proj.x = baseX - Math.sin(proj.angle) * latOffset;
        proj.y = baseY + Math.cos(proj.angle) * latOffset;
      } else {
        proj.x += proj.vx * dtSec;
        proj.y += proj.vy * dtSec;
      }
      if (this.isWallAtWorld(proj.x, proj.y)) {
        if (proj.spellId === "fireball") {
          this.explodeFireball(proj);
        } else if (proj.style === "cyclone_arrow") {
          this.spawnCycloneBreakWhirlwind(proj.ownerId, prevProjX, prevProjY);
        }
        this.cleanupProjectileTracking(proj.id);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (cycState && cycState.draggedEnemyIds.size > 0) {
        const carryDx = proj.x - prevProjX;
        const carryDy = proj.y - prevProjY;
        for (const draggedId of cycState.draggedEnemyIds) {
          const enemy = this.enemies.find((e) => e.id === draggedId && e.hp > 0);
          if (!enemy || enemy.kind === "boss") continue;
          const pullToTipX = (proj.x - enemy.x) * 0.28;
          const pullToTipY = (proj.y - enemy.y) * 0.28;
          moveWithCollision(
            this.map,
            this.props,
            enemy,
            carryDx + pullToTipX,
            carryDy + pullToTipY,
            enemy.radius
          );
        }
      }
      if (proj.ownerType === "enemy") {
        let blockedByDome = false;
        for (let zIdx = 0; zIdx < this.zones.length; zIdx++) {
          const z = this.zones[zIdx];
          if (z.kind === "aegis_dome") {
            const dx = proj.x - z.x;
            const dy = proj.y - z.y;
            if (dx * dx + dy * dy <= z.radius * z.radius) {
              blockedByDome = true;
              break;
            }
          }
        }
        if (blockedByDome) {
          this.projectiles.splice(i, 1);
          continue;
        }
        let hitPlayer = false;
        const playerHitR = 14 + proj.radius;
        const playerHitRSq = playerHitR * playerHitR;
        for (const pr of this.players.values()) {
          if (pr.state.downed || !pr.state.connected) continue;
          const dx = pr.state.x - proj.x;
          const dy = pr.state.y - proj.y;
          if (dx * dx + dy * dy <= playerHitRSq) {
            const ownerEnemy = proj.ownerId ? this.enemies.find((e) => e.id === proj.ownerId) : null;
            let finalProjDmg = proj.damage;
            if (ownerEnemy && (ownerEnemy.poisonedMs || 0) > 0) {
              finalProjDmg = Math.max(1, Math.round(finalProjDmg * 0.7));
            }
            const projDmgCat = proj.damageCategory ?? inferDamageCategoryFromProjectileStyle(proj.style);
            this.damagePlayer(pr.state, finalProjDmg, projDmgCat);
            if (proj.statusOnHit) {
              this.applyPlayerStatus(pr.state, proj.statusOnHit, proj.statusDurationMs || 3e3);
            }
            hitPlayer = true;
            break;
          }
        }
        if (hitPlayer) {
          this.projectiles.splice(i, 1);
        }
      } else {
        const crateHitR = 18 + proj.radius;
        const crateHitRSq = crateHitR * crateHitR;
        for (const prop of this.props) {
          if (!prop.opened && prop.kind === "crate") {
            const dx = prop.x - proj.x;
            const dy = prop.y - proj.y;
            if (dx * dx + dy * dy <= crateHitRSq) {
              prop.opened = true;
              for (const ally of this.players.values()) {
                ally.state.gold += prop.value;
              }
              this.emitEvent("gold", prop.x, prop.y - 10, `+${prop.value}g`, "#F4D378");
            }
          }
        }
        const ownerPr = this.players.get(proj.ownerId);
        if (proj.style === "arcane_orb") {
          let orbMap = this.arcaneOrbHits.get(proj.id);
          if (!orbMap) {
            orbMap = /* @__PURE__ */ new Map();
            this.arcaneOrbHits.set(proj.id, orbMap);
          }
          const orbSpec = ARCANIST_SPELLS.arcane_orb;
          const hitInterval = orbSpec.hitIntervalMs ?? 500;
          const maxHits = orbSpec.maxHitsPerEnemy ?? 2;
          const isTacticalOrb = this.tacticalProjIds.has(proj.id);
          for (const dummy of this.trainingDummies) {
            if (!dummy || !dummy.id) continue;
            const dx = dummy.x - proj.x;
            const dy = dummy.y - proj.y;
            if (dx * dx + dy * dy <= crateHitRSq) {
              const rec = orbMap.get(dummy.id);
              if (!rec || rec.hits < maxHits && this.simTimeMs - rec.lastHitAtMs >= hitInterval) {
                orbMap.set(dummy.id, { hits: (rec?.hits || 0) + 1, lastHitAtMs: this.simTimeMs });
                this.damageDummy(dummy, proj.damage, ownerPr ? ownerPr.state : null, false, false, "arcane");
                if (isTacticalOrb) this.onTacticalHitConfirmed(ownerPr?.state);
              }
            }
          }
          for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
            if (eIdx >= this.enemies.length) continue;
            const enemy = this.enemies[eIdx];
            if (!enemy || !enemy.id || enemy.hp <= 0) continue;
            const dx = enemy.x - proj.x;
            const dy = enemy.y - proj.y;
            const hitR = enemy.radius + proj.radius;
            if (dx * dx + dy * dy <= hitR * hitR) {
              const rec = orbMap.get(enemy.id);
              if (!rec || rec.hits < maxHits && this.simTimeMs - rec.lastHitAtMs >= hitInterval) {
                orbMap.set(enemy.id, { hits: (rec?.hits || 0) + 1, lastHitAtMs: this.simTimeMs });
                const dealtOrb = this.damageEnemy(enemy, proj.damage, ownerPr ? ownerPr.state : null, false, "arcane");
                if (dealtOrb > 0 && isTacticalOrb) this.onTacticalHitConfirmed(ownerPr?.state);
              }
            }
          }
          continue;
        }
        if (!Array.isArray(proj.hitEntityIds)) {
          proj.hitEntityIds = [];
        }
        let hitDummy = false;
        for (const dummy of this.trainingDummies) {
          if (!dummy || !dummy.id) continue;
          if (proj.hitEntityIds.includes(dummy.id)) continue;
          const dx = dummy.x - proj.x;
          const dy = dummy.y - proj.y;
          if (dx * dx + dy * dy <= crateHitRSq) {
            if (proj.spellId === "fireball") {
              this.explodeFireball(proj);
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
            const isPrimaryProj = this.primaryAttackProjIds.has(proj.id);
            const isTacticalProj = this.tacticalProjIds.has(proj.id);
            const pierceHitIndex = proj.hitEntityIds.length;
            proj.hitEntityIds.push(dummy.id);
            const hitDamage = this.computePrimaryProjectileHitDamage(
              proj,
              dummy.x,
              dummy.y,
              ownerPr ? ownerPr.state : null,
              pierceHitIndex
            );
            const dealtDummy = this.damageDummy(
              dummy,
              hitDamage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit),
              isPrimaryProj,
              proj.damageCategory
            );
            if (!isPrimaryProj && isTacticalProj && dealtDummy > 0) {
              this.onTacticalHitConfirmed(ownerPr?.state);
            }
            if (proj.style === "cyclone_arrow" && cycState && cycState.carryMsRemaining === null) {
              cycState.carryMsRemaining = ARMAMENT_TUNING.weapons.galewind.cycloneArrowCarryDurationMs;
            }
            if (isPrimaryProj && ownerPr && dealtDummy > 0) {
              this.applyWeaponPrimaryHitSpecial(
                proj,
                dummy.x,
                dummy.y,
                ownerPr.state,
                null,
                dummy,
                dealtDummy
              );
            }
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
          }
        }
        if (hitDummy) continue;
        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          if (eIdx >= this.enemies.length) continue;
          const enemy = this.enemies[eIdx];
          if (!enemy || !enemy.id || enemy.hp <= 0) continue;
          if (proj.hitEntityIds.includes(enemy.id)) continue;
          const dx = enemy.x - proj.x;
          const dy = enemy.y - proj.y;
          const hitR = enemy.radius + proj.radius;
          if (dx * dx + dy * dy <= hitR * hitR) {
            if (proj.spellId === "fireball") {
              this.explodeFireball(proj);
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              break;
            }
            const isPrimaryProj = this.primaryAttackProjIds.has(proj.id);
            const isTacticalProj = this.tacticalProjIds.has(proj.id);
            const pierceHitIndex = proj.hitEntityIds.length;
            proj.hitEntityIds.push(enemy.id);
            if (proj.slowOnHit) this.applySoftCc(enemy, 3e3);
            const hitDamage = this.computePrimaryProjectileHitDamage(
              proj,
              enemy.x,
              enemy.y,
              ownerPr ? ownerPr.state : null,
              pierceHitIndex,
              enemy
            );
            const dealtPrimary = this.damageEnemy(
              enemy,
              hitDamage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit),
              proj.damageCategory,
              isPrimaryProj
            );
            if (!isPrimaryProj && isTacticalProj && dealtPrimary > 0) {
              this.onTacticalHitConfirmed(ownerPr?.state);
            }
            if (proj.style === "cyclone_arrow" && cycState) {
              this.applySoftCc(enemy, 700);
              if (enemy.kind !== "boss" && enemy.hp > 0) {
                cycState.draggedEnemyIds.add(enemy.id);
              }
              if (cycState.carryMsRemaining === null) {
                cycState.carryMsRemaining = ARMAMENT_TUNING.weapons.galewind.cycloneArrowCarryDurationMs;
              }
            }
            if (isPrimaryProj && ownerPr && dealtPrimary > 0) {
              this.applyWeaponPrimaryHitSpecial(
                proj,
                enemy.x,
                enemy.y,
                ownerPr.state,
                enemy,
                null,
                dealtPrimary
              );
            }
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }
    let anyRoomNewlyCleared = false;
    let bossJustCleared = false;
    for (const room of this.map.rooms) {
      if (!room.cleared) {
        const aliveInRoom = this.enemies.some((e) => e.roomId === room.id && e.hp > 0);
        if (!aliveInRoom) {
          room.cleared = true;
          anyRoomNewlyCleared = true;
          for (const prop of this.props) {
            if (prop.roomId === room.id && prop.locked) {
              prop.locked = false;
              if (prop.kind === "totem") {
                this.emitEvent("status", prop.x, prop.y - 24, "OBELISK AWAKENED!", "#38BDF8");
                this.pushSystemChat(`Ancient Guardian Obelisk awakened in Guardian Chamber ${room.id}! Approach to claim your blessing.`);
              }
            }
          }
          if (room.type === "boss") {
            bossJustCleared = true;
            if (!this.props.some((pr) => pr.kind === "relic_chest" && pr.roomId === room.id)) {
              this.props.push({
                id: this.nextId("prop"),
                kind: "relic_chest",
                x: this.map.portalPos.x + 48,
                y: this.map.portalPos.y,
                opened: false,
                roomId: room.id,
                value: 1
              });
            }
            for (const ally of this.players.values()) {
              if (ally.state.heroClass === "arcanist" && Math.random() < 0.5) {
                this.grantScrollChoices(ally.state.id);
              }
            }
          } else if (room.type === "combat" && this.floor > 0) {
            this.awardCombatRoomClear(room);
            if (room.guardian) {
              for (const ally of this.players.values()) {
                if (ally.state.heroClass === "arcanist" && Math.random() < 0.4) {
                  this.grantScrollChoices(ally.state.id);
                }
              }
            }
          }
        }
      }
    }
    const combatRooms = this.map.rooms.filter((r) => r.type === "combat");
    if (this.floor > 0 && anyRoomNewlyCleared && !this.floorMasteryAwarded && combatRooms.length > 0 && combatRooms.every((r) => r.cleared)) {
      this.awardFullFloorMastery();
    }
    const bossRoom = this.map.rooms.find((r) => r.type === "boss");
    if (bossRoom && bossRoom.cleared) {
      const guardiansRemaining = this.getGuardiansRemaining();
      if (guardiansRemaining === 0) {
        if (!this.map.portalActive) {
          this.map.portalActive = true;
          this.emitEvent(
            "status",
            this.map.portalPos.x,
            this.map.portalPos.y - 34,
            "PORTAL UNLOCKED!",
            "#34D399"
          );
          this.pushSystemChat(
            bossJustCleared ? `Floor ${this.floor} Boss vanquished! Open the Relic Vault and press [E] at the Portal.` : `Final Sanctum Guardian defeated! Floor ${this.floor} Exit Portal is now unsealed.`
          );
        }
      } else if (bossJustCleared) {
        this.emitEvent(
          "status",
          this.map.portalPos.x,
          this.map.portalPos.y - 34,
          `PORTAL SEALED \xB7 ${guardiansRemaining} GUARDIAN${guardiansRemaining > 1 ? "S" : ""}`,
          "#F59E0B"
        );
        this.pushSystemChat(
          `Floor ${this.floor} Boss vanquished, but the Exit Portal remains sealed! Defeat the remaining ${guardiansRemaining} Guardian chamber${guardiansRemaining > 1 ? "s" : ""} to unlock the descent.`
        );
      }
    }
  }
  awardCombatRoomClear(room) {
    const isGuardian = Boolean(room.guardian);
    const centerX = room.cx * TILE_SIZE + TILE_SIZE / 2;
    const centerY = room.cy * TILE_SIZE + TILE_SIZE / 2;
    const floorXpBonus = 1 + (this.floor - 1) * 0.35;
    const diffXpBonus = this.difficulty === "Abyssal" ? 1.5 : this.difficulty === "Heroic" ? 1.25 : 1;
    const bonusXp = Math.round((isGuardian ? 95 : 55) * floorXpBonus * diffXpBonus);
    const bonusGold = (isGuardian ? 45 : 24) + this.floor * (isGuardian ? 12 : 8);
    const blessingOrder = ["fury", "swiftness", "bastion"];
    const blessing = blessingOrder[(room.id + this.floor) % blessingOrder.length];
    const blessingMeta = FLOOR_BLESSINGS[blessing];
    for (const ally of this.players.values()) {
      const st = ally.state;
      st.gold += bonusGold;
      if (!st.floorBlessings) st.floorBlessings = [];
      st.floorBlessings.push(blessing);
      if (blessing === "bastion") {
        this.grantShield(st, 20, "add");
      }
      if (!st.downed) {
        const healAmt = isGuardian ? 18 : 10;
        st.hp = Math.min(st.maxHp, st.hp + healAmt);
      }
      this.grantXp(st, bonusXp);
      this.emitEvent("gold", st.x, st.y - 16, `+${bonusGold}g \xB7 +${bonusXp} XP`, "#F4D378");
      this.emitEvent(
        "status",
        st.x,
        st.y - 34,
        `${blessingMeta.name} (${blessingMeta.shortTag})`,
        blessingMeta.color
      );
    }
    this.emitEvent(
      "status",
      centerX,
      centerY - 24,
      isGuardian ? "GUARDIAN DEFEATED!" : "ROOM CLEARED!",
      isGuardian ? "#F59E0B" : "#34D399"
    );
    const activeBoss = this.enemies.find((e) => e.kind === "boss" && e.hp > 0);
    const remainingWards = this.getBossWards();
    if (activeBoss) {
      this.emitEvent(
        "status",
        activeBoss.x,
        activeBoss.y - activeBoss.radius - 28,
        remainingWards > 0 ? `WARD SHATTERED (${remainingWards} LEFT)` : "ALL WARDS SHATTERED!",
        "#38BDF8"
      );
    }
    this.pushSystemChat(
      `${isGuardian ? "Guardian Chamber" : "Combat Chamber"} cleared! Party earned +${bonusGold}g, +${bonusXp} XP & ${blessingMeta.name}. Boss Wards left: ${remainingWards}.`
    );
  }
  awardFullFloorMastery() {
    if (this.floorMasteryAwarded) return;
    this.floorMasteryAwarded = true;
    const floorXpBonus = 1 + (this.floor - 1) * 0.35;
    const diffXpBonus = this.difficulty === "Abyssal" ? 1.5 : this.difficulty === "Heroic" ? 1.25 : 1;
    const masteryXp = Math.round(130 * floorXpBonus * diffXpBonus);
    const masteryGold = 60 + this.floor * 15;
    for (const ally of this.players.values()) {
      const st = ally.state;
      st.gold += masteryGold;
      let gainedMasteryShield = 0;
      if (!st.downed) {
        st.hp = Math.min(st.maxHp, st.hp + 25);
        gainedMasteryShield = this.grantShield(st, 25, "add");
      }
      st.potions = Math.min(5, st.potions + 1);
      this.grantXp(st, masteryXp);
      this.emitEvent(
        "status",
        st.x,
        st.y - 42,
        gainedMasteryShield > 0 ? "FLOOR CLEARED (+25 SHIELD)" : "FLOOR CLEARED (SHIELD LOCKED)",
        "#FDE047"
      );
    }
    this.pushSystemChat(
      `Floor Mastery achieved! All chambers on Floor ${this.floor} cleared: +${masteryGold}g, +${masteryXp} XP, +25 Shield, and +1 Potion!`
    );
  }
  computePrimaryProjectileHitDamage(proj, _targetX, _targetY, owner, _pierceHitIndex, enemy) {
    let dmg = proj.damage;
    if (!owner || !proj.weaponId) return dmg;
    const weaponMods = resolveEquippedWeaponForClass(owner.heroClass, proj.weaponId)?.modifiers;
    if (!weaponMods) return dmg;
    if (weaponMods.impairedTargetBonusPct && enemy && (enemy.slowedMs > 0 || enemy.frozenMs > 0 || enemy.poisonedMs > 0)) {
      dmg = Math.round(dmg * (1 + weaponMods.impairedTargetBonusPct));
    }
    return Math.max(1, dmg);
  }
  triggerBastionCounterCleave(pr) {
    const p = pr.state;
    p.bastionCounterMs = 0;
    p.bastionCounterMaxMs = 0;
    const blockedHits = pr.bastionBlockedHits || 0;
    pr.bastionBlockedHits = 0;
    if (p.downed || resolveActiveTacticalDef(p.heroClass, p.equippedWeapon, p.equippedScrollId).id !== "bastion_counter") {
      return;
    }
    const sfCfg = ARMAMENT_TUNING.weapons.sunforged;
    const cleaveAngle = Number.isFinite(p.aimAngle) ? p.aimAngle : pr.bastionAimAngle;
    const dmgMult = this.computeDamageMult(p, "physical");
    const bonusMult = 1 + Math.min(sfCfg.bastionMaxBonusStacks, blockedHits) * sfCfg.bastionBlockedBonusPerHitRatio;
    const cleaveDmg = Math.max(1, Math.round(sfCfg.bastionCleaveBaseDamage * dmgMult * bonusMult));
    const cleaveRadius = sfCfg.bastionCleaveRadiusPx;
    const halfAngle = sfCfg.bastionCleaveHalfAngleRad;
    p.attackAnimMs = Math.max(p.attackAnimMs, 260);
    this.zones.push({
      id: this.nextId("zone"),
      kind: "bastion_counter_cleave",
      x: p.x,
      y: p.y,
      radius: cleaveRadius,
      angle: cleaveAngle,
      coneHalfAngleRad: halfAngle,
      ttlMs: sfCfg.bastionCleaveZoneTtlMs,
      maxTtlMs: sfCfg.bastionCleaveZoneTtlMs,
      ownerId: p.id
    });
    const enemiesSnap = [...this.enemies];
    for (const enemy of enemiesSnap) {
      if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= cleaveRadius + enemy.radius * 0.35) {
        const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - cleaveAngle));
        if (diff <= halfAngle) {
          this.applyHardCc(enemy, "stun", 700);
          this.damageEnemy(enemy, cleaveDmg, p, blockedHits > 0, "physical", false);
        }
      }
    }
    for (const dummy of this.trainingDummies) {
      const dx = dummy.x - p.x;
      const dy = dummy.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= cleaveRadius + 18) {
        const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - cleaveAngle));
        if (diff <= halfAngle) {
          this.damageDummy(dummy, cleaveDmg, p, blockedHits > 0, false, "physical");
        }
      }
    }
    const bonusLabel = blockedHits > 0 ? `COUNTER CLEAVE! (+${Math.round(blockedHits * sfCfg.bastionBlockedBonusPerHitRatio * 100)}%)` : "COUNTER CLEAVE!";
    this.emitEvent("status", p.x, p.y - 28, bonusLabel, "#FBBF24");
  }
  triggerGaleburstExplosion(owner, cx, cy, baseHitDmg, radius, dmgRatio) {
    const gwCfg = ARMAMENT_TUNING.weapons.galewind;
    this.zones.push({
      id: this.nextId("zone"),
      kind: "galeburst_nova",
      x: cx,
      y: cy,
      radius,
      ttlMs: gwCfg.novaZoneTtlMs,
      maxTtlMs: gwCfg.novaZoneTtlMs,
      ownerId: owner.id
    });
    const burstBase = Math.max(1, Math.round(baseHitDmg * dmgRatio));
    const burstCategory = resolveWeaponCombatProfile(owner.heroClass, owner.equippedWeapon, owner).damageCategory;
    const enemiesSnap = [...this.enemies];
    for (const other of enemiesSnap) {
      if (!other || other.hp <= 0 || !this.enemies.includes(other)) continue;
      const dist = Math.hypot(other.x - cx, other.y - cy);
      if (dist <= radius + other.radius * 0.35) {
        this.damageEnemy(other, burstBase, owner, false, burstCategory, false);
      }
    }
    for (const d of this.trainingDummies) {
      if (Math.hypot(d.x - cx, d.y - cy) <= radius + 18) {
        this.damageDummy(d, burstBase, owner, false, false, burstCategory);
      }
    }
    this.emitEvent("status", cx, cy - 22, "GALEBURST!", "#38BDF8");
  }
  triggerSacredRetributionShockwave(cleric) {
    const srCfg = ARMAMENT_TUNING.passives.sacredRetribution;
    const radius = srCfg.shockwaveRadiusPx;
    this.zones.push({
      id: this.nextId("zone"),
      kind: "sacred_retribution",
      x: cleric.x,
      y: cleric.y,
      radius,
      ttlMs: srCfg.shockwaveZoneTtlMs,
      maxTtlMs: srCfg.shockwaveZoneTtlMs,
      ownerId: cleric.id
    });
    const dmgMult = this.computeDamageMult(cleric, "divine");
    const enemyDmg = Math.max(1, Math.round(srCfg.enemyBaseDamage * dmgMult));
    const enemiesSnap = [...this.enemies];
    for (const enemy of enemiesSnap) {
      if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
      if (Math.hypot(enemy.x - cleric.x, enemy.y - cleric.y) <= radius + enemy.radius * 0.35) {
        this.damageEnemy(enemy, enemyDmg, cleric, false, "divine", false);
      }
    }
    for (const dummy of this.trainingDummies) {
      if (Math.hypot(dummy.x - cleric.x, dummy.y - cleric.y) <= radius + 18) {
        this.damageDummy(dummy, enemyDmg, cleric, false, false, "divine");
      }
    }
    for (const allyPr of this.players.values()) {
      const ally = allyPr.state;
      if (ally.downed || !ally.connected) continue;
      if (Math.hypot(ally.x - cleric.x, ally.y - cleric.y) <= radius) {
        const healAmt = _GameRoom.computeHealingAmount(srCfg.allyBaseHeal, cleric, ally);
        this.applyEffectiveHealing(cleric, ally, healAmt, "sacred_retribution");
      }
    }
    this.emitEvent("status", cleric.x, cleric.y - 28, "SACRED RETRIBUTION!", "#FDE047");
  }
  applyWeaponPrimaryHitSpecial(proj, targetX, targetY, owner, enemy, dummy, dealtDmg) {
    this.onConfirmedPrimaryHit(owner, proj.id);
    const weaponDef = resolveEquippedWeaponForClass(owner.heroClass, proj.weaponId);
    if (!weaponDef) return;
    const mods = weaponDef.modifiers;
    const triggeredBefore = this.triggeredOnceProjIds.has(proj.id);
    if (mods.galeburstTriggerHits && mods.galeburstRadiusPx && mods.galeburstDamageRatio) {
      const baseDmgForBurst = dealtDmg ?? proj.damage;
      if (enemy) {
        const meta = this.getEnemyMeta(enemy);
        if (!meta.galeburstByOwner) meta.galeburstByOwner = /* @__PURE__ */ new Map();
        const nextStacks = (meta.galeburstByOwner.get(owner.id) || 0) + 1;
        if (nextStacks >= mods.galeburstTriggerHits) {
          meta.galeburstByOwner.set(owner.id, 0);
          this.syncEnemyGaleburstMarks(enemy, meta);
          this.triggerGaleburstExplosion(
            owner,
            targetX,
            targetY,
            baseDmgForBurst,
            mods.galeburstRadiusPx,
            mods.galeburstDamageRatio
          );
        } else {
          meta.galeburstByOwner.set(owner.id, nextStacks);
          this.syncEnemyGaleburstMarks(enemy, meta);
        }
      } else if (dummy) {
        const pr = this.players.get(owner.id);
        if (pr) {
          const nextStacks = (pr.dummyGaleburstStacks.get(dummy.id) || 0) + 1;
          if (nextStacks >= mods.galeburstTriggerHits) {
            pr.dummyGaleburstStacks.set(dummy.id, 0);
            this.triggerGaleburstExplosion(
              owner,
              targetX,
              targetY,
              baseDmgForBurst,
              mods.galeburstRadiusPx,
              mods.galeburstDamageRatio
            );
          } else {
            pr.dummyGaleburstStacks.set(dummy.id, nextStacks);
          }
        }
      }
    }
    if (mods.emberSplashRadiusPx && mods.emberSplashRatio && !triggeredBefore) {
      this.triggeredOnceProjIds.add(proj.id);
      const splashRad = mods.emberSplashRadiusPx;
      const splashBase = Math.max(2, Math.round(proj.damage * mods.emberSplashRatio));
      this.zones.push({
        id: this.nextId("zone"),
        kind: "cinderflare_blast",
        x: targetX,
        y: targetY,
        radius: splashRad,
        ttlMs: ARMAMENT_TUNING.weapons.cinderflare.blastZoneTtlMs,
        maxTtlMs: ARMAMENT_TUNING.weapons.cinderflare.blastZoneTtlMs,
        ownerId: owner.id
      });
      let splashed = 0;
      const enemiesSnap = [...this.enemies];
      for (const other of enemiesSnap) {
        if (!other || other === enemy || other.hp <= 0 || !this.enemies.includes(other)) continue;
        const dx = other.x - targetX;
        const dy = other.y - targetY;
        const hitR = splashRad + other.radius * 0.35;
        if (dx * dx + dy * dy <= hitR * hitR) {
          this.damageEnemy(other, splashBase, owner, false, "fire", false);
          if (other.hp > 0 && Math.random() < 0.35) {
            const fireRes = _GameRoom.getEnemyResistance(other.resistances, "fire");
            this.applyDotStatus(other, "burn", owner, Math.round(3500 * (1 - fireRes * 0.4)), "weapon");
          }
          splashed++;
        }
      }
      for (const otherDummy of this.trainingDummies) {
        if (!otherDummy || otherDummy === dummy) continue;
        const dx = otherDummy.x - targetX;
        const dy = otherDummy.y - targetY;
        if (dx * dx + dy * dy <= (splashRad + 18) * (splashRad + 18)) {
          this.damageDummy(otherDummy, splashBase, owner, false, false, "fire");
          splashed++;
        }
      }
      if (splashed > 0 || enemy || dummy) {
        this.emitEvent("status", targetX, targetY - 18, "EMBER BLAST!", "#F97316");
      }
    }
    if ((mods.tacticalSiphonMs || mods.ultSiphonMs) && !triggeredBefore) {
      this.triggeredOnceProjIds.add(proj.id);
      if (mods.tacticalSiphonMs && owner.skillCooldownMs > 0) {
        owner.skillCooldownMs = Math.max(0, owner.skillCooldownMs - mods.tacticalSiphonMs);
      }
      if (mods.ultSiphonMs && owner.ultCooldownMs > 0) {
        owner.ultCooldownMs = Math.max(0, owner.ultCooldownMs - mods.ultSiphonMs);
      }
    }
    if (mods.allyHealOnHitBase && !triggeredBefore) {
      this.triggeredOnceProjIds.add(proj.id);
      const pr = this.players.get(owner.id);
      const procCd = mods.allyHealProcCooldownMs ?? ARMAMENT_TUNING.weapons.solaris.procCooldownMs;
      if (!pr || this.simTimeMs - pr.solarisLastHealAtMs >= procCd) {
        const healRange = mods.allyHealOnHitRangePx ?? ARMAMENT_TUNING.weapons.solaris.healRangePx;
        let lowestAlly = null;
        let lowestRatio = 1.01;
        for (const ally of this.players.values()) {
          const st = ally.state;
          if (st.id === owner.id || !st.connected || st.downed) continue;
          if (Math.hypot(st.x - owner.x, st.y - owner.y) > healRange) continue;
          const ratio = st.hp / Math.max(1, st.maxHp);
          if (st.hp < st.maxHp && ratio < lowestRatio) {
            lowestRatio = ratio;
            lowestAlly = st;
          }
        }
        if (lowestAlly) {
          const healAmt = _GameRoom.computeHealingAmount(mods.allyHealOnHitBase, owner, lowestAlly);
          const applied = this.applyEffectiveHealing(owner, lowestAlly, healAmt, "solaris");
          if (applied > 0 && pr) {
            pr.solarisLastHealAtMs = this.simTimeMs;
          }
        }
      }
    }
  }
  advancePlayerComboStep(p) {
    const pr = this.players.get(p.id);
    if (!pr) return;
    const comboCount = getWeaponComboStepCount(p.heroClass, p.equippedWeapon);
    const prevStep = p.attackComboStep ?? 0;
    if (pr.lastPrimaryAttackAtMs >= 0 && this.simTimeMs - pr.lastPrimaryAttackAtMs <= PRIMARY_COMBO_RESET_WINDOW_MS) {
      p.attackComboStep = (prevStep + 1) % comboCount;
    } else {
      p.attackComboStep = 0;
    }
    pr.lastPrimaryAttackAtMs = this.simTimeMs;
  }
  fireEclipseChargedShot(p, holdDurationMs) {
    const def = HERO_CLASSES[p.heroClass];
    const weaponDef = resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
    if (!weaponDef || !weaponDef.modifiers.chargeToFire) {
      this.firePrimaryAttack(p);
      return;
    }
    this.advancePlayerComboStep(p);
    const weaponMods = weaponDef.modifiers;
    const combatProfile = resolveWeaponCombatProfile(p.heroClass, weaponDef, p);
    const category = combatProfile.damageCategory;
    const {
      chargeT,
      damageRatio: chargeDmgRatio,
      projSpeedMult: chargeSpeedRatio
    } = computeEclipseChargeProfile(holdDurationMs);
    const mult = this.computeDamageMult(p, category, {
      isPrimaryAttack: true,
      weaponDef
    });
    const critChance = this.getPlayerCritChance(p, weaponMods);
    const hasCrit = Math.random() < critChance;
    const critMult = hasCrit ? computePlayerCritMultiplier(p, weaponMods) : 1;
    const baseDmg = Math.max(1, Math.round(def.damage * mult * critMult * chargeDmgRatio));
    const relicExtraCount = p.relics.includes("twinstring_charm") ? 1 : 0;
    const totalPierce = computePlayerPierceCount(p, weaponMods);
    const maxSearchDist = getPrimaryAttackRange(p.heroClass) + (weaponMods.rangeBonusPx || 0);
    const bestTarget = findBestAutoTarget({
      playerX: p.x,
      playerY: p.y,
      maxRange: maxSearchDist,
      preferredAngle: p.aimAngle,
      minDot: 0.88,
      map: this.map,
      props: this.props,
      enemies: this.enemies,
      trainingDummies: this.trainingDummies
    })?.target ?? null;
    const shotCount = 1 + relicExtraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread = shotCount === 1 ? 0 : s === 0 ? -0.1 : 0.1;
      const ang = p.aimAngle + spread;
      const isRelicTwinShot = s >= 1;
      const shotDmg = Math.max(1, Math.round(baseDmg * (isRelicTwinShot ? 0.35 : 1)));
      const spawned = this.spawnProjectile({
        ownerType: "player",
        ownerId: p.id,
        style: "arrow",
        damageCategory: category,
        x: p.x + Math.cos(ang) * 16,
        y: p.y + Math.sin(ang) * 16,
        vx: Math.cos(ang) * 470 * chargeSpeedRatio,
        vy: Math.sin(ang) * 470 * chargeSpeedRatio,
        angle: ang,
        radius: chargeT >= 0.75 ? 8 : 6,
        damage: shotDmg,
        pierce: totalPierce,
        crit: hasCrit,
        ttlMs: Math.round(420 * (1 + chargeT * 0.25)),
        targetEnemyId: bestTarget?.id,
        originX: p.x,
        originY: p.y,
        weaponId: weaponDef.id
      });
      this.primaryAttackProjIds.add(spawned.id);
    }
    if (chargeT >= 0.85) {
      this.emitEvent("status", p.x, p.y - 26, "ECLIPSE FULL DRAW!", "#FBBF24");
    }
  }
  firePrimaryAttack(p) {
    const def = HERO_CLASSES[p.heroClass];
    const weaponDef = resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
    const weaponMods = weaponDef?.modifiers || {};
    if (weaponMods.chargeToFire) {
      this.fireEclipseChargedShot(p, 0);
      return;
    }
    this.advancePlayerComboStep(p);
    const activePassive = this.getActivePassive(p);
    if (activePassive === "sacred_retribution" && (p.clericSanctity || 0) >= ARMAMENT_TUNING.passives.sacredRetribution.cap) {
      p.clericSanctity = 0;
      this.triggerSacredRetributionShockwave(p);
    }
    const combatProfile = resolveWeaponCombatProfile(p.heroClass, weaponDef, p);
    const category = combatProfile.damageCategory;
    let mult = this.computeDamageMult(p, category, { isPrimaryAttack: true, weaponDef });
    if (weaponMods.activeRiftBonusPct && this.zones.some((z) => z.kind === "star_rift" && z.ownerId === p.id && z.ttlMs > 0)) {
      mult *= 1 + weaponMods.activeRiftBonusPct;
    }
    const critChance = this.getPlayerCritChance(p, weaponMods);
    const hasCrit = Math.random() < critChance;
    const critMult = hasCrit ? computePlayerCritMultiplier(p, weaponMods) : 1;
    const dmg = Math.max(1, Math.round(def.damage * mult * critMult));
    const relicExtraCount = p.relics.includes("twinstring_charm") ? 1 : 0;
    const totalPierce = computePlayerPierceCount(p, weaponMods);
    const projSpeedMult = weaponMods.projectileSpeedMult ?? 1;
    const rangeBonusPx = weaponMods.rangeBonusPx || 0;
    if (weaponMods.heavySlamAoe) {
      const sbCfg = ARMAMENT_TUNING.weapons.stormbreaker;
      const slamOffset = sbCfg.slamForwardOffsetPx + Math.min(18, rangeBonusPx);
      const slamPos = { x: p.x, y: p.y };
      this.moveWithCollision(
        slamPos,
        Math.cos(p.aimAngle) * slamOffset,
        Math.sin(p.aimAngle) * slamOffset,
        10
      );
      const slamRadius = sbCfg.slamRadiusPx;
      const slamDmg = Math.max(1, Math.round(dmg * sbCfg.slamDamageRatio));
      this.zones.push({
        id: this.nextId("zone"),
        kind: "stormbreaker_slam",
        x: slamPos.x,
        y: slamPos.y,
        radius: slamRadius,
        angle: p.aimAngle,
        ttlMs: sbCfg.slamZoneTtlMs,
        maxTtlMs: sbCfg.slamZoneTtlMs,
        ownerId: p.id
      });
      const hitIds = /* @__PURE__ */ new Set();
      for (const prop of this.props) {
        if (!prop.opened && prop.kind === "crate") {
          if (Math.hypot(prop.x - slamPos.x, prop.y - slamPos.y) <= slamRadius + 18) {
            prop.opened = true;
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            this.emitEvent("gold", prop.x, prop.y - 10, `+${prop.value}g`, "#F4D378");
          }
        }
      }
      const enemiesSnap = [...this.enemies];
      for (const enemy of enemiesSnap) {
        if (!enemy || enemy.hp <= 0 || hitIds.has(enemy.id) || !this.enemies.includes(enemy)) {
          continue;
        }
        if (Math.hypot(enemy.x - slamPos.x, enemy.y - slamPos.y) <= slamRadius + enemy.radius * 0.35) {
          hitIds.add(enemy.id);
          const dealt = this.damageEnemy(enemy, slamDmg, p, hasCrit, category, true);
          if (dealt > 0) this.onConfirmedPrimaryHit(p);
        }
      }
      for (const dummy of this.trainingDummies) {
        if (!dummy || hitIds.has(dummy.id)) continue;
        if (Math.hypot(dummy.x - slamPos.x, dummy.y - slamPos.y) <= slamRadius + 18) {
          hitIds.add(dummy.id);
          const dealt = this.damageDummy(dummy, slamDmg, p, hasCrit, true, category);
          if (dealt > 0) this.onConfirmedPrimaryHit(p);
        }
      }
      return;
    }
    if (weaponMods.sunforgedShockwave && p.shield > 0) {
      const sfCfg = ARMAMENT_TUNING.weapons.sunforged;
      const sfDmg = Math.max(1, Math.round(dmg * sfCfg.shockwaveDamageRatio));
      this.zones.push({
        id: this.nextId("zone"),
        kind: "sunforged_shockwave",
        x: p.x,
        y: p.y,
        angle: p.aimAngle,
        radius: sfCfg.shockwaveRangePx,
        coneHalfAngleRad: sfCfg.shockwaveHalfAngleRad,
        ttlMs: sfCfg.shockwaveZoneTtlMs,
        maxTtlMs: sfCfg.shockwaveZoneTtlMs,
        ownerId: p.id
      });
      const enemiesSnap = [...this.enemies];
      for (const enemy of enemiesSnap) {
        if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= sfCfg.shockwaveRangePx + enemy.radius * 0.35) {
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - p.aimAngle));
          if (diff <= sfCfg.shockwaveHalfAngleRad) {
            this.damageEnemy(enemy, sfDmg, p, false, category, false);
          }
        }
      }
      for (const dummy of this.trainingDummies) {
        const dx = dummy.x - p.x;
        const dy = dummy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= sfCfg.shockwaveRangePx + 18) {
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - p.aimAngle));
          if (diff <= sfCfg.shockwaveHalfAngleRad) {
            this.damageDummy(dummy, sfDmg, p, false, false, category);
          }
        }
      }
    }
    const maxSearchDist = getPrimaryAttackRange(p.heroClass) + rangeBonusPx;
    const bestTarget = findBestAutoTarget({
      playerX: p.x,
      playerY: p.y,
      maxRange: weaponMods.seekingRadiusPx ? Math.max(maxSearchDist, weaponMods.seekingRadiusPx) : maxSearchDist,
      preferredAngle: p.aimAngle,
      minDot: weaponMods.seekingRadiusPx ? 0.35 : 0.88,
      map: this.map,
      props: this.props,
      enemies: this.enemies,
      trainingDummies: this.trainingDummies
    })?.target ?? null;
    const shotCount = 1 + relicExtraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread = shotCount === 1 ? 0 : shotCount === 2 ? s === 0 ? -0.1 : 0.1 : (s - (shotCount - 1) / 2) * 0.14;
      const ang = p.aimAngle + spread;
      const isRelicTwinShot = s >= 1;
      const shotDmg = Math.max(1, Math.round(dmg * (isRelicTwinShot ? 0.35 : 1)));
      let spawned;
      if (p.heroClass === "vanguard") {
        const isHalberd = weaponDef?.id === "vanguard_crimson_halberd";
        const forwardReachOffset = isHalberd ? 30 : 22;
        const swingSpeed = isHalberd ? 145 : 60;
        const swingTtl = isHalberd ? 155 : 140;
        spawned = this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "slash",
          damageCategory: category,
          x: p.x + Math.cos(ang) * forwardReachOffset,
          y: p.y + Math.sin(ang) * forwardReachOffset,
          vx: Math.cos(ang) * swingSpeed,
          vy: Math.sin(ang) * swingSpeed,
          angle: ang,
          radius: 34 + rangeBonusPx,
          damage: shotDmg,
          pierce: totalPierce,
          crit: hasCrit,
          ttlMs: swingTtl,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id
        });
      } else if (p.heroClass === "ranger") {
        spawned = this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "arrow",
          damageCategory: category,
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 470 * projSpeedMult,
          vy: Math.sin(ang) * 470 * projSpeedMult,
          angle: ang,
          radius: 6,
          damage: shotDmg,
          pierce: totalPierce,
          crit: hasCrit,
          ttlMs: 420,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id
        });
      } else if (p.heroClass === "arcanist") {
        if (s === 0 && activePassive === "astral_resonance") {
          const pr = this.players.get(p.id);
          if (pr) {
            pr.starRiftAttackCount = (pr.starRiftAttackCount || 0) + 1;
            if (pr.starRiftAttackCount >= STAR_RIFT_REQUIRED_ATTACKS) {
              if ((p.starRiftCooldownMs || 0) <= 0) {
                const riftX = bestTarget ? bestTarget.x : p.x + Math.cos(ang) * 120;
                const riftY = bestTarget ? bestTarget.y : p.y + Math.sin(ang) * 120;
                this.zones.push({
                  id: this.nextId("zone"),
                  kind: "star_rift",
                  x: riftX,
                  y: riftY,
                  radius: 75,
                  ttlMs: 3e3,
                  maxTtlMs: 3e3,
                  ownerId: p.id
                });
                p.starRiftCooldownMs = STAR_RIFT_PROC_COOLDOWN_MS;
                this.emitEvent("status", riftX, riftY - 18, " Star Rift", "#C084FC");
              }
              pr.starRiftAttackCount = 0;
            }
          }
        }
        spawned = this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "arcane",
          damageCategory: category,
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 380 * projSpeedMult,
          vy: Math.sin(ang) * 380 * projSpeedMult,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: totalPierce,
          crit: hasCrit,
          ttlMs: 480,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id
        });
      } else {
        spawned = this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "radiant",
          damageCategory: category,
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 390 * projSpeedMult,
          vy: Math.sin(ang) * 390 * projSpeedMult,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: totalPierce,
          crit: hasCrit,
          ttlMs: 420,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id
        });
      }
      this.primaryAttackProjIds.add(spawned.id);
    }
  }
  spawnProjectile(spec) {
    const proj = {
      id: this.nextId("proj"),
      ...spec,
      pierce: spec.pierce ?? 1,
      hitEntityIds: spec.hitEntityIds ? [...spec.hitEntityIds] : [],
      chronoSuspendedMs: spec.chronoSuspendedMs ?? this.isPositionInChronoWell(spec.x, spec.y, spec.radius)
    };
    this.projectiles.push(proj);
    return proj;
  }
  getBossCombatProfile(floorNum) {
    if (floorNum === 1 || floorNum === 10) {
      return { archetype: "brawler", preferredMinDist: 44, preferredMaxDist: 92 };
    }
    if (floorNum === 4 || floorNum === 7 || floorNum === 9) {
      return { archetype: "skirmisher", preferredMinDist: 80, preferredMaxDist: 155 };
    }
    return { archetype: "caster", preferredMinDist: 135, preferredMaxDist: 220 };
  }
  isBossHazardPosition(x, y, extraRadius = 0) {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.ttlMs <= 0) continue;
      if (z.kind === "fireball_burn" || z.kind === "star_rift" || z.kind === "arcane_meteor") {
        if (Math.hypot(x - z.x, y - z.y) <= z.radius + extraRadius) {
          return true;
        }
      }
    }
    return false;
  }
  predictTargetPosition(target, leadSec, bossRoom) {
    const clampedLead = Math.max(0, Math.min(0.75, leadSec));
    const speed = Math.hypot(target.vx, target.vy);
    if (speed < 5 || clampedLead <= 0) {
      return { x: target.x, y: target.y };
    }
    const stepX = target.vx * clampedLead * 0.78;
    const stepY = target.vy * clampedLead * 0.78;
    const steps = 4;
    let px = target.x;
    let py = target.y;
    for (let s = 1; s <= steps; s++) {
      const nx = target.x + stepX * s / steps;
      const ny = target.y + stepY * s / steps;
      const tx = Math.floor(nx / TILE_SIZE);
      const ty = Math.floor(ny / TILE_SIZE);
      if (bossRoom) {
        if (tx < bossRoom.x + 1 || tx >= bossRoom.x + bossRoom.w - 1 || ty < bossRoom.y + 1 || ty >= bossRoom.y + bossRoom.h - 1) {
          break;
        }
      }
      if (this.isWallAtWorld(nx, ny)) break;
      px = nx;
      py = ny;
    }
    return { x: px, y: py };
  }
  selectBossTarget(boss, fallbackNearest, bossRoom) {
    const meta = this.getEnemyMeta(boss);
    const candidates = [];
    for (const pr of this.players.values()) {
      const st = pr.state;
      if (st.downed || !st.connected) continue;
      const dist = Math.hypot(st.x - boss.x, st.y - boss.y);
      const pRoom = this.findRoomContaining(st.x, st.y);
      if (dist <= 460 || bossRoom && pRoom && pRoom.id === bossRoom.id) {
        candidates.push(st);
      }
    }
    if (candidates.length <= 1) {
      const single = candidates[0] || fallbackNearest;
      meta.bossTargetId = single.id;
      return single;
    }
    const currentTarget = candidates.find((c) => c.id === meta.bossTargetId);
    const currentInLos = currentTarget ? this.hasLineOfSight(boss.x, boss.y, currentTarget.x, currentTarget.y) : false;
    const canSwitchFreely = !currentTarget || !currentInLos || this.simTimeMs - meta.bossTargetSwitchAtMs >= 2400;
    if (!canSwitchFreely && currentTarget) {
      return currentTarget;
    }
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - boss.x, c.y - boss.y);
      const los = this.hasLineOfSight(boss.x, boss.y, c.x, c.y);
      const hpMissing = 1 - c.hp / Math.max(1, c.maxHp);
      let score = 100 - d * 0.16;
      if (los) score += 35;
      score += hpMissing * 48;
      if (c.disintegrationState?.active || c.spellCastState) score += 32;
      if (c.heroClass === "cleric" || c.heroClass === "arcanist") score += 12;
      if (c.statuses?.some((s) => s.type === "impaled" || s.type === "guard_broken" || s.type === "frostbite")) {
        score += 18;
      }
      if (c.id === meta.bossTargetId && this.simTimeMs - meta.bossTargetSwitchAtMs >= 2400) {
        score -= 32;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best.id !== meta.bossTargetId) {
      meta.bossTargetSwitchAtMs = this.simTimeMs;
    }
    meta.bossTargetId = best.id;
    return best;
  }
  computeSmartBossMove(boss, target, bossRoom, archetype, preferredMinDist, preferredMaxDist, meta, spd, dtSec) {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const targetDist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const hasLoS = this.hasLineOfSight(boss.x, boss.y, target.x, target.y);
    if (this.simTimeMs >= meta.bossStrafeFlipAtMs) {
      meta.bossStrafeDir = meta.bossStrafeDir >= 0 ? -1 : 1;
      meta.bossStrafeFlipAtMs = this.simTimeMs + 1900 + Math.floor(Math.random() * 900);
    }
    let vxDes = 0;
    let vyDes = 0;
    let shouldMove = false;
    if (!hasLoS || targetDist > preferredMaxDist) {
      vxDes += Math.cos(angle);
      vyDes += Math.sin(angle);
      if (archetype !== "brawler") {
        const perp = angle + meta.bossStrafeDir * (Math.PI / 2);
        vxDes += Math.cos(perp) * 0.35;
        vyDes += Math.sin(perp) * 0.35;
      }
      shouldMove = true;
    } else if (targetDist < preferredMinDist && archetype !== "brawler") {
      const away = angle + Math.PI;
      const strafe = angle + meta.bossStrafeDir * (Math.PI / 2);
      vxDes += Math.cos(away) * 0.78 + Math.cos(strafe) * 0.62;
      vyDes += Math.sin(away) * 0.78 + Math.sin(strafe) * 0.62;
      shouldMove = true;
    } else if (archetype !== "brawler" || targetDist > 52) {
      const orbitAngle = angle + meta.bossStrafeDir * (Math.PI * 0.46);
      const orbitWeight = archetype === "brawler" ? 0.55 : 0.9;
      vxDes += Math.cos(orbitAngle) * orbitWeight;
      vyDes += Math.sin(orbitAngle) * orbitWeight;
      shouldMove = true;
    }
    let escapeX = 0;
    let escapeY = 0;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.ttlMs <= 0) continue;
      if (z.kind === "fireball_burn" || z.kind === "star_rift" || z.kind === "arcane_meteor") {
        const zd = Math.hypot(boss.x - z.x, boss.y - z.y);
        const dangerR = z.radius + boss.radius + 10;
        if (zd < dangerR) {
          const awayAng = zd > 2 ? Math.atan2(boss.y - z.y, boss.x - z.x) : angle + Math.PI;
          const urgency = 1.45 * (1 - zd / dangerR) + 0.65;
          escapeX += Math.cos(awayAng) * urgency;
          escapeY += Math.sin(awayAng) * urgency;
          shouldMove = true;
        }
      }
    }
    vxDes += escapeX;
    vyDes += escapeY;
    if (!shouldMove || Math.hypot(vxDes, vyDes) < 0.08) {
      boss.vx = 0;
      boss.vy = 0;
      return;
    }
    const desiredAngle = Math.atan2(vyDes, vxDes);
    const whiskerOffsets = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, Math.PI];
    const probeShort = boss.radius + 10;
    const probeFar = boss.radius + 26;
    let bestAngle = desiredAngle;
    let bestScore = -Infinity;
    for (const off of whiskerOffsets) {
      const cand = desiredAngle + off;
      const cx1 = boss.x + Math.cos(cand) * probeShort;
      const cy1 = boss.y + Math.sin(cand) * probeShort;
      const cx2 = boss.x + Math.cos(cand) * probeFar;
      const cy2 = boss.y + Math.sin(cand) * probeFar;
      if (this.collidesCircle(cx1, cy1, boss.radius - 2)) continue;
      if (bossRoom) {
        const tx2 = Math.floor(cx2 / TILE_SIZE);
        const ty2 = Math.floor(cy2 / TILE_SIZE);
        if (tx2 < bossRoom.x + 1 || tx2 >= bossRoom.x + bossRoom.w - 1 || ty2 < bossRoom.y + 1 || ty2 >= bossRoom.y + bossRoom.h - 1) {
          continue;
        }
      }
      let candScore = Math.cos(off) * 100;
      if (this.collidesCircle(cx2, cy2, boss.radius - 2)) candScore -= 45;
      if (this.isBossHazardPosition(cx1, cy1, boss.radius * 0.5)) candScore -= 85;
      if (this.hasLineOfSight(cx1, cy1, target.x, target.y)) candScore += 20;
      if (candScore > bestScore) {
        bestScore = candScore;
        bestAngle = cand;
      }
    }
    const moveSpeedFactor = archetype === "brawler" && targetDist < preferredMaxDist && escapeX === 0 && escapeY === 0 ? 0.65 : 1;
    boss.vx = Math.cos(bestAngle) * spd * moveSpeedFactor;
    boss.vy = Math.sin(bestAngle) * spd * moveSpeedFactor;
    const startX = boss.x;
    const startY = boss.y;
    this.moveWithCollision(boss, boss.vx * dtSec, boss.vy * dtSec, 22);
    const actualMoved = Math.hypot(boss.x - startX, boss.y - startY);
    const expectedMove = Math.hypot(boss.vx * dtSec, boss.vy * dtSec);
    if (expectedMove > 0.5 && actualMoved < expectedMove * 0.25) {
      meta.bossStrafeDir = meta.bossStrafeDir >= 0 ? -1 : 1;
    }
  }
  pickSmartBossAbility(floorNum, available, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard) {
    const ready = available.filter(
      (idx) => (meta.bossAbilityCooldowns[idx] ?? 0) <= this.simTimeMs
    );
    const pool = ready.length > 0 ? ready : available;
    if (pool.length === 1) {
      meta.lastBossAbility = pool[0];
      return pool[0];
    }
    const hpRatio = boss.hp / Math.max(1, boss.maxHp);
    const playersNear160 = activePlayers.filter(
      (p) => Math.hypot(p.state.x - boss.x, p.state.y - boss.y) <= 160
    ).length;
    const playersNear95 = activePlayers.filter(
      (p) => Math.hypot(p.state.x - boss.x, p.state.y - boss.y) <= 95
    ).length;
    const targetMovingFast = Math.hypot(target.vx, target.vy) > 65;
    const targetChanneling = Boolean(target.disintegrationState?.active || target.spellCastState);
    const underHeavyFocus = meta.bossRecentDmgTaken > boss.maxHp * 0.05 && this.simTimeMs - meta.bossRecentDmgAtMs <= 2200;
    let bestChoice = pool[0];
    let bestScore = -Infinity;
    for (const idx of pool) {
      let score = 50 + Math.random() * 12;
      if (idx === meta.lastBossAbility) score -= 24;
      if (floorNum === 1) {
        if (idx === 0) {
          score += underHeavyFocus ? 36 : 0;
          score += playersNear95 >= 1 ? 18 : -12;
          if (hpRatio < 0.7) score += 12;
        } else if (idx === 1) {
          score += hasLoS && targetDist <= 220 ? 28 : -18;
        } else if (idx === 2) {
          score += targetDist <= 170 ? 26 : -10;
          if (targetChanneling || !hasLoS) score += 22;
        } else if (idx === 3) {
          const chargeClear = this.hasLineOfSight(boss.x, boss.y, target.x, target.y);
          score += targetDist >= 145 && chargeClear ? 46 : -30;
        }
      } else if (floorNum === 2) {
        if (idx === 0) {
          score += targetChanneling || !hasLoS ? 32 : 14;
          if (activePlayers.length >= 2) score += 16;
        } else if (idx === 1) {
          score += targetDist <= 160 ? 34 : -24;
          if (hpRatio < 0.8 && targetDist <= 160) score += 26;
        } else if (idx === 2) {
          score += hasLoS && targetDist >= 110 ? 30 : -15;
        } else if (idx === 3) {
          score += playersNear160 >= 2 || targetDist <= 135 ? 30 : 8;
        }
      } else if (floorNum === 3) {
        if (idx === 0) {
          score += targetDist > 130 || !hasLoS ? 28 : 10;
        } else if (idx === 1) {
          score += hasLoS && targetDist <= 260 ? 32 : -20;
        } else if (idx === 2) {
          score += playersNear160 >= 1 ? 26 : 6;
        } else if (idx === 3) {
          score += targetChanneling || targetDist <= 185 ? 36 : 14;
        }
      } else if (floorNum === 4) {
        if (idx === 0) {
          score += targetDist >= 115 || activePlayers.length >= 2 ? 34 : 8;
        } else if (idx === 1) {
          score += hasLoS && targetDist <= 210 ? 28 : -16;
        } else if (idx === 2) {
          score += standingInHazard || !hasLoS || targetDist > 175 ? 48 : targetDist < 75 ? 24 : -12;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 28 : -8;
        }
      } else if (floorNum === 5) {
        if (idx === 0) {
          score += playersNear160 >= 1 ? 42 : -45;
        } else if (idx === 1) {
          score += targetDist > 125 || !hasLoS ? 32 : 12;
        } else if (idx === 2) {
          score += hasLoS && targetDist >= 105 ? 30 : -15;
        } else if (idx === 3) {
          score += playersNear160 >= 2 || targetMovingFast ? 24 : 8;
        }
      } else if (floorNum === 6) {
        if (idx === 0) {
          score += hasLoS && targetDist <= 290 ? 30 : -18;
        } else if (idx === 1) {
          score += !hasLoS || targetDist > 210 || targetChanneling ? 34 : 16;
        } else if (idx === 2) {
          score += hasLoS && targetDist <= 310 ? 30 : -16;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 30 : 6;
        }
      } else if (floorNum === 7) {
        if (idx === 0) {
          score += playersNear160 >= 1 ? 28 : -18;
        } else if (idx === 1) {
          score += targetDist <= 155 ? 44 : -42;
        } else if (idx === 2) {
          score += targetDist >= 85 && targetDist <= 190 ? 28 : -8;
        } else if (idx === 3) {
          score += hasLoS && (targetDist > 130 || underHeavyFocus) ? 38 : -10;
        }
      } else if (floorNum === 8) {
        if (idx === 0) {
          score += hasLoS && targetDist <= 260 ? 30 : -12;
        } else if (idx === 1) {
          score += hasLoS && targetDist >= 80 && targetDist <= 230 ? 28 : -10;
        } else if (idx === 2) {
          score += target.heroClass === "arcanist" || target.heroClass === "cleric" || targetChanneling || !hasLoS ? 42 : 18;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 28 : -10;
        }
      } else if (floorNum === 9) {
        if (idx === 0) {
          score += hasLoS && targetDist <= 340 ? 32 : -22;
        } else if (idx === 1) {
          score += !hasLoS || targetMovingFast || targetDist > 160 ? 36 : 16;
        } else if (idx === 2) {
          score += hasLoS && targetDist <= 280 ? 30 : -18;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 36 : -30;
        }
      } else {
        if (idx === 0) {
          score += targetDist <= 215 ? 36 : -26;
        } else if (idx === 1) {
          score += underHeavyFocus ? 46 : playersNear160 >= 1 ? 16 : -20;
        } else if (idx === 2) {
          score += hasLoS && targetDist <= 180 ? 34 : -22;
        } else if (idx === 3) {
          score += playersNear160 >= 1 || targetDist <= 185 ? 32 : -24;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestChoice = idx;
      }
    }
    meta.lastBossAbility = bestChoice;
    return bestChoice;
  }
  updateBossAi(boss, bossRoom, fallbackNearest, dtMs, dtSec, slowFactor) {
    const meta = this.getEnemyMeta(boss);
    const hpRatio = boss.hp / Math.max(1, boss.maxHp);
    if (this.simTimeMs - meta.bossRecentDmgAtMs > 2500) {
      meta.bossRecentDmgTaken = 0;
    }
    if (!boss.enraged && hpRatio <= 0.5) {
      boss.enraged = true;
      this.emitEvent("crit", boss.x, boss.y - boss.radius - 24, "ENRAGED!", "#EF4444");
      this.pushSystemChat(`${boss.name} has entered an ENRAGED frenzy! Pressure intensifying!`);
    }
    const floorNum = this.floor;
    const isCatacombs = this.map.biome === "catacombs" || floorNum === 2;
    const isEmber = this.map.biome === "ember" || floorNum === 3;
    const isVoid = this.map.biome === "void" || floorNum === 4;
    const isAstral = this.map.biome === "astral" || floorNum === 5;
    const isHymns = this.map.biome === "hymns" || floorNum === 6;
    const isReliquary = this.map.biome === "reliquary" || floorNum === 7;
    const isScripture = this.map.biome === "scripture" || floorNum === 8;
    const isNave = this.map.biome === "nave" || floorNum === 9;
    const isWardenGate = this.map.biome === "wardengate" || floorNum === 10;
    const effectiveFloor = isCatacombs ? 2 : isEmber ? 3 : isVoid ? 4 : isAstral ? 5 : isHymns ? 6 : isReliquary ? 7 : isScripture ? 8 : isNave ? 9 : isWardenGate ? 10 : floorNum;
    let nextPhase = meta.bossPhase || 1;
    if (effectiveFloor === 1) {
      nextPhase = hpRatio <= 0.5 ? 2 : 1;
    } else if (effectiveFloor === 2) {
      nextPhase = hpRatio <= 0.4 ? 3 : hpRatio <= 0.75 ? 2 : 1;
    } else if (effectiveFloor === 3) {
      nextPhase = hpRatio <= 0.55 ? 2 : 1;
    } else if (effectiveFloor === 4) {
      nextPhase = hpRatio <= 0.35 ? 3 : hpRatio <= 0.65 ? 2 : 1;
    } else if (effectiveFloor === 5) {
      nextPhase = hpRatio <= 0.6 ? 2 : 1;
    } else if (effectiveFloor === 6) {
      nextPhase = hpRatio <= 0.35 ? 3 : hpRatio <= 0.65 ? 2 : 1;
    } else if (effectiveFloor === 7) {
      nextPhase = hpRatio <= 0.55 ? 2 : 1;
    } else if (effectiveFloor === 8) {
      nextPhase = hpRatio <= 0.35 ? 3 : hpRatio <= 0.7 ? 2 : 1;
    } else if (effectiveFloor === 9) {
      nextPhase = hpRatio <= 0.55 ? 2 : 1;
    } else if (effectiveFloor === 10) {
      nextPhase = hpRatio <= 0.4 ? 3 : hpRatio <= 0.7 ? 2 : 1;
    }
    if (nextPhase > meta.bossPhase) {
      meta.bossPhase = nextPhase;
      this.emitEvent("status", boss.x, boss.y - boss.radius - 28, `PHASE ${nextPhase}!`, "#FBBF24");
      this.pushSystemChat(`${boss.name} shifts to Phase ${nextPhase}!`);
    }
    const curWave = boss.summonWave || 0;
    const canSummonSafely = !boss.charging && !this.zones.some(
      (z) => z.ownerId === boss.id && z.ttlMs <= 500 && (z.kind === "warden_edict" || z.kind === "supernova" || z.kind === "censer_sweep")
    );
    if (canSummonSafely) {
      if (effectiveFloor === 2) {
        if (hpRatio <= 0.75 && curWave < 1) {
          boss.summonWave = 1;
          this.summonBossAdds(boss, bossRoom, ["cultist", "skeleton"], 0.7, 2);
        } else if (hpRatio <= 0.4 && curWave < 2) {
          boss.summonWave = 2;
          this.summonBossAdds(boss, bossRoom, ["cultist", "skeleton"], 0.7, 2);
        }
      } else if (effectiveFloor === 3 && hpRatio <= 0.55 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ["knight", "cultist"], 0.65, 2);
      } else if (effectiveFloor === 4 && hpRatio <= 0.55 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ["shadow_stalker", "shadow_stalker"], 0.6, 2);
      } else if (effectiveFloor === 5 && hpRatio <= 0.5 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ["astral_sentinel"], 0.7, 1);
      } else if (effectiveFloor === 7 && hpRatio <= 0.45 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ["relic_golem"], 0.75, 1);
      } else if (effectiveFloor === 8 && hpRatio <= 0.55 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ["veiled_heretic", "veiled_heretic"], 0.6, 2);
      }
    }
    const target = this.selectBossTarget(boss, fallbackNearest, bossRoom);
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const targetDist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const isEnraged = Boolean(boss.enraged);
    const baseSpd = isEnraged ? 142 : 110;
    const spd = baseSpd * slowFactor;
    if (boss.charging) {
      if ((boss.chargeWindupMs || 0) > 0) {
        boss.state = "windup";
        boss.chargeWindupMs = Math.max(0, (boss.chargeWindupMs || 0) - dtMs);
        if (boss.chargeWindupMs > 260) {
          const leadPt = this.predictTargetPosition(target, 0.35, bossRoom);
          boss.chargeAngle = Math.atan2(leadPt.y - boss.y, leadPt.x - boss.x);
        }
        boss.vx = 0;
        boss.vy = 0;
        return;
      }
      boss.state = "charge";
      boss.chargeTimerMs = (boss.chargeTimerMs || 0) - dtMs;
      const chargeSpd = 295 * slowFactor;
      const cAngle = boss.chargeAngle ?? angle;
      boss.vx = Math.cos(cAngle) * chargeSpd;
      boss.vy = Math.sin(cAngle) * chargeSpd;
      const preX = boss.x;
      const preY = boss.y;
      this.moveWithCollision(
        boss,
        boss.vx * dtSec,
        boss.vy * dtSec,
        24
      );
      for (const pr of this.players.values()) {
        if (!pr.state.downed && !meta.chargeHitPlayerIds.has(pr.state.id) && Math.hypot(pr.state.x - boss.x, pr.state.y - boss.y) <= boss.radius + 16) {
          meta.chargeHitPlayerIds.add(pr.state.id);
          this.damagePlayer(pr.state, 20 + floorNum * 4, "physical");
          this.applyPlayerStatus(pr.state, "guard_broken", 4e3);
        }
      }
      const chargeMoved = Math.hypot(boss.x - preX, boss.y - preY);
      if ((boss.chargeTimerMs || 0) <= 0 || chargeMoved < 0.8 && dtSec > 0.01) {
        this.clearEnemyChargeState(boss);
        boss.state = "recover";
        boss.vx = 0;
        boss.vy = 0;
        boss.windupMs = isEnraged ? 750 : 950;
      }
      return;
    }
    const profile = this.getBossCombatProfile(effectiveFloor);
    this.computeSmartBossMove(
      boss,
      target,
      bossRoom,
      profile.archetype,
      profile.preferredMinDist,
      profile.preferredMaxDist,
      meta,
      spd,
      dtSec
    );
    if (boss.windupMs > 0) return;
    if (boss.silencedMs > 0) {
      if (targetDist <= boss.radius + 26) {
        const baseHit = 18 + floorNum * 2;
        this.damagePlayer(target, this.computeEnemyDamage(baseHit, boss), "physical");
        this.emitEvent("status", boss.x, boss.y - boss.radius - 16, "[SILENCED]", "#C084FC");
        boss.windupMs = isEnraged ? 800 : 1150;
      } else {
        boss.windupMs = 600;
      }
      return;
    }
    const activePlayers = Array.from(this.players.values()).filter((p) => !p.state.downed && p.state.connected);
    const hasLoS = this.hasLineOfSight(boss.x, boss.y, target.x, target.y);
    const standingInHazard = this.isBossHazardPosition(boss.x, boss.y, boss.radius * 0.4);
    const leadPos = this.predictTargetPosition(target, Math.min(0.65, targetDist / 420), bossRoom);
    const leadAngle = Math.atan2(leadPos.y - boss.y, leadPos.x - boss.x);
    if (effectiveFloor === 1) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        boss.shieldWallMs = 2400;
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 6e3;
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " SHIELD WALL!", "#60A5FA");
        for (let off = -0.3; off <= 0.3; off += 0.3) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "slash",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 230,
            vy: Math.sin(a) * 230,
            angle: a,
            radius: 9,
            damage: 18,
            pierce: 1,
            ttlMs: 1400
          });
        }
        boss.windupMs = isEnraged ? 900 : 1250;
      } else if (ability === 1) {
        for (let off = -0.28; off <= 0.28; off += 0.28) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "slash",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 255,
            vy: Math.sin(a) * 255,
            angle: a,
            radius: 10,
            damage: 22,
            pierce: 1,
            ttlMs: 1600
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " CLEAVE!", "#EF4444");
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        const slamPt = this.predictTargetPosition(target, 0.55, bossRoom);
        this.zones.push({
          id: this.nextId("zone"),
          kind: "boss_slam",
          x: slamPt.x,
          y: slamPt.y,
          radius: 84,
          ttlMs: isEnraged ? 800 : 950,
          maxTtlMs: isEnraged ? 800 : 950,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " GROUND SLAM!", "#F59E0B");
        boss.windupMs = isEnraged ? 850 : 1150;
      } else {
        const chargePt = this.predictTargetPosition(target, 0.45, bossRoom);
        boss.charging = true;
        boss.chargeAngle = Math.atan2(chargePt.y - boss.y, chargePt.x - boss.x);
        boss.chargeWindupMs = 550;
        boss.chargeTimerMs = 560;
        boss.state = "windup";
        boss.vx = 0;
        boss.vy = 0;
        meta.chargeHitPlayerIds.clear();
        meta.bossAbilityCooldowns[3] = this.simTimeMs + 3400;
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, "WAR CHARGE!", "#F59E0B");
        boss.windupMs = 0;
      }
    } else if (effectiveFloor === 2) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 2, 3];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let k = 0; k < 3; k++) {
          const targetState = activePlayers[k % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.55, bossRoom);
          const offsetX = k === 0 ? 0 : k === 1 ? -75 : 75;
          const offsetY = k === 0 ? 0 : k === 1 ? 55 : -55;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "frost_nova",
            x: pred.x + offsetX,
            y: pred.y + offsetY,
            radius: 70,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " FROST NOVA!", "#38BDF8");
        boss.windupMs = isEnraged ? 850 : 1150;
      } else if (ability === 1) {
        meta.bossAbilityCooldowns[1] = this.simTimeMs + 4200;
        if (targetDist <= 165) {
          this.damagePlayer(target, 20 + floorNum * 2, "elemental");
          boss.hp = Math.min(boss.maxHp, boss.hp + 40);
          this.emitEvent("status", target.x, target.y - 14, "SOUL SIPHONED!", "#A855F7");
          this.emitEvent("heal", boss.x, boss.y - boss.radius - 16, "+40", "#34D399");
        } else {
          for (let k = -1; k <= 1; k++) {
            const a = leadAngle + k * 0.22;
            this.spawnProjectile({
              ownerType: "enemy",
              ownerId: boss.id,
              style: "voidorb",
              x: boss.x,
              y: boss.y,
              vx: Math.cos(a) * 225,
              vy: Math.sin(a) * 225,
              angle: a,
              radius: 8,
              damage: 18 + floorNum * 2,
              pierce: 1,
              ttlMs: 1900
            });
          }
          this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " SIPHON VOLLEY!", "#A855F7");
        }
        boss.windupMs = isEnraged ? 800 : 1050;
      } else if (ability === 2) {
        for (let k = 0; k < 5; k++) {
          const a = leadAngle + (k - 2) * 0.24;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "voidorb",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 235,
            vy: Math.sin(a) * 235,
            angle: a,
            radius: 8,
            damage: 22,
            pierce: 1,
            ttlMs: 2200,
            statusOnHit: "frostbite",
            statusDurationMs: 4e3
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " SOUL HAIL!", "#A855F7");
        boss.windupMs = isEnraged ? 800 : 1050;
      } else {
        const count = meta.bossPhase >= 3 || isEnraged ? 14 : 11;
        for (let k = 0; k < count; k++) {
          const a = k * Math.PI * 2 / count;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "voidorb",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 225,
            vy: Math.sin(a) * 225,
            angle: a,
            radius: 7,
            damage: 20,
            pierce: 1,
            ttlMs: 2e3
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " DEATH RING!", "#A855F7");
        boss.windupMs = isEnraged ? 850 : 1200;
      }
    } else if (effectiveFloor === 3) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let k = 0; k < 3; k++) {
          const targetState = activePlayers[k % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.55, bossRoom);
          const sepAngle = k * Math.PI * 2 / 3;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "magma_pillar",
            x: pred.x + (k === 0 ? 0 : Math.cos(sepAngle) * 78),
            y: pred.y + (k === 0 ? 0 : Math.sin(sepAngle) * 78),
            radius: 80,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " MAGMA ERUPTION!", "#EF4444");
        boss.windupMs = isEnraged ? 850 : 1150;
      } else if (ability === 1) {
        for (let off = -0.36; off <= 0.36; off += 0.18) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "fireball",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 255,
            vy: Math.sin(a) * 255,
            angle: a,
            radius: 9,
            damage: 24,
            pierce: 1,
            ttlMs: 1800,
            statusOnHit: "scorched",
            statusDurationMs: 4e3
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " FISSURE WAVE!", "#F97316");
        boss.windupMs = isEnraged ? 750 : 1e3;
      } else if (ability === 2) {
        const count = isEnraged ? 16 : 12;
        const rot = Math.random() * Math.PI;
        for (let k = 0; k < count; k++) {
          const a = rot + k * Math.PI * 2 / count;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "fireball",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 265,
            vy: Math.sin(a) * 265,
            angle: a,
            radius: 9,
            damage: 25,
            pierce: 1,
            ttlMs: 2400
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " CINDER SPIRAL!", "#F59E0B");
        boss.windupMs = isEnraged ? 800 : 1150;
      } else {
        meta.bossAbilityCooldowns[3] = this.simTimeMs + 3500;
        const detPt = this.predictTargetPosition(target, 0.6, bossRoom);
        this.zones.push({
          id: this.nextId("zone"),
          kind: "magma_pillar",
          x: detPt.x,
          y: detPt.y,
          radius: 105,
          ttlMs: isEnraged ? 850 : 1050,
          maxTtlMs: isEnraged ? 850 : 1050,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " CORE DETONATION!", "#EF4444");
        boss.windupMs = isEnraged ? 850 : 1100;
      }
    } else if (effectiveFloor === 4) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [1, 3];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 3500;
        const singPt = this.predictTargetPosition(target, 0.45, bossRoom);
        this.zones.push({
          id: this.nextId("zone"),
          kind: "singularity",
          x: singPt.x,
          y: singPt.y,
          radius: 112,
          ttlMs: 1800,
          maxTtlMs: 1800,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " SINGULARITY!", "#A855F7");
        boss.windupMs = isEnraged ? 900 : 1250;
      } else if (ability === 1) {
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI * 2 / 6 + leadAngle;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "voidorb",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 305,
            vy: Math.sin(a) * 305,
            angle: a,
            radius: 8,
            damage: 26,
            pierce: 1,
            ttlMs: 1800
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " TENDRIL FLURRY!", "#C084FC");
        boss.windupMs = isEnraged ? 750 : 1e3;
      } else if (ability === 2) {
        meta.bossAbilityCooldowns[2] = this.simTimeMs + 3500;
        let stepped = false;
        const flankBaseTheta = (target.aimAngle ?? angle) + Math.PI;
        const candidateOffsets = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.2, -2.2, Math.PI];
        for (const dist of [115, 95, 145]) {
          for (const off of candidateOffsets) {
            const theta = flankBaseTheta + off;
            const cx = target.x + Math.cos(theta) * dist;
            const cy = target.y + Math.sin(theta) * dist;
            const tx = Math.floor(cx / TILE_SIZE);
            const ty = Math.floor(cy / TILE_SIZE);
            const inRoom = bossRoom ? tx >= bossRoom.x + 1 && tx < bossRoom.x + bossRoom.w - 1 && ty >= bossRoom.y + 1 && ty < bossRoom.y + bossRoom.h - 1 : true;
            if (!inRoom || this.collidesCircle(cx, cy, boss.radius)) continue;
            if (this.isBossHazardPosition(cx, cy, boss.radius)) continue;
            if (!this.hasLineOfSight(cx, cy, target.x, target.y)) continue;
            const farFromPlayers = activePlayers.every((p) => Math.hypot(cx - p.state.x, cy - p.state.y) >= 65);
            if (farFromPlayers) {
              boss.x = cx;
              boss.y = cy;
              stepped = true;
              break;
            }
          }
          if (stepped) break;
        }
        const postStepPred = this.predictTargetPosition(target, 0.35, bossRoom);
        const newAngle = Math.atan2(postStepPred.y - boss.y, postStepPred.x - boss.x);
        for (let off = -0.4; off <= 0.4; off += 0.2) {
          const a = newAngle + off;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "voidorb",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 285,
            vy: Math.sin(a) * 285,
            angle: a,
            radius: 8,
            damage: 29,
            pierce: 1,
            ttlMs: 1800
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, stepped ? " VOID STEP!" : " VOID SCYTHE!", "#E879F9");
        boss.windupMs = isEnraged ? 750 : 1e3;
      } else {
        const count = meta.bossPhase >= 3 || isEnraged ? 18 : 14;
        for (let k = 0; k < count; k++) {
          const a = k * Math.PI * 2 / count;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "voidorb",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 275,
            vy: Math.sin(a) * 275,
            angle: a,
            radius: 8,
            damage: 28,
            pierce: 1,
            ttlMs: 2200
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " ABYSSAL NOVA!", "#C084FC");
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 5) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 4500;
        this.zones.push({
          id: this.nextId("zone"),
          kind: "supernova",
          x: boss.x,
          y: boss.y,
          radius: 145,
          ttlMs: 1350,
          maxTtlMs: 1350,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " SUPERNOVA!", "#F472B6");
        boss.windupMs = isEnraged ? 900 : 1300;
      } else if (ability === 1) {
        for (let k = 0; k < 4; k++) {
          const targetState = activePlayers[k % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.5, bossRoom);
          const beamAngle = k * Math.PI / 2;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "starlight_beam",
            x: pred.x + (k === 0 ? 0 : Math.cos(beamAngle) * 48),
            y: pred.y + (k === 0 ? 0 : Math.sin(beamAngle) * 48),
            radius: 68,
            ttlMs: 900,
            maxTtlMs: 900,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " STARBEAM CASCADE!", "#38BDF8");
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        for (let k = -2; k <= 3; k++) {
          const a = leadAngle + k * 0.16;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "arcane",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 320,
            vy: Math.sin(a) * 320,
            angle: a,
            radius: 7,
            damage: 28,
            pierce: 1,
            ttlMs: 2e3,
            statusOnHit: "disoriented",
            statusDurationMs: 3e3
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " COSMIC VOLLEY!", "#818CF8");
        boss.windupMs = isEnraged ? 750 : 1e3;
      } else {
        const count = isEnraged ? 20 : 16;
        const rot = Math.random() * Math.PI;
        for (let k = 0; k < count; k++) {
          const a = rot + k * Math.PI * 2 / count;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "arcane",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 305,
            vy: Math.sin(a) * 305,
            angle: a,
            radius: 8,
            damage: 31,
            pierce: 1,
            ttlMs: 2400
          });
        }
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 6) {
      const avail = meta.bossPhase >= 3 ? [0, 1, 2, 3] : meta.bossPhase === 2 ? [0, 1, 2] : [0, 1];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let lane = -1; lane <= 1; lane++) {
          const perpX = Math.cos(leadAngle + Math.PI / 2) * (lane * 54);
          const perpY = Math.sin(leadAngle + Math.PI / 2) * (lane * 54);
          this.zones.push({
            id: this.nextId("zone"),
            kind: "sound_lane",
            x: boss.x + perpX,
            y: boss.y + perpY,
            width: 340,
            height: 36,
            angle: leadAngle,
            radius: 170,
            ttlMs: isEnraged ? 800 : 1e3,
            maxTtlMs: isEnraged ? 800 : 1e3,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " RESONANT CRESCENDO!", "#F59E0B");
        boss.windupMs = isEnraged ? 800 : 1150;
      } else if (ability === 1) {
        for (const pr of activePlayers) {
          const pred = this.predictTargetPosition(pr.state, 0.55, bossRoom);
          this.zones.push({
            id: this.nextId("zone"),
            kind: "lament_mark",
            x: pred.x,
            y: pred.y,
            radius: 64,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " LAMENT OF THE FORGOTTEN!", "#FEF08A");
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 2) {
        for (let c = -1; c <= 1; c++) {
          const echoAngle = leadAngle + c * 0.45;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "sound_lane",
            x: boss.x + Math.cos(echoAngle) * 80,
            y: boss.y + Math.sin(echoAngle) * 80,
            width: 380,
            height: 34,
            angle: echoAngle,
            radius: 190,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " DIVINE CHORUS BEAMS!", "#FBBF24");
        boss.windupMs = isEnraged ? 750 : 1050;
      } else {
        for (let lane = -2; lane <= 2; lane++) {
          const crAngle = lane * Math.PI / 5;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "sound_lane",
            x: boss.x,
            y: boss.y,
            width: 400,
            height: 32,
            angle: crAngle,
            radius: 200,
            ttlMs: isEnraged ? 950 : 1100,
            maxTtlMs: isEnraged ? 950 : 1100,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " CHORUS OF REMEMBRANCE!", "#FEF08A");
        boss.windupMs = isEnraged ? 850 : 1200;
      }
    } else if (effectiveFloor === 7) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 4200;
        for (let c = 0; c < 2; c++) {
          const offX = c === 0 ? -55 : 55;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "ashen_cloud",
            x: (c === 0 ? boss.x : leadPos.x) + offX,
            y: (c === 0 ? boss.y : leadPos.y) + (c === 0 ? -35 : 35),
            radius: 82,
            ttlMs: 3200,
            maxTtlMs: 3200,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " ASHEN PROCESSION!", "#D9AA52");
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 1) {
        this.zones.push({
          id: this.nextId("zone"),
          kind: "censer_sweep",
          x: boss.x,
          y: boss.y,
          angle: leadAngle,
          radius: 155,
          ttlMs: isEnraged ? 850 : 1050,
          maxTtlMs: isEnraged ? 850 : 1050,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " CHAIN OF THE DEPARTED!", "#F59E0B");
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        for (let m = 0; m < 3; m++) {
          const rAngle = leadAngle + (m - 1) * 0.65;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "lament_mark",
            x: boss.x + Math.cos(rAngle) * 115,
            y: boss.y + Math.sin(rAngle) * 115,
            radius: 68,
            ttlMs: 900,
            maxTtlMs: 900,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " RELIQUARY AWAKENING!", "#E2E8F0");
        boss.windupMs = isEnraged ? 750 : 1050;
      } else {
        if ((meta.bossAbilityCooldowns[99] ?? 0) <= this.simTimeMs) {
          boss.shieldWallMs = 1500;
          meta.bossAbilityCooldowns[99] = this.simTimeMs + 8e3;
          this.emitEvent("status", boss.x, boss.y - boss.radius - 30, " RELIQUARY AEGIS!", "#CBD5E1");
        }
        for (let off = -0.3; off <= 0.3; off += 0.3) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: "radiant",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 330,
            vy: Math.sin(a) * 330,
            angle: a,
            radius: 10,
            damage: 34,
            pierce: 2,
            ttlMs: 1800,
            statusOnHit: "ashen_curse",
            statusDurationMs: 4500
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " JUDGMENT OF THE DEPARTED!", "#FEF08A");
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 8) {
      const avail = meta.bossPhase >= 3 ? [0, 1, 2, 3] : meta.bossPhase === 2 ? [0, 1, 2] : [0, 1];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let line = -1; line <= 1; line++) {
          const gridAngle = line === 0 ? leadAngle : leadAngle + Math.PI / 2;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "scripture_line",
            x: boss.x,
            y: boss.y,
            width: 420,
            height: 26,
            angle: gridAngle,
            radius: 210,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " SCRIPTURE OF BINDING!", "#E879F9");
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 1) {
        for (let v = 1; v <= 4; v++) {
          const pageAngle = leadAngle + (v - 2.5) * 0.34;
          const dist = 65 + v * 36;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "lancefall_mark",
            x: boss.x + Math.cos(pageAngle) * dist,
            y: boss.y + Math.sin(pageAngle) * dist,
            radius: 60,
            seqNumber: v,
            ttlMs: 700 + v * 220,
            maxTtlMs: 700 + v * 220,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " FORBIDDEN VERSES!", "#A855F7");
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 2) {
        meta.bossAbilityCooldowns[2] = this.simTimeMs + 5e3;
        for (const pr of activePlayers) {
          const pred = this.predictTargetPosition(pr.state, 0.55, bossRoom);
          this.zones.push({
            id: this.nextId("zone"),
            kind: "silence_seal",
            x: pred.x,
            y: pred.y,
            radius: 72,
            ttlMs: isEnraged ? 950 : 1150,
            maxTtlMs: isEnraged ? 950 : 1150,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " SEAL OF SILENCE!", "#C084FC");
        boss.windupMs = isEnraged ? 850 : 1150;
      } else {
        const count = isEnraged ? 20 : 16;
        for (let k = 0; k < count; k++) {
          const a = k * Math.PI * 2 / count;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: boss.id,
            style: k % 2 === 0 ? "radiant" : "voidorb",
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 280,
            vy: Math.sin(a) * 280,
            angle: a,
            radius: 8,
            damage: 30,
            pierce: 1,
            ttlMs: 2200,
            statusOnHit: "silenced",
            statusDurationMs: 2600
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " HERETICAL VOLLEY!", "#F43F5E");
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 9) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        this.zones.push({
          id: this.nextId("zone"),
          kind: "lance_thrust",
          x: boss.x,
          y: boss.y,
          width: 380,
          height: 42,
          angle: leadAngle,
          radius: 190,
          ttlMs: isEnraged ? 750 : 900,
          maxTtlMs: isEnraged ? 750 : 900,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " HEAVEN'S PIERCING LINE!", "#FDE047");
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 1) {
        for (let l = 1; l <= 4; l++) {
          const targetState = activePlayers[(l - 1) % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.35 + l * 0.1, bossRoom);
          const offsetX = l === 1 ? -30 : l === 2 ? 30 : l === 3 ? -15 : 15;
          const offsetY = l === 1 ? -15 : l === 2 ? 15 : l === 3 ? 30 : -30;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "lancefall_mark",
            x: pred.x + offsetX,
            y: pred.y + offsetY,
            radius: 64,
            seqNumber: l,
            ttlMs: 700 + l * 250,
            maxTtlMs: 700 + l * 250,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " LANCEFALL SEQUENCE!", "#FBBF24");
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        for (let d = -1; d <= 1; d++) {
          const diveAngle = leadAngle + d * 0.35;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "lance_thrust",
            x: boss.x,
            y: boss.y,
            width: 320,
            height: 36,
            angle: diveAngle,
            radius: 160,
            ttlMs: 750 + Math.abs(d) * 200,
            maxTtlMs: 750 + Math.abs(d) * 200,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " AERIAL JUDGMENT!", "#38BDF8");
        boss.windupMs = isEnraged ? 750 : 1e3;
      } else {
        for (let l = 1; l <= 6; l++) {
          const spAngle = l * Math.PI * 2 / 6;
          const dist = 95;
          this.zones.push({
            id: this.nextId("zone"),
            kind: "lancefall_mark",
            x: boss.x + Math.cos(spAngle) * dist,
            y: boss.y + Math.sin(spAngle) * dist,
            radius: 64,
            seqNumber: l,
            ttlMs: 700 + l * 180,
            maxTtlMs: 700 + l * 180,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " SENTINEL SPEARFALL CASCADE!", "#FBBF24");
        boss.windupMs = isEnraged ? 800 : 1100;
      }
    } else if (effectiveFloor === 10 || isWardenGate) {
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [2, 3];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 4200;
        let tAng = Math.atan2(target.y - boss.y, target.x - boss.x);
        if (tAng < 0) tAng += Math.PI * 2;
        const playerQuad = Math.floor(tAng / (Math.PI / 2)) % 4;
        let safeQuad = (playerQuad + 2) % 4;
        for (let attempt = 0; attempt < 4; attempt++) {
          const q = (playerQuad + 2 + attempt) % 4;
          const midAng = (q + 0.5) * (Math.PI / 2);
          const checkX = boss.x + Math.cos(midAng) * 110;
          const checkY = boss.y + Math.sin(midAng) * 110;
          if (!this.isWallAtWorld(checkX, checkY)) {
            safeQuad = q;
            break;
          }
        }
        for (let q = 0; q < 4; q++) {
          if (q !== safeQuad) {
            this.zones.push({
              id: this.nextId("zone"),
              kind: "warden_edict",
              x: boss.x,
              y: boss.y,
              radius: 220,
              quadrant: q,
              ttlMs: isEnraged ? 1150 : 1400,
              maxTtlMs: isEnraged ? 1150 : 1400,
              ownerId: boss.id
            });
          }
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " WARDEN'S EDICT! FIND SAFE QUADRANT!", "#EF4444");
        boss.windupMs = isEnraged ? 900 : 1250;
      } else if (ability === 1) {
        meta.bossAbilityCooldowns[1] = this.simTimeMs + 7500;
        this.zones.push({
          id: this.nextId("zone"),
          kind: "warden_parry",
          x: boss.x,
          y: boss.y,
          radius: 65,
          ttlMs: 2100,
          maxTtlMs: 2100,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " UNBROKEN JUDGMENT! (AEGIS PARRY)", "#F59E0B");
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 2) {
        const stages = meta.bossPhase >= 3 || isEnraged ? 3 : 2;
        for (let st = 1; st <= stages; st++) {
          this.zones.push({
            id: this.nextId("zone"),
            kind: "verdict_combo",
            x: boss.x + Math.cos(leadAngle) * (st * 40),
            y: boss.y + Math.sin(leadAngle) * (st * 40),
            radius: 80 + st * 25,
            stage: st,
            ttlMs: 650 + st * 350,
            maxTtlMs: 650 + st * 350,
            ownerId: boss.id
          });
        }
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " THE FINAL VERDICT COMBO!", "#FEF08A");
        boss.windupMs = isEnraged ? 850 : 1150;
      } else {
        this.zones.push({
          id: this.nextId("zone"),
          kind: "warden_shatter",
          x: boss.x,
          y: boss.y,
          radius: 190,
          ttlMs: 1400,
          maxTtlMs: 1400,
          ownerId: boss.id
        });
        this.emitEvent("status", boss.x, boss.y - boss.radius - 18, " BASTION GROUND SHATTER!", "#FBBF24");
        boss.windupMs = isEnraged ? 800 : 1100;
      }
    }
  }
  summonBossAdds(boss, bossRoom, kinds, hpRatioScale = 0.7, maxLiveAdds = 2) {
    const existingAdds = this.enemies.filter((e) => e.id.startsWith("add_") && e.hp > 0).length;
    const roomSlots = Math.max(0, maxLiveAdds - existingAdds);
    if (roomSlots <= 0 || kinds.length === 0) return;
    const toSpawn = Math.min(kinds.length, roomSlots);
    const activePlayers = Array.from(this.players.values()).filter((p) => p.state.connected && !p.state.downed);
    this.emitEvent("status", boss.x, boss.y - boss.radius - 20, " REINFORCEMENTS!", "#F59E0B");
    this.pushSystemChat(`${boss.name} calls forth reinforcements!`);
    for (let i = 0; i < toSpawn; i++) {
      const minionKind = kinds[i % kinds.length];
      let spawnX = boss.x;
      let spawnY = boss.y;
      let foundSafe = false;
      for (let dist = 85; dist <= 135 && !foundSafe; dist += 25) {
        for (let step = 0; step < 8; step++) {
          const ang = step * Math.PI * 2 / 8 + i * 0.9;
          const cx = boss.x + Math.cos(ang) * dist;
          const cy = boss.y + Math.sin(ang) * dist;
          const tx = Math.floor(cx / TILE_SIZE);
          const ty = Math.floor(cy / TILE_SIZE);
          const inRoom = bossRoom ? tx >= bossRoom.x + 1 && tx < bossRoom.x + bossRoom.w - 1 && ty >= bossRoom.y + 1 && ty < bossRoom.y + bossRoom.h - 1 : true;
          if (!inRoom || this.collidesCircle(cx, cy, 16)) continue;
          const clearOfPlayers = activePlayers.every((p) => Math.hypot(cx - p.state.x, cy - p.state.y) >= 65);
          if (clearOfPlayers) {
            spawnX = cx;
            spawnY = cy;
            foundSafe = true;
            break;
          }
        }
      }
      if (!foundSafe) continue;
      const add = makeEnemy(
        `add_${this.floor}_${this.entitySeq++}`,
        minionKind,
        boss.roomId,
        spawnX,
        spawnY,
        hpRatioScale * (1 + (this.floor - 1) * 0.28),
        false,
        // Non-elite tuned role adds so the boss stays the primary threat
        this.floor,
        this.map.biome
      );
      add.name = `Summoned ${add.name}`;
      this.enemies.push(add);
    }
  }
  damageEnemy(enemy, rawAmount, attacker, isCrit = false, category, isPrimaryAttack = false) {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1 || enemy.hp <= 0) return 0;
    const isCritBool = typeof isCrit === "boolean" ? isCrit : false;
    const cat = (typeof isCrit === "string" ? isCrit : category) || (attacker ? resolveWeaponCombatProfile(attacker.heroClass, attacker.equippedWeapon, attacker).damageCategory : "physical");
    const attackerWeapon = attacker ? resolveEquippedWeaponForClass(attacker.heroClass, attacker.equippedWeapon)?.modifiers : void 0;
    const targetRes = _GameRoom.getEnemyResistance(enemy.resistances, cat);
    const markBonus = enemy.markedMs > 0 ? 1.35 : 1;
    let finalDmg = Math.max(1, Math.round(rawAmount * (1 - targetRes) * markBonus));
    if (isPrimaryAttack && attackerWeapon?.undeadBossBonusPct && (enemy.kind === "boss" || enemy.kind === "skeleton" || enemy.kind === "cultist" || enemy.kind === "hymn_phantom" || enemy.kind === "veiled_heretic" || enemy.kind === "astral_sentinel")) {
      finalDmg = Math.max(1, Math.round(finalDmg * (1 + attackerWeapon.undeadBossBonusPct)));
    }
    if (enemy.kind === "boss" && this.floor > 0) {
      const activeWards = this.getBossWards();
      if (activeWards > 0) {
        const wardMitigation = Math.min(0.48, activeWards * 0.12);
        finalDmg = Math.max(1, Math.round(finalDmg * (1 - wardMitigation)));
      }
    }
    if (attacker && attacker.statuses && attacker.statuses.some((s) => s.type === "charmed")) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.65));
    }
    if (enemy.shieldWallMs && enemy.shieldWallMs > 0) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.4));
    }
    const attackerActivePassive = attacker ? this.getActivePassive(attacker) : null;
    const isParrying = enemy.stunnedMs <= 0 && enemy.frozenMs <= 0 && this.zones.some((z) => z.kind === "warden_parry" && z.ownerId === enemy.id);
    if (isParrying && attacker) {
      const reflectDmg = Math.round(rawAmount * 0.85);
      this.damagePlayer(attacker, reflectDmg, "divine");
      this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, "AEGIS PARRY & REFLECTED!", "#F59E0B");
      return 0;
    }
    let effectiveCrit = isCritBool;
    if (attacker && attackerActivePassive === "eagle_keenness") {
      const distToTarget = Math.hypot(enemy.x - attacker.x, enemy.y - attacker.y);
      if (distToTarget >= 180) {
        const longshotBonus = 0.25 + (attackerWeapon?.longshotBonusPct || 0);
        finalDmg = Math.round(finalDmg * (1 + longshotBonus));
        effectiveCrit = true;
        this.emitEvent("crit", enemy.x, enemy.y - enemy.radius - 22, ` LONGSHOT! (+${Math.round(longshotBonus * 100)}%)`, "#34D399");
      }
    }
    if (attacker && attackerActivePassive === "predators_instinct") {
      const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
      if (attacker.predatorTargetId !== enemy.id) {
        attacker.predatorTargetId = enemy.id;
        attacker.predatorStacks = 0;
      } else if ((attacker.predatorStacks || 0) > 0) {
        finalDmg = Math.max(
          1,
          Math.round(finalDmg * (1 + (attacker.predatorStacks || 0) * predCfg.damagePerStackPct))
        );
      }
    }
    let shattered = false;
    if (enemy.frozenMs > 0) {
      enemy.frozenMs = 0;
      finalDmg = Math.round(finalDmg * 1.4);
      shattered = true;
      this.emitEvent("crit", enemy.x, enemy.y - enemy.radius - 20, " SHATTER!", "#38BDF8");
      const shatterTargets = [...this.enemies];
      for (const other of shatterTargets) {
        if (other !== enemy && other.hp > 0 && this.enemies.includes(other) && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 85) {
          const otherRes = _GameRoom.getEnemyResistance(other.resistances, "frost");
          const otherMark = other.markedMs > 0 ? 1.35 : 1;
          const aoeDmg = Math.max(1, Math.round(finalDmg * 0.35 * (1 - otherRes) * otherMark));
          other.hp -= aoeDmg;
          if (attacker) attacker.damageDealt += aoeDmg;
          this.applySoftCc(other, 2500);
          this.emitEvent("damage", other.x, other.y - 10, `${aoeDmg}`, getDamageTypeColor("frost", false), "frost");
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
        }
      }
    }
    enemy.hp -= finalDmg;
    if (enemy.kind === "boss") {
      const bossMeta = this.getEnemyMeta(enemy);
      bossMeta.bossRecentDmgTaken += finalDmg;
      bossMeta.bossRecentDmgAtMs = this.simTimeMs;
    }
    if (attacker) {
      attacker.damageDealt += finalDmg;
      if (attackerActivePassive === "predators_instinct") {
        const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
        const predPr = this.players.get(attacker.id);
        attacker.predatorStacks = Math.min(
          predCfg.maxStacks,
          (attacker.predatorStacks || 0) + 1
        );
        if (predPr) predPr.predatorLastHitAtMs = this.simTimeMs;
      }
      if (attackerActivePassive === "iron_will") {
        if (enemy.stunnedMs > 0 || enemy.burnedMs > 0 || enemy.frozenMs > 0) {
          this.grantShield(attacker, 3, "add");
        }
      }
      if (attackerActivePassive === "war_monger" && !attacker.downed && attacker.hp < attacker.maxHp) {
        const wmCfg = ARMAMENT_TUNING.passives.warMonger;
        const hpRatio = attacker.hp / Math.max(1, attacker.maxHp);
        const isLowHp = wmCfg.thresholdInclusive ? hpRatio <= wmCfg.lowHpThresholdRatio : hpRatio < wmCfg.lowHpThresholdRatio;
        const pct = isLowHp ? wmCfg.atOrBelowThresholdLifestealPct : wmCfg.aboveThresholdLifestealPct;
        const missing = Math.max(0, attacker.maxHp - attacker.hp);
        const lsHeal = Math.min(missing, Math.max(1, Math.round(finalDmg * pct)));
        if (lsHeal > 0) {
          attacker.hp += lsHeal;
          this.emitEvent("heal", attacker.x, attacker.y - 20, `+${lsHeal}`, "#34D399");
        }
      }
      if (isCrimsonFrenzyActive(attacker) && !attacker.downed && attacker.hp < attacker.maxHp) {
        const lsPct = ARMAMENT_TUNING.weapons.crimson.frenzyLifestealPct;
        const missing = Math.max(0, attacker.maxHp - attacker.hp);
        const lsHeal = Math.min(missing, Math.max(1, Math.round(finalDmg * lsPct)));
        if (lsHeal > 0) {
          attacker.hp += lsHeal;
          this.emitEvent("heal", attacker.x, attacker.y - 20, `+${lsHeal}`, "#34D399");
        }
      }
      if (isPrimaryAttack && attackerWeapon) {
        if (attacker.heroClass === "vanguard" && attackerWeapon.shieldOnPrimaryHit) {
          this.grantShield(attacker, attackerWeapon.shieldOnPrimaryHit, "add");
        }
        const res2 = enemy.resistances;
        if (attackerWeapon.burnChance && Math.random() < attackerWeapon.burnChance) {
          if (enemy.burnedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "IGNITED!", "#F97316", 3500);
          }
          const fireRes = _GameRoom.getEnemyResistance(res2, "fire");
          this.applyDotStatus(enemy, "burn", attacker, Math.round(4e3 * (1 - fireRes * 0.4)), "weapon");
        }
        if (attackerWeapon.chillChance && Math.random() < attackerWeapon.chillChance) {
          if (enemy.slowedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "CHILLED", "#7DD3FC", 3500);
          }
          this.applySoftCc(enemy, 2500);
        }
        if (attackerWeapon.shockChance && Math.random() < attackerWeapon.shockChance) {
          const lightningRes = _GameRoom.getEnemyResistance(res2, "lightning");
          const shockDur = Math.round(3500 * (1 - lightningRes * 0.4));
          if (enemy.shockedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 16, "SHOCKED!", "#FBBF24", 3500);
          }
          enemy.shockedMs = Math.max(enemy.shockedMs, shockDur);
        }
        if (attackerWeapon.bleedChance && Math.random() < attackerWeapon.bleedChance) {
          if (enemy.bleedingMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "BLEED", "#DC2626", 3500);
          }
          const bleedRes = _GameRoom.getEnemyResistance(res2, "bleed");
          this.applyDotStatus(enemy, "bleed", attacker, Math.round(4e3 * (1 - bleedRes * 0.4)), "weapon");
        }
      }
      const res = enemy.resistances;
      const dotSourceKind = isPrimaryAttack ? "weapon" : "class";
      if (attacker.relics.includes("cinder_heart") && (effectiveCrit || rawAmount >= 24)) {
        if (enemy.burnedMs <= 0) {
          this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "IGNITED!", "#F97316", 3500);
        }
        const fireRes = _GameRoom.getEnemyResistance(res, "fire");
        const burnDuration = Math.round(4500 * (1 - fireRes * 0.4));
        this.applyDotStatus(enemy, "burn", attacker, burnDuration, dotSourceKind);
      }
      if (attacker.relics.includes("rimefrost_shard")) {
        if (enemy.slowedMs > 0 && enemy.frozenMs <= 0 && !shattered) {
          const appliedFreeze = this.applyHardCc(enemy, "freeze", 1800);
          if (appliedFreeze > 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 16, "FROZEN!", "#38BDF8", 2e3);
          }
        } else if (Math.random() < 0.35) {
          if (enemy.slowedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "CHILLED", "#7DD3FC", 3500);
          }
          this.applySoftCc(enemy, 3e3);
        }
      }
      if (attacker.relics.includes("stormcaller_lodestone")) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            const lightningRes = _GameRoom.getEnemyResistance(res, "lightning");
            const shockDuration = Math.round(5e3 * (1 - lightningRes * 0.4));
            if (enemy.shockedMs <= 0) {
              this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 16, "SHOCKED!", "#FBBF24", 3500);
            }
            enemy.shockedMs = shockDuration;
          }
        }
      }
      if (attacker.relics.includes("viper_crucible")) {
        if (enemy.poisonedMs <= 0) {
          this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "POISONED", "#22C55E", 3500);
        }
        const poisonRes = _GameRoom.getEnemyResistance(res, "poison");
        const poisonDuration = Math.round(6e3 * (1 - poisonRes * 0.4));
        this.applyDotStatus(enemy, "poison", attacker, poisonDuration, dotSourceKind);
      }
      if (attacker.relics.includes("bloodletter_talisman")) {
        if (enemy.bleedingMs <= 0) {
          this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, "BLEED", "#DC2626", 3500);
        }
        const bleedRes = _GameRoom.getEnemyResistance(res, "bleed");
        const bleedDuration = Math.round(5e3 * (1 - bleedRes * 0.4));
        this.applyDotStatus(enemy, "bleed", attacker, bleedDuration, dotSourceKind);
      }
    }
    if (enemy.shockedMs > 0 && finalDmg > 6) {
      let arcs = 3;
      for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
        if (eIdx >= this.enemies.length) continue;
        const other = this.enemies[eIdx];
        if (!other || other === enemy || other.hp <= 0) continue;
        const dx = other.x - enemy.x;
        const dy = other.y - enemy.y;
        if (dx * dx + dy * dy <= 16900) {
          const otherRes = _GameRoom.getEnemyResistance(other.resistances, "lightning");
          const otherMark = other.markedMs > 0 ? 1.35 : 1;
          const arcDmg = Math.max(1, Math.round(finalDmg * 0.45 * (1 - otherRes) * otherMark));
          other.hp -= arcDmg;
          if (attacker) attacker.damageDealt += arcDmg;
          this.emitEvent("damage", other.x, other.y - 12, `\u26A1${arcDmg}`, getDamageTypeColor("lightning", false), "lightning");
          arcs--;
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
          if (arcs <= 0) break;
        }
      }
    }
    const isCritPop = effectiveCrit || enemy.markedMs > 0;
    this.emitEvent(
      isCritPop ? "crit" : "damage",
      enemy.x + (Math.random() * 14 - 7),
      enemy.y - enemy.radius - 6,
      `${finalDmg}${effectiveCrit ? "!" : ""}`,
      getDamageTypeColor(cat, isCritPop),
      cat,
      attacker ? {
        attackerId: attacker.id,
        isPrimaryHit: isPrimaryAttack,
        hitTargetId: enemy.id
      } : void 0
    );
    if (enemy.hp <= 0) {
      this.processEnemyDeath(enemy, attacker);
    }
    return finalDmg;
  }
  damageDummy(dummy, rawAmount, attacker, isCrit = false, isPrimaryAttack = false, category) {
    const attackerWeapon = attacker ? resolveEquippedWeaponForClass(attacker.heroClass, attacker.equippedWeapon)?.modifiers : void 0;
    const attackerActivePassive = attacker ? this.getActivePassive(attacker) : null;
    const cat = category || (attacker ? resolveWeaponCombatProfile(attacker.heroClass, attacker.equippedWeapon, attacker).damageCategory : "physical");
    let finalDmg = Math.max(1, rawAmount);
    if (attacker && attackerActivePassive === "eagle_keenness") {
      const distToTarget = Math.hypot(dummy.x - attacker.x, dummy.y - attacker.y);
      if (distToTarget >= 180) {
        const longshotBonus = 0.25 + (attackerWeapon?.longshotBonusPct || 0);
        finalDmg = Math.round(finalDmg * (1 + longshotBonus));
        isCrit = true;
        this.emitEvent("crit", dummy.x, dummy.y - 42, ` LONGSHOT! (+${Math.round(longshotBonus * 100)}%)`, "#34D399");
      }
    }
    if (attacker && attackerActivePassive === "predators_instinct") {
      const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
      if (attacker.predatorTargetId !== dummy.id) {
        attacker.predatorTargetId = dummy.id;
        attacker.predatorStacks = 0;
      } else if ((attacker.predatorStacks || 0) > 0) {
        finalDmg = Math.max(
          1,
          Math.round(finalDmg * (1 + (attacker.predatorStacks || 0) * predCfg.damagePerStackPct))
        );
      }
    }
    dummy.hitAnimMs = 280;
    dummy.lastHitTimerMs = 4e3;
    dummy.totalDamageTaken = (dummy.totalDamageTaken || 0) + finalDmg;
    dummy.hp = Math.max(1, dummy.hp - finalDmg);
    if (attacker) {
      attacker.damageDealt += finalDmg;
      if (attackerActivePassive === "predators_instinct") {
        const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
        const predPr = this.players.get(attacker.id);
        attacker.predatorStacks = Math.min(
          predCfg.maxStacks,
          (attacker.predatorStacks || 0) + 1
        );
        if (predPr) predPr.predatorLastHitAtMs = this.simTimeMs;
      }
      if (attackerActivePassive === "iron_will") {
        this.grantShield(attacker, 3, "add");
      }
      if (attackerActivePassive === "war_monger" && !attacker.downed && attacker.hp < attacker.maxHp) {
        const wmCfg = ARMAMENT_TUNING.passives.warMonger;
        const hpRatio = attacker.hp / Math.max(1, attacker.maxHp);
        const isLowHp = wmCfg.thresholdInclusive ? hpRatio <= wmCfg.lowHpThresholdRatio : hpRatio < wmCfg.lowHpThresholdRatio;
        const pct = isLowHp ? wmCfg.atOrBelowThresholdLifestealPct : wmCfg.aboveThresholdLifestealPct;
        const missing = Math.max(0, attacker.maxHp - attacker.hp);
        const lsHeal = Math.min(missing, Math.max(1, Math.round(finalDmg * pct)));
        if (lsHeal > 0) {
          attacker.hp += lsHeal;
          this.emitEvent("heal", attacker.x, attacker.y - 20, `+${lsHeal}`, "#34D399");
        }
      }
      if (isCrimsonFrenzyActive(attacker) && !attacker.downed && attacker.hp < attacker.maxHp) {
        const lsPct = ARMAMENT_TUNING.weapons.crimson.frenzyLifestealPct;
        const missing = Math.max(0, attacker.maxHp - attacker.hp);
        const lsHeal = Math.min(missing, Math.max(1, Math.round(finalDmg * lsPct)));
        if (lsHeal > 0) {
          attacker.hp += lsHeal;
          this.emitEvent("heal", attacker.x, attacker.y - 20, `+${lsHeal}`, "#34D399");
        }
      }
      if (attacker.heroClass === "vanguard" && isPrimaryAttack && attackerWeapon?.shieldOnPrimaryHit) {
        this.grantShield(attacker, attackerWeapon.shieldOnPrimaryHit, "add");
      }
    }
    const text = isCrit ? `${finalDmg} CRIT` : `${finalDmg}`;
    const color = getDamageTypeColor(cat, isCrit);
    this.emitEvent(
      isCrit ? "crit" : "damage",
      dummy.x + (Math.random() * 14 - 7),
      dummy.y - 28,
      text,
      color,
      cat,
      attacker ? {
        attackerId: attacker.id,
        isPrimaryHit: isPrimaryAttack,
        hitTargetId: dummy.id
      } : void 0
    );
    if (attacker) {
      if (attacker.relics.includes("cinder_heart") && (isCrit || rawAmount >= 24) || isPrimaryAttack && attackerWeapon?.burnChance && Math.random() < attackerWeapon.burnChance) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "IGNITED!", "#F97316", 3500);
      }
      if (attacker.relics.includes("rimefrost_shard") && Math.random() < 0.35 || isPrimaryAttack && attackerWeapon?.chillChance && Math.random() < attackerWeapon.chillChance) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "CHILLED!", "#38BDF8", 3500);
      }
      if (isPrimaryAttack && attackerWeapon?.bleedChance && Math.random() < attackerWeapon.bleedChance) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "BLEED!", "#DC2626", 3500);
      }
      if (isPrimaryAttack && attackerWeapon?.shockChance && Math.random() < attackerWeapon.shockChance) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "SHOCKED!", "#FBBF24", 3500);
      }
      if (attacker.relics.includes("stormcaller_lodestone")) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "SHOCKED!", "#FBBF24", 3500);
            for (const other of this.trainingDummies) {
              if (other.id !== dummy.id && Math.hypot(other.x - dummy.x, other.y - dummy.y) <= 350) {
                this.damageDummy(other, Math.round(finalDmg * 0.5), attacker, false, false, "lightning");
              }
            }
          }
        }
      }
      if (attacker.relics.includes("viper_crucible")) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "POISONED!", "#22C55E", 3500);
      }
      if (attacker.relics.includes("bloodletter_talisman")) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, "LACERATED!", "#DC2626", 3500);
      }
    }
    return finalDmg;
  }
  processEnemyDeath(enemy, attacker) {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);
    this.removeEntityZones(enemy.id);
    this.enemyMeta.delete(enemy.id);
    for (const pr of this.players.values()) {
      if (pr.state.predatorTargetId === enemy.id) {
        pr.state.predatorTargetId = null;
        pr.state.predatorStacks = 0;
        pr.predatorLastHitAtMs = 0;
      }
    }
    if (attacker) {
      attacker.kills += 1;
      if (this.onKillCallback) {
        this.onKillCallback(attacker.id, { isBoss: enemy.kind === "boss" });
      }
      if (attacker.relics.includes("crimson_fang")) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
      }
      if (this.getActivePassive(attacker) === "eagle_keenness") {
        attacker.hasteMs = Math.max(attacker.hasteMs, 2500);
      }
    }
    if (enemy.elite || enemy.kind === "boss" || Math.random() < 0.6) {
      this.props.push({
        id: this.nextId("prop"),
        kind: "coin",
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: enemy.kind === "boss" ? 90 : enemy.elite ? 24 : 11
      });
    } else if (Math.random() < 0.15) {
      this.props.push({
        id: this.nextId("prop"),
        kind: "potion",
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: 1
      });
    }
    const baseMobXp = enemy.kind === "boss" ? 110 : enemy.elite ? 48 : 24;
    const floorXpBonus = 1 + (this.floor - 1) * 0.35;
    const diffXpBonus = this.difficulty === "Abyssal" ? 1.5 : this.difficulty === "Heroic" ? 1.25 : 1;
    const xpGain = Math.round(baseMobXp * floorXpBonus * diffXpBonus);
    for (const ally of this.players.values()) {
      this.grantXp(ally.state, xpGain);
    }
    if (enemy.kind === "boss" && this.roomId !== "TAVERN-HUB") {
      for (const ally of this.players.values()) {
        const st = ally.state;
        if (!st.ownedWeapons) st.ownedWeapons = [getDefaultWeaponIdForClass(st.heroClass)];
        if (!st.ownedVestments) st.ownedVestments = [getDefaultVestmentIdForClass(st.heroClass)];
        const unlocked = pickNextUnlockableArmamentForClass(
          st.heroClass,
          st.ownedWeapons,
          st.ownedVestments,
          this.floor
        );
        if (unlocked) {
          if (unlocked.slot === "weapon") {
            st.ownedWeapons.push(unlocked.id);
          } else {
            st.ownedVestments.push(unlocked.id);
          }
          this.emitEvent(
            "status",
            st.x,
            st.y - 38,
            `ARMORY UNLOCKED: ${unlocked.name}`,
            unlocked.accent
          );
          this.pushSystemChat(
            `${st.username} discovered permanent ${unlocked.slot}: ${unlocked.name} (${unlocked.rarity})!`
          );
          this.onArmamentUnlockedCallback?.(st.id, unlocked.slot, unlocked.id);
        }
      }
    }
  }
  grantXp(p, amount) {
    if (p.level >= MAX_LEVEL) {
      p.level = MAX_LEVEL;
      p.xp = 0;
      p.nextXp = 999999;
      return;
    }
    p.xp += amount;
    let leveledUp = false;
    while (p.xp >= p.nextXp && p.level < MAX_LEVEL) {
      p.xp -= p.nextXp;
      p.level += 1;
      leveledUp = true;
      if (p.level <= MAX_LEVEL) {
        p.attributePoints += 3;
      }
      p.nextXp = _GameRoom.computeNextXp(p.level);
      if (p.level >= MAX_LEVEL) {
        p.level = MAX_LEVEL;
        p.xp = 0;
        p.nextXp = 999999;
      }
      const oldMax = p.maxHp;
      p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
      p.hp += p.maxHp - oldMax;
      p.hp = Math.min(p.maxHp, p.hp + 24);
      this.emitEvent("status", p.x, p.y - 26, `Level ${p.level} (+3 Pts)`, "#F4D378");
      if (p.level >= MAX_LEVEL) break;
    }
    if (p.level >= MAX_LEVEL) {
      p.level = MAX_LEVEL;
      p.xp = 0;
      p.nextXp = 999999;
    }
    if (this.onProgressionUpdateCallback) {
      this.onProgressionUpdateCallback(p.id, p);
    }
  }
  damagePlayer(p, rawDamage, damageType = "physical") {
    if (p.downed || p.godMode) return 0;
    const resist = computeIncomingDamageTypeResistance(p, damageType);
    const vestmentMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
    let dmg = Math.max(1, Math.round(rawDamage * (1 - resist)));
    if (p.statuses.some((s) => s.type === "guard_broken")) {
      dmg = Math.round(dmg * 1.3);
    }
    if (damageType === "divine" && p.statuses.some((s) => s.type === "impaled")) {
      dmg = Math.round(dmg * 1.45);
      this.emitEvent("status", p.x, p.y - 14, "IMPALED CRITICAL!", "#FBBF24");
    }
    if (this.getActivePassive(p) === "iron_will") {
      dmg = Math.max(1, Math.round(dmg * 0.85));
    }
    if (vestmentMods?.damageTakenMult && vestmentMods.damageTakenMult !== 1) {
      dmg = Math.max(1, Math.round(dmg * vestmentMods.damageTakenMult));
    }
    const inAegis = this.zones.some(
      (z) => z.kind === "aegis_dome" && Math.hypot(p.x - z.x, p.y - z.y) <= z.radius
    );
    if (inAegis) dmg = Math.max(1, Math.round(dmg * 0.65));
    if ((p.bastionCounterMs || 0) > 0) {
      const sfCfg = ARMAMENT_TUNING.weapons.sunforged;
      dmg = Math.max(1, Math.round(dmg * (1 - sfCfg.bastionDamageReduction)));
      const bPr = this.players.get(p.id);
      if (bPr) {
        bPr.bastionBlockedHits = Math.min(
          sfCfg.bastionMaxBonusStacks,
          (bPr.bastionBlockedHits || 0) + 1
        );
      }
      this.emitThrottledEntityStatus(p.id, p.x, p.y - 22, "COUNTER BRACE!", "#FBBF24", 350);
    }
    const finalMitigatedDamage = dmg;
    let absorbed = 0;
    if (p.shield > 0) {
      absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0 && p.relics.includes("thorned_aegis")) {
        for (const enemy of this.enemies) {
          if (enemy.hp > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 125) {
            const appliedStun = this.applyHardCc(enemy, "stun", 1800);
            if (appliedStun > 0) {
              this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - 16, "STUNNED!", "#A855F7", 2e3);
            }
          }
        }
      }
    }
    if ((dmg > 0 || absorbed > 0) && this.getActivePassive(p) === "momentum" && ARMAMENT_TUNING.passives.momentum.resetOnHit) {
      p.rangerMomentum = 0;
      const mPr = this.players.get(p.id);
      if (mPr) mPr.momentumHoldMs = 0;
    }
    if (dmg > 0) {
      p.hp = Math.max(0, p.hp - dmg);
      this.emitEvent(
        "damage",
        p.x,
        p.y - 18,
        `-${dmg}`,
        getDamageTypeColor(damageType, false),
        damageType
      );
    }
    if ((dmg >= 20 || absorbed >= 20 || rawDamage >= 20) && p.statuses && p.statuses.some((s) => s.type === "charmed")) {
      p.statuses = p.statuses.filter((s) => s.type !== "charmed");
      this.emitEvent("status", p.x, p.y - 30, "CHARM BROKEN!", "#F472B6");
    }
    if (p.hp <= 0) {
      p.downed = true;
      p.downedTimerMs = 18e3;
      p.reviveProgress = 0;
      const dPr = this.players.get(p.id);
      if (dPr) {
        this.clearEclipseCharge(dPr);
        this.clearPlayerTacticalState(dPr, { removeOwnedZones: false });
      }
      if (this.players.size > 1) {
        this.pushSystemChat(
          `${p.username} is downed! Stand near your ally to revive them.`
        );
      }
    } else if (dmg > 0) {
      this.triggerSharedGraceForAlly(p);
    }
    return finalMitigatedDamage;
  }
  completeRevive(target, reviverId) {
    target.downed = false;
    target.reviveProgress = 0;
    target.hp = Math.round(target.maxHp * 0.45);
    target.shield = 0;
    this.grantShield(target, 20, "add");
    target.statuses = [];
    const reviver = this.players.get(reviverId);
    if (reviver && reviver.state.id !== target.id) {
      reviver.state.revives += 1;
      if (this.onReviveCallback) this.onReviveCallback(reviver.state.id);
      this.pushSystemChat(`${reviver.state.username} revived ${target.username}!`);
    }
    this.emitEvent("heal", target.x, target.y - 24, "Revived!", "#6EE7B7");
  }
  emitThrottledEntityStatus(entityId, x, y, text, color, cooldownMs = 3500) {
    const now = Date.now();
    const key = `${entityId}_${text.trim()}`;
    const lastAt = this.entityStatusTextCooldowns.get(key) ?? 0;
    if (now - lastAt < cooldownMs) return;
    this.entityStatusTextCooldowns.set(key, now);
    if (this.entityStatusTextCooldowns.size > 200) {
      const cutoff = now - 6e3;
      for (const [k, t] of this.entityStatusTextCooldowns.entries()) {
        if (t < cutoff) this.entityStatusTextCooldowns.delete(k);
      }
    }
    this.emitEvent("status", x, y, text, color);
  }
  emitEvent(kind, x, y, text, color, damageCategory, hitMeta) {
    const now = Date.now();
    if (kind === "status" || kind === "crit") {
      const bucketSize = kind === "status" ? 110 : 45;
      const throttleKey = `${Math.round(x / bucketSize)}_${Math.round(y / bucketSize)}_${text.trim()}`;
      const lastTime = this.recentStatusEvents.get(throttleKey) ?? 0;
      if (now - lastTime < 2500) {
        return;
      }
      this.recentStatusEvents.set(throttleKey, now);
      if (this.recentStatusEvents.size > 150) {
        const cutoff = now - 5e3;
        for (const [k, t] of this.recentStatusEvents.entries()) {
          if (t < cutoff) this.recentStatusEvents.delete(k);
        }
      }
    }
    this.pendingEvents.push({
      id: this.nextId("ev"),
      kind,
      x: Math.round(x),
      y: Math.round(y),
      text,
      color,
      ...damageCategory ? { damageCategory } : {},
      ...hitMeta?.attackerId ? { attackerId: hitMeta.attackerId } : {},
      ...hitMeta?.isPrimaryHit !== void 0 ? { isPrimaryHit: hitMeta.isPrimaryHit } : {},
      ...hitMeta?.hitTargetId ? { hitTargetId: hitMeta.hitTargetId } : {}
    });
  }
  findRoomContaining(wx, wy) {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    return this.map.rooms.find(
      (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h
    );
  }
  hasLineOfSight(x1, y1, x2, y2) {
    return hasLineOfSight(this.map, this.props, x1, y1, x2, y2);
  }
  isWallAtWorld(wx, wy) {
    return isWallAtWorld(this.map, this.props, wx, wy, this.npcs);
  }
  collidesCircle(wx, wy, radius) {
    return collidesCircle(this.map, this.props, wx, wy, radius, this.npcs);
  }
  moveWithCollision(entity, dx, dy, radius) {
    moveWithCollision(this.map, this.props, entity, dx, dy, radius, this.npcs);
  }
  getElapsedSec() {
    if (this.status === "waiting") return 0;
    const end = this.endedAt ?? Date.now();
    return Math.max(0, Math.floor((end - this.startedAt) / 1e3));
  }
  getSummary() {
    return {
      roomId: this.roomId,
      name: this.name,
      hostId: this.hostId,
      hostName: this.hostName,
      difficulty: this.difficulty,
      floor: this.floor,
      seed: this.baseSeed,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      status: this.status
    };
  }
  buildSnapshot() {
    const events = this.pendingEvents.splice(0, this.pendingEvents.length);
    const activePlayers = [];
    let portalReadyCount = 0;
    for (const r of this.players.values()) {
      activePlayers.push(r.state);
      if (r.state.readyNextFloor) {
        portalReadyCount++;
      }
    }
    let combatRoomsTotal = 0;
    let combatRoomsCleared = 0;
    let bossRoomCleared = false;
    const roomClearedFlags = new Array(this.map.rooms.length);
    for (let i = 0; i < this.map.rooms.length; i++) {
      const r = this.map.rooms[i];
      if (r.type === "combat") {
        combatRoomsTotal++;
        if (r.cleared) combatRoomsCleared++;
      } else if (r.type === "boss") {
        bossRoomCleared = Boolean(r.cleared);
      }
      roomClearedFlags[i] = {
        id: r.id,
        cleared: r.cleared,
        discovered: r.discovered,
        guardian: r.guardian,
        type: r.type
      };
    }
    return {
      roomId: this.roomId,
      roomName: this.name,
      hostId: this.hostId,
      hostName: this.hostName,
      difficulty: this.difficulty,
      status: this.status,
      floor: this.floor,
      seed: this.baseSeed,
      elapsedSec: this.getElapsedSec(),
      lastRunSummary: this.lastRunSummary,
      bossDefeated: this.map.portalActive,
      bossRoomCleared,
      bossWards: this.getBossWards(),
      maxBossWards: this.getMaxBossWards(),
      guardiansRemaining: this.getGuardiansRemaining(),
      guardiansTotal: this.getGuardiansTotal(),
      combatRoomsCleared,
      combatRoomsTotal,
      floorMasteryAwarded: this.floorMasteryAwarded,
      portalReadyCount,
      players: activePlayers,
      enemies: this.enemies,
      projectiles: this.projectiles,
      props: this.props,
      zones: this.zones,
      npcs: this.npcs,
      trainingDummies: this.trainingDummies,
      events,
      roomClearedFlags
    };
  }
  /**
   * Produces a bandwidth-trimmed projection of the authoritative room state for
   * high-frequency `room:tick` broadcasts:
   * - Quantizes kinematic floats (0.1px position/velocity, 0.01rad angle)
   * - Omits enemy resistances on non-boss enemies (only boss resistances render on HUD)
   * - Omits static dialogue text/options on silent NPCs
   * - Omits server-internal projectile tracking fields (hitEntityIds, targetEnemyId)
   * - Filters already-collected ephemeral props (crate, coin, potion)
   */
  buildNetworkSnapshot() {
    const base = this.buildSnapshot();
    const r1 = (n) => Math.round(n * 10) / 10;
    const r2 = (n) => Math.round(n * 100) / 100;
    const netPlayers = base.players.map((p) => {
      const { npcDialogue: _omitPrivateDialogue, ...rest } = p;
      return {
        ...rest,
        x: r1(p.x),
        y: r1(p.y),
        vx: r1(p.vx),
        vy: r1(p.vy),
        aimAngle: r2(p.aimAngle),
        reviveProgress: r2(p.reviveProgress)
      };
    });
    const netEnemies = base.enemies.map((e) => {
      const projected = {
        id: e.id,
        kind: e.kind,
        name: e.name,
        roomId: e.roomId,
        x: r1(e.x),
        y: r1(e.y),
        vx: r1(e.vx),
        vy: r1(e.vy),
        hp: e.hp,
        maxHp: e.maxHp,
        radius: e.radius,
        state: e.state,
        windupMs: e.windupMs,
        targetX: r1(e.targetX),
        targetY: r1(e.targetY),
        markedMs: e.markedMs,
        slowedMs: e.slowedMs,
        stunnedMs: e.stunnedMs,
        burnedMs: e.burnedMs,
        frozenMs: e.frozenMs,
        shockedMs: e.shockedMs,
        poisonedMs: e.poisonedMs,
        bleedingMs: e.bleedingMs,
        silencedMs: e.silencedMs,
        elite: e.elite
      };
      if (e.kind === "boss" && e.resistances) projected.resistances = e.resistances;
      if (e.enraged) projected.enraged = true;
      if (e.charging) projected.charging = true;
      if (e.chargeAngle !== void 0) projected.chargeAngle = r2(e.chargeAngle);
      if (e.chargeTimerMs) projected.chargeTimerMs = e.chargeTimerMs;
      if (e.chargeWindupMs) projected.chargeWindupMs = e.chargeWindupMs;
      if (e.summonWave) projected.summonWave = e.summonWave;
      if (e.shieldWallMs) projected.shieldWallMs = e.shieldWallMs;
      if (e.abilityCdMs) projected.abilityCdMs = e.abilityCdMs;
      if (e.chronoSuspendedMs) projected.chronoSuspendedMs = e.chronoSuspendedMs;
      return projected;
    });
    const netProjectiles = base.projectiles.map((pr) => {
      const projected = {
        id: pr.id,
        ownerType: pr.ownerType,
        ownerId: pr.ownerId,
        style: pr.style,
        x: r1(pr.x),
        y: r1(pr.y),
        vx: r1(pr.vx),
        vy: r1(pr.vy),
        angle: r2(pr.angle),
        radius: pr.radius,
        damage: pr.damage,
        pierce: pr.pierce,
        ttlMs: pr.ttlMs
      };
      if (pr.slowOnHit) projected.slowOnHit = true;
      if (pr.statusOnHit) projected.statusOnHit = pr.statusOnHit;
      if (pr.statusDurationMs) projected.statusDurationMs = pr.statusDurationMs;
      if (pr.crit) projected.crit = true;
      if (pr.chronoSuspendedMs) projected.chronoSuspendedMs = pr.chronoSuspendedMs;
      if (pr.spellId) projected.spellId = pr.spellId;
      if (pr.weaponId) projected.weaponId = pr.weaponId;
      return projected;
    });
    const netProps = [];
    for (let i = 0; i < base.props.length; i++) {
      const prop = base.props[i];
      if (prop.opened && (prop.kind === "crate" || prop.kind === "coin" || prop.kind === "potion")) {
        continue;
      }
      netProps.push(prop);
    }
    const netZones = base.zones.map((z) => {
      const projected = {
        ...z,
        x: r1(z.x),
        y: r1(z.y)
      };
      if (z.angle !== void 0) projected.angle = r2(z.angle);
      return projected;
    });
    const netNpcs = base.npcs.map(
      (n) => (n.speakingMs ?? 0) > 0 ? n : {
        id: n.id,
        name: n.name,
        x: n.x,
        y: n.y,
        dialogue: "",
        spriteKind: n.spriteKind,
        speakingMs: 0
      }
    );
    return {
      ...base,
      players: netPlayers,
      enemies: netEnemies,
      projectiles: netProjectiles,
      props: netProps,
      zones: netZones,
      npcs: netNpcs
    };
  }
  getPlayerNpcDialogue(playerId) {
    return this.players.get(playerId)?.state.npcDialogue ?? null;
  }
  handleDialogueClose(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.npcDialogue = null;
  }
  handleDialoguePick(playerId, optionId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const current = pr.state.npcDialogue;
    if (!current || current.npcId !== "npc_aleph") return;
    if (optionId === "lore") {
      pr.state.npcDialogue = {
        ...current,
        text: "I am Aleph, weaver of dormant spirits. Reclaim your points and forge a new path.",
        ttlMs: 6e5,
        maxTtlMs: 6e5,
        persistent: true,
        seq: ++pr.dialogueSeq,
        options: [
          { id: "reset_stats", label: "Reset Stats" },
          { id: "back", label: "Back" }
        ]
      };
    } else if (optionId === "back") {
      pr.state.npcDialogue = {
        ...current,
        text: "Your path shifts. Seek a new focus?",
        ttlMs: 6e5,
        maxTtlMs: 6e5,
        persistent: true,
        seq: ++pr.dialogueSeq,
        options: [
          { id: "reset_stats", label: "Reset Stats" },
          { id: "lore", label: "Who are you?" }
        ]
      };
    } else if (optionId === "goodbye") {
      pr.state.npcDialogue = null;
    }
  }
  handleAlephResetDialogue(playerId, spent) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const aleph = this.npcs.find((n) => n.id === "npc_aleph");
    if (!aleph) return;
    pr.state.npcDialogue = {
      npcId: aleph.id,
      npcName: aleph.name,
      x: aleph.x,
      y: aleph.y,
      text: spent > 0 ? `Reclaimed ${spent} Stat Pts. Forge your build anew.` : "No spent points to reclaim yet.",
      ttlMs: 6e5,
      maxTtlMs: 6e5,
      persistent: true,
      seq: ++pr.dialogueSeq,
      options: [
        { id: "lore", label: "Who are you?" },
        { id: "goodbye", label: "Close" }
      ]
    };
  }
};

// src/server/partyCoordinator.ts
var DEFAULT_EXPEDITION_DISCONNECT_GRACE_MS = 2e4;
var PartyCoordinator = class {
  constructor(deps) {
    this.disconnectTimers = /* @__PURE__ */ new Map();
    this.rooms = deps.rooms;
    this.roomClientIndex = deps.roomClientIndex;
    this.roomDeltaStates = deps.roomDeltaStates;
    this.dirtyNonPlayingRooms = deps.dirtyNonPlayingRooms;
    this.disconnectGraceMs = deps.disconnectGraceMs ?? DEFAULT_EXPEDITION_DISCONNECT_GRACE_MS;
    this.generateRoomCode = deps.generateRoomCode;
    this.sendJson = deps.sendJson;
    this.broadcastToRoom = deps.broadcastToRoom;
    this.broadcastRoomList = deps.broadcastRoomList;
    this.onRoomCreated = deps.onRoomCreated;
  }
  timerKey(roomId, userId) {
    return `${roomId}:${userId}`;
  }
  clearDisconnectTimer(roomId, userId) {
    const key = this.timerKey(roomId, userId);
    const existing = this.disconnectTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(key);
    }
  }
  clearRoomTimers(roomId) {
    const prefix = `${roomId}:`;
    for (const [key, timer] of this.disconnectTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.disconnectTimers.delete(key);
      }
    }
  }
  disposeAllTimers() {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }
  markRoomDirty(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.status !== "playing") {
      this.dirtyNonPlayingRooms.add(roomId);
    }
  }
  wireRoomCallbacks(room) {
    room.onChatMessageCallback = (msg) => {
      this.broadcastToRoom(room.roomId, {
        type: "chat:message",
        message: msg
      });
    };
    if (this.onRoomCreated) {
      this.onRoomCreated(room);
    }
  }
  ensureTavernRoom() {
    let tavern = this.rooms.get("TAVERN-HUB");
    if (!tavern) {
      tavern = new GameRoom({
        roomId: "TAVERN-HUB",
        name: "Sanctuary Tavern & Social Hub",
        hostName: "Innkeeper",
        difficulty: "Normal",
        seed: 777,
        initialStatus: "playing"
      });
      this.wireRoomCallbacks(tavern);
      this.rooms.set("TAVERN-HUB", tavern);
    }
    return tavern;
  }
  createParty(client, account, opts) {
    if (client.roomId) {
      this.leaveRoomExplicit(client);
    }
    const roomId = this.generateRoomCode();
    const room = new GameRoom({
      roomId,
      name: opts.name.trim() || `${account.username}'s Party`,
      hostId: account.id,
      hostName: account.username,
      difficulty: opts.difficulty,
      seed: opts.seed,
      initialFloor: 1,
      initialStatus: "waiting"
    });
    this.wireRoomCallbacks(room);
    this.rooms.set(roomId, room);
    room.addOrReconnectPlayer(
      account.id,
      account.username,
      account.heroClass,
      Boolean(account.isAdmin),
      account.savedStats
    );
    this.roomClientIndex.assignRoom(client, room.roomId);
    client.needsKeyframe = true;
    this.markRoomDirty(room.roomId);
    this.sendJson(client.ws, {
      type: "room:joined",
      roomId: room.roomId,
      playerId: account.id,
      map: room.map,
      snapshot: room.buildNetworkSnapshot(),
      chat: room.chat
    });
    this.broadcastRoomList();
    return room;
  }
  joinOrReconnectRoom(client, account, rawRoomId) {
    const normalizedCode = rawRoomId.trim().toUpperCase();
    const room = normalizedCode === "TAVERN-HUB" ? this.ensureTavernRoom() : this.rooms.get(normalizedCode);
    if (!room) {
      const reason = `Room "${normalizedCode}" was not found or has closed.`;
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    const check = room.canAcceptJoin(account.id);
    if (!check.allowed) {
      this.sendJson(client.ws, { type: "error", message: check.reason });
      return { ok: false, reason: check.reason };
    }
    if (client.roomId && client.roomId !== room.roomId) {
      this.leaveRoomExplicit(client);
    }
    this.clearDisconnectTimer(room.roomId, account.id);
    for (const existingClient of Array.from(
      this.roomClientIndex.getRoomClients(room.roomId)
    )) {
      if (existingClient !== client && existingClient.userId === account.id) {
        this.roomClientIndex.removeFromRoom(existingClient, room.roomId);
      }
    }
    room.addOrReconnectPlayer(
      account.id,
      account.username,
      account.heroClass,
      Boolean(account.isAdmin),
      account.savedStats
    );
    this.roomClientIndex.assignRoom(client, room.roomId);
    client.needsKeyframe = true;
    this.markRoomDirty(room.roomId);
    this.sendJson(client.ws, {
      type: "room:joined",
      roomId: room.roomId,
      playerId: account.id,
      map: room.map,
      snapshot: room.buildNetworkSnapshot(),
      chat: room.chat
    });
    this.broadcastRoomList();
    return { ok: true, room, isReconnect: check.isReconnect };
  }
  startExpedition(client) {
    if (!client.roomId) {
      return { ok: false, reason: "You are not in a party room." };
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.roomId === "TAVERN-HUB") {
      return { ok: false, reason: "Invalid party room." };
    }
    if (!room.isHost(client.userId)) {
      const reason = "Only the party host can start the expedition.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    if (room.status === "playing") {
      const reason = "This expedition is already in progress.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    if (room.status !== "waiting") {
      const reason = "Return to the waiting lobby or restart before starting a new expedition.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    if (room.getConnectedPlayerCount() === 0) {
      const reason = "Cannot start expedition without connected party members.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    const freshMap = room.startExpedition();
    this.dirtyNonPlayingRooms.delete(room.roomId);
    this.roomDeltaStates.delete(room.roomId);
    for (const c of this.roomClientIndex.getRoomClients(room.roomId)) {
      c.needsKeyframe = true;
    }
    this.broadcastToRoom(room.roomId, { type: "room:map", map: freshMap });
    this.broadcastRoomList();
    return { ok: true, map: freshMap };
  }
  setPlayerReady(client, ready) {
    if (!client.roomId) {
      return { ok: false, reason: "You are not in a party room." };
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.roomId === "TAVERN-HUB") {
      const reason = "Ready status is only used in expedition party lobbies.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    const result = room.setPlayerReady(client.userId, ready);
    if (!result.ok) {
      this.sendJson(client.ws, { type: "error", message: result.reason });
      return result;
    }
    this.markRoomDirty(room.roomId);
    return result;
  }
  restartExpedition(client) {
    if (!client.roomId) {
      return { ok: false, reason: "You are not in a party room." };
    }
    const room = this.rooms.get(client.roomId);
    if (!room) {
      return { ok: false, reason: "Room not found." };
    }
    if (room.roomId !== "TAVERN-HUB" && !room.isHost(client.userId)) {
      const reason = "Only the party host can restart the expedition.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    if (room.roomId !== "TAVERN-HUB" && room.status === "waiting") {
      const reason = "Start the expedition from the waiting lobby first.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    const freshMap = room.restartRun();
    this.dirtyNonPlayingRooms.delete(room.roomId);
    this.roomDeltaStates.delete(room.roomId);
    for (const c of this.roomClientIndex.getRoomClients(room.roomId)) {
      c.needsKeyframe = true;
    }
    this.broadcastToRoom(room.roomId, { type: "room:map", map: freshMap });
    this.broadcastRoomList();
    return { ok: true, map: freshMap };
  }
  returnToLobby(client) {
    if (!client.roomId) {
      return { ok: false, reason: "You are not in a party room." };
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.roomId === "TAVERN-HUB") {
      return { ok: false, reason: "Invalid party room." };
    }
    if (!room.isHost(client.userId)) {
      const reason = "Only the party host can return the party to the waiting lobby.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    if (room.status === "playing") {
      const reason = "Cannot unlock the party while an expedition is still active.";
      this.sendJson(client.ws, { type: "error", message: reason });
      return { ok: false, reason };
    }
    if (room.status === "waiting") {
      return { ok: true };
    }
    this.clearRoomTimers(room.roomId);
    room.returnToWaitingLobby();
    this.roomDeltaStates.delete(room.roomId);
    for (const c of this.roomClientIndex.getRoomClients(room.roomId)) {
      c.needsKeyframe = true;
    }
    this.dirtyNonPlayingRooms.add(room.roomId);
    this.broadcastRoomList();
    return { ok: true };
  }
  leaveRoomExplicit(client) {
    if (!client.roomId) return;
    const oldRoomId = client.roomId;
    this.clearDisconnectTimer(oldRoomId, client.userId);
    this.roomClientIndex.removeFromRoom(client, oldRoomId);
    const room = this.rooms.get(oldRoomId);
    if (room) {
      const stillConnected = Array.from(
        this.roomClientIndex.getRoomClients(oldRoomId)
      ).some((other) => other.userId === client.userId);
      if (!stillConnected) {
        room.removePlayer(client.userId);
        if (room.getPlayerCount() === 0 && oldRoomId !== "TAVERN-HUB") {
          this.clearRoomTimers(oldRoomId);
          this.rooms.delete(oldRoomId);
          this.roomDeltaStates.delete(oldRoomId);
          this.dirtyNonPlayingRooms.delete(oldRoomId);
        } else {
          this.markRoomDirty(oldRoomId);
        }
      }
    }
    this.broadcastRoomList();
  }
  handleSocketDisconnect(client) {
    if (!client.roomId) {
      this.broadcastRoomList();
      return;
    }
    const oldRoomId = client.roomId;
    this.roomClientIndex.removeFromRoom(client, oldRoomId);
    const stillHasSocket = Array.from(
      this.roomClientIndex.getRoomClients(oldRoomId)
    ).some((other) => other.userId === client.userId);
    if (stillHasSocket) {
      return;
    }
    const room = this.rooms.get(oldRoomId);
    if (!room) {
      this.broadcastRoomList();
      return;
    }
    if (oldRoomId === "TAVERN-HUB" || room.status === "waiting") {
      room.removePlayer(client.userId);
      if (room.getPlayerCount() === 0 && oldRoomId !== "TAVERN-HUB") {
        this.clearRoomTimers(oldRoomId);
        this.rooms.delete(oldRoomId);
        this.roomDeltaStates.delete(oldRoomId);
        this.dirtyNonPlayingRooms.delete(oldRoomId);
      } else {
        this.markRoomDirty(oldRoomId);
      }
      this.broadcastRoomList();
      return;
    }
    room.markPlayerDisconnected(client.userId);
    this.markRoomDirty(oldRoomId);
    this.broadcastRoomList();
    this.clearDisconnectTimer(oldRoomId, client.userId);
    const key = this.timerKey(oldRoomId, client.userId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      const currentRoom = this.rooms.get(oldRoomId);
      if (!currentRoom) return;
      if (!currentRoom.hasPlayer(client.userId) || currentRoom.isPlayerConnected(client.userId)) {
        return;
      }
      if (currentRoom.getConnectedPlayerCount() === 0) {
        this.clearRoomTimers(oldRoomId);
        this.rooms.delete(oldRoomId);
        this.roomDeltaStates.delete(oldRoomId);
        this.dirtyNonPlayingRooms.delete(oldRoomId);
        this.broadcastRoomList();
        return;
      }
      if (currentRoom.isHost(client.userId)) {
        const transfer = currentRoom.transferHostToConnectedMember(client.userId);
        if (transfer) {
          this.markRoomDirty(oldRoomId);
          this.broadcastRoomList();
        }
      }
    }, this.disconnectGraceMs);
    this.disconnectTimers.set(key, timer);
  }
};

// server.ts
import { AccessToken } from "livekit-server-sdk";

// src/server/wsTransport.ts
var WS_OPEN_READY_STATE = 1;
var WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES = 64 * 1024;
var WS_CRITICAL_BACKPRESSURE_BYTES = 512 * 1024;
var WS_MAX_CONSECUTIVE_DROPPED_TICKS = 100;
function closeCongestedSocket(ws) {
  try {
    if (typeof ws.terminate === "function") {
      ws.terminate();
    } else {
      ws.close(4008, "Backpressure overflow");
    }
  } catch {
  }
}
function sendRawFrame(target, rawPayload, options = {}) {
  const isManaged = "ws" in target;
  const ws = isManaged ? target.ws : target;
  if (ws.readyState !== WS_OPEN_READY_STATE) {
    return "not_open";
  }
  const highWaterBytes = options.highWaterBytes ?? WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES;
  const criticalBytes = options.criticalBytes ?? WS_CRITICAL_BACKPRESSURE_BYTES;
  const maxConsecutiveDrops = options.maxConsecutiveDrops ?? WS_MAX_CONSECUTIVE_DROPPED_TICKS;
  if (ws.bufferedAmount > criticalBytes) {
    closeCongestedSocket(ws);
    return "closed_overflow";
  }
  if (options.droppable && ws.bufferedAmount > highWaterBytes) {
    if (isManaged) {
      target.droppedTicks = (target.droppedTicks ?? 0) + 1;
      target.totalDroppedTicks = (target.totalDroppedTicks ?? 0) + 1;
      target.needsKeyframe = true;
      if (target.droppedTicks >= maxConsecutiveDrops) {
        closeCongestedSocket(ws);
        return "closed_overflow";
      }
    }
    return "dropped_backpressure";
  }
  if (isManaged) {
    target.droppedTicks = 0;
  }
  try {
    ws.send(rawPayload);
    return "sent";
  } catch {
    return "not_open";
  }
}
function sendJsonMessage(target, msg, options) {
  return sendRawFrame(target, JSON.stringify(msg), options);
}
function broadcastSerialized(targets, msg, options = {}, serializeFn = JSON.stringify) {
  const iterator = targets[Symbol.iterator]();
  const first = iterator.next();
  if (first.done) {
    return {
      serializedBytes: 0,
      targetCount: 0,
      sentCount: 0,
      droppedCount: 0,
      closedCount: 0
    };
  }
  const rawPayload = serializeFn(msg);
  let targetCount = 0;
  let sentCount = 0;
  let droppedCount = 0;
  let closedCount = 0;
  let current = first;
  while (!current.done) {
    targetCount++;
    const outcome = sendRawFrame(current.value, rawPayload, options);
    if (outcome === "sent") sentCount++;
    else if (outcome === "dropped_backpressure") droppedCount++;
    else if (outcome === "closed_overflow") closedCount++;
    current = iterator.next();
  }
  return {
    serializedBytes: rawPayload.length,
    targetCount,
    sentCount,
    droppedCount,
    closedCount
  };
}
var RoomClientIndex = class {
  constructor() {
    this.byRoom = /* @__PURE__ */ new Map();
  }
  assignRoom(client, roomId) {
    if (client.roomId && client.roomId !== roomId) {
      this.removeFromRoom(client, client.roomId);
    }
    client.roomId = roomId;
    if (!roomId) return;
    let set = this.byRoom.get(roomId);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.byRoom.set(roomId, set);
    }
    set.add(client);
  }
  removeFromRoom(client, roomId = client.roomId) {
    if (!roomId) return;
    const set = this.byRoom.get(roomId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.byRoom.delete(roomId);
      }
    }
    if (client.roomId === roomId) {
      client.roomId = null;
    }
  }
  getRoomClients(roomId) {
    return this.byRoom.get(roomId) ?? [];
  }
  getRoomClientCount(roomId) {
    return this.byRoom.get(roomId)?.size ?? 0;
  }
};

// src/shared/snapshotDelta.ts
var hasOwn = Object.prototype.hasOwnProperty;
function shallowEqualValues(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = a.length;
    if (len !== b.length) return false;
    for (let i = 0; i < len; i++) {
      if (!shallowEqualValues(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const objA = a;
    const objB = b;
    let countA = 0;
    for (const k in objA) {
      if (!hasOwn.call(objA, k)) continue;
      countA++;
      if (!hasOwn.call(objB, k)) return false;
      if (!shallowEqualValues(objA[k], objB[k])) return false;
    }
    let countB = 0;
    for (const k in objB) {
      if (hasOwn.call(objB, k)) {
        countB++;
        if (countB > countA) return false;
      }
    }
    return countA === countB;
  }
  return false;
}
function diffEntity(prev, next) {
  const prevRec = prev;
  const nextRec = next;
  let changes = null;
  let removedKeys;
  for (const key in nextRec) {
    if (key === "id" || !hasOwn.call(nextRec, key)) continue;
    if (!shallowEqualValues(prevRec[key], nextRec[key])) {
      if (!changes) changes = {};
      changes[key] = nextRec[key];
    }
  }
  for (const key in prevRec) {
    if (key === "id" || !hasOwn.call(prevRec, key)) continue;
    if ((!hasOwn.call(nextRec, key) || nextRec[key] === void 0) && prevRec[key] !== void 0) {
      if (!removedKeys) removedKeys = [];
      removedKeys.push(key);
    }
  }
  if (!changes && !removedKeys) return null;
  return {
    changes: changes ?? {},
    ...removedKeys ? { removedKeys } : {}
  };
}
function diffEntityArray(prevList, nextList) {
  const prevLen = prevList.length;
  const nextLen = nextList.length;
  if (prevLen === 0 && nextLen === 0) return {};
  if (prevLen === nextLen) {
    let sameOrder = true;
    for (let i = 0; i < prevLen; i++) {
      if (prevList[i].id !== nextList[i].id) {
        sameOrder = false;
        break;
      }
    }
    if (sameOrder) {
      let updated2;
      for (let i = 0; i < nextLen; i++) {
        const nextItem = nextList[i];
        const patch = diffEntity(prevList[i], nextItem);
        if (patch) {
          if (!updated2) updated2 = [];
          updated2.push({
            id: nextItem.id,
            changes: patch.changes,
            ...patch.removedKeys ? { removedKeys: patch.removedKeys } : {}
          });
        }
      }
      return { updated: updated2 };
    }
  }
  const prevById = /* @__PURE__ */ new Map();
  for (let i = 0; i < prevLen; i++) {
    prevById.set(prevList[i].id, prevList[i]);
  }
  const nextIds = /* @__PURE__ */ new Set();
  let added;
  let updated;
  for (let i = 0; i < nextLen; i++) {
    const nextItem = nextList[i];
    nextIds.add(nextItem.id);
    const prevItem = prevById.get(nextItem.id);
    if (!prevItem) {
      if (!added) added = [];
      added.push(nextItem);
    } else {
      const patch = diffEntity(prevItem, nextItem);
      if (patch) {
        if (!updated) updated = [];
        updated.push({
          id: nextItem.id,
          changes: patch.changes,
          ...patch.removedKeys ? { removedKeys: patch.removedKeys } : {}
        });
      }
    }
  }
  let removed;
  for (let i = 0; i < prevLen; i++) {
    const prevId = prevList[i].id;
    if (!nextIds.has(prevId)) {
      if (!removed) removed = [];
      removed.push(prevId);
    }
  }
  return { added, updated, removed };
}
var SCALAR_KEYS = [
  "roomId",
  "roomName",
  "hostId",
  "hostName",
  "difficulty",
  "status",
  "floor",
  "seed",
  "elapsedSec",
  "bossDefeated",
  "bossRoomCleared",
  "bossWards",
  "maxBossWards",
  "guardiansRemaining",
  "guardiansTotal",
  "combatRoomsCleared",
  "combatRoomsTotal",
  "floorMasteryAwarded",
  "portalReadyCount"
];
function cloneSnapshotBaseline(snap) {
  const baseline = {
    ...snap,
    players: snap.players.map((p) => {
      const copy = {
        ...p,
        relics: [...p.relics],
        storage: [...p.storage || []],
        pendingRelicChoices: [...p.pendingRelicChoices],
        statuses: p.statuses.map((s) => ({ ...s }))
      };
      if (p.floorBlessings) copy.floorBlessings = [...p.floorBlessings];
      if (p.spellCastState !== void 0) {
        copy.spellCastState = p.spellCastState ? { ...p.spellCastState } : null;
      }
      if (p.disintegrationState !== void 0) {
        copy.disintegrationState = p.disintegrationState ? { ...p.disintegrationState } : null;
      }
      if (p.pendingScrollChoices) copy.pendingScrollChoices = [...p.pendingScrollChoices];
      if (p.ownedWeapons) copy.ownedWeapons = [...p.ownedWeapons];
      if (p.ownedVestments) copy.ownedVestments = [...p.ownedVestments];
      return copy;
    }),
    enemies: snap.enemies.map((e) => {
      const copy = { ...e };
      if (e.resistances) copy.resistances = { ...e.resistances };
      return copy;
    }),
    projectiles: snap.projectiles.map((pr) => ({ ...pr })),
    props: snap.props.map((pr) => {
      const copy = { ...pr };
      if (pr.claimedRelicPlayerIds) copy.claimedRelicPlayerIds = [...pr.claimedRelicPlayerIds];
      if (pr.claimedScrollPlayerIds) copy.claimedScrollPlayerIds = [...pr.claimedScrollPlayerIds];
      if (pr.relicChoicesByPlayer) {
        const mapCopy = {};
        for (const [k, v] of Object.entries(pr.relicChoicesByPlayer)) {
          mapCopy[k] = [...v];
        }
        copy.relicChoicesByPlayer = mapCopy;
      }
      if (pr.scrollChoicesByPlayer) {
        const mapCopy = {};
        for (const [k, v] of Object.entries(pr.scrollChoicesByPlayer)) {
          mapCopy[k] = [...v];
        }
        copy.scrollChoicesByPlayer = mapCopy;
      }
      return copy;
    }),
    zones: snap.zones.map((z) => {
      const copy = { ...z };
      if (z.chainPoints) copy.chainPoints = z.chainPoints.map((pt) => ({ ...pt }));
      return copy;
    }),
    npcs: snap.npcs.map((n) => {
      const copy = { ...n };
      if (n.options) copy.options = n.options.map((o) => ({ ...o }));
      return copy;
    }),
    trainingDummies: snap.trainingDummies.map((d) => ({ ...d })),
    events: [],
    roomClearedFlags: snap.roomClearedFlags.map((f) => ({ ...f }))
  };
  if (snap.lastRunSummary !== void 0) {
    baseline.lastRunSummary = snap.lastRunSummary ? {
      ...snap.lastRunSummary,
      players: snap.lastRunSummary.players.map((lp) => ({ ...lp }))
    } : null;
  }
  return baseline;
}
function computeSnapshotDelta(prev, next, baseSeq, nextSeq) {
  const delta = {
    seq: nextSeq,
    baseSeq
  };
  let scalars;
  const prevRec = prev;
  const nextRec = next;
  for (let i = 0; i < SCALAR_KEYS.length; i++) {
    const k = SCALAR_KEYS[i];
    if (!Object.is(prevRec[k], nextRec[k])) {
      if (!scalars) scalars = {};
      scalars[k] = nextRec[k];
    }
  }
  if (scalars) {
    delta.scalars = scalars;
  }
  const playerDiff = diffEntityArray(prev.players, next.players);
  if (playerDiff.added) delta.playersAdded = playerDiff.added;
  if (playerDiff.updated) delta.playersUpdated = playerDiff.updated;
  if (playerDiff.removed) delta.playersRemoved = playerDiff.removed;
  const enemyDiff = diffEntityArray(prev.enemies, next.enemies);
  if (enemyDiff.added) delta.enemiesAdded = enemyDiff.added;
  if (enemyDiff.updated) delta.enemiesUpdated = enemyDiff.updated;
  if (enemyDiff.removed) delta.enemiesRemoved = enemyDiff.removed;
  if (!shallowEqualValues(prev.projectiles, next.projectiles)) {
    delta.projectiles = next.projectiles;
  }
  if (!shallowEqualValues(prev.zones, next.zones)) {
    delta.zones = next.zones;
  }
  if (!shallowEqualValues(prev.props, next.props)) {
    delta.props = next.props;
  }
  if (!shallowEqualValues(prev.npcs, next.npcs)) {
    delta.npcs = next.npcs;
  }
  if (!shallowEqualValues(prev.trainingDummies, next.trainingDummies)) {
    delta.trainingDummies = next.trainingDummies;
  }
  if (!shallowEqualValues(prev.roomClearedFlags, next.roomClearedFlags)) {
    delta.roomClearedFlags = next.roomClearedFlags;
  }
  if (next.events.length > 0) {
    delta.events = next.events;
  }
  const prevRun = prev.lastRunSummary ?? null;
  const nextRun = next.lastRunSummary ?? null;
  if (!shallowEqualValues(prevRun, nextRun)) {
    delta.lastRunSummary = nextRun;
  }
  return delta;
}

// src/client/networkStats.ts
var SERVER_TICK_MS = 25;
var CLIENT_WS_BACKPRESSURE_LIMIT_BYTES = 64 * 1024;

// src/server/sharedIdentity.ts
import crypto from "node:crypto";
var SHARED_IDENTITY_ISSUER = "beyond-dungeons";
var SHARED_IDENTITY_AUDIENCE = "beyond-overworld";
var DEFAULT_ASSERTION_TTL_SECONDS = 60;
var MIN_SHARED_IDENTITY_SECRET_LENGTH = 16;
function hashPassword(pw) {
  const newSalt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, newSalt, 64).toString("hex");
  return `scrypt:${newSalt}:${hash}`;
}
function verifyPassword(pw, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith("scrypt:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    try {
      const expectedBuf = Buffer.from(expectedHex, "hex");
      const derivedBuf = crypto.scryptSync(pw, salt, 64);
      if (expectedBuf.length !== derivedBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, derivedBuf);
    } catch {
      return false;
    }
  }
  try {
    const expectedBuf = Buffer.from(storedHash, "hex");
    const legacyBuf = crypto.createHash("sha256").update(`beyond_salt_${pw}`).digest();
    if (expectedBuf.length !== legacyBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, legacyBuf);
  } catch {
    return false;
  }
}
function normalizeHeroClass(raw) {
  if (raw === "ranger" || raw === "arcanist" || raw === "cleric") {
    return raw;
  }
  return "vanguard";
}
function clampAttr(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(MAX_ATTRIBUTE, Math.floor(num)));
}
function buildSharedAssertionPayload(acc, ttlSeconds = DEFAULT_ASSERTION_TTL_SECONDS, nowMs = Date.now()) {
  const rawLevel = Number(acc.level) || 1;
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(rawLevel)));
  const xp = level >= MAX_LEVEL ? 0 : Math.max(0, Math.floor(Number(acc.xp) || 0));
  const lockedClass = normalizeHeroClass(acc.lockedClass || acc.preferredClass);
  const preferredClass = normalizeHeroClass(acc.preferredClass || lockedClass);
  const iat = Math.floor(nowMs / 1e3);
  const safeTtl = Math.max(10, Math.min(300, Math.floor(ttlSeconds)));
  return {
    iss: SHARED_IDENTITY_ISSUER,
    aud: SHARED_IDENTITY_AUDIENCE,
    exp: iat + safeTtl,
    iat,
    jti: crypto.randomBytes(16).toString("hex"),
    accountId: acc.id,
    username: acc.username,
    isAdmin: Boolean(acc.isAdmin),
    preferredClass,
    lockedClass,
    level,
    xp,
    strength: clampAttr(acc.strength),
    vitality: clampAttr(acc.vitality),
    dexterity: clampAttr(acc.dexterity),
    intelligence: clampAttr(acc.intelligence),
    faith: clampAttr(acc.faith),
    attributePoints: Math.max(0, Math.floor(Number(acc.attributePoints) || 0))
  };
}
function signDungeonsIdentityAssertion(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}
function extractSecretFromHeaders(authorizationHeader, xSecretHeader) {
  if (typeof authorizationHeader === "string") {
    const trimmed = authorizationHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      const token = trimmed.slice(7).trim();
      if (token) return token;
    }
  }
  if (typeof xSecretHeader === "string") {
    const token = xSecretHeader.trim();
    if (token) return token;
  }
  return null;
}
function verifySharedIdentityRequestSecret(authorizationHeader, xSecretHeader, expectedSecret) {
  const normalizedExpected = expectedSecret?.trim() || "";
  if (normalizedExpected.length < MIN_SHARED_IDENTITY_SECRET_LENGTH) {
    return {
      ok: false,
      status: 503,
      error: "Shared identity integration secret is not configured."
    };
  }
  const provided = extractSecretFromHeaders(authorizationHeader, xSecretHeader);
  if (!provided) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden: Missing shared identity secret."
    };
  }
  const providedDigest = crypto.createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(normalizedExpected, "utf8").digest();
  if (provided.length !== normalizedExpected.length || !crypto.timingSafeEqual(providedDigest, expectedDigest)) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden: Invalid shared identity secret."
    };
  }
  return { ok: true };
}
var SlidingWindowRateLimiter = class {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.hitsByKey = /* @__PURE__ */ new Map();
  }
  consume(key, nowMs = Date.now()) {
    const cutoff = nowMs - this.windowMs;
    const existing = this.hitsByKey.get(key) ?? [];
    const recent = existing.filter((ts) => ts > cutoff);
    if (recent.length >= this.maxRequests) {
      this.hitsByKey.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hitsByKey.set(key, recent);
    if (this.hitsByKey.size > 2e3) {
      for (const [k, list] of this.hitsByKey.entries()) {
        const filtered = list.filter((ts) => ts > cutoff);
        if (filtered.length === 0) this.hitsByKey.delete(k);
        else this.hitsByKey.set(k, filtered);
      }
    }
    return true;
  }
};

// src/shared/dailyQuests.ts
var DAILY_MASTERY_FALLBACK_GOLD = 350;
var DAILY_MASTERY_FALLBACK_XP = 300;
var DAILY_QUEST_TEMPLATES = [
  // Slot 0: Skirmish (kills)
  {
    id: "dq_slay_25",
    slot: "skirmish",
    title: "Sanctuary Patrol",
    description: "Slay 25 dungeon monsters across expedition runs.",
    metric: "kills",
    target: 25,
    rewardGold: 120,
    rewardXp: 140,
    rewardsArmament: false
  },
  {
    id: "dq_slay_35",
    slot: "skirmish",
    title: "Crypt Vanguard",
    description: "Slay 35 dungeon monsters across expedition runs.",
    metric: "kills",
    target: 35,
    rewardGold: 155,
    rewardXp: 185,
    rewardsArmament: false
  },
  {
    id: "dq_slay_45",
    slot: "skirmish",
    title: "Abyssal Purge",
    description: "Slay 45 dungeon monsters across expedition runs.",
    metric: "kills",
    target: 45,
    rewardGold: 190,
    rewardXp: 230,
    rewardsArmament: false
  },
  // Slot 1: Delve (floors_cleared)
  {
    id: "dq_floors_2",
    slot: "delve",
    title: "Subterranean Descent",
    description: "Clear 2 dungeon floors across one or more expeditions.",
    metric: "floors_cleared",
    target: 2,
    rewardGold: 150,
    rewardXp: 180,
    rewardsArmament: false
  },
  {
    id: "dq_floors_3",
    slot: "delve",
    title: "Reliquary March",
    description: "Clear 3 dungeon floors across one or more expeditions.",
    metric: "floors_cleared",
    target: 3,
    rewardGold: 210,
    rewardXp: 250,
    rewardsArmament: false
  },
  // Slot 2: Trial (boss_kills or runs_played)
  {
    id: "dq_boss_1",
    slot: "trial",
    title: "Guardian Challenger",
    description: "Defeat 1 Floor Guardian Boss during an expedition.",
    metric: "boss_kills",
    target: 1,
    rewardGold: 165,
    rewardXp: 200,
    rewardsArmament: false
  },
  {
    id: "dq_runs_1",
    slot: "trial",
    title: "Oathbound Venture",
    description: "Complete 1 full expedition attempt (Victory or Fall in battle).",
    metric: "runs_played",
    target: 1,
    rewardGold: 145,
    rewardXp: 170,
    rewardsArmament: false
  },
  // Slot 3: Daily Armory Bounty (Always awards a class-matched Armament or Mastery Bonus)
  {
    id: "dq_bounty_boss_2",
    slot: "bounty",
    title: "Armory Bounty: Boss Hunter",
    description: "Defeat 2 Floor Bosses across runs to earn a sworn class Armament.",
    metric: "boss_kills",
    target: 2,
    rewardGold: 200,
    rewardXp: 260,
    rewardsArmament: true
  },
  {
    id: "dq_bounty_floors_4",
    slot: "bounty",
    title: "Armory Bounty: Deep Delver",
    description: "Clear 4 dungeon floors across runs to earn a sworn class Armament.",
    metric: "floors_cleared",
    target: 4,
    rewardGold: 220,
    rewardXp: 280,
    rewardsArmament: true
  },
  {
    id: "dq_bounty_kills_60",
    slot: "bounty",
    title: "Armory Bounty: Endless Vigil",
    description: "Slay 60 dungeon monsters across runs to earn a sworn class Armament.",
    metric: "kills",
    target: 60,
    rewardGold: 210,
    rewardXp: 270,
    rewardsArmament: true
  },
  {
    id: "dq_bounty_runs_2",
    slot: "bounty",
    title: "Armory Bounty: Seasoned Delver",
    description: "Finish 2 expeditions (Victory or Defeat) to earn a sworn class Armament.",
    metric: "runs_played",
    target: 2,
    rewardGold: 220,
    rewardXp: 280,
    rewardsArmament: true
  }
];
var TEMPLATES_BY_ID = new Map(
  DAILY_QUEST_TEMPLATES.map((t) => [t.id, t])
);
function getUtcDateKey(nowMs = Date.now()) {
  const safeMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(safeMs).toISOString().slice(0, 10);
}
function getNextUtcResetMs(nowMs = Date.now()) {
  const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}
function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function computeNextXpForLevel(level) {
  if (level >= MAX_LEVEL) return 999999;
  const lvl = Math.max(1, level);
  return Math.round(80 + (lvl - 1) * 60 + Math.pow(lvl - 1, 1.75) * 12);
}
function getDailyQuestTemplatesForDate(dateKey) {
  const seed = hashSeed(`beyond:daily:${dateKey}`);
  const bountyPool = DAILY_QUEST_TEMPLATES.filter((t) => t.slot === "bounty");
  const bounty = bountyPool[seed % bountyPool.length];
  const skirmishPool = DAILY_QUEST_TEMPLATES.filter(
    (t) => t.slot === "skirmish" && t.metric !== bounty.metric
  );
  const delvePool = DAILY_QUEST_TEMPLATES.filter(
    (t) => t.slot === "delve" && t.metric !== bounty.metric
  );
  const trialPool = DAILY_QUEST_TEMPLATES.filter(
    (t) => t.slot === "trial" && t.metric !== bounty.metric
  );
  const selected = [];
  if (skirmishPool.length > 0) {
    selected.push(skirmishPool[(seed >>> 3) % skirmishPool.length]);
  }
  if (delvePool.length > 0) {
    selected.push(delvePool[(seed >>> 7) % delvePool.length]);
  }
  if (trialPool.length > 0) {
    selected.push(trialPool[(seed >>> 11) % trialPool.length]);
  }
  if (selected.length < 3) {
    const usedMetrics = /* @__PURE__ */ new Set([
      bounty.metric,
      ...selected.map((s) => s.metric)
    ]);
    const extras = DAILY_QUEST_TEMPLATES.filter(
      (t) => t.slot !== "bounty" && !usedMetrics.has(t.metric)
    );
    if (extras.length > 0) {
      selected.push(extras[(seed >>> 15) % extras.length]);
    }
  }
  selected.push(bounty);
  return selected;
}
function createDailyQuestStateForDate(dateKey) {
  const templates = getDailyQuestTemplatesForDate(dateKey);
  const quests = {};
  for (const t of templates) {
    quests[t.id] = {
      questId: t.id,
      progress: 0,
      claimed: false
    };
  }
  return { dateKey, quests };
}
function normalizeDailyQuestState(raw, nowMs = Date.now()) {
  const currentDateKey = getUtcDateKey(nowMs);
  let parsed = null;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") parsed = obj;
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw;
  }
  const fresh = createDailyQuestStateForDate(currentDateKey);
  if (!parsed || parsed.dateKey !== currentDateKey) {
    return fresh;
  }
  const rawQuests = parsed.quests && typeof parsed.quests === "object" ? parsed.quests : {};
  for (const [questId, entry] of Object.entries(fresh.quests)) {
    const tpl = TEMPLATES_BY_ID.get(questId);
    if (!tpl) continue;
    const savedRaw = rawQuests[questId];
    if (savedRaw && typeof savedRaw === "object") {
      const saved = savedRaw;
      const rawProgress = Number(saved.progress);
      entry.progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(tpl.target, Math.floor(rawProgress))) : 0;
      entry.claimed = Boolean(saved.claimed) && entry.progress >= tpl.target;
      if (entry.claimed && typeof saved.claimedAt === "number" && Number.isFinite(saved.claimedAt)) {
        entry.claimedAt = saved.claimedAt;
      }
    }
  }
  return fresh;
}
function applyDailyQuestEvent(state, metric, amount = 1, nowMs = Date.now()) {
  const normalized = normalizeDailyQuestState(state, nowMs);
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  if (delta <= 0) {
    return { state: normalized, changed: false, newlyCompletedIds: [] };
  }
  const templates = getDailyQuestTemplatesForDate(normalized.dateKey);
  let changed = false;
  const newlyCompletedIds = [];
  for (const tpl of templates) {
    if (tpl.metric !== metric) continue;
    const entry = normalized.quests[tpl.id];
    if (!entry || entry.claimed) continue;
    const prev = entry.progress;
    const next = Math.min(tpl.target, prev + delta);
    if (next !== prev) {
      entry.progress = next;
      changed = true;
      if (prev < tpl.target && next >= tpl.target) {
        newlyCompletedIds.push(tpl.id);
      }
    }
  }
  return { state: normalized, changed, newlyCompletedIds };
}
function resolveDailyQuestArmament(heroClass, ownedWeapons = [], ownedVestments = [], dateKey = getUtcDateKey(), questId = "") {
  const validClass = HERO_CLASSES[heroClass] ? heroClass : "vanguard";
  const classItems = [
    ...WEAPON_CATALOG.filter((w) => w.heroClass === validClass && !w.isDefault),
    ...VESTMENT_CATALOG.filter((v) => v.heroClass === validClass && !v.isDefault)
  ];
  const unowned = classItems.filter(
    (item) => item.slot === "weapon" ? !ownedWeapons.includes(item.id) : !ownedVestments.includes(item.id)
  );
  if (unowned.length === 0) return null;
  const forgedUnowned = unowned.filter((i) => i.rarity === "Forged");
  const pool = forgedUnowned.length > 0 ? forgedUnowned : unowned;
  const pickIdx = hashSeed(`${dateKey}:${questId}:${validClass}`) % pool.length;
  return pool[pickIdx] ?? pool[0];
}
function buildDailyQuestRewardPreview(tpl, heroClass, ownedWeapons = [], ownedVestments = [], dateKey = getUtcDateKey()) {
  if (!tpl.rewardsArmament) {
    return {
      gold: tpl.rewardGold,
      xp: tpl.rewardXp,
      armament: null,
      masteryFallback: null
    };
  }
  const candidate = resolveDailyQuestArmament(
    heroClass,
    ownedWeapons,
    ownedVestments,
    dateKey,
    tpl.id
  );
  if (candidate) {
    return {
      gold: tpl.rewardGold,
      xp: tpl.rewardXp,
      armament: {
        slot: candidate.slot,
        itemId: candidate.id,
        name: candidate.name,
        rarity: candidate.rarity,
        accent: candidate.accent,
        summary: candidate.summary,
        passiveName: candidate.slot === "vestment" ? candidate.passiveName : void 0
      },
      masteryFallback: null
    };
  }
  return {
    gold: tpl.rewardGold,
    xp: tpl.rewardXp,
    armament: null,
    masteryFallback: {
      bonusGold: DAILY_MASTERY_FALLBACK_GOLD,
      bonusXp: DAILY_MASTERY_FALLBACK_XP,
      reason: "All sworn class Armaments unlocked \u2014 grants Mastery Bonus instead."
    }
  };
}
function hydrateDailyQuestsForAccount(acc, nowMs = Date.now()) {
  const heroClass = HERO_CLASSES[acc.lockedClass] ? acc.lockedClass : HERO_CLASSES[acc.preferredClass] ? acc.preferredClass : "vanguard";
  const state = normalizeDailyQuestState(acc.dailyQuests, nowMs);
  const templates = getDailyQuestTemplatesForDate(state.dateKey);
  const ownedWeapons = acc.ownedWeapons || [];
  const ownedVestments = acc.ownedVestments || [];
  const quests = templates.map((tpl) => {
    const entry = state.quests[tpl.id] || {
      questId: tpl.id,
      progress: 0,
      claimed: false
    };
    const progress = Math.max(0, Math.min(tpl.target, entry.progress));
    const claimed = Boolean(entry.claimed) && progress >= tpl.target;
    return {
      questId: tpl.id,
      title: tpl.title,
      description: tpl.description,
      metric: tpl.metric,
      progress,
      target: tpl.target,
      completed: progress >= tpl.target,
      claimed,
      claimedAt: entry.claimedAt,
      rewardsArmament: tpl.rewardsArmament,
      rewardPreview: buildDailyQuestRewardPreview(
        tpl,
        heroClass,
        ownedWeapons,
        ownedVestments,
        state.dateKey
      )
    };
  });
  return {
    dateKey: state.dateKey,
    resetAtMs: getNextUtcResetMs(nowMs),
    state,
    quests
  };
}
function applyAccountXpAndLevelUp(acc, xpToAdd) {
  const rawLevel = Number(acc.level) || 1;
  acc.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(rawLevel)));
  acc.xp = acc.level >= MAX_LEVEL ? 0 : Math.max(0, Number(acc.xp) || 0);
  acc.attributePoints = Math.max(0, Number(acc.attributePoints) || 0);
  const safeXp = Math.max(0, Math.floor(Number(xpToAdd) || 0));
  if (safeXp <= 0 || acc.level >= MAX_LEVEL) {
    if (acc.level >= MAX_LEVEL) {
      acc.level = MAX_LEVEL;
      acc.xp = 0;
    }
    return { levelsGained: 0 };
  }
  acc.xp += safeXp;
  let levelsGained = 0;
  while (acc.level < MAX_LEVEL) {
    const nextXp = computeNextXpForLevel(acc.level);
    if (acc.xp < nextXp) break;
    acc.xp -= nextXp;
    acc.level += 1;
    acc.attributePoints += 3;
    levelsGained += 1;
  }
  if (acc.level >= MAX_LEVEL) {
    acc.level = MAX_LEVEL;
    acc.xp = 0;
  }
  return { levelsGained };
}
function claimDailyQuestForAccount(acc, questId, nowMs = Date.now()) {
  if (typeof questId !== "string" || !questId.trim()) {
    return { ok: false, status: 400, error: "A valid questId is required." };
  }
  const cleanId = questId.trim();
  applyAccountArmamentMigration(acc);
  const state = normalizeDailyQuestState(acc.dailyQuests, nowMs);
  acc.dailyQuests = state;
  const tpl = TEMPLATES_BY_ID.get(cleanId);
  const entry = state.quests[cleanId];
  if (!tpl || !entry) {
    return { ok: false, status: 404, error: "That quest is not active in today\u2019s daily rotation." };
  }
  if (entry.claimed) {
    return { ok: false, status: 409, error: "Reward for this daily quest has already been claimed today." };
  }
  if (entry.progress < tpl.target) {
    return { ok: false, status: 400, error: "Daily quest objective is not yet complete." };
  }
  const heroClass = HERO_CLASSES[acc.lockedClass] ? acc.lockedClass : HERO_CLASSES[acc.preferredClass] ? acc.preferredClass : "vanguard";
  const preview = buildDailyQuestRewardPreview(
    tpl,
    heroClass,
    acc.ownedWeapons || [],
    acc.ownedVestments || [],
    state.dateKey
  );
  let goldAdded = preview.gold;
  let xpAdded = preview.xp;
  let masteryBonusApplied = false;
  let armamentGranted = null;
  if (preview.armament) {
    const def = getArmamentDef(preview.armament.slot, preview.armament.itemId);
    if (def && def.heroClass === heroClass) {
      if (def.slot === "weapon") {
        if (!acc.ownedWeapons.includes(def.id)) {
          acc.ownedWeapons.push(def.id);
        }
      } else {
        if (!acc.ownedVestments.includes(def.id)) {
          acc.ownedVestments.push(def.id);
        }
      }
      armamentGranted = {
        slot: def.slot,
        itemId: def.id,
        name: def.name,
        rarity: def.rarity,
        accent: def.accent
      };
    }
  } else if (preview.masteryFallback) {
    goldAdded += preview.masteryFallback.bonusGold;
    xpAdded += preview.masteryFallback.bonusXp;
    masteryBonusApplied = true;
  }
  acc.gold = Math.max(0, Number(acc.gold) || 0) + goldAdded;
  const { levelsGained } = applyAccountXpAndLevelUp(acc, xpAdded);
  entry.claimed = true;
  entry.claimedAt = nowMs;
  const hydrated = hydrateDailyQuestsForAccount(acc, nowMs);
  return {
    ok: true,
    dateKey: hydrated.dateKey,
    resetAtMs: hydrated.resetAtMs,
    quests: hydrated.quests,
    rewardGranted: {
      questId: tpl.id,
      questTitle: tpl.title,
      goldAdded,
      xpAdded,
      levelsGained,
      armamentGranted,
      masteryBonusApplied
    }
  };
}

// src/shared/armamentShop.ts
var SANCTUARY_GOLD_REWARDS = {
  floorClearedGold: 45,
  bossKillGold: 60
};
var ARMAMENT_SHOP_PRICES = {
  weapon: {
    Standard: 0,
    Forged: 400,
    Ascendant: 750
  },
  vestment: {
    Standard: 0,
    Forged: 320,
    Ascendant: 600
  }
};
function getArmamentShopPrice(def) {
  if (def.isDefault) return 0;
  return ARMAMENT_SHOP_PRICES[def.slot][def.rarity];
}
function resolveAccountHeroClass(acc) {
  if (HERO_CLASSES[acc.lockedClass]) return acc.lockedClass;
  if (HERO_CLASSES[acc.preferredClass]) return acc.preferredClass;
  return "vanguard";
}
function toShopItem(def, heroClass, gold, ownedWeapons, ownedVestments, equippedWeapon, equippedVestment) {
  const priceGold = getArmamentShopPrice(def);
  const owned = def.slot === "weapon" ? ownedWeapons.includes(def.id) : ownedVestments.includes(def.id);
  const equipped = def.slot === "weapon" ? equippedWeapon === def.id : equippedVestment === def.id;
  const classMatch = def.heroClass === heroClass;
  const tacticalDef = def.slot === "weapon" ? getWeaponTacticalDef(def) : null;
  const vestment = def.slot === "vestment" ? def : null;
  return {
    slot: def.slot,
    itemId: def.id,
    heroClass: def.heroClass,
    name: def.name,
    rarity: def.rarity,
    archetype: def.archetype,
    summary: def.summary,
    effectLines: def.effectLines,
    accent: def.accent,
    isDefault: Boolean(def.isDefault),
    priceGold,
    owned,
    equipped,
    classMatch,
    canAfford: gold >= priceGold,
    tacticalDef,
    passiveName: vestment?.passiveName,
    passiveSummary: vestment?.passiveSummary
  };
}
function hydrateArmamentShopForAccount(acc) {
  const heroClass = resolveAccountHeroClass(acc);
  const gold = Math.max(0, Math.floor(Number(acc.gold) || 0));
  const ownedWeapons = acc.ownedWeapons || [];
  const ownedVestments = acc.ownedVestments || [];
  const allDefs = [...WEAPON_CATALOG, ...VESTMENT_CATALOG];
  const items = allDefs.map(
    (def) => toShopItem(
      def,
      heroClass,
      gold,
      ownedWeapons,
      ownedVestments,
      acc.equippedWeapon,
      acc.equippedVestment
    )
  ).sort((a, b) => {
    if (a.classMatch !== b.classMatch) return a.classMatch ? -1 : 1;
    if (a.heroClass !== b.heroClass) return a.heroClass.localeCompare(b.heroClass);
    if (a.slot !== b.slot) return a.slot === "weapon" ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
    return a.priceGold - b.priceGold;
  });
  const classItems = items.filter((i) => i.classMatch);
  return {
    gold,
    heroClass,
    ownedClassCount: classItems.filter((i) => i.owned).length,
    totalClassCount: classItems.length,
    items
  };
}
function purchaseArmamentForAccount(acc, slot, itemId, opts = {}) {
  if (slot !== "weapon" && slot !== "vestment") {
    return { ok: false, status: 400, error: "Invalid armament slot." };
  }
  const cleanId = typeof itemId === "string" ? itemId.trim() : "";
  if (!cleanId) {
    return { ok: false, status: 400, error: "Missing armament itemId." };
  }
  applyAccountArmamentMigration(acc);
  const def = getArmamentDef(slot, cleanId);
  if (!def) {
    return { ok: false, status: 404, error: "Unknown armament." };
  }
  const activeClass = resolveAccountHeroClass(acc);
  if (def.heroClass !== activeClass) {
    return {
      ok: false,
      status: 403,
      error: `${def.name} requires the ${HERO_CLASSES[def.heroClass].name} class.`
    };
  }
  const ownedList = slot === "weapon" ? acc.ownedWeapons : acc.ownedVestments;
  if (ownedList.includes(cleanId) || def.isDefault) {
    return {
      ok: false,
      status: 409,
      error: `You already own ${def.name}.`
    };
  }
  const priceGold = getArmamentShopPrice(def);
  const currentGold = Math.max(0, Math.floor(Number(acc.gold) || 0));
  if (currentGold < priceGold) {
    return {
      ok: false,
      status: 400,
      error: `Not enough Gold for ${def.name}. Need ${priceGold} Gold (you have ${currentGold} Gold).`
    };
  }
  acc.gold = currentGold - priceGold;
  ownedList.push(cleanId);
  let equipped = false;
  if (opts.autoEquip) {
    if (slot === "weapon") {
      acc.equippedWeapon = cleanId;
    } else {
      acc.equippedVestment = cleanId;
    }
    equipped = true;
  }
  applyAccountArmamentMigration(acc);
  return {
    ok: true,
    slot,
    item: def,
    priceGold,
    equipped,
    goldRemaining: acc.gold,
    shop: hydrateArmamentShopForAccount(acc)
  };
}
function equipArmamentForAccount(acc, slot, itemId) {
  if (slot !== "weapon" && slot !== "vestment") {
    return { ok: false, status: 400, error: "Invalid armament slot." };
  }
  applyAccountArmamentMigration(acc);
  const activeClass = resolveAccountHeroClass(acc);
  if (itemId === null) {
    if (slot === "weapon") {
      acc.equippedWeapon = null;
      return {
        ok: true,
        slot,
        equippedId: null,
        item: null,
        shop: hydrateArmamentShopForAccount(acc)
      };
    }
    const defaultVestmentId = getDefaultVestmentIdForClass(activeClass);
    acc.equippedVestment = defaultVestmentId;
    return {
      ok: true,
      slot,
      equippedId: defaultVestmentId,
      item: getArmamentDef("vestment", defaultVestmentId),
      shop: hydrateArmamentShopForAccount(acc)
    };
  }
  const cleanId = typeof itemId === "string" ? itemId.trim() : "";
  const def = cleanId ? getArmamentDef(slot, cleanId) : null;
  if (!def) {
    return { ok: false, status: 404, error: "Unknown armament." };
  }
  if (def.heroClass !== activeClass) {
    return {
      ok: false,
      status: 403,
      error: `${def.name} belongs to ${HERO_CLASSES[def.heroClass].name}.`
    };
  }
  const ownedList = slot === "weapon" ? acc.ownedWeapons : acc.ownedVestments;
  if (!ownedList.includes(cleanId)) {
    return {
      ok: false,
      status: 403,
      error: `You must unlock or purchase ${def.name} before equipping it.`
    };
  }
  if (slot === "weapon") {
    acc.equippedWeapon = cleanId;
  } else {
    acc.equippedVestment = cleanId;
  }
  applyAccountArmamentMigration(acc);
  return {
    ok: true,
    slot,
    equippedId: cleanId,
    item: def,
    shop: hydrateArmamentShopForAccount(acc)
  };
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var accountsByLower = /* @__PURE__ */ new Map();
var accountsById = /* @__PURE__ */ new Map();
var sessionsByToken = /* @__PURE__ */ new Map();
function clearExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessionsByToken.entries()) {
    if (session.expiresAt < now) {
      sessionsByToken.delete(token);
    }
  }
}
setInterval(clearExpiredSessions, 1e3 * 60 * 60);
var DATA_DIR = path.resolve(__dirname, "data");
var ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
var MIGRATIONS_FILE = path.join(DATA_DIR, "migrations.json");
var { Pool } = pg;
var dbPool = null;
if (process.env.DATABASE_URL) {
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : void 0
  });
}
function normalizeAccountLevel(acc) {
  const rawLevel = Number(acc.level) || 1;
  if (rawLevel >= MAX_LEVEL) {
    acc.level = MAX_LEVEL;
    acc.xp = 0;
  } else {
    acc.level = Math.max(1, Math.floor(rawLevel));
    acc.xp = Math.max(0, Number(acc.xp) || 0);
  }
}
function toPublicProfile(acc) {
  normalizeAccountLevel(acc);
  applyAccountArmamentMigration(acc);
  acc.dailyQuests = normalizeDailyQuestState(acc.dailyQuests);
  return {
    id: acc.id,
    username: acc.username,
    preferredClass: acc.lockedClass,
    lockedClass: acc.lockedClass,
    runsCompleted: acc.runsCompleted,
    highestFloor: acc.highestFloor,
    totalKills: acc.totalKills,
    totalRevives: acc.totalRevives,
    isAdmin: !!acc.isAdmin,
    level: acc.level || 1,
    xp: acc.xp || 0,
    strength: acc.strength || 0,
    vitality: acc.vitality || 0,
    dexterity: acc.dexterity || 0,
    intelligence: acc.intelligence || 0,
    faith: acc.faith || 0,
    attributePoints: acc.attributePoints || 0,
    ownedWeapons: [...acc.ownedWeapons || []],
    ownedVestments: [...acc.ownedVestments || []],
    equippedWeapon: acc.equippedWeapon ?? null,
    equippedVestment: acc.equippedVestment ?? null,
    gold: Math.max(0, Number(acc.gold) || 0),
    dailyQuests: acc.dailyQuests
  };
}
var fileSaveInFlight = false;
var fileSaveQueued = false;
var fileDataDirReady = false;
async function flushAccountsToFile() {
  if (fileSaveInFlight) {
    fileSaveQueued = true;
    return;
  }
  fileSaveInFlight = true;
  try {
    do {
      fileSaveQueued = false;
      if (!fileDataDirReady) {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        fileDataDirReady = true;
      }
      const list = Array.from(accountsById.values());
      await fs.promises.writeFile(ACCOUNTS_FILE, JSON.stringify(list, null, 2), "utf8");
    } while (fileSaveQueued);
  } catch (err) {
    console.error("Failed to save accounts to file:", err);
  } finally {
    fileSaveInFlight = false;
  }
}
function saveAccountsToFile() {
  void flushAccountsToFile();
}
var accountLocks = /* @__PURE__ */ new Map();
async function persistAccount(acc) {
  const lockKey = acc.id;
  const existingLock = accountLocks.get(lockKey) || Promise.resolve();
  const newLock = (async () => {
    try {
      await existingLock;
    } catch {
    }
    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO accounts (
            id, username, username_lower, password_hash, locked_class, preferred_class,
            runs_completed, highest_floor, total_kills, total_revives, gold, is_admin,
            level, xp,
            strength, vitality, dexterity, intelligence, faith, attribute_points,
            owned_weapons, owned_vestments, equipped_weapon, equipped_vestment, daily_quests, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW())
          ON CONFLICT (username_lower) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            locked_class = EXCLUDED.locked_class,
            preferred_class = EXCLUDED.preferred_class,
            runs_completed = EXCLUDED.runs_completed,
            highest_floor = EXCLUDED.highest_floor,
            total_kills = EXCLUDED.total_kills,
            total_revives = EXCLUDED.total_revives,
            gold = EXCLUDED.gold,
            is_admin = EXCLUDED.is_admin,
            level = EXCLUDED.level,
            xp = EXCLUDED.xp,
            strength = EXCLUDED.strength,
            vitality = EXCLUDED.vitality,
            dexterity = EXCLUDED.dexterity,
            intelligence = EXCLUDED.intelligence,
            faith = EXCLUDED.faith,
            attribute_points = EXCLUDED.attribute_points,
            owned_weapons = EXCLUDED.owned_weapons,
            owned_vestments = EXCLUDED.owned_vestments,
            equipped_weapon = EXCLUDED.equipped_weapon,
            equipped_vestment = EXCLUDED.equipped_vestment,
            daily_quests = EXCLUDED.daily_quests,
            updated_at = NOW();`,
          [
            acc.id,
            acc.username,
            acc.usernameLower,
            acc.passwordHash,
            acc.lockedClass,
            acc.preferredClass,
            acc.runsCompleted,
            acc.highestFloor,
            acc.totalKills,
            acc.totalRevives,
            acc.gold ?? 0,
            !!acc.isAdmin,
            acc.level || 1,
            acc.xp || 0,
            acc.strength || 0,
            acc.vitality || 0,
            acc.dexterity || 0,
            acc.intelligence || 0,
            acc.faith || 0,
            acc.attributePoints || 0,
            JSON.stringify(acc.ownedWeapons || []),
            JSON.stringify(acc.ownedVestments || []),
            acc.equippedWeapon ?? null,
            acc.equippedVestment ?? null,
            JSON.stringify(normalizeDailyQuestState(acc.dailyQuests))
          ]
        );
      } catch (err) {
        console.error(`Postgres persist error for ${acc.username}:`, err);
        throw err;
      }
    }
    accountsByLower.set(acc.usernameLower, acc);
    accountsById.set(acc.id, acc);
    saveAccountsToFile();
  })();
  accountLocks.set(lockKey, newLock);
  newLock.then(
    () => {
      if (accountLocks.get(lockKey) === newLock) {
        accountLocks.delete(lockKey);
      }
    },
    () => {
      if (accountLocks.get(lockKey) === newLock) {
        accountLocks.delete(lockKey);
      }
    }
  );
  return newLock;
}
async function initStorage() {
  if (dbPool) {
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(32) NOT NULL,
          username_lower VARCHAR(32) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          locked_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          preferred_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          runs_completed INT NOT NULL DEFAULT 0,
          highest_floor INT NOT NULL DEFAULT 0,
          total_kills INT NOT NULL DEFAULT 0,
          total_revives INT NOT NULL DEFAULT 0,
          gold INT NOT NULL DEFAULT 0,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          level INT NOT NULL DEFAULT 1,
          xp INT NOT NULL DEFAULT 0,
          strength INT NOT NULL DEFAULT 0,
          vitality INT NOT NULL DEFAULT 0,
          dexterity INT NOT NULL DEFAULT 0,
          intelligence INT NOT NULL DEFAULT 0,
          faith INT NOT NULL DEFAULT 0,
          attribute_points INT NOT NULL DEFAULT 0,
          owned_weapons TEXT NOT NULL DEFAULT '[]',
          owned_vestments TEXT NOT NULL DEFAULT '[]',
          equipped_weapon VARCHAR(64),
          equipped_vestment VARCHAR(64),
          daily_quests TEXT NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      await dbPool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='is_admin') THEN
            ALTER TABLE accounts ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='strength') THEN
            ALTER TABLE accounts ADD COLUMN strength INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='intelligence') THEN
            ALTER TABLE accounts ADD COLUMN intelligence INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='faith') THEN
            ALTER TABLE accounts ADD COLUMN faith INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='dexterity') THEN
            ALTER TABLE accounts ADD COLUMN dexterity INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='vitality') THEN
            ALTER TABLE accounts ADD COLUMN vitality INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='attribute_points') THEN
            ALTER TABLE accounts ADD COLUMN attribute_points INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='level') THEN
            ALTER TABLE accounts ADD COLUMN level INT NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='xp') THEN
            ALTER TABLE accounts ADD COLUMN xp INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='owned_weapons') THEN
            ALTER TABLE accounts ADD COLUMN owned_weapons TEXT NOT NULL DEFAULT '[]';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='owned_vestments') THEN
            ALTER TABLE accounts ADD COLUMN owned_vestments TEXT NOT NULL DEFAULT '[]';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='equipped_weapon') THEN
            ALTER TABLE accounts ADD COLUMN equipped_weapon VARCHAR(64);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='equipped_vestment') THEN
            ALTER TABLE accounts ADD COLUMN equipped_vestment VARCHAR(64);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='daily_quests') THEN
            ALTER TABLE accounts ADD COLUMN daily_quests TEXT NOT NULL DEFAULT '{}';
          END IF;
          -- Increase password_hash length for scrypt
          ALTER TABLE accounts ALTER COLUMN password_hash TYPE VARCHAR(255);
        END $$;
      `);
      console.log("Connected to PostgreSQL and verified schema.");
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      const migrationRes = await dbPool.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        ["20261106_reset_attributes"]
      );
      if (migrationRes.rowCount === 0) {
        console.log("[Migration] Running one-time global attribute reset in PostgreSQL...");
        await dbPool.query(`
          UPDATE accounts 
          SET strength = 0, vitality = 0, dexterity = 0, intelligence = 0, faith = 0, 
              attribute_points = (GREATEST(1, level) - 1) * 3;
        `);
        await dbPool.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          ["20261106_reset_attributes"]
        );
        console.log("[Migration] Attribute reset migration completed successfully in PostgreSQL.");
      } else {
        console.log("[Migration] Attribute reset migration already applied. Preserving account attributes.");
      }
      const armamentMigrationRes = await dbPool.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        ["20261119_permanent_armaments"]
      );
      const needsArmamentMigration = armamentMigrationRes.rowCount === 0;
      const res = await dbPool.query("SELECT * FROM accounts");
      const migratedAccounts = [];
      for (const row of res.rows) {
        const lvl = Number(row.level) || 1;
        const parsedWeapons = parseArmamentIdArray(row.owned_weapons, "weapon");
        const parsedVestments = parseArmamentIdArray(row.owned_vestments, "vestment");
        const isLegacyRow = needsArmamentMigration && row.equipped_weapon == null && row.equipped_vestment == null && parsedWeapons.length === 0 && parsedVestments.length === 0;
        const rec = {
          id: row.id,
          username: row.username,
          usernameLower: row.username_lower,
          passwordHash: row.password_hash,
          lockedClass: row.locked_class,
          preferredClass: row.preferred_class,
          runsCompleted: Number(row.runs_completed) || 0,
          highestFloor: Number(row.highest_floor) || 0,
          totalKills: Number(row.total_kills) || 0,
          totalRevives: Number(row.total_revives) || 0,
          gold: Number(row.gold) || 0,
          isAdmin: !!row.is_admin,
          level: lvl,
          xp: Number(row.xp) || 0,
          strength: Number(row.strength) || 0,
          vitality: Number(row.vitality) || 0,
          dexterity: Number(row.dexterity) || 0,
          intelligence: Number(row.intelligence) || 0,
          faith: Number(row.faith) || 0,
          attributePoints: Number(row.attribute_points) || 0,
          ownedWeapons: parsedWeapons,
          ownedVestments: parsedVestments,
          equippedWeapon: isLegacyRow ? void 0 : row.equipped_weapon ?? null,
          equippedVestment: isLegacyRow ? void 0 : row.equipped_vestment ?? null,
          dailyQuests: normalizeDailyQuestState(row.daily_quests)
        };
        normalizeAccountLevel(rec);
        const changed = applyAccountArmamentMigration(rec, needsArmamentMigration);
        if (changed) {
          migratedAccounts.push(rec);
        }
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }
      if (needsArmamentMigration || migratedAccounts.length > 0) {
        for (const acc of migratedAccounts) {
          await dbPool.query(
            `UPDATE accounts
             SET owned_weapons = $2, owned_vestments = $3, equipped_weapon = $4, equipped_vestment = $5, updated_at = NOW()
             WHERE id = $1`,
            [
              acc.id,
              JSON.stringify(acc.ownedWeapons || []),
              JSON.stringify(acc.ownedVestments || []),
              acc.equippedWeapon ?? null,
              acc.equippedVestment ?? null
            ]
          );
        }
        if (needsArmamentMigration) {
          await dbPool.query(
            "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
            ["20261119_permanent_armaments"]
          );
          console.log(`[Migration] Permanent armaments assigned to ${migratedAccounts.length} PostgreSQL accounts.`);
        }
      }
      console.log(`Loaded ${res.rows.length} accounts from PostgreSQL.`);
    } catch (err) {
      console.error("PostgreSQL init error, falling back to local storage:", err);
    }
  }
  if (accountsById.size === 0 && fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const isProduction2 = process.env.NODE_ENV === "production";
      const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
      const list = JSON.parse(data);
      let appliedMigrations = [];
      if (fs.existsSync(MIGRATIONS_FILE)) {
        try {
          appliedMigrations = JSON.parse(fs.readFileSync(MIGRATIONS_FILE, "utf8"));
        } catch {
          appliedMigrations = [];
        }
      }
      const needsReset = !appliedMigrations.includes("20261106_reset_attributes");
      const needsArmamentMigration = !appliedMigrations.includes("20261119_permanent_armaments");
      if (needsReset) {
        console.log("[JSON Storage] Applying one-time attribute reset migration...");
      }
      if (needsArmamentMigration) {
        console.log("[JSON Storage] Applying permanent armaments migration...");
      }
      let anyJsonChanged = false;
      for (const rec of list) {
        if (isProduction2 && rec.usernameLower === "wanderer") continue;
        rec.level = Number(rec.level) || 1;
        rec.xp = Number(rec.xp) || 0;
        if (needsReset) {
          rec.strength = 0;
          rec.vitality = 0;
          rec.dexterity = 0;
          rec.intelligence = 0;
          rec.faith = 0;
          rec.attributePoints = (Math.max(1, rec.level) - 1) * 3;
        } else {
          rec.strength = Number(rec.strength) || 0;
          rec.vitality = Number(rec.vitality) || 0;
          rec.dexterity = Number(rec.dexterity) || 0;
          rec.intelligence = Number(rec.intelligence) || 0;
          rec.faith = Number(rec.faith) || 0;
          rec.attributePoints = Number(rec.attributePoints) || 0;
        }
        normalizeAccountLevel(rec);
        rec.dailyQuests = normalizeDailyQuestState(rec.dailyQuests);
        if (applyAccountArmamentMigration(rec, needsArmamentMigration)) {
          anyJsonChanged = true;
        }
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }
      if (needsReset || needsArmamentMigration || anyJsonChanged) {
        if (needsReset && !appliedMigrations.includes("20261106_reset_attributes")) {
          appliedMigrations.push("20261106_reset_attributes");
        }
        if (needsArmamentMigration && !appliedMigrations.includes("20261119_permanent_armaments")) {
          appliedMigrations.push("20261119_permanent_armaments");
        }
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(MIGRATIONS_FILE, JSON.stringify(appliedMigrations, null, 2), "utf8");
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(accountsById.values()), null, 2), "utf8");
        console.log("[JSON Storage] Account migrations applied and recorded.");
      }
      console.log(`Loaded ${accountsById.size} accounts from ${ACCOUNTS_FILE}`);
    } catch (err) {
      console.error("Failed to load accounts from file:", err);
    }
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction && !accountsByLower.has("wanderer")) {
    createAccount("wanderer", "beyond", "vanguard");
  }
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const adminUsername = "Aleph";
  const adminLower = adminUsername.toLowerCase();
  if (!accountsByLower.has(adminLower)) {
    if (bootstrapPassword) {
      if (bootstrapPassword.length >= 16) {
        console.log(`Bootstrapping fresh admin account "${adminUsername}"...`);
        createAccount(adminUsername, bootstrapPassword, "vanguard", true);
      } else {
        console.warn(`[Admin Bootstrap] ADMIN_BOOTSTRAP_PASSWORD provided but does not meet minimum length requirement of 16 characters (length: ${bootstrapPassword.length}).`);
      }
    }
  } else {
    const existing = accountsByLower.get(adminLower);
    if (!existing.isAdmin) {
      console.log(`Granting administrator privileges to account "${adminUsername}"...`);
      existing.isAdmin = true;
      persistAccount(existing);
    }
  }
}
function buildAccountRecord(username, password, chosenClass = "vanguard", isAdmin = false) {
  const validClass = normalizeHeroClass(chosenClass);
  const id = `usr_${crypto2.randomBytes(6).toString("hex")}`;
  const defaultWeapon = getDefaultWeaponIdForClass(validClass);
  const defaultVestment = getDefaultVestmentIdForClass(validClass);
  return {
    id,
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: hashPassword(password),
    lockedClass: validClass,
    preferredClass: validClass,
    runsCompleted: 0,
    highestFloor: 0,
    totalKills: 0,
    totalRevives: 0,
    gold: 0,
    isAdmin,
    strength: 0,
    vitality: 0,
    dexterity: 0,
    intelligence: 0,
    faith: 0,
    attributePoints: 0,
    level: 1,
    xp: 0,
    ownedWeapons: [defaultWeapon],
    ownedVestments: [defaultVestment],
    equippedWeapon: defaultWeapon,
    equippedVestment: defaultVestment,
    dailyQuests: normalizeDailyQuestState(void 0)
  };
}
function createAccount(username, password, chosenClass = "vanguard", isAdmin = false) {
  const rec = buildAccountRecord(username, password, chosenClass, isAdmin);
  persistAccount(rec);
  return rec;
}
var rooms = /* @__PURE__ */ new Map();
var roomDeltaStates = /* @__PURE__ */ new Map();
var dirtyNonPlayingRooms = /* @__PURE__ */ new Set();
var clients = /* @__PURE__ */ new Set();
var roomClientIndex = new RoomClientIndex();
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BYND-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}
function sendJson(ws, msg, options) {
  sendJsonMessage(ws, msg, options);
}
function getDialogueKey(dialogue) {
  if (!dialogue) return "";
  const optsKey = dialogue.options?.map((o) => o.id).join(",") ?? "";
  return `${dialogue.npcId}:${dialogue.seq}:${dialogue.text}:${optsKey}`;
}
function syncClientNpcDialogue(c, room) {
  if (c.ws.readyState !== WebSocket.OPEN) return;
  const dlg = room.getPlayerNpcDialogue(c.userId);
  const nextKey = getDialogueKey(dlg);
  if (nextKey !== (c.lastSentDialogueKey ?? "")) {
    c.lastSentDialogueKey = nextKey;
    sendJson(c.ws, { type: "npc:dialogue", dialogue: dlg });
  }
}
function broadcastRoomList() {
  const lobbyTargets = [];
  for (const c of clients) {
    if (!c.roomId || c.roomId === "TAVERN-HUB") {
      lobbyTargets.push(c);
    }
  }
  if (lobbyTargets.length === 0) return;
  const summaries = Array.from(rooms.values()).filter((r) => r.roomId !== "TAVERN-HUB").map((r) => r.getSummary());
  const payload = {
    type: "lobby:rooms",
    rooms: summaries,
    onlineCount: clients.size
  };
  broadcastSerialized(lobbyTargets, payload, { droppable: true });
}
function broadcastToRoom(roomId, msg, options = {}) {
  const stats = broadcastSerialized(roomClientIndex.getRoomClients(roomId), msg, options);
  if (stats.closedCount > 0) {
    for (const c of Array.from(roomClientIndex.getRoomClients(roomId))) {
      if (c.ws.readyState !== WebSocket.OPEN) {
        roomClientIndex.removeFromRoom(c, roomId);
        clients.delete(c);
      }
    }
  }
}
function attachRoomPersistenceCallbacks(room) {
  const isExpeditionRoom = room.roomId !== "TAVERN-HUB";
  room.onFloorClearedCallback = async (playerIds, floor) => {
    for (const pid of playerIds) {
      const acc = accountsById.get(pid);
      if (acc) {
        acc.highestFloor = Math.max(acc.highestFloor, floor);
        if (floor >= 3) acc.runsCompleted += 1;
        if (isExpeditionRoom) {
          acc.dailyQuests = applyDailyQuestEvent(acc.dailyQuests, "floors_cleared", 1).state;
          acc.gold = Math.max(0, Number(acc.gold) || 0) + SANCTUARY_GOLD_REWARDS.floorClearedGold;
        }
        await persistAccount(acc).catch((err) => console.error("Failed to persist floor clear:", err));
      }
    }
  };
  room.onKillCallback = async (pid, meta) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalKills += 1;
      if (isExpeditionRoom) {
        let next = applyDailyQuestEvent(acc.dailyQuests, "kills", 1).state;
        if (meta?.isBoss) {
          next = applyDailyQuestEvent(next, "boss_kills", 1).state;
          acc.gold = Math.max(0, Number(acc.gold) || 0) + SANCTUARY_GOLD_REWARDS.bossKillGold;
        }
        acc.dailyQuests = next;
      }
      await persistAccount(acc).catch((err) => console.error("Failed to persist kill:", err));
    }
  };
  room.onReviveCallback = async (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalRevives += 1;
      if (isExpeditionRoom) {
        acc.dailyQuests = applyDailyQuestEvent(acc.dailyQuests, "revives", 1).state;
      }
      await persistAccount(acc).catch((err) => console.error("Failed to persist revive:", err));
    }
  };
  room.onRunEndedCallback = async (playerIds) => {
    if (!isExpeditionRoom) return;
    for (const pid of playerIds) {
      const acc = accountsById.get(pid);
      if (acc) {
        acc.dailyQuests = applyDailyQuestEvent(acc.dailyQuests, "runs_played", 1).state;
        await persistAccount(acc).catch((err) => console.error("Failed to persist run completion:", err));
      }
    }
  };
  room.onProgressionUpdateCallback = async (pid, state) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.level = Math.max(1, Math.min(MAX_LEVEL, state.level));
      acc.xp = acc.level >= MAX_LEVEL ? 0 : Math.max(0, state.xp);
      acc.strength = state.strength;
      acc.vitality = state.vitality;
      acc.dexterity = state.dexterity;
      acc.intelligence = state.intelligence;
      acc.faith = state.faith;
      acc.attributePoints = state.attributePoints;
      await persistAccount(acc).catch((err) => {
        console.error("CRITICAL: Failed to persist progression update:", err);
      });
    }
  };
  room.onArmamentUnlockedCallback = async (pid, slot, itemId) => {
    const acc = accountsById.get(pid);
    if (!acc) return;
    applyAccountArmamentMigration(acc);
    if (slot === "weapon") {
      if (!acc.ownedWeapons.includes(itemId)) {
        acc.ownedWeapons.push(itemId);
      }
    } else {
      if (!acc.ownedVestments.includes(itemId)) {
        acc.ownedVestments.push(itemId);
      }
    }
    await persistAccount(acc).catch((err) => {
      console.error("Failed to persist unlocked permanent armament:", err);
    });
  };
}
function toPartyAccount(acc) {
  normalizeAccountLevel(acc);
  applyAccountArmamentMigration(acc);
  return {
    id: acc.id,
    username: acc.username,
    heroClass: acc.lockedClass || acc.preferredClass || "vanguard",
    isAdmin: acc.isAdmin,
    savedStats: {
      level: acc.level || 1,
      xp: acc.xp || 0,
      strength: acc.strength || 0,
      vitality: acc.vitality || 0,
      dexterity: acc.dexterity || 0,
      intelligence: acc.intelligence || 0,
      faith: acc.faith || 0,
      attributePoints: acc.attributePoints || 0,
      storage: acc.storedRelics || [],
      ownedWeapons: [...acc.ownedWeapons || []],
      ownedVestments: [...acc.ownedVestments || []],
      equippedWeapon: acc.equippedWeapon ?? null,
      equippedVestment: acc.equippedVestment ?? null
    }
  };
}
var partyCoordinator = new PartyCoordinator({
  rooms,
  roomClientIndex,
  roomDeltaStates,
  dirtyNonPlayingRooms,
  generateRoomCode,
  sendJson: (ws, msg) => sendJsonMessage(ws, msg),
  broadcastToRoom: (roomId, msg) => broadcastToRoom(roomId, msg),
  broadcastRoomList,
  onRoomCreated: attachRoomPersistenceCallbacks
});
async function startServer() {
  await initStorage();
  partyCoordinator.ensureTavernRoom();
  const app = express();
  app.use(express.json());
  const isProduction = process.env.NODE_ENV === "production";
  const rawOrigins = process.env.ALLOWED_ORIGINS || "";
  const allowedOrigins = rawOrigins.split(",").map((o) => o.trim()).filter((o) => {
    if (!o) return false;
    try {
      if (o.includes("*")) return false;
      const url = new URL(o);
      return url.origin === o && (url.protocol === "http:" || url.protocol === "https:");
    } catch {
      return false;
    }
  });
  if (rawOrigins && allowedOrigins.length === 0) {
    console.error("CRITICAL: ALLOWED_ORIGINS is configured but all entries were rejected as malformed.");
  }
  function isOriginAllowed(origin, hostHeader) {
    if (!origin) return true;
    if (allowedOrigins.length > 0) {
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return true;
      }
    }
    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();
      if (hostHeader) {
        const cleanHost = hostHeader.split(":")[0].toLowerCase();
        if (hostname === cleanHost) return true;
      }
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return true;
      }
      if (hostname.endsWith(".onrender.com") || hostname.endsWith(".run.app") || hostname.endsWith(".vercel.app") || hostname.endsWith(".itch.io") || hostname.endsWith(".itch.zone")) {
        return true;
      }
    } catch {
      return false;
    }
    return !isProduction;
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isAllowed = isOriginAllowed(origin, req.headers.host);
    if (isAllowed && origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    if (origin && !isAllowed) {
      console.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
      res.status(403).json({ error: "CORS policy: Origin not allowed." });
      return;
    }
    next();
  });
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";
  const redirectTarget = process.env.REDIRECT_URL || "https://beyond-game-sg.onrender.com";
  app.post("/api/auth/login", (req, res) => {
    const usernameRaw = String(req.body?.username ?? "").trim();
    const passwordRaw = String(req.body?.password ?? "");
    if (usernameRaw.length < 2 || usernameRaw.length > 20) {
      res.status(400).json({ error: "Username must be 2 to 20 characters." });
      return;
    }
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    const acc = accountsByLower.get(usernameRaw.toLowerCase());
    if (!acc) {
      if (isMaintenance) {
        res.status(503).json({
          error: `Server is migrating to Singapore for lower latency. Please connect to: ${redirectTarget}`,
          redirectUrl: redirectTarget
        });
        return;
      }
      res.status(401).json({ error: "No adventurer account found with that name." });
      return;
    }
    if (!verifyPassword(passwordRaw, acc.passwordHash)) {
      res.status(401).json({ error: "Invalid password for this adventurer." });
      return;
    }
    if (!acc.passwordHash.startsWith("scrypt:")) {
      acc.passwordHash = hashPassword(passwordRaw);
      persistAccount(acc);
    }
    if (acc.usernameLower === "aleph" && !acc.isAdmin) {
      acc.isAdmin = true;
      persistAccount(acc);
    }
    const token = crypto2.randomBytes(24).toString("hex");
    sessionsByToken.set(token, {
      userId: acc.id,
      expiresAt: Date.now() + 1e3 * 60 * 60 * 24
      // 24 hours
    });
    res.json({ token, user: toPublicProfile(acc) });
  });
  app.post("/api/auth/register", (req, res) => {
    if (isMaintenance) {
      res.status(503).json({
        error: `Server is migrating to Singapore for lower latency. Please register at: ${redirectTarget}`,
        redirectUrl: redirectTarget
      });
      return;
    }
    const usernameRaw = String(req.body?.username ?? "").trim();
    const passwordRaw = String(req.body?.password ?? "");
    const preferredClass = req.body?.preferredClass || "vanguard";
    if (!/^[a-zA-Z0-9_-]{2,20}$/.test(usernameRaw)) {
      res.status(400).json({
        error: "Username must be 2\u201320 letters, numbers, underscores, or hyphens."
      });
      return;
    }
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (accountsByLower.has(usernameRaw.toLowerCase())) {
      res.status(409).json({ error: "That adventurer name is already claimed." });
      return;
    }
    const isAdmin = usernameRaw.toLowerCase() === "aleph";
    const acc = createAccount(usernameRaw, passwordRaw, preferredClass, isAdmin);
    const token = crypto2.randomBytes(24).toString("hex");
    sessionsByToken.set(token, {
      userId: acc.id,
      expiresAt: Date.now() + 1e3 * 60 * 60 * 24
      // 24 hours
    });
    res.status(201).json({ token, user: toPublicProfile(acc) });
  });
  app.post("/api/auth/change-password", async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Authentication required to change password." });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }
    if (!verifyPassword(currentPassword, acc.passwordHash)) {
      res.status(401).json({ error: "Incorrect current password." });
      return;
    }
    acc.passwordHash = hashPassword(newPassword);
    await persistAccount(acc);
    for (const [t, sess] of sessionsByToken.entries()) {
      if (sess.userId === userId && t !== token) {
        sessionsByToken.delete(t);
      }
    }
    sessionsByToken.set(token, {
      userId,
      expiresAt: Date.now() + 1e3 * 60 * 60 * 24
      // 24 hours
    });
    res.json({ message: "Password updated successfully.", token });
  });
  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Session expired." });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    res.json({ user: toPublicProfile(acc) });
  });
  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token) sessionsByToken.delete(token);
    res.json({ ok: true });
  });
  function requireAuthenticatedAccount(req, res) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return null;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return null;
    }
    return acc;
  }
  const claimingDailyQuestAccounts = /* @__PURE__ */ new Set();
  app.get("/api/daily-quests", (req, res) => {
    const acc = requireAuthenticatedAccount(req, res);
    if (!acc) return;
    applyAccountArmamentMigration(acc);
    const hydrated = hydrateDailyQuestsForAccount(acc);
    acc.dailyQuests = hydrated.state;
    res.json({
      dateKey: hydrated.dateKey,
      resetAtMs: hydrated.resetAtMs,
      quests: hydrated.quests,
      user: toPublicProfile(acc)
    });
  });
  app.post("/api/daily-quests/claim", async (req, res) => {
    const acc = requireAuthenticatedAccount(req, res);
    if (!acc) return;
    const questId = typeof req.body?.questId === "string" ? req.body.questId.trim() : "";
    if (!questId) {
      res.status(400).json({ error: "Missing questId." });
      return;
    }
    if (claimingDailyQuestAccounts.has(acc.id)) {
      res.status(409).json({ error: "Quest reward claim already in progress." });
      return;
    }
    claimingDailyQuestAccounts.add(acc.id);
    const snapshot = {
      gold: acc.gold,
      level: acc.level,
      xp: acc.xp,
      attributePoints: acc.attributePoints,
      ownedWeapons: acc.ownedWeapons ? [...acc.ownedWeapons] : void 0,
      ownedVestments: acc.ownedVestments ? [...acc.ownedVestments] : void 0,
      dailyQuests: acc.dailyQuests ? JSON.parse(JSON.stringify(acc.dailyQuests)) : void 0
    };
    try {
      const claimRes = claimDailyQuestForAccount(acc, questId);
      if (!claimRes.ok) {
        res.status(claimRes.status).json({ error: claimRes.error });
        return;
      }
      await persistAccount(acc);
      for (const room of rooms.values()) {
        if (!room.hasPlayer(acc.id)) continue;
        if (claimRes.rewardGranted.armamentGranted) {
          room.grantArmament(
            acc.id,
            claimRes.rewardGranted.armamentGranted.slot,
            claimRes.rewardGranted.armamentGranted.itemId
          );
        }
        room.syncPlayerProgression(
          acc.id,
          acc.level || 1,
          acc.xp || 0,
          acc.attributePoints || 0
        );
        partyCoordinator.markRoomDirty(room.roomId);
      }
      res.json({
        ok: true,
        dateKey: claimRes.dateKey,
        resetAtMs: claimRes.resetAtMs,
        quests: claimRes.quests,
        rewardGranted: claimRes.rewardGranted,
        user: toPublicProfile(acc)
      });
    } catch (err) {
      acc.gold = snapshot.gold;
      acc.level = snapshot.level;
      acc.xp = snapshot.xp;
      acc.attributePoints = snapshot.attributePoints;
      acc.ownedWeapons = snapshot.ownedWeapons;
      acc.ownedVestments = snapshot.ownedVestments;
      acc.dailyQuests = snapshot.dailyQuests;
      console.error("Failed to claim daily quest reward:", err);
      res.status(500).json({ error: "Failed to persist daily quest reward. Please retry." });
    } finally {
      claimingDailyQuestAccounts.delete(acc.id);
    }
  });
  const shopMutationAccounts = /* @__PURE__ */ new Set();
  app.get("/api/shop/armaments", (req, res) => {
    const acc = requireAuthenticatedAccount(req, res);
    if (!acc) return;
    applyAccountArmamentMigration(acc);
    const shop = hydrateArmamentShopForAccount(acc);
    res.json({
      ok: true,
      ...shop,
      user: toPublicProfile(acc)
    });
  });
  app.post("/api/shop/armaments/buy", async (req, res) => {
    const acc = requireAuthenticatedAccount(req, res);
    if (!acc) return;
    const slot = req.body?.slot === "weapon" || req.body?.slot === "vestment" ? req.body.slot : null;
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId.trim() : "";
    const autoEquip = Boolean(req.body?.autoEquip);
    if (!slot || !itemId) {
      res.status(400).json({ error: "Invalid armament selection." });
      return;
    }
    if (shopMutationAccounts.has(acc.id)) {
      res.status(409).json({ error: "Armory transaction already in progress." });
      return;
    }
    shopMutationAccounts.add(acc.id);
    const snapshot = {
      gold: acc.gold,
      ownedWeapons: acc.ownedWeapons ? [...acc.ownedWeapons] : void 0,
      ownedVestments: acc.ownedVestments ? [...acc.ownedVestments] : void 0,
      equippedWeapon: acc.equippedWeapon,
      equippedVestment: acc.equippedVestment
    };
    try {
      const purchase = purchaseArmamentForAccount(acc, slot, itemId, { autoEquip });
      if (!purchase.ok) {
        res.status(purchase.status).json({ error: purchase.error });
        return;
      }
      await persistAccount(acc);
      for (const room of rooms.values()) {
        if (!room.hasPlayer(acc.id)) continue;
        room.grantArmament(acc.id, purchase.slot, purchase.item.id);
        if (purchase.equipped) {
          room.equipArmament(acc.id, purchase.slot, purchase.item.id);
        }
        partyCoordinator.markRoomDirty(room.roomId);
      }
      res.json({
        ok: true,
        purchased: {
          slot: purchase.slot,
          itemId: purchase.item.id,
          name: purchase.item.name,
          rarity: purchase.item.rarity,
          accent: purchase.item.accent
        },
        priceGold: purchase.priceGold,
        equipped: purchase.equipped,
        goldRemaining: purchase.goldRemaining,
        shop: purchase.shop,
        user: toPublicProfile(acc)
      });
    } catch (err) {
      acc.gold = snapshot.gold;
      acc.ownedWeapons = snapshot.ownedWeapons;
      acc.ownedVestments = snapshot.ownedVestments;
      acc.equippedWeapon = snapshot.equippedWeapon;
      acc.equippedVestment = snapshot.equippedVestment;
      console.error("Failed to purchase armament:", err);
      res.status(500).json({ error: "Failed to persist armament purchase. Please retry." });
    } finally {
      shopMutationAccounts.delete(acc.id);
    }
  });
  app.post("/api/shop/armaments/equip", async (req, res) => {
    const acc = requireAuthenticatedAccount(req, res);
    if (!acc) return;
    const slot = req.body?.slot === "weapon" || req.body?.slot === "vestment" ? req.body.slot : null;
    const rawItemId = req.body?.itemId;
    const itemId = rawItemId === null ? null : typeof rawItemId === "string" ? rawItemId.trim() : "";
    if (!slot || itemId !== null && !itemId) {
      res.status(400).json({ error: "Invalid armament equip request." });
      return;
    }
    if (shopMutationAccounts.has(acc.id)) {
      res.status(409).json({ error: "Armory update already in progress." });
      return;
    }
    shopMutationAccounts.add(acc.id);
    const snapshot = {
      equippedWeapon: acc.equippedWeapon,
      equippedVestment: acc.equippedVestment
    };
    try {
      const equipRes = equipArmamentForAccount(acc, slot, itemId);
      if (!equipRes.ok) {
        res.status(equipRes.status).json({ error: equipRes.error });
        return;
      }
      await persistAccount(acc);
      for (const room of rooms.values()) {
        if (!room.hasPlayer(acc.id)) continue;
        if (equipRes.equippedId === null) {
          room.unequipArmament(acc.id, equipRes.slot);
        } else {
          room.equipArmament(acc.id, equipRes.slot, equipRes.equippedId);
        }
        partyCoordinator.markRoomDirty(room.roomId);
      }
      res.json({
        ok: true,
        slot: equipRes.slot,
        equippedId: equipRes.equippedId,
        shop: equipRes.shop,
        user: toPublicProfile(acc)
      });
    } catch (err) {
      acc.equippedWeapon = snapshot.equippedWeapon;
      acc.equippedVestment = snapshot.equippedVestment;
      console.error("Failed to update equipped armament:", err);
      res.status(500).json({ error: "Failed to save equipped armament. Please retry." });
    } finally {
      shopMutationAccounts.delete(acc.id);
    }
  });
  const internalIdentityRateLimiter = new SlidingWindowRateLimiter(120, 6e4);
  const ssoAssertionRateLimiter = new SlidingWindowRateLimiter(30, 6e4);
  function getConfiguredIdentitySecret() {
    return (process.env.BEYOND_IDENTITY_SECRET || "").trim();
  }
  function requireInternalIdentityAuth(req, res) {
    const clientKey = req.ip || "unknown";
    if (!internalIdentityRateLimiter.consume(clientKey)) {
      res.status(429).json({ error: "Too many shared identity requests. Please retry shortly." });
      return null;
    }
    const expectedSecret = getConfiguredIdentitySecret();
    const xSecretHeader = typeof req.headers["x-beyond-identity-secret"] === "string" ? req.headers["x-beyond-identity-secret"] : void 0;
    const check = verifySharedIdentityRequestSecret(
      req.headers.authorization,
      xSecretHeader,
      expectedSecret
    );
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return null;
    }
    return expectedSecret;
  }
  app.post("/api/auth/overworld-assertion", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!ssoAssertionRateLimiter.consume(userId)) {
      res.status(429).json({ error: "Rate limit exceeded for Overworld handoff assertions." });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    const secret = getConfiguredIdentitySecret();
    if (secret.length < MIN_SHARED_IDENTITY_SECRET_LENGTH) {
      res.status(503).json({ error: "Shared Beyond identity integration is not configured." });
      return;
    }
    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.json({
      assertion,
      expiresInSeconds: DEFAULT_ASSERTION_TTL_SECONDS
    });
  });
  app.post("/api/internal/identity/verify-credentials", async (req, res) => {
    const secret = requireInternalIdentityAuth(req, res);
    if (!secret) return;
    const usernameRaw = String(req.body?.username ?? "").trim();
    const passwordRaw = String(req.body?.password ?? "");
    if (usernameRaw.length < 2 || usernameRaw.length > 20) {
      res.status(400).json({ error: "Username must be 2 to 20 characters." });
      return;
    }
    if (!passwordRaw) {
      res.status(400).json({ error: "Password is required." });
      return;
    }
    const acc = accountsByLower.get(usernameRaw.toLowerCase());
    if (!acc) {
      if (isMaintenance) {
        res.status(503).json({
          error: `Server is migrating to Singapore for lower latency. Please connect to: ${redirectTarget}`,
          redirectUrl: redirectTarget
        });
        return;
      }
      res.status(401).json({ error: "No adventurer account found with that name." });
      return;
    }
    if (!verifyPassword(passwordRaw, acc.passwordHash)) {
      res.status(401).json({ error: "Invalid password for this adventurer." });
      return;
    }
    let dirty = false;
    if (!acc.passwordHash.startsWith("scrypt:")) {
      acc.passwordHash = hashPassword(passwordRaw);
      dirty = true;
    }
    if (acc.usernameLower === "aleph" && !acc.isAdmin) {
      acc.isAdmin = true;
      dirty = true;
    }
    if (dirty) {
      await persistAccount(acc).catch((err) => {
        console.error("Failed to persist account upgrade during shared verify:", err);
      });
    }
    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.json({
      assertion,
      account: toPublicProfile(acc)
    });
  });
  app.post("/api/internal/identity/register", async (req, res) => {
    const secret = requireInternalIdentityAuth(req, res);
    if (!secret) return;
    if (isMaintenance) {
      res.status(503).json({
        error: `Server is migrating to Singapore for lower latency. Please register at: ${redirectTarget}`,
        redirectUrl: redirectTarget
      });
      return;
    }
    const usernameRaw = String(req.body?.username ?? "").trim();
    const passwordRaw = String(req.body?.password ?? "");
    const preferredClass = normalizeHeroClass(req.body?.preferredClass ?? req.body?.heroClass);
    if (!/^[a-zA-Z0-9_-]{2,20}$/.test(usernameRaw)) {
      res.status(400).json({
        error: "Username must be 2\u201320 letters, numbers, underscores, or hyphens."
      });
      return;
    }
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (accountsByLower.has(usernameRaw.toLowerCase())) {
      res.status(409).json({ error: "That adventurer name is already claimed." });
      return;
    }
    const isAdmin = usernameRaw.toLowerCase() === "aleph";
    const acc = buildAccountRecord(usernameRaw, passwordRaw, preferredClass, isAdmin);
    try {
      await persistAccount(acc);
    } catch (err) {
      console.error("Failed to persist shared-identity registration:", err);
      res.status(500).json({ error: "Failed to persist new adventurer account." });
      return;
    }
    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.status(201).json({
      assertion,
      account: toPublicProfile(acc)
    });
  });
  app.get("/api/internal/identity/account/:accountId", (req, res) => {
    const secret = requireInternalIdentityAuth(req, res);
    if (!secret) return;
    const accountId = String(req.params.accountId ?? "").trim();
    const acc = accountsById.get(accountId);
    if (!acc) {
      res.status(404).json({ error: "Adventurer account not found." });
      return;
    }
    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.json({
      assertion,
      account: toPublicProfile(acc)
    });
  });
  app.post("/api/voice/token", async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      console.warn("[Voice] Token request rejected: invalid or missing session token.");
      res.status(401).json({ error: "Authentication required for voice chat." });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    const rawRoomId = String(req.body?.roomId || "").trim();
    if (!rawRoomId) {
      res.status(400).json({ error: "Room ID required." });
      return;
    }
    const room = rooms.get(rawRoomId) || rooms.get(rawRoomId.toUpperCase());
    if (!room) {
      console.warn(`[Voice] Token request rejected: Room ${rawRoomId} not found.`);
      res.status(404).json({ error: "Game room not found." });
      return;
    }
    const resolvedRoomId = room.roomId;
    const isMemberViaWs = Array.from(roomClientIndex.getRoomClients(resolvedRoomId)).some(
      (c) => c.userId === acc.id
    );
    const isMember = room.hasPlayer(acc.id) || isMemberViaWs;
    if (!isMember) {
      console.warn(
        `[Voice] Token request rejected: Player ${acc.username} (${acc.id}) is not a member of room ${resolvedRoomId}.`
      );
      res.status(403).json({ error: "Forbidden: You are not a member of this room." });
      return;
    }
    const apiKey = (process.env.LIVEKIT_API_KEY || "").trim();
    const apiSecret = (process.env.LIVEKIT_API_SECRET || "").trim();
    const rawUrl = (process.env.LIVEKIT_URL || "").trim();
    const livekitUrl = rawUrl.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
    if (!apiKey || !apiSecret || !livekitUrl) {
      console.warn("[Voice] LiveKit environment variables are missing on server.");
      res.status(503).json({
        error: "Voice chat is not configured on the server (missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET)."
      });
      return;
    }
    console.log(`[Voice] Generating LiveKit token for ${acc.username} in room ${resolvedRoomId}`);
    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: acc.id,
        name: acc.username
      });
      at.addGrant({
        roomJoin: true,
        room: resolvedRoomId,
        canPublish: true,
        canSubscribe: true
      });
      const jwtToken = await at.toJwt();
      console.log(`[Voice] Token issued for ${acc.username} in room ${resolvedRoomId}`);
      res.json({ token: jwtToken, url: livekitUrl });
    } catch (err) {
      console.error("[Voice] Failed to generate LiveKit access token:", err);
      res.status(500).json({ error: "Failed to generate voice token." });
    }
  });
  app.post("/api/voice/report", async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Authentication required for reporting." });
      return;
    }
    const reporterAcc = accountsById.get(userId);
    if (!reporterAcc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    const roomId = String(req.body?.roomId || "").trim();
    const reportedUserId = String(req.body?.reportedUserId || "").trim();
    const reason = String(req.body?.reason || "").trim();
    if (!roomId || !reportedUserId || !reason) {
      res.status(400).json({ error: "roomId, reportedUserId, and reason are required." });
      return;
    }
    if (reason.length > 500) {
      res.status(400).json({ error: "Report reason must be 500 characters or less." });
      return;
    }
    if (reportedUserId === userId) {
      res.status(400).json({ error: "You cannot report yourself." });
      return;
    }
    const room = rooms.get(roomId) || rooms.get(roomId.toUpperCase());
    if (!room || !room.hasPlayer(userId)) {
      res.status(403).json({ error: "Invalid room or membership." });
      return;
    }
    const reportedKnown = accountsById.has(reportedUserId) || room.hasPlayer(reportedUserId);
    if (!reportedKnown) {
      res.status(400).json({ error: "Reported player was not found." });
      return;
    }
    console.log(
      `[VoiceReport] Player ${reporterAcc.username} reported user ${reportedUserId} in room ${room.roomId}: ${reason}`
    );
    if (dbPool) {
      try {
        await dbPool.query(
          `CREATE TABLE IF NOT EXISTS voice_reports (
            id SERIAL PRIMARY KEY,
            room_id VARCHAR(64) NOT NULL,
            reporter_id VARCHAR(64) NOT NULL,
            reported_id VARCHAR(64) NOT NULL,
            reason TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );`
        );
        await dbPool.query(
          `INSERT INTO voice_reports (room_id, reporter_id, reported_id, reason) VALUES ($1, $2, $3, $4);`,
          [room.roomId, userId, reportedUserId, reason]
        );
      } catch (err) {
        console.error("[VoiceReport] Failed to persist report to PostgreSQL:", err);
        res.status(500).json({ error: "Failed to save report to database." });
        return;
      }
    } else {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const reportsFile = path.join(DATA_DIR, "voice_reports.json");
        let existing = [];
        if (fs.existsSync(reportsFile)) {
          try {
            existing = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
            if (!Array.isArray(existing)) existing = [];
          } catch {
            existing = [];
          }
        }
        existing.push({
          roomId: room.roomId,
          reporterId: userId,
          reportedId: reportedUserId,
          reason,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        fs.writeFileSync(reportsFile, JSON.stringify(existing, null, 2), "utf8");
      } catch (err) {
        console.error("[VoiceReport] Failed to persist report locally:", err);
        res.status(500).json({ error: "Failed to save report." });
        return;
      }
    }
    res.json({ success: true, message: "Report recorded successfully." });
  });
  app.get("/api/admin/export-accounts", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      res.status(500).json({ error: "Migration secret not configured or too weak." });
      return;
    }
    if (!authHeader.startsWith("Bearer ")) {
      res.status(403).json({ error: "Forbidden: Missing Bearer token." });
      return;
    }
    const providedToken = Buffer.from(authHeader.slice(7));
    const expectedBuffer = Buffer.from(expectedSecret);
    if (providedToken.length !== expectedBuffer.length || !crypto2.timingSafeEqual(providedToken, expectedBuffer)) {
      res.status(403).json({ error: "Forbidden: Invalid or missing migration admin secret." });
      return;
    }
    const list = Array.from(accountsById.values());
    res.json({
      exportTimestamp: Date.now(),
      count: list.length,
      accounts: list
    });
  });
  app.post("/api/admin/import-accounts", async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      res.status(500).json({ error: "Migration secret not configured or too weak." });
      return;
    }
    if (!authHeader.startsWith("Bearer ")) {
      res.status(403).json({ error: "Forbidden: Missing Bearer token." });
      return;
    }
    const providedToken = Buffer.from(authHeader.slice(7));
    const expectedBuffer = Buffer.from(expectedSecret);
    if (providedToken.length !== expectedBuffer.length || !crypto2.timingSafeEqual(providedToken, expectedBuffer)) {
      res.status(403).json({ error: "Forbidden: Invalid or missing migration admin secret." });
      return;
    }
    const payload = req.body?.accounts;
    if (!Array.isArray(payload)) {
      res.status(400).json({ error: 'Invalid payload: "accounts" array required.' });
      return;
    }
    let importedCount = 0;
    for (const item of payload) {
      if (item && item.username && item.passwordHash) {
        const rec = {
          id: String(item.id || `usr_${crypto2.randomBytes(6).toString("hex")}`),
          username: String(item.username),
          usernameLower: String(item.usernameLower || item.username).toLowerCase(),
          passwordHash: String(item.passwordHash),
          lockedClass: item.lockedClass || "vanguard",
          preferredClass: item.preferredClass || item.lockedClass || "vanguard",
          runsCompleted: Number(item.runsCompleted) || 0,
          highestFloor: Number(item.highestFloor) || 0,
          totalKills: Number(item.totalKills) || 0,
          totalRevives: Number(item.totalRevives) || 0,
          gold: Number(item.gold) || 0,
          isAdmin: !!item.isAdmin,
          dexterity: Number(item.dexterity) || 10,
          vitality: Number(item.vitality) || 10,
          attributePoints: Number(item.attributePoints) || 0
        };
        await persistAccount(rec);
        importedCount++;
      }
    }
    res.json({
      success: true,
      importedCount,
      message: `Successfully migrated ${importedCount} accounts into storage.`
    });
  });
  const server = http.createServer(app);
  let lastTickDurationMs = 0;
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 64 * 1024,
    perMessageDeflate: false
  });
  wss.on("connection", (ws, req) => {
    req.socket?.setNoDelay?.(true);
    const origin = req.headers.origin;
    const originAllowed = isOriginAllowed(origin, req.headers.host);
    if (!originAllowed) {
      console.warn(`WebSocket connection rejected from unauthorized origin: ${origin}`);
      ws.close(4003, "Forbidden Origin");
      return;
    }
    const token = String(req.headers["sec-websocket-protocol"] || "").split(",")[0].trim();
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    const acc = userId ? accountsById.get(userId) : void 0;
    if (!acc) {
      sendJson(ws, { type: "error", message: "Authentication required." });
      ws.close(4001, "Unauthorized");
      return;
    }
    const client = {
      ws,
      userId: acc.id,
      username: acc.username,
      roomId: null,
      droppedTicks: 0,
      totalDroppedTicks: 0,
      needsKeyframe: false
    };
    clients.add(client);
    broadcastRoomList();
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "ping") {
        sendJson(ws, { type: "pong", t: msg.t, tickMs: lastTickDurationMs });
        return;
      }
      if (msg.type === "lobby:subscribe") {
        sendJson(ws, {
          type: "lobby:rooms",
          rooms: Array.from(rooms.values()).filter((r) => r.roomId !== "TAVERN-HUB").map((r) => r.getSummary()),
          onlineCount: clients.size
        });
        return;
      }
      if (msg.type === "room:create") {
        if (isMaintenance) {
          sendJson(ws, {
            type: "error",
            message: `Expeditions are paused on Oregon during Singapore migration. Please connect to: ${redirectTarget}`
          });
          return;
        }
        const difficulty = msg.difficulty === "Heroic" || msg.difficulty === "Abyssal" ? msg.difficulty : "Normal";
        partyCoordinator.createParty(client, toPartyAccount(acc), {
          name: msg.name,
          difficulty,
          seed: msg.seed
        });
        return;
      }
      if (msg.type === "room:join") {
        client.lastSentDialogueKey = "";
        const res = partyCoordinator.joinOrReconnectRoom(client, toPartyAccount(acc), String(msg.roomId || ""));
        if (res.ok) {
          syncClientNpcDialogue(client, res.room);
        }
        return;
      }
      if (msg.type === "room:leave") {
        client.lastSentDialogueKey = "";
        partyCoordinator.leaveRoomExplicit(client);
        sendJson(ws, { type: "room:left" });
        return;
      }
      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (msg.type === "player:input") {
        room.updateInput(acc.id, msg.input, msg.seq);
      } else if (msg.type === "room:resync") {
        client.needsKeyframe = true;
      } else if (msg.type === "player:action") {
        const res = room.performAction(acc.id, msg.action, msg.aimAngle, {
          aimDistance: typeof msg.aimDistance === "number" && Number.isFinite(msg.aimDistance) ? msg.aimDistance : void 0,
          explicitAim: Boolean(msg.explicitAim)
        });
        if (res.floorChanged) {
          roomDeltaStates.delete(room.roomId);
          for (const c of roomClientIndex.getRoomClients(room.roomId)) {
            c.needsKeyframe = true;
          }
          broadcastToRoom(room.roomId, {
            type: "room:map",
            map: res.floorChanged
          });
          broadcastRoomList();
        }
        if (msg.action === "interact") {
          syncClientNpcDialogue(client, room);
        }
      } else if (msg.type === "player:channel_start") {
        room.startDisintegrationChannel(acc.id, msg.aimAngle);
      } else if (msg.type === "player:channel_update") {
        room.updateDisintegrationTarget(acc.id, msg.aimAngle);
      } else if (msg.type === "player:channel_stop") {
        room.stopDisintegrationChannel(acc.id);
      } else if (msg.type === "player:select_scroll") {
        room.selectArcanistScroll(acc.id, msg.scrollId);
      } else if (msg.type === "player:close_chest") {
        room.closeChest(acc.id);
      } else if (msg.type === "player:select_relic") {
        room.selectRelic(acc.id, msg.relicId);
        acc.storedRelics = [...room.getPlayerState(acc.id)?.storage || []];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === "player:unequip_relic") {
        room.unequipRelic(acc.id, msg.relicId);
        acc.storedRelics = [...room.getPlayerState(acc.id)?.storage || []];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === "player:store_relic") {
        room.storeRelic(acc.id, msg.relicId);
        acc.storedRelics = [...room.getPlayerState(acc.id)?.storage || []];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === "player:equip_stored_relic") {
        room.equipStoredRelic(acc.id, msg.relicId);
        acc.storedRelics = [...room.getPlayerState(acc.id)?.storage || []];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === "player:delete_relic") {
        room.deleteRelic(acc.id, msg.relicId, msg.fromStorage);
        acc.storedRelics = [...room.getPlayerState(acc.id)?.storage || []];
        acc.gold = room.getPlayerState(acc.id)?.gold ?? acc.gold;
        persistAccount(acc).catch(console.error);
      } else if (msg.type === "player:discard_potion") {
        room.discardPotion(acc.id, msg.count);
      } else if (msg.type === "player:equip_armament") {
        const slot = msg.slot === "weapon" || msg.slot === "vestment" ? msg.slot : null;
        const itemId = typeof msg.itemId === "string" ? msg.itemId.trim() : "";
        if (!slot || !itemId) {
          sendJson(ws, { type: "error", message: "Invalid armament selection." });
          return;
        }
        applyAccountArmamentMigration(acc);
        const def = getArmamentDef(slot, itemId);
        if (!def) {
          sendJson(ws, { type: "error", message: "Unknown permanent armament." });
          return;
        }
        const activeClass = acc.lockedClass || acc.preferredClass || "vanguard";
        if (def.heroClass !== activeClass) {
          sendJson(ws, {
            type: "error",
            message: `${def.name} requires the ${def.heroClass.toUpperCase()} class.`
          });
          return;
        }
        const ownedList = slot === "weapon" ? acc.ownedWeapons || [] : acc.ownedVestments || [];
        if (!ownedList.includes(itemId)) {
          sendJson(ws, {
            type: "error",
            message: `Ownership verification failed: ${def.name} is not in your armory.`
          });
          return;
        }
        if (slot === "weapon") {
          acc.equippedWeapon = itemId;
        } else {
          acc.equippedVestment = itemId;
        }
        const eqRes = room.equipArmament(acc.id, slot, itemId);
        if (!eqRes.ok) {
          sendJson(ws, { type: "error", message: eqRes.error || "Cannot equip armament." });
          return;
        }
        partyCoordinator.markRoomDirty(room.roomId);
        persistAccount(acc).catch((err) => {
          console.error("Failed to persist equipped armament:", err);
        });
      } else if (msg.type === "player:unequip_armament") {
        const slot = msg.slot === "weapon" || msg.slot === "vestment" ? msg.slot : null;
        if (!slot) {
          sendJson(ws, { type: "error", message: "Invalid armament slot." });
          return;
        }
        applyAccountArmamentMigration(acc);
        const activeClass = acc.lockedClass || acc.preferredClass || "vanguard";
        if (slot === "weapon") {
          acc.equippedWeapon = null;
        } else {
          acc.equippedVestment = getDefaultVestmentIdForClass(activeClass);
        }
        room.unequipArmament(acc.id, slot);
        partyCoordinator.markRoomDirty(room.roomId);
        persistAccount(acc).catch((err) => {
          console.error("Failed to persist unequipped armament:", err);
        });
      } else if (msg.type === "admin:grant_armament") {
        if (!acc.isAdmin) {
          sendJson(ws, { type: "error", message: "Admin access required." });
          return;
        }
        const slot = msg.slot === "weapon" || msg.slot === "vestment" ? msg.slot : null;
        const itemId = typeof msg.itemId === "string" ? msg.itemId.trim() : "";
        const def = slot ? getArmamentDef(slot, itemId) : null;
        if (!slot || !def) {
          sendJson(ws, { type: "error", message: "Unknown armament item ID." });
          return;
        }
        applyAccountArmamentMigration(acc);
        const targetList = slot === "weapon" ? acc.ownedWeapons : acc.ownedVestments;
        if (!targetList.includes(itemId)) {
          targetList.push(itemId);
        }
        room.grantArmament(acc.id, slot, itemId);
        partyCoordinator.markRoomDirty(room.roomId);
        persistAccount(acc).catch((err) => {
          console.error("Failed to persist admin-granted armament:", err);
        });
      } else if (msg.type === "player:change_class") {
        if (acc.isAdmin) {
          const validClass = msg.heroClass === "ranger" || msg.heroClass === "arcanist" || msg.heroClass === "cleric" || msg.heroClass === "vanguard" ? msg.heroClass : "vanguard";
          acc.lockedClass = validClass;
          acc.preferredClass = validClass;
          applyAccountArmamentMigration(acc, true);
          persistAccount(acc).catch(console.error);
          room.changeClass(acc.id, validClass);
          room.pushSystemChat(`[ADMIN] ${acc.username} shifted hero class to ${validClass.toUpperCase()}`);
          partyCoordinator.markRoomDirty(room.roomId);
        } else {
          sendJson(ws, {
            type: "error",
            message: `${acc.username}'s account is permanently bound to the ${acc.lockedClass.toUpperCase()} class.`
          });
        }
      } else if (msg.type === "admin:godmode") {
        if (acc.isAdmin) {
          const isGod = room.togglePlayerGodMode(acc.id, msg.enabled);
          room.pushSystemChat(`[ADMIN] God Mode ${isGod ? "ENABLED" : "DISABLED"} for ${acc.username}`);
        } else {
          sendJson(ws, { type: "error", message: "Admin access required." });
        }
      } else if (msg.type === "admin:toggle_speed") {
        if (acc.isAdmin) {
          const isSpeed = room.togglePlayerSpeedBoost(acc.id, msg.enabled);
          room.pushSystemChat(`[ADMIN] Speed Boost ${isSpeed ? "ENABLED" : "DISABLED"} for ${acc.username}`);
        } else {
          sendJson(ws, { type: "error", message: "Admin access required." });
        }
      } else if (msg.type === "admin:toggle_no_cooldown") {
        if (acc.isAdmin) {
          const isNoCd = room.togglePlayerNoCooldown(acc.id, msg.enabled);
          room.pushSystemChat(`[ADMIN] No Cooldown Mode ${isNoCd ? "ENABLED" : "DISABLED"} for ${acc.username}`);
        } else {
          sendJson(ws, { type: "error", message: "Admin access required." });
        }
      } else if (msg.type === "admin:add_gold") {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0 && amount <= 1e6) {
            room.addPlayerGold(acc.id, amount);
          }
        }
      } else if (msg.type === "admin:add_potions") {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0 && amount <= 99) {
            room.addPlayerPotions(acc.id, amount);
          }
        }
      } else if (msg.type === "admin:set_level") {
        if (acc.isAdmin) {
          const level = Math.floor(Number(msg.level));
          if (Number.isFinite(level) && level >= 1 && level <= MAX_LEVEL) {
            room.setPlayerLevel(acc.id, level);
            room.pushSystemChat(`[ADMIN] Set Level ${level} for ${acc.username}`);
          }
        }
      } else if (msg.type === "admin:add_relic") {
        if (acc.isAdmin && msg.relicId) {
          room.addPlayerRelic(acc.id, String(msg.relicId));
        }
      } else if (msg.type === "admin:equip_scroll") {
        if (acc.isAdmin && msg.scrollId) {
          room.adminEquipScroll(acc.id, String(msg.scrollId));
        }
      } else if (msg.type === "admin:spawn_dummy") {
        if (acc.isAdmin) {
          room.spawnDummyAtPlayer(acc.id);
        }
      } else if (msg.type === "admin:teleport_floor") {
        if (acc.isAdmin && typeof msg.floor === "number") {
          if (room.roomId !== "TAVERN-HUB" && room.status !== "playing") {
            sendJson(ws, { type: "error", message: "Start the expedition from the party lobby first." });
            return;
          }
          room.teleportPlayerToFloor(acc.id, msg.floor);
        }
      } else if (msg.type === "admin:spawn_entity") {
        if (acc.isAdmin && msg.kind) {
          if (room.roomId !== "TAVERN-HUB" && room.status !== "playing") {
            sendJson(ws, { type: "error", message: "Start the expedition from the party lobby first." });
            return;
          }
          room.spawnEntitiesForAdmin(acc.id, msg.kind, msg.count || 1);
        }
      } else if (msg.type === "admin:despawn_entity") {
        if (acc.isAdmin && msg.entityId) {
          room.despawnEntity(String(msg.entityId));
        }
      } else if (msg.type === "admin:clear_enemies") {
        if (acc.isAdmin) {
          room.clearAllEnemies();
        }
      } else if (msg.type === "admin:clear_summoned") {
        if (acc.isAdmin) {
          room.clearSummonedEntities();
        }
      } else if (msg.type === "admin:heal_player") {
        if (acc.isAdmin) {
          room.healPlayer(acc.id);
        }
      } else if (msg.type === "admin:restore_energy") {
        if (acc.isAdmin) {
          room.restoreEnergy(acc.id);
        }
      } else if (msg.type === "admin:revive_all") {
        if (acc.isAdmin) {
          room.reviveAllPlayers();
        }
      } else if (msg.type === "admin:summon_boss") {
        if (acc.isAdmin && typeof msg.floor === "number") {
          if (room.roomId !== "TAVERN-HUB" && room.status !== "playing") {
            sendJson(ws, { type: "error", message: "Start the expedition from the party lobby first." });
            return;
          }
          room.summonBossForFloor(msg.floor);
        }
      } else if (msg.type === "admin:reset_boss") {
        if (acc.isAdmin) {
          room.resetBossEncounter();
        }
      } else if (msg.type === "admin:reset_room") {
        if (acc.isAdmin) {
          room.resetCurrentRoom();
        }
      } else if (msg.type === "admin:toggle_ai") {
        if (acc.isAdmin) {
          room.toggleEnemyAI(msg.enabled);
        }
      } else if (msg.type === "player:ping") {
        room.addPing(acc.id, msg.label, msg.x, msg.y);
      } else if (msg.type === "chat:send") {
        const trimmed = String(msg.text ?? "").trim();
        if (trimmed.length > 0) {
          room.pushChat(acc.username, trimmed, false);
        }
      } else if (msg.type === "room:start") {
        partyCoordinator.startExpedition(client);
      } else if (msg.type === "room:set_ready") {
        partyCoordinator.setPlayerReady(client, msg.ready);
      } else if (msg.type === "room:return_to_lobby") {
        partyCoordinator.returnToLobby(client);
      } else if (msg.type === "room:restart") {
        partyCoordinator.restartExpedition(client);
      } else if (msg.type === "player:spend_attribute") {
        if (acc.attributePoints && acc.attributePoints > 0) {
          const attr = msg.attribute;
          if (attr === "strength" || attr === "dexterity" || attr === "vitality" || attr === "intelligence" || attr === "faith") {
            const currentAttr = acc[attr] || 0;
            if (currentAttr < MAX_ATTRIBUTE) {
              const oldAttr = currentAttr;
              const oldPoints = acc.attributePoints;
              const requested = msg.amount !== void 0 ? Math.floor(Number(msg.amount)) : 1;
              const availableRoom = Math.max(0, MAX_ATTRIBUTE - oldAttr);
              const spend = Math.min(requested > 0 ? requested : 1, oldPoints, availableRoom);
              if (spend > 0) {
                acc[attr] = oldAttr + spend;
                acc.attributePoints = oldPoints - spend;
                void (async () => {
                  try {
                    await persistAccount(acc);
                    room.pushSystemChat(`${acc.username} increased ${attr.toUpperCase()} by +${spend} to ${acc[attr]}.`);
                    room.updatePlayerAttributes(
                      acc.id,
                      acc.strength || 0,
                      acc.vitality || 0,
                      acc.dexterity || 0,
                      acc.intelligence || 0,
                      acc.faith || 0,
                      acc.attributePoints || 0
                    );
                    partyCoordinator.markRoomDirty(room.roomId);
                  } catch {
                    acc[attr] = oldAttr;
                    acc.attributePoints = oldPoints;
                    sendJson(ws, { type: "error", message: "Failed to save attribute allocation. Please try again." });
                  }
                })();
              }
            } else {
              sendJson(ws, { type: "error", message: `${attr.toUpperCase()} is already at maximum level.` });
            }
          }
        }
      } else if (msg.type === "admin:add_attribute_points") {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0) {
            acc.attributePoints = (acc.attributePoints || 0) + amount;
            persistAccount(acc).catch((err) => console.error("Failed to persist admin attribute points:", err));
            room.addPlayerAttributePoints(acc.id, amount);
          }
        }
      } else if (msg.type === "player:reset_attributes") {
        if (room.roomId !== "TAVERN-HUB") {
          sendJson(ws, { type: "error", message: "Attributes can only be reset in the Sanctuary Tavern." });
          return;
        }
        if (!room.isPlayerNearNpc(acc.id, "npc_aleph", 260)) {
          sendJson(ws, { type: "error", message: "You must be near Aleph to reset your attributes." });
          return;
        }
        const spent = (acc.strength || 0) + (acc.vitality || 0) + (acc.dexterity || 0) + (acc.intelligence || 0) + (acc.faith || 0);
        const oldState = {
          strength: acc.strength,
          vitality: acc.vitality,
          dexterity: acc.dexterity,
          intelligence: acc.intelligence,
          faith: acc.faith,
          attributePoints: acc.attributePoints
        };
        acc.attributePoints = (acc.attributePoints || 0) + spent;
        acc.strength = 0;
        acc.vitality = 0;
        acc.dexterity = 0;
        acc.intelligence = 0;
        acc.faith = 0;
        void (async () => {
          try {
            await persistAccount(acc);
            room.updatePlayerAttributes(
              acc.id,
              acc.strength || 0,
              acc.vitality || 0,
              acc.dexterity || 0,
              acc.intelligence || 0,
              acc.faith || 0,
              acc.attributePoints || 0
            );
            room.pushSystemChat(`${acc.username} has reclaimed ${spent} attribute points through Aleph.`);
          } catch {
            Object.assign(acc, oldState);
            sendJson(ws, { type: "error", message: "Failed to reset attributes. Please try again." });
          }
        })();
        room.handleAlephResetDialogue(acc.id, spent);
        syncClientNpcDialogue(client, room);
      } else if (msg.type === "player:dialogue_close") {
        room.handleDialogueClose(acc.id);
        syncClientNpcDialogue(client, room);
      } else if (msg.type === "player:dialogue_pick") {
        room.handleDialoguePick(acc.id, msg.optionId);
        syncClientNpcDialogue(client, room);
      }
    });
    ws.on("close", () => {
      clients.delete(client);
      partyCoordinator.handleSocketDisconnect(client);
    });
    ws.on("error", () => {
      clients.delete(client);
      partyCoordinator.handleSocketDisconnect(client);
    });
  });
  const TICK_MS = SERVER_TICK_MS;
  let nextTickAt = performance.now() + TICK_MS;
  const keyframeTargets = [];
  const deltaTargets = [];
  const runServerTick = () => {
    const tickStart = performance.now();
    let anyStatusChanged = false;
    for (const [roomId, room] of rooms.entries()) {
      if (room.getPlayerCount() === 0) {
        if (roomId !== "TAVERN-HUB") {
          partyCoordinator.clearRoomTimers(roomId);
          rooms.delete(roomId);
          roomDeltaStates.delete(roomId);
          dirtyNonPlayingRooms.delete(roomId);
        }
        continue;
      }
      const prevStatus = room.status;
      if (room.status === "playing") {
        room.tick(TICK_MS);
      }
      const clientCount = roomClientIndex.getRoomClientCount(roomId);
      const statusTransitioned = room.status !== prevStatus;
      let anyNeedsKeyframe = false;
      const roomClientsIter = clientCount > 0 ? roomClientIndex.getRoomClients(roomId) : null;
      if (roomClientsIter) {
        for (const c of roomClientsIter) {
          if (c.needsKeyframe) {
            anyNeedsKeyframe = true;
            break;
          }
        }
      }
      const shouldBroadcast = clientCount > 0 && (room.status === "playing" || statusTransitioned || dirtyNonPlayingRooms.has(roomId) || anyNeedsKeyframe);
      if (shouldBroadcast && roomClientsIter) {
        const snapshot = room.buildNetworkSnapshot();
        let deltaState = roomDeltaStates.get(roomId);
        if (!deltaState) {
          deltaState = { seq: 0, lastBaseline: null };
          roomDeltaStates.set(roomId, deltaState);
        }
        const nextSeq = deltaState.seq + 1;
        keyframeTargets.length = 0;
        deltaTargets.length = 0;
        if (!deltaState.lastBaseline) {
          for (const c of roomClientsIter) keyframeTargets.push(c);
        } else {
          for (const c of roomClientsIter) {
            if (c.needsKeyframe) keyframeTargets.push(c);
            else deltaTargets.push(c);
          }
        }
        if (keyframeTargets.length > 0) {
          const rawKeyframe = JSON.stringify({
            type: "room:tick",
            snapshot,
            seq: nextSeq
          });
          for (let i = 0; i < keyframeTargets.length; i++) {
            const c = keyframeTargets[i];
            const outcome = sendRawFrame(c, rawKeyframe, { droppable: true });
            if (outcome === "sent") {
              c.needsKeyframe = false;
            } else if (outcome === "closed_overflow") {
              roomClientIndex.removeFromRoom(c, roomId);
              clients.delete(c);
            }
          }
        }
        if (deltaTargets.length > 0 && deltaState.lastBaseline) {
          const delta = computeSnapshotDelta(
            deltaState.lastBaseline,
            snapshot,
            deltaState.seq,
            nextSeq
          );
          const stats = broadcastSerialized(
            deltaTargets,
            { type: "room:delta", delta },
            { droppable: true }
          );
          if (stats.closedCount > 0) {
            for (let i = 0; i < deltaTargets.length; i++) {
              const c = deltaTargets[i];
              if (c.ws.readyState !== WebSocket.OPEN) {
                roomClientIndex.removeFromRoom(c, roomId);
                clients.delete(c);
              }
            }
          }
        }
        deltaState.seq = nextSeq;
        deltaState.lastBaseline = cloneSnapshotBaseline(snapshot);
        dirtyNonPlayingRooms.delete(roomId);
        for (const c of roomClientsIter) {
          syncClientNpcDialogue(c, room);
        }
      }
      if (statusTransitioned) {
        anyStatusChanged = true;
      }
    }
    if (anyStatusChanged) {
      broadcastRoomList();
    }
    const nowAfter = performance.now();
    lastTickDurationMs = Math.round((nowAfter - tickStart) * 10) / 10;
    nextTickAt += TICK_MS;
    if (nowAfter - nextTickAt > TICK_MS * 4) {
      nextTickAt = nowAfter + TICK_MS;
    }
    const delayMs = Math.max(1, Math.round(nextTickAt - nowAfter));
    setTimeout(runServerTick, delayMs);
  };
  setTimeout(runServerTick, TICK_MS);
  const distPath = path.resolve(__dirname, "dist");
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(path.join(distPath, "index.html"));
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Beyond Co-op Server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
