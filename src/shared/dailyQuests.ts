import {
  applyAccountArmamentMigration,
  getArmamentDef,
  VESTMENT_CATALOG,
  WEAPON_CATALOG,
  type ArmamentDef,
} from './armaments.ts';
import {
  HERO_CLASSES,
  MAX_LEVEL,
  type AccountRecord,
  type DailyQuestEntryState,
  type DailyQuestHydratedItem,
  type DailyQuestMetric,
  type DailyQuestRewardPreview,
  type DailyQuestState,
  type HeroClassId,
} from './types.ts';

export interface DailyQuestTemplate {
  id: string;
  slot: 'skirmish' | 'delve' | 'trial' | 'bounty';
  title: string;
  description: string;
  metric: DailyQuestMetric;
  target: number;
  rewardGold: number;
  rewardXp: number;
  rewardsArmament: boolean;
}

export const DAILY_MASTERY_FALLBACK_GOLD = 350;
export const DAILY_MASTERY_FALLBACK_XP = 300;

export const DAILY_QUEST_TEMPLATES: readonly DailyQuestTemplate[] = [
  // Slot 0: Skirmish (kills)
  {
    id: 'dq_slay_25',
    slot: 'skirmish',
    title: 'Sanctuary Patrol',
    description: 'Slay 25 dungeon monsters across expedition runs.',
    metric: 'kills',
    target: 25,
    rewardGold: 120,
    rewardXp: 140,
    rewardsArmament: false,
  },
  {
    id: 'dq_slay_35',
    slot: 'skirmish',
    title: 'Crypt Vanguard',
    description: 'Slay 35 dungeon monsters across expedition runs.',
    metric: 'kills',
    target: 35,
    rewardGold: 155,
    rewardXp: 185,
    rewardsArmament: false,
  },
  {
    id: 'dq_slay_45',
    slot: 'skirmish',
    title: 'Abyssal Purge',
    description: 'Slay 45 dungeon monsters across expedition runs.',
    metric: 'kills',
    target: 45,
    rewardGold: 190,
    rewardXp: 230,
    rewardsArmament: false,
  },

  // Slot 1: Delve (floors_cleared)
  {
    id: 'dq_floors_2',
    slot: 'delve',
    title: 'Subterranean Descent',
    description: 'Clear 2 dungeon floors across one or more expeditions.',
    metric: 'floors_cleared',
    target: 2,
    rewardGold: 150,
    rewardXp: 180,
    rewardsArmament: false,
  },
  {
    id: 'dq_floors_3',
    slot: 'delve',
    title: 'Reliquary March',
    description: 'Clear 3 dungeon floors across one or more expeditions.',
    metric: 'floors_cleared',
    target: 3,
    rewardGold: 210,
    rewardXp: 250,
    rewardsArmament: false,
  },

  // Slot 2: Trial (boss_kills or runs_played)
  {
    id: 'dq_boss_1',
    slot: 'trial',
    title: 'Guardian Challenger',
    description: 'Defeat 1 Floor Guardian Boss during an expedition.',
    metric: 'boss_kills',
    target: 1,
    rewardGold: 165,
    rewardXp: 200,
    rewardsArmament: false,
  },
  {
    id: 'dq_runs_1',
    slot: 'trial',
    title: 'Oathbound Venture',
    description: 'Complete 1 full expedition attempt (Victory or Fall in battle).',
    metric: 'runs_played',
    target: 1,
    rewardGold: 145,
    rewardXp: 170,
    rewardsArmament: false,
  },

  // Slot 3: Daily Armory Bounty (Always awards a class-matched Armament or Mastery Bonus)
  {
    id: 'dq_bounty_boss_2',
    slot: 'bounty',
    title: 'Armory Bounty: Boss Hunter',
    description: 'Defeat 2 Floor Bosses across runs to earn a sworn class Armament.',
    metric: 'boss_kills',
    target: 2,
    rewardGold: 200,
    rewardXp: 260,
    rewardsArmament: true,
  },
  {
    id: 'dq_bounty_floors_4',
    slot: 'bounty',
    title: 'Armory Bounty: Deep Delver',
    description: 'Clear 4 dungeon floors across runs to earn a sworn class Armament.',
    metric: 'floors_cleared',
    target: 4,
    rewardGold: 220,
    rewardXp: 280,
    rewardsArmament: true,
  },
  {
    id: 'dq_bounty_kills_60',
    slot: 'bounty',
    title: 'Armory Bounty: Endless Vigil',
    description: 'Slay 60 dungeon monsters across runs to earn a sworn class Armament.',
    metric: 'kills',
    target: 60,
    rewardGold: 210,
    rewardXp: 270,
    rewardsArmament: true,
  },
  {
    id: 'dq_bounty_runs_2',
    slot: 'bounty',
    title: 'Armory Bounty: Seasoned Delver',
    description: 'Finish 2 expeditions (Victory or Defeat) to earn a sworn class Armament.',
    metric: 'runs_played',
    target: 2,
    rewardGold: 220,
    rewardXp: 280,
    rewardsArmament: true,
  },
] as const;

