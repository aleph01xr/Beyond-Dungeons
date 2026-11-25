import type {
  ArcanistCastState,
  ArcanistScrollId,
  ArcanistSpellId,
  DisintegrationChannelState,
} from './arcanist.ts';

export type HeroClassId = 'vanguard' | 'ranger' | 'arcanist' | 'cleric';

export type VestmentPassiveId =
  | 'iron_will'
  | 'war_monger'
  | 'heat'
  | 'eagle_keenness'
  | 'momentum'
  | 'predators_instinct'
  | 'astral_resonance'
  | 'temporal_acceleration'
  | 'void_consumption'
  | 'radiant_aura'
  | 'shared_grace'
  | 'sacred_retribution';

export type DifficultyTier = 'Normal' | 'Heroic' | 'Abyssal';

export type BiomeId =
  | 'courtyard'
  | 'catacombs'
  | 'ember'
  | 'void'
  | 'astral'
  | 'hymns'
  | 'reliquary'
  | 'scripture'
  | 'nave'
  | 'wardengate'
  | 'overworld';
export const MAX_LEVEL = 50;
export const MAX_ATTRIBUTE = 100;
export const CRIT_DAMAGE_MULTIPLIER = 1.25;

export type DailyQuestMetric =
  | 'kills'
  | 'boss_kills'
  | 'floors_cleared'
  | 'runs_played'
  | 'revives';

export interface DailyQuestEntryState {
  questId: string;
  progress: number;
  claimed: boolean;
  claimedAt?: number;
}

export interface DailyQuestState {
  dateKey: string;
  quests: Record<string, DailyQuestEntryState>;
}

export interface DailyQuestRewardPreview {
  gold: number;
  xp: number;
  armament?: {
    slot: 'weapon' | 'vestment';
    itemId: string;
    name: string;
    rarity: string;
    accent: string;
    summary: string;
    passiveName?: string;
  } | null;
  masteryFallback?: {
    bonusGold: number;
    bonusXp: number;
    reason: string;
  } | null;
}

export interface DailyQuestHydratedItem {
  questId: string;
  title: string;
  description: string;
  metric: DailyQuestMetric;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  claimedAt?: number;
  rewardsArmament: boolean;
  rewardPreview: DailyQuestRewardPreview;
}

export interface DailyQuestClaimResult {
  ok: boolean;
  dateKey: string;
  resetAtMs: number;
  quests: DailyQuestHydratedItem[];
  rewardGranted: {
    questId: string;
    questTitle: string;
    goldAdded: number;
    xpAdded: number;
    levelsGained: number;
    armamentGranted?: {
      slot: 'weapon' | 'vestment';
      itemId: string;
      name: string;
      rarity: string;
      accent: string;
    } | null;
    masteryBonusApplied?: boolean;
  };
  user: UserProfile;
}

export interface AccountRecord {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  lockedClass: HeroClassId;
  preferredClass: HeroClassId;
  runsCompleted: number;
  highestFloor: number;
  totalKills: number;
  totalRevives: number;
  gold?: number;
  isAdmin?: boolean;
  level?: number;
  xp?: number;
  strength?: number;
  vitality?: number;
  dexterity?: number;
  intelligence?: number;
  faith?: number;
  attributePoints?: number;
  storedRelics?: string[];
  ownedWeapons?: string[];
  ownedVestments?: string[];
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
  dailyQuests?: DailyQuestState;
}

export interface HeroClassStats {
  survivability: number; // 1-5
  damage: number;        // 1-5
  range: number;         // 1-5
  mobility: number;      // 1-5
  utility: number;       // 1-5
}

export interface CombatResistances {
  physical: number;   // damage mitigation (e.g. 0.28 = 28%)
  fire: number;       // reduces Burn tick damage & duration
  frost: number;      // reduces Freeze duration & slow magnitude
  lightning: number;  // reduces Shock duration & chain arc damage
  poison: number;     // reduces Poison DoT & monster weaken magnitude
  bleed: number;      // reduces Bleed tick damage & duration
}

export type DamageCategory = 'physical' | 'arcane' | 'divine' | 'fire' | 'frost' | 'lightning' | 'poison' | 'bleed';

