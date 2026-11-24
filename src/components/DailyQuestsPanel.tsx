import React, { useEffect, useMemo, useState } from 'react';
import { getApiEndpoint } from '../client/apiConfig.ts';
import { sfx } from '../client/sound.ts';
import { hydrateDailyQuestsForAccount } from '../shared/dailyQuests.ts';
import type {
  DailyQuestClaimResult,
  DailyQuestHydratedItem,
  UserProfile,
} from '../shared/types.ts';

interface DailyQuestsPanelProps {
  user: UserProfile;
  authToken: string;
  onUserUpdated: (user: UserProfile) => void;
}

function formatUtcCountdown(resetAtMs: number, nowMs: number): string {
  const diffMs = Math.max(0, resetAtMs - nowMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export const DailyQuestsPanel: React.FC<DailyQuestsPanelProps> = ({
  user,
  authToken,
  onUserUpdated,
}) => {
  const initial = useMemo(() => hydrateDailyQuestsForAccount(user), [user]);
  const [dateKey, setDateKey] = useState<string>(initial.dateKey);
  const [resetAtMs, setResetAtMs] = useState<number>(initial.resetAtMs);
  const [quests, setQuests] = useState<DailyQuestHydratedItem[]>(initial.quests);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimBanner, setClaimBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Sync immediately whenever user prop updates (e.g. after returning from an expedition)
  useEffect(() => {
    const next = hydrateDailyQuestsForAccount(user);
    setDateKey(next.dateKey);
    setResetAtMs(next.resetAtMs);
    setQuests(next.quests);
  }, [user]);

  // Fetch authoritative daily quest state from server on mount & UTC rollover
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    fetch(getApiEndpoint('/api/daily-quests'), {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.dateKey === 'string') setDateKey(data.dateKey);
        if (typeof data.resetAtMs === 'number') setResetAtMs(data.resetAtMs);
        if (Array.isArray(data.quests)) setQuests(data.quests);
        if (data.user) onUserUpdated(data.user as UserProfile);
      })
      .catch(() => {
        // Keep local hydrated snapshot if offline/transiently unreachable
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, onUserUpdated]);

  // Keep UTC reset countdown fresh every 30s
  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= resetAtMs && authToken) {
        fetch(getApiEndpoint('/api/daily-quests'), {
          headers: { Authorization: `Bearer ${authToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            if (typeof data.dateKey === 'string') setDateKey(data.dateKey);
            if (typeof data.resetAtMs === 'number') setResetAtMs(data.resetAtMs);
            if (Array.isArray(data.quests)) setQuests(data.quests);
            if (data.user) onUserUpdated(data.user as UserProfile);
          })
          .catch(() => {});
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [resetAtMs, authToken, onUserUpdated]);

  const handleClaim = async (questId: string) => {
    if (!authToken || claimingId) return;
    sfx.playUiClick();
    setClaimingId(questId);
    setClaimBanner(null);

    try {
      const res = await fetch(getApiEndpoint('/api/daily-quests/claim'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ questId }),
      });

      const data = await res.json();
      if (!res.ok) {
        sfx.playUiCancel();
        setClaimBanner({
          type: 'error',
          message: data?.error || 'Could not claim quest reward.',
        });
        return;
      }

      const result = data as DailyQuestClaimResult;
      setDateKey(result.dateKey);
      setResetAtMs(result.resetAtMs);
      setQuests(result.quests);
      onUserUpdated(result.user);

      if (result.rewardGranted.armamentGranted) {
        sfx.playRelicChime();
      } else {
        sfx.playUiConfirm();
      }

      const parts: string[] = [
        `+${result.rewardGranted.goldAdded} Gold`,
        `+${result.rewardGranted.xpAdded} XP`,
      ];
      if (result.rewardGranted.levelsGained > 0) {
        parts.push(
          `Level Up (+${result.rewardGranted.levelsGained * 3} Attribute Pts)`
        );
      }
      if (result.rewardGranted.armamentGranted) {
        const arm = result.rewardGranted.armamentGranted;
        parts.unshift(
          `Unlocked ${arm.rarity} ${arm.slot === 'weapon' ? 'Weapon' : 'Vestment'}: ${arm.name}`
        );
      } else if (result.rewardGranted.masteryBonusApplied) {
        parts.push('Armory Mastery Bonus Applied');
      }

      setClaimBanner({
        type: 'success',
        message: `Claimed "${result.rewardGranted.questTitle}" — ${parts.join(' · ')}`,
      });
    } catch {
      sfx.playUiCancel();
      setClaimBanner({
        type: 'error',
        message: 'Network error while claiming quest reward. Please retry.',
      });
    } finally {
      setClaimingId(null);
    }
  };

  const completedCount = quests.filter((q) => q.completed).length;
  const claimableCount = quests.filter((q) => q.completed && !q.claimed).length;

  return (
    <section
      id="daily-quests-board"
      aria-labelledby="daily-quests-heading"
      className="p-5 sm:p-6 bg-[#20202B] border border-[#2F2E3E] space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#2C2B3B] pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id="daily-quests-heading"
              className="font-display text-xl sm:text-2xl text-white"
            >
              Daily Sanctuary Bounties
            </h2>
            {claimableCount > 0 && (
              <span className="px-2 py-0.5 bg-[#1B2C24] border border-[#34D399] text-[#6EE7B7] font-mono text-[11px] font-semibold uppercase tracking-wide tabular-nums">
                {claimableCount} Ready to Claim
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#9B99AB]">
            Progress persists across runs. Complete the Armory Bounty to unlock class gear.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#9E9CAE] tabular-nums shrink-0">
          <span>
            Completed:{' '}
            <strong className="text-white">
              {completedCount}/{quests.length}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            UTC Date: <strong className="text-[#E6E4EE]">{dateKey}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Resets in{' '}
            <strong className="text-[#D9AA52]">
              {formatUtcCountdown(resetAtMs, nowMs)}
            </strong>
          </span>
        </div>
      </div>

      {claimBanner && (
        <div
          role={claimBanner.type === 'error' ? 'alert' : 'status'}
          className={`px-4 py-3 border text-xs sm:text-sm font-mono flex items-center justify-between gap-3 ${
            claimBanner.type === 'success'
              ? 'bg-[#172821] border-[#34D399] text-[#A7F3D0]'
              : 'bg-[#341F24] border-[#8E3B46] text-[#FECACA]'
          }`}
        >
          <span>{claimBanner.message}</span>
          <button
            type="button"
            onClick={() => setClaimBanner(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quests.map((q) => {
          const pct = Math.min(
            100,
            Math.round((q.progress / Math.max(1, q.target)) * 100)
          );
          const isReady = q.completed && !q.claimed;
          const isClaiming = claimingId === q.questId;

          const statusLabel = q.claimed
            ? 'CLAIMED'
            : isReady
              ? 'READY TO CLAIM'
              : 'IN PROGRESS';

          const statusColor = q.claimed
            ? 'text-[#8C8A9E]'
            : isReady
              ? 'text-[#6EE7B7]'
              : 'text-[#D9AA52]';

          const cardBorder = isReady
            ? 'border-[#34D399]'
            : q.rewardsArmament && !q.claimed
              ? 'border-[#D9AA52]'
              : 'border-[#2E2D3E]';

          return (
            <article
              key={q.questId}
              className={`p-4 bg-[#181821] border ${cardBorder} flex flex-col justify-between gap-4`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {q.rewardsArmament && (
                        <span className="px-1.5 py-0.5 bg-[#2A2217] border border-[#D9AA52] text-[#FCD34D] font-mono text-[10px] uppercase tracking-wider font-semibold">
                          Armory Bounty
                        </span>
                      )}
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${statusColor}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <h3 className="font-display text-base sm:text-lg text-white font-semibold">
                      {q.title}
                    </h3>
                  </div>

                  <span className="font-mono text-xs sm:text-sm font-semibold text-[#E6E4EE] tabular-nums shrink-0">
                    {q.progress} / {q.target}
                  </span>
                </div>

                <p className="text-xs text-[#B5B3C6] leading-relaxed">
                  {q.description}
                </p>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-[#111118] border border-[#2B2A3A] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      q.claimed
                        ? 'bg-[#4E4C63]'
                        : isReady
                          ? 'bg-[#34D399]'
                          : 'bg-[#D9AA52]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Reward Preview */}
                <div className="p-2.5 bg-[#13131A] border border-[#292838] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <span className="text-[#8E8C9E] uppercase text-[10px] tracking-wider">
                      Completion Reward
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[#FBBF24] font-semibold">
                        +{q.rewardPreview.gold} Gold
                      </span>
                      <span aria-hidden="true" className="text-[#56546A]">
                        ·
                      </span>
                      <span className="text-[#93C5FD] font-semibold">
                        +{q.rewardPreview.xp} XP
                      </span>
                    </div>
                  </div>

                  {q.rewardPreview.armament && (
                    <div className="pt-1.5 border-t border-[#242333] space-y-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className="font-display text-xs sm:text-sm font-semibold"
                          style={{ color: q.rewardPreview.armament.accent }}
                        >
                          {q.rewardPreview.armament.name}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-[#C7C5D6] border border-[#353347] bg-[#1A1924] px-1.5 py-0.5">
                          {q.rewardPreview.armament.rarity}{' '}
                          {q.rewardPreview.armament.slot === 'weapon'
                            ? 'Weapon'
                            : 'Vestment'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#9E9CAE] leading-snug">
                        {q.rewardPreview.armament.summary}
                      </p>
                    </div>
                  )}

                  {q.rewardPreview.masteryFallback && (
                    <div className="pt-1.5 border-t border-[#242333] text-[11px] font-mono text-[#FCD34D]">
                      Mastery Bonus: +{q.rewardPreview.masteryFallback.bonusGold} Gold · +
                      {q.rewardPreview.masteryFallback.bonusXp} XP (
                      {q.rewardPreview.masteryFallback.reason})
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  disabled={!isReady || isClaiming}
                  onClick={() => void handleClaim(q.questId)}
                  className={`stone-button w-full sm:w-auto px-5 py-2 text-xs ${
                    q.claimed
                      ? 'stone-button-dark opacity-50'
                      : isReady
                        ? 'stone-button-gold'
                        : 'stone-button-dark opacity-65'
                  }`}
                >
                  {isClaiming
                    ? 'Claiming...'
                    : q.claimed
                      ? 'Claimed Today'
                      : isReady
                        ? 'Claim Reward'
                        : `Progress ${q.progress}/${q.target}`}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