const TEMPLATES_BY_ID: ReadonlyMap<string, DailyQuestTemplate> = new Map(
  DAILY_QUEST_TEMPLATES.map((t) => [t.id, t])
);

export function getUtcDateKey(nowMs: number = Date.now()): string {
  const safeMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(safeMs).toISOString().slice(0, 10);
}

export function getNextUtcResetMs(nowMs: number = Date.now()): number {
  const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function computeNextXpForLevel(level: number): number {
  if (level >= MAX_LEVEL) return 999999;
  const lvl = Math.max(1, level);
  return Math.round(80 + (lvl - 1) * 60 + Math.pow(lvl - 1, 1.75) * 12);
}

export function getDailyQuestTemplatesForDate(dateKey: string): DailyQuestTemplate[] {
  const seed = hashSeed(`beyond:daily:${dateKey}`);
  const bountyPool = DAILY_QUEST_TEMPLATES.filter((t) => t.slot === 'bounty');
  const bounty = bountyPool[seed % bountyPool.length];

  const skirmishPool = DAILY_QUEST_TEMPLATES.filter(
    (t) => t.slot === 'skirmish' && t.metric !== bounty.metric
  );
  const delvePool = DAILY_QUEST_TEMPLATES.filter(
    (t) => t.slot === 'delve' && t.metric !== bounty.metric
  );
  const trialPool = DAILY_QUEST_TEMPLATES.filter(
    (t) => t.slot === 'trial' && t.metric !== bounty.metric
  );

  const selected: DailyQuestTemplate[] = [];

  if (skirmishPool.length > 0) {
    selected.push(skirmishPool[(seed >>> 3) % skirmishPool.length]);
  }
  if (delvePool.length > 0) {
    selected.push(delvePool[(seed >>> 7) % delvePool.length]);
  }
  if (trialPool.length > 0) {
    selected.push(trialPool[(seed >>> 11) % trialPool.length]);
  }

  // Ensure 3 non-bounty quests even when bounty borrows one metric
  if (selected.length < 3) {
    const usedMetrics = new Set<DailyQuestMetric>([
      bounty.metric,
      ...selected.map((s) => s.metric),
    ]);
    const extras = DAILY_QUEST_TEMPLATES.filter(
      (t) => t.slot !== 'bounty' && !usedMetrics.has(t.metric)
    );
    if (extras.length > 0) {
      selected.push(extras[(seed >>> 15) % extras.length]);
    }
  }

  selected.push(bounty);
  return selected;
}

export function createDailyQuestStateForDate(dateKey: string): DailyQuestState {
  const templates = getDailyQuestTemplatesForDate(dateKey);
  const quests: Record<string, DailyQuestEntryState> = {};
  for (const t of templates) {
    quests[t.id] = {
      questId: t.id,
      progress: 0,
      claimed: false,
    };
  }
  return { dateKey, quests };
}

export function normalizeDailyQuestState(
  raw: unknown,
  nowMs: number = Date.now()
): DailyQuestState {
  const currentDateKey = getUtcDateKey(nowMs);
  let parsed: Record<string, unknown> | null = null;

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') parsed = obj as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }

  const fresh = createDailyQuestStateForDate(currentDateKey);
  if (!parsed || parsed.dateKey !== currentDateKey) {
    return fresh;
  }

  const rawQuests =
    parsed.quests && typeof parsed.quests === 'object'
      ? (parsed.quests as Record<string, unknown>)
      : {};

  for (const [questId, entry] of Object.entries(fresh.quests)) {
    const tpl = TEMPLATES_BY_ID.get(questId);
    if (!tpl) continue;
    const savedRaw = rawQuests[questId];
    if (savedRaw && typeof savedRaw === 'object') {
      const saved = savedRaw as Record<string, unknown>;
      const rawProgress = Number(saved.progress);
      entry.progress = Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(tpl.target, Math.floor(rawProgress)))
        : 0;
      entry.claimed = Boolean(saved.claimed) && entry.progress >= tpl.target;
      if (entry.claimed && typeof saved.claimedAt === 'number' && Number.isFinite(saved.claimedAt)) {
        entry.claimedAt = saved.claimedAt;
      }
    }
  }

  return fresh;
}