export type ScalingAttribute = 'strength' | 'dexterity' | 'intelligence' | 'faith';

export type DamageTypeMode = 'fixed' | 'adaptive';

export type DamageTypeFamily = 'physical' | 'magic' | 'divine' | 'poison';

export function getDamageTypeFamily(
  category?: DamageCategory | 'elemental' | null
): DamageTypeFamily {
  if (category === 'divine') return 'divine';
  if (
    category === 'arcane' ||
    category === 'elemental' ||
    category === 'fire' ||
    category === 'frost' ||
    category === 'lightning'
  ) {
    return 'magic';
  }
  if (category === 'poison') return 'poison';
  return 'physical';
}

export function getDamageTypeColor(
  category?: DamageCategory | 'elemental' | null,
  isCrit: boolean = false
): string {
  const family = getDamageTypeFamily(category);
  if (family === 'magic') {
    return isCrit ? '#E9D5FF' : '#C084FC';
  }
  if (family === 'divine') {
    return isCrit ? '#FEF08A' : '#FDE047';
  }
  if (family === 'poison') {
    return isCrit ? '#BEF264' : '#A3E635';
  }
  return isCrit ? '#FCA5A5' : '#F87171';
}

export function inferDamageCategoryFromProjectileStyle(
  style: ProjectileState['style']
): DamageCategory {
  if (style === 'radiant') return 'divine';
  if (style === 'fireball') return 'fire';
  if (style === 'frost_lance') return 'frost';
  if (
    style === 'arcane' ||
    style === 'voidorb' ||
    style === 'arcane_orb' ||
    style === 'arcane_barrage'
  ) {
    return 'arcane';
  }
  return 'physical';
}

export interface EnemyResistances {
  physical: number;
  fire: number;
  frost: number;
  lightning: number;
  poison: number;
  bleed: number;
  tenacity: number;   // crowd control reduction (Freeze/Stun duration scaling)
  arcane?: number;    // magical/arcane damage mitigation
  divine?: number;    // holy/divine damage mitigation
}

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  title: string;
  role: string;
  roleBadge: 'TANK' | 'MARKSMAN' | 'CASTER' | 'SUPPORT';
  weapon: string;
  weaponType: string;
  passiveName: string;
  passiveDesc: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldownMs: number;
  range: number;
  primaryColor: string;
  secondaryColor: string;
  capeColor: string;
  accentColor: string;
  glowColor: string;
  lore: string;
  stats: HeroClassStats;
  resistances: CombatResistances;
  tacticalName: string;
  tacticalDesc: string;
  tacticalCooldownMs: number;
  ultName: string;
  ultDesc: string;
  ultCooldownMs: number;
}

