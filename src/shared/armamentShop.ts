import {
  applyAccountArmamentMigration,
  getArmamentDef,
  getDefaultVestmentIdForClass,
  getWeaponTacticalDef,
  VESTMENT_CATALOG,
  WEAPON_CATALOG,
  type ActiveTacticalDef,
  type ArmamentDef,
  type ArmamentRarity,
  type ArmamentSlot,
  type VestmentDef,
  type WeaponDef,
} from './armaments.ts';
import {
  HERO_CLASSES,
  type AccountRecord,
  type HeroClassId,
  type UserProfile,
} from './types.ts';

/**
 * Sanctuary Treasury Gold rewards earned automatically during expedition milestones.
 */
export const SANCTUARY_GOLD_REWARDS = {
  floorClearedGold: 45,
  bossKillGold: 60,
} as const;

/**
 * Canonical Gold prices for Sanctuary Armory Shop armaments.
 * Starter items (isDefault === true) are owned at 0 Gold; Forged & Ascendant armaments
 * are priced by slot and functional tier.
 */
export const ARMAMENT_SHOP_PRICES: Record<ArmamentSlot, Record<ArmamentRarity, number>> = {
  weapon: {
    Standard: 0,
    Forged: 400,
    Ascendant: 750,
  },
  vestment: {
    Standard: 0,
    Forged: 320,
    Ascendant: 600,
  },
};

export function getArmamentShopPrice(def: Pick<ArmamentDef, 'slot' | 'rarity' | 'isDefault'>): number {
  if (def.isDefault) return 0;
  return ARMAMENT_SHOP_PRICES[def.slot][def.rarity];
}

export interface ArmamentShopItem {
  slot: ArmamentSlot;
  itemId: string;
  heroClass: HeroClassId;
  name: string;
  rarity: ArmamentRarity;
  archetype: string;
  summary: string;
  effectLines: readonly string[];
  accent: string;
  isDefault: boolean;
  priceGold: number;
  owned: boolean;
  equipped: boolean;
  classMatch: boolean;
  canAfford: boolean;
  tacticalDef: ActiveTacticalDef | null;
  passiveName?: string;
  passiveSummary?: string;
}

export interface HydratedArmamentShop {
  gold: number;
  heroClass: HeroClassId;
  ownedClassCount: number;
  totalClassCount: number;
  items: ArmamentShopItem[];
}

export function resolveAccountHeroClass(
  acc: Pick<AccountRecord | UserProfile, 'lockedClass' | 'preferredClass'>
): HeroClassId {
  if (HERO_CLASSES[acc.lockedClass]) return acc.lockedClass;
  if (HERO_CLASSES[acc.preferredClass]) return acc.preferredClass;
  return 'vanguard';
}

export function toShopItem(
  def: ArmamentDef,
  heroClass: HeroClassId,
  gold: number,
  ownedWeapons: readonly string[],
  ownedVestments: readonly string[],
  equippedWeapon: string | null | undefined,
  equippedVestment: string | null | undefined
): ArmamentShopItem {
  const priceGold = getArmamentShopPrice(def);
  const owned =
    def.slot === 'weapon'
      ? ownedWeapons.includes(def.id)
      : ownedVestments.includes(def.id);
  const equipped =
    def.slot === 'weapon'
      ? equippedWeapon === def.id
      : equippedVestment === def.id;
  const classMatch = def.heroClass === heroClass;
  const tacticalDef =
    def.slot === 'weapon' ? getWeaponTacticalDef(def as WeaponDef) : null;
  const vestment = def.slot === 'vestment' ? (def as VestmentDef) : null;

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
    passiveSummary: vestment?.passiveSummary,
  };
}

export function hydrateArmamentShopForAccount(
  acc: Pick<
    AccountRecord | UserProfile,
    | 'lockedClass'
    | 'preferredClass'
    | 'gold'
    | 'ownedWeapons'
    | 'ownedVestments'
    | 'equippedWeapon'
    | 'equippedVestment'
  >
): HydratedArmamentShop {
  const heroClass = resolveAccountHeroClass(acc);
  const gold = Math.max(0, Math.floor(Number(acc.gold) || 0));
  const ownedWeapons = acc.ownedWeapons || [];
  const ownedVestments = acc.ownedVestments || [];

  const allDefs: ArmamentDef[] = [...WEAPON_CATALOG, ...VESTMENT_CATALOG];
  const items = allDefs
    .map((def) =>
      toShopItem(
        def,
        heroClass,
        gold,
        ownedWeapons,
        ownedVestments,
        acc.equippedWeapon,
        acc.equippedVestment
      )
    )
    .sort((a, b) => {
      if (a.classMatch !== b.classMatch) return a.classMatch ? -1 : 1;
      if (a.heroClass !== b.heroClass) return a.heroClass.localeCompare(b.heroClass);
      if (a.slot !== b.slot) return a.slot === 'weapon' ? -1 : 1;
      if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
      return a.priceGold - b.priceGold;
    });

  const classItems = items.filter((i) => i.classMatch);
  return {
    gold,
    heroClass,
    ownedClassCount: classItems.filter((i) => i.owned).length,
    totalClassCount: classItems.length,
    items,
  };
}