export function applyDailyQuestEvent(
  state: unknown,
  metric: DailyQuestMetric,
  amount: number = 1,
  nowMs: number = Date.now()
): {
  state: DailyQuestState;
  changed: boolean;
  newlyCompletedIds: string[];
} {
  const normalized = normalizeDailyQuestState(state, nowMs);
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  if (delta <= 0) {
    return { state: normalized, changed: false, newlyCompletedIds: [] };
  }

  const templates = getDailyQuestTemplatesForDate(normalized.dateKey);
  let changed = false;
  const newlyCompletedIds: string[] = [];

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

export function resolveDailyQuestArmament(
  heroClass: HeroClassId,
  ownedWeapons: readonly string[] = [],
  ownedVestments: readonly string[] = [],
  dateKey: string = getUtcDateKey(),
  questId: string = ''
): ArmamentDef | null {
  const validClass: HeroClassId = HERO_CLASSES[heroClass] ? heroClass : 'vanguard';
  const classItems: ArmamentDef[] = [
    ...WEAPON_CATALOG.filter((w) => w.heroClass === validClass && !w.isDefault),
    ...VESTMENT_CATALOG.filter((v) => v.heroClass === validClass && !v.isDefault),
  ];

  const unowned = classItems.filter((item) =>
    item.slot === 'weapon'
      ? !ownedWeapons.includes(item.id)
      : !ownedVestments.includes(item.id)
  );
  if (unowned.length === 0) return null;

  const forgedUnowned = unowned.filter((i) => i.rarity === 'Forged');
  const pool = forgedUnowned.length > 0 ? forgedUnowned : unowned;
  const pickIdx = hashSeed(`${dateKey}:${questId}:${validClass}`) % pool.length;
  return pool[pickIdx] ?? pool[0];
}

export function buildDailyQuestRewardPreview(
  tpl: DailyQuestTemplate,
  heroClass: HeroClassId,
  ownedWeapons: readonly string[] = [],
  ownedVestments: readonly string[] = [],
  dateKey: string = getUtcDateKey()
): DailyQuestRewardPreview {
  if (!tpl.rewardsArmament) {
    return {
      gold: tpl.rewardGold,
      xp: tpl.rewardXp,
      armament: null,
      masteryFallback: null,
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
        passiveName: candidate.slot === 'vestment' ? candidate.passiveName : undefined,
      },
      masteryFallback: null,
    };
  }

  return {
    gold: tpl.rewardGold,
    xp: tpl.rewardXp,
    armament: null,
    masteryFallback: {
      bonusGold: DAILY_MASTERY_FALLBACK_GOLD,
      bonusXp: DAILY_MASTERY_FALLBACK_XP,
      reason: 'All sworn class Armaments unlocked — grants Mastery Bonus instead.',
    },
  };
}