export const HERO_CLASSES: Record<HeroClassId, HeroClassDef> = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    title: 'Ironcrest Bastion',
    role: 'Frontline Tank & Bruiser',
    roleBadge: 'TANK',
    weapon: 'Sunforged Claymore & Tower Shield',
    weaponType: 'Heavy Cleave & Shield',
    passiveName: 'Iron Will',
    passiveDesc: '-15% incoming damage. Hitting stunned or burning foes restores +3 Shield.',
    maxHp: 155,
    speed: 175,
    damage: 28,
    attackCooldownMs: 670,
    range: 74,
    primaryColor: '#64748B',
    secondaryColor: '#CBD5E1',
    capeColor: '#991B1B',
    accentColor: '#F59E0B',
    glowColor: '#FBBF24',
    lore: 'Oathbound knights of the Sunken Bastion, immovable behind eternal steel.',
    stats: { survivability: 5, damage: 3, range: 1, mobility: 2, utility: 4 },
    resistances: { physical: 0.28, fire: 0.15, frost: 0.15, lightning: 0.10, poison: 0.15, bleed: 0.30 },
    tacticalName: 'Bulwark Dash',
    tacticalDesc: 'Dash and slam: Stuns foes 1.7s and grants nearby allies +28 Shield.',
    tacticalCooldownMs: 4800,
    ultName: 'Aegis Sanctuary',
    ultDesc: 'Raise a protective dome that blocks enemy shots and boosts party defense.',
    ultCooldownMs: 13000,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    title: 'Thornwood Marksman',
    role: 'Long-Range Sniper',
    roleBadge: 'MARKSMAN',
    weapon: 'Ashwood Recurve & Barbed Quiver',
    weaponType: 'Piercing Bow',
    passiveName: 'Eagle Keenness',
    passiveDesc: '+25% Crit damage beyond 180 range. Kills grant 2s Haste.',
    maxHp: 110,
    speed: 210,
    damage: 24,
    attackCooldownMs: 320,
    range: 195,
    primaryColor: '#2D5A3C',
    secondaryColor: '#4ADE80',
    capeColor: '#1A3826',
    accentColor: '#FBBF24',
    glowColor: '#34D399',
    lore: 'Master trackers of the Thornwood whose arrows never miss their mark.',
    stats: { survivability: 2, damage: 5, range: 5, mobility: 5, utility: 2 },
    resistances: { physical: 0.10, fire: 0.10, frost: 0.25, lightning: 0.15, poison: 0.45, bleed: 0.20 },
    tacticalName: 'Frost Volley',
    tacticalDesc: 'Fire 5 piercing frost arrows that slow enemies by 50%.',
    tacticalCooldownMs: 4200,
    ultName: 'Hunter Quarry',
    ultDesc: 'Mark bosses and elites so all allies deal +35% damage.',
    ultCooldownMs: 11500,
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    title: 'Astral Conduit',
    role: 'AoE Spellweaver',
    roleBadge: 'CASTER',
    weapon: 'Runebound Spire & Astral Orbs',
    weaponType: 'Cosmic Shards & Scrolls',
    passiveName: 'Astral Resonance',
    passiveDesc: 'Primary attacks home & pierce +1 foe. Spells spawn star rifts.',
    maxHp: 100,
    speed: 188,
    damage: 24,
    attackCooldownMs: 720,
    range: 185,
    primaryColor: '#4338CA',
    secondaryColor: '#818CF8',
    capeColor: '#312E81',
    accentColor: '#38BDF8',
    glowColor: '#60A5FA',
    lore: 'Scholars of shattered celestial spires who bend starlight and time.',
    stats: { survivability: 2, damage: 5, range: 4, mobility: 3, utility: 4 },
    resistances: { physical: 0.05, fire: 0.25, frost: 0.35, lightning: 0.45, poison: 0.15, bleed: 0.10 },
    tacticalName: 'Astral Nova',
    tacticalDesc: 'Fire 8 piercing shards in a ring. Replaced when an Ancient Scroll is equipped.',
    tacticalCooldownMs: 5000,
    ultName: 'Chrono Well',
    ultDesc: 'Freeze foes, allies, and all projectiles for 3s while you act freely.',
    ultCooldownMs: 45000,
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    title: 'Sunbrand Prelate',
    role: 'Healer & Support',
    roleBadge: 'SUPPORT',
    weapon: 'Dawnstar Mace & Reliquary',
    weaponType: 'Radiant Smite & Heal',
    passiveName: 'Radiant Aura',
    passiveDesc: 'Heals nearby allies every 2s (scales with Level & Faith) and revives 40% faster.',
    maxHp: 128,
    speed: 185,
    damage: 22,
    attackCooldownMs: 680,
    range: 160,
    primaryColor: '#E2E8F0',
    secondaryColor: '#FDE047',
    capeColor: '#854D0E',
    accentColor: '#FACC15',
    glowColor: '#FEF08A',
    lore: 'Devotees of the Eternal Dawn whose sacred light mends allies and sears undead.',
    stats: { survivability: 4, damage: 3, range: 3, mobility: 2, utility: 5 },
    resistances: { physical: 0.15, fire: 0.40, frost: 0.20, lightning: 0.15, poison: 0.35, bleed: 0.25 },
    tacticalName: 'Sanctified Pulse',
    tacticalDesc: 'Holy wave: heals nearby allies (scales with Level & Faith) and burns nearby foes.',
    tacticalCooldownMs: 6800,
    ultName: 'Solar Beacon',
    ultDesc: 'Consecrate ground to heal allies over time and rapidly revive downed teammates.',
    ultCooldownMs: 18000,
  },
};

export interface RelicDef {
  id: string;
  name: string;
  category: 'Offense' | 'Defense' | 'Mobility' | 'Co-op';
  summary: string;
  accent: string;
}

