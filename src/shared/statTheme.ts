import type { ScalingAttribute } from './types.ts';

export type PrimaryAttributeKey =
  | 'strength'
  | 'vitality'
  | 'dexterity'
  | 'intelligence'
  | 'faith';

export const PRIMARY_STAT_ORDER: readonly PrimaryAttributeKey[] = [
  'strength',
  'vitality',
  'dexterity',
  'intelligence',
  'faith',
] as const;

export interface StatColorMeta {
  key: PrimaryAttributeKey;
  short: 'STR' | 'VIT' | 'DEX' | 'INT' | 'FTH';
  name: string;
  color: string;
  textColor: string;
  borderColor: string;
  bgTint: string;
  borderTint: string;
  conciseDesc: string;
  scalingSummary: string;
}

/**
 * Canonical highlight color palette for primary & combat stats across all Beyond UI views.
 * - STR: Orange-Red (#F97316)
 * - VIT: Vital Green (#22C55E)
 * - DEX: Swift Cyan (#38BDF8)
 * - INT: Arcane Violet (#C084FC)
 * - FTH: Sacred Gold (#FDE047)
 */
export const PRIMARY_STAT_THEME: Record<PrimaryAttributeKey, StatColorMeta> = {
  strength: {
    key: 'strength',
    short: 'STR',
    name: 'Strength',
    color: '#F97316',
    textColor: '#FB923C',
    borderColor: 'rgba(249, 115, 22, 0.5)',
    bgTint: 'rgba(249, 115, 22, 0.14)',
    borderTint: 'rgba(249, 115, 22, 0.45)',
    conciseDesc: '+0.8% Vanguard DMG, +0.1% DoT, +0.15% Armor / pt.',
    scalingSummary: '+0.8% Vanguard DMG, +0.1% DoT, +0.15% Armor / pt.',
  },
  vitality: {
    key: 'vitality',
    short: 'VIT',
    name: 'Vitality',
    color: '#22C55E',
    textColor: '#4ADE80',
    borderColor: 'rgba(34, 197, 94, 0.5)',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    borderTint: 'rgba(34, 197, 94, 0.45)',
    conciseDesc: '+5 Max HP / pt & 2s combat regen (at 6+ VIT).',
    scalingSummary: '+5 Max HP / pt & 2s combat regen (at 6+ VIT).',
  },
  dexterity: {
    key: 'dexterity',
    short: 'DEX',
    name: 'Dexterity',
    color: '#38BDF8',
    textColor: '#7DD3FC',
    borderColor: 'rgba(56, 189, 248, 0.5)',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    borderTint: 'rgba(56, 189, 248, 0.45)',
    conciseDesc: '+0.8% Ranger DMG, +0.4% Atk Spd, +0.25% Move Spd, +0.3% Crit / pt.',
    scalingSummary: '+0.8% Ranger DMG, +0.4% Atk Spd, +0.25% Move Spd, +0.3% Crit / pt.',
  },
  intelligence: {
    key: 'intelligence',
    short: 'INT',
    name: 'Intelligence',
    color: '#C084FC',
    textColor: '#D8B4FE',
    borderColor: 'rgba(192, 132, 252, 0.5)',
    bgTint: 'rgba(192, 132, 252, 0.14)',
    borderTint: 'rgba(192, 132, 252, 0.45)',
    conciseDesc: '+0.8% Arcanist DMG, +0.1% DoT, +0.2% CDR, +0.15% Elem Res / pt.',
    scalingSummary: '+0.8% Arcanist DMG, +0.1% DoT, +0.2% CDR, +0.15% Elem Res / pt.',
  },
  faith: {
    key: 'faith',
    short: 'FTH',
    name: 'Faith',
    color: '#FDE047',
    textColor: '#FEF08A',
    borderColor: 'rgba(253, 224, 71, 0.5)',
    bgTint: 'rgba(253, 224, 71, 0.14)',
    borderTint: 'rgba(253, 224, 71, 0.45)',
    conciseDesc: '+0.8% Cleric DMG, +0.6% Heal, +0.1% DoT, +0.3% Tenacity / pt.',
    scalingSummary: '+0.8% Cleric DMG, +0.6% Heal, +0.1% DoT, +0.3% Tenacity / pt.',
  },
};

export const COMBAT_STAT_COLORS = {
  hp: '#4ADE80',
  ehp: '#22C55E',
  shield: '#60A5FA',
  damage: '#F87171',
  dps: '#F87171',
  dot: '#FB923C',
  crit: '#FBBF24',
  speed: '#34D399',
  range: '#38BDF8',
  cdr: '#A78BFA',
  armor: '#93C5FD',
  elemResist: '#E879F9',
  tenacity: '#FDE047',
  gold: '#FACC15',
} as const;

export function getPrimaryStatColor(attr: PrimaryAttributeKey | ScalingAttribute | string): string {
  const norm = attr.toLowerCase();
  if (norm === 'strength' || norm === 'str') return PRIMARY_STAT_THEME.strength.color;
  if (norm === 'vitality' || norm === 'vit') return PRIMARY_STAT_THEME.vitality.color;
  if (norm === 'dexterity' || norm === 'dex') return PRIMARY_STAT_THEME.dexterity.color;
  if (norm === 'intelligence' || norm === 'int') return PRIMARY_STAT_THEME.intelligence.color;
  if (norm === 'faith' || norm === 'fth') return PRIMARY_STAT_THEME.faith.color;
  return '#E2E8F0';
}

export function getPrimaryStatMeta(attr: PrimaryAttributeKey | ScalingAttribute): StatColorMeta {
  return PRIMARY_STAT_THEME[attr] ?? PRIMARY_STAT_THEME.strength;
}