export type PurchaseArmamentResult =
  | {
      ok: true;
      slot: ArmamentSlot;
      item: ArmamentDef;
      priceGold: number;
      equipped: boolean;
      goldRemaining: number;
      shop: HydratedArmamentShop;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Authoritative purchase validator & mutator for AccountRecord.
 * Enforces class oath, catalog lookup, duplicate prevention, and Gold balance.
 */
export function purchaseArmamentForAccount(
  acc: AccountRecord,
  slot: ArmamentSlot,
  itemId: string,
  opts: { autoEquip?: boolean } = {}
): PurchaseArmamentResult {
  if (slot !== 'weapon' && slot !== 'vestment') {
    return { ok: false, status: 400, error: 'Invalid armament slot.' };
  }
  const cleanId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!cleanId) {
    return { ok: false, status: 400, error: 'Missing armament itemId.' };
  }

  applyAccountArmamentMigration(acc);

  const def = getArmamentDef(slot, cleanId);
  if (!def) {
    return { ok: false, status: 404, error: 'Unknown armament.' };
  }

  const activeClass = resolveAccountHeroClass(acc);
  if (def.heroClass !== activeClass) {
    return {
      ok: false,
      status: 403,
      error: `${def.name} requires the ${HERO_CLASSES[def.heroClass].name} class.`,
    };
  }

  const ownedList = slot === 'weapon' ? acc.ownedWeapons! : acc.ownedVestments!;
  if (ownedList.includes(cleanId) || def.isDefault) {
    return {
      ok: false,
      status: 409,
      error: `You already own ${def.name}.`,
    };
  }

  const priceGold = getArmamentShopPrice(def);
  const currentGold = Math.max(0, Math.floor(Number(acc.gold) || 0));
  if (currentGold < priceGold) {
    return {
      ok: false,
      status: 400,
      error: `Not enough Gold for ${def.name}. Need ${priceGold} Gold (you have ${currentGold} Gold).`,
    };
  }

  acc.gold = currentGold - priceGold;
  ownedList.push(cleanId);

  let equipped = false;
  if (opts.autoEquip) {
    if (slot === 'weapon') {
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
    shop: hydrateArmamentShopForAccount(acc),
  };
}

export type EquipAccountArmamentResult =
  | {
      ok: true;
      slot: ArmamentSlot;
      equippedId: string | null;
      item: ArmamentDef | null;
      shop: HydratedArmamentShop;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Equips or unequips a permanent Armament on an AccountRecord directly from Sanctuary Keep.
 */
export function equipArmamentForAccount(
  acc: AccountRecord,
  slot: ArmamentSlot,
  itemId: string | null
): EquipAccountArmamentResult {
  if (slot !== 'weapon' && slot !== 'vestment') {
    return { ok: false, status: 400, error: 'Invalid armament slot.' };
  }

  applyAccountArmamentMigration(acc);
  const activeClass = resolveAccountHeroClass(acc);

  if (itemId === null) {
    if (slot === 'weapon') {
      acc.equippedWeapon = null;
      return {
        ok: true,
        slot,
        equippedId: null,
        item: null,
        shop: hydrateArmamentShopForAccount(acc),
      };
    }
    const defaultVestmentId = getDefaultVestmentIdForClass(activeClass);
    acc.equippedVestment = defaultVestmentId;
    return {
      ok: true,
      slot,
      equippedId: defaultVestmentId,
      item: getArmamentDef('vestment', defaultVestmentId),
      shop: hydrateArmamentShopForAccount(acc),
    };
  }

  const cleanId = typeof itemId === 'string' ? itemId.trim() : '';
  const def = cleanId ? getArmamentDef(slot, cleanId) : null;
  if (!def) {
    return { ok: false, status: 404, error: 'Unknown armament.' };
  }
  if (def.heroClass !== activeClass) {
    return {
      ok: false,
      status: 403,
      error: `${def.name} belongs to ${HERO_CLASSES[def.heroClass].name}.`,
    };
  }
  const ownedList = slot === 'weapon' ? acc.ownedWeapons! : acc.ownedVestments!;
  if (!ownedList.includes(cleanId)) {
    return {
      ok: false,
      status: 403,
      error: `You must unlock or purchase ${def.name} before equipping it.`,
    };
  }

  if (slot === 'weapon') {
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
    shop: hydrateArmamentShopForAccount(acc),
  };
}