export const RELIC_CATALOG: RelicDef[] = [
  {
    id: 'crimson_fang',
    name: 'Crimson Fang',
    category: 'Offense',
    summary: 'Heal +5 HP on each kill.',
    accent: '#D14B4B',
  },
  {
    id: 'twinstring_charm',
    name: 'Twinstring Charm',
    category: 'Offense',
    summary: '+1 extra projectile or wave on primary attacks (35% damage).',
    accent: '#E0A94F',
  },
  {
    id: 'zephyr_greaves',
    name: 'Zephyr Greaves',
    category: 'Mobility',
    summary: '+15% Movement Speed.',
    accent: '#68B89E',
  },
  {
    id: 'sunfire_signet',
    name: 'Sunfire Signet',
    category: 'Offense',
    summary: '+12% attack and skill damage.',
    accent: '#E88348',
  },
  {
    id: 'bastion_pauldron',
    name: 'Bastion Pauldron',
    category: 'Defense',
    summary: '+30 Max HP and +30 HP heal on pickup.',
    accent: '#8D9BB5',
  },
  {
    id: 'hourglass_shard',
    name: 'Hourglass Shard',
    category: 'Mobility',
    summary: '+25% Cooldown Recovery on Tactical & Ultimate.',
    accent: '#76B5E8',
  },
  {
    id: 'keen_arrowhead',
    name: 'Keen Arrowhead',
    category: 'Offense',
    summary: '+20% Crit Chance (45% cap).',
    accent: '#DFC15E',
  },
  {
    id: 'oathbound_censer',
    name: 'Oathbound Censer',
    category: 'Co-op',
    summary: 'Tactical skill heals nearby allies for +8 HP.',
    accent: '#E8CE76',
  },
  {
    id: 'runic_carapace',
    name: 'Runic Carapace',
    category: 'Defense',
    summary: '+22 Shield per new room; +15% Phys & +20% Elem/Status Resist.',
    accent: '#6E85C9',
  },
  {
    id: 'piercing_prism',
    name: 'Piercing Prism',
    category: 'Offense',
    summary: 'Attacks pierce +1 additional enemy.',
    accent: '#A988E6',
  },
  {
    id: 'cinder_heart',
    name: 'Cinder Heart',
    category: 'Offense',
    summary: 'Crits and Tactical skills Burn foes for 4.5s.',
    accent: '#F97316',
  },
  {
    id: 'rimefrost_shard',
    name: 'Rimefrost Shard',
    category: 'Offense',
    summary: '35% Chill on hit; hitting Chilled foes Freezes & shatters for 1.4x + frost AoE.',
    accent: '#38BDF8',
  },
  {
    id: 'stormcaller_lodestone',
    name: 'Stormcaller Lodestone',
    category: 'Offense',
    summary: 'Every 3rd hit Shocks (5s); Shocked hits chain to 3 foes.',
    accent: '#FBBF24',
  },
  {
    id: 'viper_crucible',
    name: 'Viper Crucible',
    category: 'Offense',
    summary: 'Attacks Poison foes for 6s (-30% enemy damage).',
    accent: '#22C55E',
  },
  {
    id: 'bloodletter_talisman',
    name: 'Bloodletter Talisman',
    category: 'Offense',
    summary: 'Attacks inflict Bleed (5s); damage doubles while moving.',
    accent: '#DC2626',
  },
  {
    id: 'thorned_aegis',
    name: 'Thorned Aegis',
    category: 'Defense',
    summary: 'Shield hits discharge a shockwave that Stuns nearby foes for 1.8s.',
    accent: '#A855F7',
  },
];

export const TILE_SIZE = 32;

export type FloorBlessingId = 'fury' | 'swiftness' | 'bastion';

export const FLOOR_BLESSINGS: Record<
  FloorBlessingId,
  { id: FloorBlessingId; name: string; summary: string; color: string; shortTag: string }