export function hydrateDailyQuestsForAccount(
  acc: Pick<AccountRecord, 'lockedClass' | 'preferredClass' | 'ownedWeapons' | 'ownedVestments' | 'dailyQuests'>,
  nowMs: number = Date.now()
): {
  dateKey: string;
  resetAtMs: number;
  state: DailyQuestState;
  quests: DailyQuestHydratedItem[];
} {
  const heroClass: HeroClassId = HERO_CLASSES[acc.lockedClass]
    ? acc.lockedClass
    : HERO_CLASSES[acc.preferredClass]
      ? acc.preferredClass
      : 'vanguard';

  const state = normalizeDailyQuestState(acc.dailyQuests, nowMs);
  const templates = getDailyQuestTemplatesForDate(state.dateKey);
  const ownedWeapons = acc.ownedWeapons || [];
  const ownedVestments = acc.ownedVestments || [];

  const quests: DailyQuestHydratedItem[] = templates.map((tpl) => {
    const entry = state.quests[tpl.id] || {
      questId: tpl.id,
      progress: 0,
      claimed: false,
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
      ),
    };
  });

  return {
    dateKey: state.dateKey,
    resetAtMs: getNextUtcResetMs(nowMs),
    state,
    quests,
  };
}

export function applyAccountXpAndLevelUp(
  acc: AccountRecord,
  xpToAdd: number
): { levelsGained: number } {
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

export type ClaimDailyQuestResult =
  | {
      ok: true;
      dateKey: string;
      resetAtMs: number;
      quests: DailyQuestHydratedItem[];
      rewardGranted: {
        questId: string;
        questTitle: string;
        goldAdded: number;
        xpAdded: number;
        levelsGained: number;
        armamentGranted: {
          slot: 'weapon' | 'vestment';
          itemId: string;
          name: string;
          rarity: string;
          accent: string;
        } | null;
        masteryBonusApplied: boolean;
      };
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: string;
    };

export function claimDailyQuestForAccount(
  acc: AccountRecord,
  questId: string,
  nowMs: number = Date.now()
): ClaimDailyQuestResult {
  if (typeof questId !== 'string' || !questId.trim()) {
    return { ok: false, status: 400, error: 'A valid questId is required.' };
  }
  const cleanId = questId.trim();
  applyAccountArmamentMigration(acc);

  const state = normalizeDailyQuestState(acc.dailyQuests, nowMs);
  acc.dailyQuests = state;

  const tpl = TEMPLATES_BY_ID.get(cleanId);
  const entry = state.quests[cleanId];
  if (!tpl || !entry) {
    return { ok: false, status: 404, error: 'That quest is not active in today’s daily rotation.' };
  }
  if (entry.claimed) {
    return { ok: false, status: 409, error: 'Reward for this daily quest has already been claimed today.' };
  }
  if (entry.progress < tpl.target) {
    return { ok: false, status: 400, error: 'Daily quest objective is not yet complete.' };
  }

  const heroClass: HeroClassId = HERO_CLASSES[acc.lockedClass]
    ? acc.lockedClass
    : HERO_CLASSES[acc.preferredClass]
      ? acc.preferredClass
      : 'vanguard';

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
  let armamentGranted: {
    slot: 'weapon' | 'vestment';
    itemId: string;
    name: string;
    rarity: string;
    accent: string;
  } | null = null;

  if (preview.armament) {
    const def = getArmamentDef(preview.armament.slot, preview.armament.itemId);
    if (def && def.heroClass === heroClass) {
      if (def.slot === 'weapon') {
        if (!acc.ownedWeapons!.includes(def.id)) {
          acc.ownedWeapons!.push(def.id);
        }
      } else {
        if (!acc.ownedVestments!.includes(def.id)) {
          acc.ownedVestments!.push(def.id);
        }
      }
      armamentGranted = {
        slot: def.slot,
        itemId: def.id,
        name: def.name,
        rarity: def.rarity,
        accent: def.accent,
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
      masteryBonusApplied,
    },
  };
}
