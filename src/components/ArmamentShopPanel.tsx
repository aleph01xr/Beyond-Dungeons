import React, { useEffect, useMemo, useState } from 'react';
import { getApiEndpoint } from '../client/apiConfig.ts';
import { sfx } from '../client/sound.ts';
import {
  hydrateArmamentShopForAccount,
  SANCTUARY_GOLD_REWARDS,
  type ArmamentShopItem,
} from '../shared/armamentShop.ts';
import { HERO_CLASSES, type HeroClassId, type UserProfile } from '../shared/types.ts';
import { ArmamentIcon } from './ArmamentIcon.tsx';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';
import { TacticalSkillIcon } from './TacticalSkillIcon.tsx';

interface ArmamentShopPanelProps {
  user: UserProfile;
  authToken: string;
  onUserUpdated: (user: UserProfile) => void;
}

type SlotFilter = 'all' | 'weapon' | 'vestment';
type ClassScope = 'mine' | 'all';

export const ArmamentShopPanel: React.FC<ArmamentShopPanelProps> = ({
  user,
  authToken,
  onUserUpdated,
}) => {
  const initialShop = useMemo(() => hydrateArmamentShopForAccount(user), [user]);
  const [items, setItems] = useState<ArmamentShopItem[]>(initialShop.items);
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [classScope, setClassScope] = useState<ClassScope>('mine');
  const [autoEquipOnBuy, setAutoEquipOnBuy] = useState<boolean>(true);
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const firstUnowned = initialShop.items.find((i) => i.classMatch && !i.owned);
    const firstOwned = initialShop.items.find((i) => i.classMatch);
    const target = firstUnowned || firstOwned || initialShop.items[0];
    return target ? `${target.slot}:${target.itemId}` : '';
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const playerGold = Math.max(0, Math.floor(Number(user.gold) || 0));
  const swornClass: HeroClassId = initialShop.heroClass;
  const swornClassDef = HERO_CLASSES[swornClass];

  // Keep local item ownership/affordability synced whenever `user` updates
  useEffect(() => {
    const next = hydrateArmamentShopForAccount(user);
    setItems(next.items);
  }, [user]);

  // Fetch authoritative catalog state from server on mount
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    fetch(getApiEndpoint('/api/shop/armaments'), {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.items)) setItems(data.items as ArmamentShopItem[]);
        if (data.user) onUserUpdated(data.user as UserProfile);
      })
      .catch(() => {
        // Fallback to local hydrated catalog cleanly
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, onUserUpdated]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (classScope === 'mine' && !item.classMatch) return false;
      if (slotFilter !== 'all' && item.slot !== slotFilter) return false;
      return true;
    });
  }, [items, classScope, slotFilter]);

  const selectedItem = useMemo(() => {
    const exact = items.find((i) => `${i.slot}:${i.itemId}` === selectedKey);
    if (exact && (classScope === 'all' || exact.classMatch)) return exact;
    return visibleItems[0] || items[0] || null;
  }, [items, visibleItems, selectedKey, classScope]);

  const ownedClassCount = useMemo(
    () => items.filter((i) => i.classMatch && i.owned).length,
    [items]
  );
  const totalClassCount = useMemo(
    () => items.filter((i) => i.classMatch).length,
    [items]
  );

  const rarityTextColor = (rarity: ArmamentShopItem['rarity']) => {
    if (rarity === 'Ascendant') return '#FDE047';
    if (rarity === 'Forged') return '#38BDF8';
    return '#CBD5E1';
  };

  const handleBuy = async (item: ArmamentShopItem) => {
    const key = `${item.slot}:${item.itemId}`;
    if (!authToken || busyKey) return;
    sfx.playUiClick();
    setBusyKey(key);
    setBanner(null);

    try {
      const res = await fetch(getApiEndpoint('/api/shop/armaments/buy'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          slot: item.slot,
          itemId: item.itemId,
          autoEquip: autoEquipOnBuy,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        sfx.playUiCancel();
        setBanner({
          type: 'error',
          message: data?.error || 'Unable to complete purchase.',
        });
        return;
      }

      if (data.shop?.items) {
        setItems(data.shop.items as ArmamentShopItem[]);
      }
      if (data.user) {
        onUserUpdated(data.user as UserProfile);
      }
      sfx.playRelicChime();
      setSelectedKey(key);
      setBanner({
        type: 'success',
        message: `Purchased ${item.name} for ${data.priceGold} Gold${data.equipped ? ' and equipped it onto your hero' : ''}.`,
      });
    } catch {
      sfx.playUiCancel();
      setBanner({
        type: 'error',
        message: 'Network error while purchasing Armament. Please retry.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleEquip = async (slot: ArmamentShopItem['slot'], itemId: string | null) => {
    const key = `${slot}:${itemId ?? 'none'}`;
    if (!authToken || busyKey) return;
    sfx.playUiClick('confirm');
    setBusyKey(key);
    setBanner(null);

    try {
      const res = await fetch(getApiEndpoint('/api/shop/armaments/equip'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ slot, itemId }),
      });

      const data = await res.json();
      if (!res.ok) {
        sfx.playUiCancel();
        setBanner({
          type: 'error',
          message: data?.error || 'Unable to update equipped Armament.',
        });
        return;
      }

      if (data.shop?.items) {
        setItems(data.shop.items as ArmamentShopItem[]);
      }
      if (data.user) {
        onUserUpdated(data.user as UserProfile);
      }
      const targetName =
        itemId === null
          ? slot === 'weapon'
            ? 'Unarmed'
            : 'Default Vestment'
          : items.find((i) => i.slot === slot && i.itemId === itemId)?.name || 'Armament';
      setBanner({
        type: 'success',
        message:
          itemId === null && slot === 'weapon'
            ? 'Weapon unequipped from your active loadout.'
            : `Equipped ${targetName} onto your ${swornClassDef.name}.`,
      });
    } catch {
      sfx.playUiCancel();
      setBanner({
        type: 'error',
        message: 'Network error while saving loadout. Please retry.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  // Live preview gear on PixelHeroPreview (shows selected item on matching hero class)
  const previewClass: HeroClassId = selectedItem ? selectedItem.heroClass : swornClass;
  const previewWeapon =
    selectedItem?.slot === 'weapon'
      ? selectedItem.itemId
      : previewClass === swornClass
        ? user.equippedWeapon
        : undefined;
  const previewVestment =
    selectedItem?.slot === 'vestment'
      ? selectedItem.itemId
      : previewClass === swornClass
        ? user.equippedVestment
        : undefined;

  return (
    <section
      id="sanctuary-armory-shop"
      aria-labelledby="armory-shop-heading"
      className="space-y-6"
    >
      {/* Header Strip */}
      <div className="p-5 sm:p-6 bg-[#20202B] border border-[#2F2E3E] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <h2 id="armory-shop-heading" className="font-display text-2xl sm:text-3xl text-white">
            Sanctuary Armory Merchant
          </h2>
          <p className="text-xs sm:text-sm text-[#A2A0B4] max-w-2xl leading-relaxed">
            Buy permanent Weapons &amp; Vestments with Gold from Bounties, Floors (+{SANCTUARY_GOLD_REWARDS.floorClearedGold}g), and Bosses (+{SANCTUARY_GOLD_REWARDS.bossKillGold}g).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 shrink-0 font-mono tabular-nums">
          <div className="space-y-0.5">
            <div className="text-[11px] text-[#9492A8]">Treasury Balance</div>
            <div className="text-2xl font-bold text-[#FBBF24]">{playerGold} Gold</div>
          </div>
          <div className="h-9 w-px bg-[#2F2E3E] hidden sm:block" aria-hidden="true" />
          <div className="space-y-0.5">
            <div className="text-[11px] text-[#9492A8]">{swornClassDef.name} Collection</div>
            <div className="text-lg font-semibold text-white">
              {ownedClassCount}/{totalClassCount} Owned
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Filter & Options Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[#2A2937]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Slot Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-[#171622] border border-[#2F2E3E]">
            {([
              ['all', 'All Armaments'],
              ['weapon', 'Weapons'],
              ['vestment', 'Vestments'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setSlotFilter(key);
                }}
                className={`px-3.5 py-2 min-h-[40px] text-xs font-mono font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  slotFilter === key
                    ? 'bg-[#D9AA52] text-[#14131B]'
                    : 'text-[#A9A7B8] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Class Scope Toggle */}
          <div className="flex items-center gap-1 p-1 bg-[#171622] border border-[#2F2E3E]">
            {([
              ['mine', `My Class (${swornClassDef.name})`],
              ['all', 'All Classes'],
            ] as const).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setClassScope(scope);
                }}
                className={`px-3.5 py-2 min-h-[40px] text-xs font-mono font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  classScope === scope
                    ? 'bg-[#343346] text-white'
                    : 'text-[#A9A7B8] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-mono text-[#D2D0E0] cursor-pointer select-none min-h-[40px]">
          <input
            type="checkbox"
            checked={autoEquipOnBuy}
            onChange={(e) => setAutoEquipOnBuy(e.target.checked)}
            className="w-4 h-4 accent-[#D9AA52] cursor-pointer"
          />
          <span>Equip automatically after purchase</span>
        </label>
      </div>

      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`px-4 py-3 border text-xs sm:text-sm font-mono flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-[#172821] border-[#34D399] text-[#A7F3D0]'
              : 'bg-[#341F24] border-[#8E3B46] text-[#FECACA]'
          }`}
        >
          <span>{banner.message}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Storefront + Live Preview Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Catalog Grid */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleItems.map((item) => {
            const key = `${item.slot}:${item.itemId}`;
            const isSelected = selectedItem && `${selectedItem.slot}:${selectedItem.itemId}` === key;
            const isBusy = busyKey === key;

            return (
              <div
                key={key}
                onClick={() => {
                  sfx.playUiClick();
                  setSelectedKey(key);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    sfx.playUiClick();
                    setSelectedKey(key);
                  }
                }}
                className={`p-4 bg-[#20202B] border transition-colors flex flex-col justify-between gap-4 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AA52] ${
                  isSelected
                    ? 'border-[#D9AA52] bg-[#252433]'
                    : item.equipped
                      ? 'border-[#34D399]/60 hover:border-[#34D399]'
                      : 'border-[#2F2E3E] hover:border-[#4A4860]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-12 h-12 bg-[#161520] border flex items-center justify-center shrink-0"
                      style={{ borderColor: item.accent }}
                    >
                      <ArmamentIcon itemId={item.itemId} slot={item.slot} size={34} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-[11px] font-mono text-[#9E9CAE] flex flex-wrap items-center gap-1.5">
                        <span style={{ color: rarityTextColor(item.rarity) }} className="font-semibold">
                          {item.rarity}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.slot === 'weapon' ? 'Weapon' : 'Vestment'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{HERO_CLASSES[item.heroClass].name}</span>
                      </div>
                      <h3 className="font-display text-base text-white font-semibold leading-snug">
                        {item.name}
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs text-[#BDBACF] leading-relaxed line-clamp-2">
                    {item.summary}
                  </p>

                  {item.tacticalDef && (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#E2E8F0] pt-0.5">
                      <TacticalSkillIcon
                        tacticalId={item.tacticalDef.id}
                        color={item.tacticalDef.accentColor}
                        size={14}
                      />
                      <span className="truncate">
                        Skill [1]: <strong style={{ color: item.tacticalDef.accentColor }}>{item.tacticalDef.name}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Price & Action Footer */}
                <div
                  className="pt-3 border-t border-[#2C2B3B] flex items-center justify-between gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="font-mono text-xs tabular-nums">
                    {item.isDefault ? (
                      <span className="text-[#94A3B8]">Starter Gear</span>
                    ) : item.owned ? (
                      <span className="text-[#6EE7B7] font-semibold">
                        {item.equipped ? 'Equipped' : 'Owned'}
                      </span>
                    ) : (
                      <span className={item.canAfford ? 'text-[#FBBF24] font-bold' : 'text-[#FCA5A5]'}>
                        {item.priceGold} Gold
                      </span>
                    )}
                  </div>

                  {!item.classMatch ? (
                    <span className="text-[11px] font-mono text-[#868498] whitespace-nowrap">
                      {HERO_CLASSES[item.heroClass].name} Only
                    </span>
                  ) : item.owned ? (
                    item.equipped ? (
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || (item.slot === 'vestment' && item.isDefault)}
                        onClick={() => handleEquip(item.slot, null)}
                        className="stone-button stone-button-dark py-1.5 px-3 min-h-[40px] text-[11px] whitespace-nowrap"
                      >
                        {item.slot === 'weapon' ? 'Unequip' : item.isDefault ? 'Active' : 'Default'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => handleEquip(item.slot, item.itemId)}
                        className="stone-button stone-button-blue py-1.5 px-3.5 min-h-[40px] text-[11px] whitespace-nowrap"
                      >
                        {isBusy ? 'Saving...' : 'Equip'}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={!item.canAfford || Boolean(busyKey)}
                      onClick={() => handleBuy(item)}
                      className={`stone-button py-1.5 px-3.5 min-h-[40px] text-[11px] whitespace-nowrap ${
                        item.canAfford
                          ? 'stone-button-gold'
                          : 'stone-button-dark opacity-60 cursor-not-allowed'
                      }`}
                    >
                      {isBusy
                        ? 'Buying...'
                        : item.canAfford
                          ? `Buy · ${item.priceGold}g`
                          : `Need ${item.priceGold - playerGold}g`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Armament Inspector & Live Sprite Preview */}
        {selectedItem && (
          <aside className="lg:col-span-5 p-5 sm:p-6 bg-[#20202B] border border-[#3A384D] space-y-5 lg:sticky lg:top-20">
            <div className="flex items-start gap-4 pb-4 border-b border-[#2D2C3C]">
              <div className="p-2.5 bg-[#15141E] border border-[#353346] shrink-0">
                <PixelHeroPreview
                  heroClass={previewClass}
                  equippedWeapon={previewWeapon}
                  equippedVestment={previewVestment}
                  size={74}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-mono text-[#9E9CAE] flex flex-wrap items-center gap-1.5">
                  <span style={{ color: rarityTextColor(selectedItem.rarity) }} className="font-semibold">
                    {selectedItem.rarity}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedItem.slot === 'weapon' ? 'Weapon' : 'Vestment'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{HERO_CLASSES[selectedItem.heroClass].name}</span>
                </div>
                <h3 className="font-display text-xl text-white font-semibold">
                  {selectedItem.name}
                </h3>
                <div className="text-xs font-mono text-[#A6A4B8]">
                  {selectedItem.archetype}
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#D6D4E4] leading-relaxed">
              {selectedItem.summary}
            </p>

            {/* Weapon Tactical vs Vestment Passive Highlight */}
            {selectedItem.slot === 'weapon' ? (
              selectedItem.tacticalDef ? (
                <div className="p-3.5 bg-[#171622] border border-[#D9AA52]/40 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold">
                    <TacticalSkillIcon
                      tacticalId={selectedItem.tacticalDef.id}
                      color={selectedItem.tacticalDef.accentColor}
                      size={16}
                    />
                    <span style={{ color: selectedItem.tacticalDef.accentColor }}>
                      Replaces Skill [1]: {selectedItem.tacticalDef.name} (
                      {(selectedItem.tacticalDef.cooldownMs / 1000).toFixed(1)}s CD)
                    </span>
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    {selectedItem.tacticalDef.description}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-[#171622] border border-[#2F2E3E] text-xs font-mono text-[#7DD3FC]">
                  Forged Weapon · Retains Class Default Tactical (
                  {HERO_CLASSES[selectedItem.heroClass].tacticalName})
                </div>
              )
            ) : (
              selectedItem.passiveName && (
                <div className="p-3.5 bg-[#171622] border border-[#2F2E3E] space-y-1">
                  <div className="text-xs font-mono font-semibold text-[#FDE047]">
                    Passive: {selectedItem.passiveName}
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    {selectedItem.passiveSummary}
                  </p>
                </div>
              )
            )}

            {/* Effect Lines */}
            <div className="space-y-1.5">
              <div className="text-xs font-mono font-semibold text-[#9E9CAE]">
                Combat Modifiers
              </div>
              <ul className="space-y-1.5 text-xs font-mono text-[#A7F3D0]">
                {selectedItem.effectLines.map((line, idx) => (
                  <li key={idx} className="px-3 py-2 bg-[#171622] border border-[#2A293A]">
                    + {line}
                  </li>
                ))}
              </ul>
            </div>

            {/* Inspector Primary Action */}
            <div className="pt-3 border-t border-[#2D2C3C] flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-sm tabular-nums">
                {selectedItem.isDefault ? (
                  <span className="text-[#94A3B8]">Included Starter</span>
                ) : selectedItem.owned ? (
                  <span className="text-[#6EE7B7] font-semibold">In Your Armory</span>
                ) : (
                  <span className={selectedItem.canAfford ? 'text-[#FBBF24] font-bold' : 'text-[#FCA5A5]'}>
                    Price: {selectedItem.priceGold} Gold
                  </span>
                )}
              </div>

              {!selectedItem.classMatch ? (
                <div className="text-xs font-mono text-[#FCA5A5]">
                  Requires {HERO_CLASSES[selectedItem.heroClass].name} Oath
                </div>
              ) : selectedItem.owned ? (
                selectedItem.equipped ? (
                  <button
                    type="button"
                    disabled={
                      Boolean(busyKey) ||
                      (selectedItem.slot === 'vestment' && selectedItem.isDefault)
                    }
                    onClick={() => handleEquip(selectedItem.slot, null)}
                    className="stone-button stone-button-dark px-5 py-2.5 min-h-[42px] text-xs"
                  >
                    {selectedItem.slot === 'weapon'
                      ? 'Unequip Weapon'
                      : selectedItem.isDefault
                        ? 'Default Active'
                        : 'Restore Default'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => handleEquip(selectedItem.slot, selectedItem.itemId)}
                    className="stone-button stone-button-blue px-6 py-2.5 min-h-[42px] text-xs"
                  >
                    {busyKey ? 'Saving...' : 'Equip Now'}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  disabled={!selectedItem.canAfford || Boolean(busyKey)}
                  onClick={() => handleBuy(selectedItem)}
                  className={`stone-button px-6 py-2.5 min-h-[42px] text-xs ${
                    selectedItem.canAfford
                      ? 'stone-button-gold'
                      : 'stone-button-dark opacity-60 cursor-not-allowed'
                  }`}
                >
                  {busyKey === `${selectedItem.slot}:${selectedItem.itemId}`
                    ? 'Purchasing...'
                    : selectedItem.canAfford
                      ? `Purchase · ${selectedItem.priceGold} Gold`
                      : `Need ${selectedItem.priceGold - playerGold} More Gold`}
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
};