> = {
  fury: {
    id: 'fury',
    name: "Warlord's Fury",
    summary: '+6% outgoing attack & skill damage on this floor',
    color: '#F97316',
    shortTag: '+DMG',
  },
  swiftness: {
    id: 'swiftness',
    name: "Windrunner's Grace",
    summary: '+8% movement speed & faster cooldowns on this floor',
    color: '#34D399',
    shortTag: '+SPD',
  },
  bastion: {
    id: 'bastion',
    name: 'Iron Sanctum',
    summary: '+6% damage reduction & instant +20 Shield',
    color: '#60A5FA',
    shortTag: '+DEF',
  },
};

export interface RoomNode {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  type: 'start' | 'combat' | 'treasure' | 'shrine' | 'boss';
  cleared: boolean;
  discovered: boolean;
  guardian?: boolean;
}

export interface OverworldRegion {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  radius: number;
  accentColor: string;
}

export interface DungeonMap {
  floor: number;
  seed: number;
  biome: BiomeId;
  biomeTitle: string;
  width: number;
  height: number;
  tiles: number[];
  rooms: RoomNode[];
  torches: { x: number; y: number }[];
  portalPos: { x: number; y: number };
  portalActive: boolean;
  spawnPoints?: { x: number; y: number }[];
  regions?: OverworldRegion[];
}

export interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  aimAngle: number;
  // Mobile virtual joystick analog input (-1 to 1)
  stickX?: number;
  stickY?: number;
}

export interface PlayerState {
  id: string;
  username: string;
  heroClass: HeroClassId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  shield: number;
  level: number;
  xp: number;
  nextXp: number;
  gold: number;
  potions: number;
  relics: string[];
  storage: string[];
  downed: boolean;
  downedTimerMs: number;
  reviveProgress: number; // 0 to 1
  skillCooldownMs: number;
  maxSkillCooldownMs: number;
  ultCooldownMs: number;
  maxUltCooldownMs: number;
  dashCooldownMs: number;
  maxDashCooldownMs: number;
  attackAnimMs: number;
  hasteMs: number;
  // Status Effects
  slowedMs: number;
  stunnedMs: number;
  burnedMs: number;
  frozenMs: number;
  shockedMs: number;
  poisonedMs: number;
  bleedingMs: number;
  silencedMs: number;

  kills: number;
  damageDealt: number;
  revives: number;
  readyNextFloor: boolean;
  ready?: boolean;
  pendingRelicChoices: string[];
  connected: boolean;
  isAdmin?: boolean;
  godMode?: boolean;
  speedBoost?: boolean;
  noCooldownMode?: boolean;
  dexterity: number;
  vitality: number;
  strength: number;
  intelligence: number;
  faith: number;
  attributePoints: number;
  statuses: PlayerStatusEffect[];
  floorBlessings?: FloorBlessingId[];
  lastInputSeq?: number;
  spellCastState?: ArcanistCastState | null;
  disintegrationState?: DisintegrationChannelState | null;
  equippedScrollId?: ArcanistScrollId | null;
  pendingScrollChoices?: ArcanistScrollId[];
  starRiftCooldownMs?: number;
  chronoSuspendedMs?: number;
  activeChestPropId?: string | null;
  ownedWeapons?: string[];
  ownedVestments?: string[];
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
  activePassiveId?: VestmentPassiveId;
  vanguardHeat?: number;
  rangerMomentum?: number;
  predatorTargetId?: string | null;
  predatorStacks?: number;
  voidEnergy?: number;
  storedGrace?: number;
  clericSanctity?: number;
  eclipseChargeRatio?: number;
  attackComboStep?: number;
  bastionCounterMs?: number;
  bastionCounterMaxMs?: number;
  crimsonFrenzyMs?: number;
  crimsonFrenzyMaxMs?: number;
  spawnProtectionMs?: number;
  npcDialogue?: PlayerNpcDialogueState | null;
}

export interface PlayerNpcDialogueState {
  npcId: string;
  npcName: string;
  x: number;
  y: number;
  text: string;
  ttlMs: number;
  maxTtlMs: number;
  persistent?: boolean;
  seq: number;
  options?: DialogueOption[];
}

export type PlayerStatusType =
  | 'guard_broken' // Floor 1: Warden Malakor
  | 'frostbite'    // Floor 2: Archlich Vaelor
  | 'scorched'     // Floor 3: Ignis
  | 'voidmarked'   // Floor 4: Void-Eater Malice
  | 'disoriented'  // Floor 5: Archon of Nothingness
  | 'charmed'      // Floor 6: Elyndor
  | 'ashen_curse'  // Floor 7: Zadkiel
  | 'silenced'     // Floor 8: Sariel
  | 'impaled'      // Floor 9: Seraphel
  | 'condemned';   // Floor 10: Oriphiel

export interface PlayerStatusEffect {
  id: string;
  type: PlayerStatusType;
  durationMs: number;
  maxDurationMs: number;
  stacks?: number;
  value?: number;
  sourceId?: string;
  detonationTimerMs?: number;
}

export type EnemyKind =
  | 'slime'
  | 'goblin'
  | 'skeleton'
  | 'cultist'
  | 'knight'
  | 'shadow_stalker'
  | 'astral_sentinel'
  | 'hymn_phantom'
  | 'relic_golem'
  | 'veiled_heretic'
  | 'celestial_arbiter'
  | 'warden_enforcer'
  | 'boss';

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  name: string;
  roomId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  state: 'idle' | 'chase' | 'windup' | 'recover' | 'charge';
  windupMs: number;
  targetX: number;
  targetY: number;
  markedMs: number;
  // Status Effects
  slowedMs: number;
  stunnedMs: number;
  burnedMs: number;
  frozenMs: number;
  shockedMs: number;
  poisonedMs: number;
  bleedingMs: number;
  silencedMs: number;
  
  elite: boolean;
  resistances?: EnemyResistances;
  enraged?: boolean;
  charging?: boolean;
  chargeAngle?: number;
  chargeTimerMs?: number;
  chargeWindupMs?: number;
  summonWave?: number;
  shieldWallMs?: number;
  abilityCdMs?: number;
  chronoSuspendedMs?: number;
  galeburstMarks?: number;
}

export interface ProjectileState {
  id: string;
  ownerType: 'player' | 'enemy';
  ownerId: string;
  style:
    | 'slash'
    | 'arrow'
    | 'arcane'
    | 'radiant'
    | 'bone'
    | 'voidorb'
    | 'fireball'
    | 'frost_lance'
    | 'arcane_orb'
    | 'arcane_barrage'
    | 'cyclone_arrow';
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  damage: number;
  pierce: number;
  slowOnHit?: boolean;
  statusOnHit?: PlayerStatusType;
  statusDurationMs?: number;
  crit?: boolean;
  ttlMs: number;
  targetEnemyId?: string;
  hitEntityIds?: string[];
  chronoSuspendedMs?: number;
  spellId?: ArcanistSpellId;
  damageCategory?: DamageCategory;
  explosionRadius?: number;
  originX?: number;
  originY?: number;
  elapsedMs?: number;
  helixPhase?: number;
  helixSign?: number;
  weaponId?: string;
}

export interface PropState {
  id: string;
  kind: 'crate' | 'chest' | 'relic_chest' | 'shrine' | 'coin' | 'potion' | 'warden_gate' | 'totem';
  x: number;
  y: number;
  opened: boolean;
  value: number;
  locked?: boolean;
  roomId?: number;
  chestGoldClaimed?: boolean;
  relicChoicesByPlayer?: Record<string, string[]>;
  scrollChoicesByPlayer?: Record<string, ArcanistScrollId[]>;
  claimedRelicPlayerIds?: string[];
  claimedScrollPlayerIds?: string[];
}

export interface FieldZoneState {
  id: string;
  kind:
    | 'aegis_dome'
    | 'solar_beacon'
    | 'chrono_well'
    | 'boss_slam'
    | 'star_rift'
    | 'frost_nova'
    | 'magma_pillar'
    | 'singularity'
    | 'supernova'
    | 'starlight_beam'
    | 'sound_lane'
    | 'lament_mark'
    | 'ashen_cloud'
    | 'censer_sweep'
    | 'scripture_line'
    | 'silence_seal'
    | 'lance_thrust'
    | 'lancefall_mark'
    | 'warden_edict'
    | 'warden_parry'
    | 'verdict_combo'
    | 'warden_shatter'
    | 'arcane_meteor'
    | 'chain_lightning_arc'
    | 'fireball_burn'
    | 'sunforged_shockwave'
    | 'stormbreaker_slam'
    | 'bastion_counter_cleave'
    | 'cyclone_break'
    | 'black_sun_zone'
    | 'black_sun_burst'
    | 'galeburst_nova'
    | 'cinderflare_blast'
    | 'seraphim_holy_burst'
    | 'sacred_retribution'
    | 'bulwark_dash_shockwave'
    | 'frost_volley_cone'
    | 'sanctified_pulse_wave';
  x: number;
  y: number;
  radius: number;
  width?: number;
  height?: number;
  angle?: number;
  coneHalfAngleRad?: number;
  seqNumber?: number;
  label?: string;
  quadrant?: number;
  stage?: number;
  ttlMs: number;
  maxTtlMs: number;
  ownerId: string;
  chronoSuspendedMs?: number;
  damage?: number;
  chainPoints?: { x: number; y: number }[];
}

export interface FloatingEvent {
  id: string;
  kind: 'damage' | 'crit' | 'heal' | 'gold' | 'status' | 'ping' | 'cleric_pulse';
  x: number;
  y: number;
  text: string;
  color: string;
  damageCategory?: DamageCategory | 'elemental';
  attackerId?: string;
  isPrimaryHit?: boolean;
  hitTargetId?: string;
  targetPlayerId?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export type RoomStatus = 'waiting' | 'playing' | 'victory' | 'defeat';

export interface LastRunPlayerSummary {
  id: string;
  username: string;
  heroClass: HeroClassId;
  level: number;
  kills: number;
  revives: number;
}

export interface LastRunSummary {
  outcome: 'victory' | 'defeat';
  floor: number;
  elapsedSec: number;
  players: LastRunPlayerSummary[];
}

export type RoomMode = 'dungeon' | 'tavern' | 'open_world';

export interface RoomSummary {
  roomId: string;
  name: string;
  hostId?: string;
  hostName: string;
  difficulty: DifficultyTier;
  floor: number;
  seed: number;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  roomMode?: RoomMode;
  pvpEnabled?: boolean;
}

export interface DialogueOption {
  id: string;
  label: string;
}

export interface NpcState {
  id: string;
  name: string;
  x: number;
  y: number;
  dialogue: string;
  spriteKind: string;
  speechIndex?: number;
  speakingMs?: number;
  options?: DialogueOption[];
}

export interface TrainingDummyState {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitAnimMs: number;
  totalDamageTaken?: number;
  lastHitTimerMs?: number;
}

export interface GameSnapshot {
  roomId: string;
  roomName: string;
  roomMode?: RoomMode;
  pvpEnabled?: boolean;
  hostId?: string;
  hostName?: string;
  difficulty: DifficultyTier;
  status: RoomStatus;
  floor: number;
  seed: number;
  elapsedSec: number;
  lastRunSummary?: LastRunSummary | null;
  bossDefeated: boolean;
  bossRoomCleared?: boolean;
  bossWards?: number;
  maxBossWards?: number;
  guardiansRemaining?: number;
  guardiansTotal?: number;
  combatRoomsCleared?: number;
  combatRoomsTotal?: number;
  floorMasteryAwarded?: boolean;
  portalReadyCount: number;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  props: PropState[];
  zones: FieldZoneState[];
  npcs: NpcState[];
  trainingDummies: TrainingDummyState[];
  events: FloatingEvent[];
  roomClearedFlags: {
    id: number;
    cleared: boolean;
    discovered: boolean;
    guardian?: boolean;
    type?: RoomNode['type'];
  }[];
}

export interface UserProfile {
  id: string;
  username: string;
  preferredClass: HeroClassId;
  lockedClass: HeroClassId;
  runsCompleted: number;
  highestFloor: number;
  totalKills: number;
  totalRevives: number;
  isAdmin?: boolean;
  level: number;
  xp: number;
  dexterity: number;
  vitality: number;
  strength: number;
  intelligence: number;
  faith: number;
  attributePoints: number;
  ownedWeapons?: string[];
  ownedVestments?: string[];
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
  gold?: number;
  dailyQuests?: DailyQuestState;
}

export type ClientMessage =
  | { type: 'lobby:subscribe' }
  | {
      type: 'room:create';
      name: string;
      difficulty: DifficultyTier;
      seed?: number;
      heroClass: HeroClassId;
    }
  | {
      type: 'room:join';
      roomId: string;
      heroClass: HeroClassId;
    }
  | { type: 'room:leave' }
  | { type: 'player:input'; input: PlayerInputState; seq?: number }
  | {
      type: 'player:action';
      action: 'tactical' | 'ult' | 'potion' | 'interact' | 'dash';
      aimAngle: number;
      aimDistance?: number;
      explicitAim?: boolean;
    }
  | { type: 'player:select_relic'; relicId: string }
  | { type: 'player:unequip_relic'; relicId: string }
  | { type: 'player:store_relic'; relicId: string }
  | { type: 'player:equip_stored_relic'; relicId: string }
  | { type: 'player:delete_relic'; relicId: string; fromStorage?: boolean }
  | { type: 'player:discard_potion'; count?: number }
  | { type: 'player:change_class'; heroClass: HeroClassId }
  | { type: 'player:ping'; label: string; x: number; y: number }
  | { type: 'chat:send'; text: string }
  | { type: 'room:start' }
  | { type: 'room:set_ready'; ready?: boolean }
  | { type: 'room:return_to_lobby' }
  | { type: 'room:restart' }
  | { type: 'admin:godmode'; enabled?: boolean }
  | { type: 'admin:toggle_speed'; enabled?: boolean }
  | { type: 'admin:toggle_no_cooldown'; enabled?: boolean }
  | { type: 'admin:add_gold'; amount?: number }
  | { type: 'admin:add_potions'; amount?: number }
  | { type: 'admin:set_level'; level?: number; targetPlayerId?: string }
  | { type: 'admin:add_relic'; relicId: string }
  | { type: 'admin:spawn_dummy' }
  | { type: 'admin:teleport_floor'; floor: number }
  | { type: 'admin:spawn_entity'; kind: EnemyKind; count: number }
  | { type: 'admin:despawn_entity'; entityId: string }
  | { type: 'admin:clear_enemies' }
  | { type: 'admin:clear_summoned' }
  | { type: 'admin:heal_player' }
  | { type: 'admin:restore_energy' }
  | { type: 'admin:revive_all' }
  | { type: 'admin:summon_boss'; floor: number }
  | { type: 'admin:reset_boss' }
  | { type: 'admin:reset_room' }
  | { type: 'admin:toggle_ai'; enabled?: boolean }
  | { type: 'admin:add_attribute_points'; amount?: number }
  | { type: 'admin:equip_scroll'; scrollId: string }
  | { type: 'player:spend_attribute'; attribute: 'strength' | 'dexterity' | 'vitality' | 'intelligence' | 'faith'; amount?: number }
  | { type: 'player:reset_attributes' }
  | { type: 'player:dialogue_close' }
  | { type: 'player:dialogue_pick'; optionId: string }
  | { type: 'player:channel_start'; aimAngle: number; spellId?: 'disintegration' }
  | { type: 'player:channel_update'; aimAngle: number }
  | { type: 'player:channel_stop' }
  | { type: 'player:select_scroll'; scrollId: ArcanistScrollId }
  | { type: 'player:close_chest' }
  | { type: 'player:equip_armament'; slot: 'weapon' | 'vestment'; itemId: string }
  | { type: 'player:unequip_armament'; slot: 'weapon' | 'vestment' }
  | { type: 'admin:grant_armament'; slot: 'weapon' | 'vestment'; itemId: string }
  | { type: 'room:resync' }
  | { type: 'ping'; t: number };

import type { SnapshotDelta } from './snapshotDelta.ts';

export type ServerMessage =
  | { type: 'lobby:rooms'; rooms: RoomSummary[]; onlineCount: number }
  | { type: 'room:joined'; roomId: string; playerId: string; map: DungeonMap; snapshot: GameSnapshot; chat: ChatMessage[] }
  | { type: 'room:map'; map: DungeonMap }
  | { type: 'room:tick'; snapshot: GameSnapshot; seq?: number }
  | { type: 'room:delta'; delta: SnapshotDelta }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'npc:dialogue'; dialogue: PlayerNpcDialogueState | null }
  | { type: 'room:left' }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number; tickMs?: number };
