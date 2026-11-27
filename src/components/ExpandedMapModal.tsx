import React, { useEffect, useRef } from 'react';
import { TILE_SIZE, type DungeonMap, type GameSnapshot } from '../shared/types.ts';
import { sfx } from '../client/sound.ts';

interface ExpandedMapModalProps {
  map: DungeonMap;
  snapshot: GameSnapshot;
  playerId: string;
  onClose: () => void;
}

export const ExpandedMapModal: React.FC<ExpandedMapModalProps> = ({
  map,
  snapshot,
  playerId,
  onClose,
}) => {
  const isOpenWorld = snapshot.roomMode === 'open_world' || map.biome === 'overworld';
  const flagMap = new Map(snapshot.roomClearedFlags.map((f) => [f.id, f]));

  const maxDim = Math.max(map.width, map.height);
  const scale = Math.max(3, Math.min(12, Math.floor(520 / maxDim)));
  const canvasW = map.width * scale;
  const canvasH = map.height * scale;

  const tileCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = tileCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = isOpenWorld ? '#0E1418' : '#111018';
    ctx.fillRect(0, 0, canvasW, canvasH);

    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const code = map.tiles[ty * map.width + tx];
        if (isOpenWorld) {
          const isOuter = tx < 2 || tx >= map.width - 2 || ty < 2 || ty >= map.height - 2;
          if (code === 0) {
            if (isOuter) {
              ctx.fillStyle = '#0A1014';
            } else {
              const isShallow =
                map.tiles[(ty - 1) * map.width + tx] !== 0 ||
                map.tiles[(ty + 1) * map.width + tx] !== 0 ||
                map.tiles[ty * map.width + (tx - 1)] !== 0 ||
                map.tiles[ty * map.width + (tx + 1)] !== 0;
              ctx.fillStyle = isShallow ? '#2563EB' : '#163D6E';
            }
          } else if (code === 1) {
            ctx.fillStyle = '#255B34';
          } else if (code === 2) {
            ctx.fillStyle = '#143820';
          } else if (code === 3) {
            ctx.fillStyle = tx >= 64 && ty < 45 ? '#7C654F' : '#64748B';
          } else if (code === 4) {
            ctx.fillStyle = '#7C5A3C';
          } else if (code === 5) {
            ctx.fillStyle = '#585D6E';
          } else {
            ctx.fillStyle = '#B5935A';
          }
          ctx.fillRect(tx * scale, ty * scale, scale, scale);
          if (tx === 60 && ty === 45) {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.45)';
            ctx.fillRect((tx - 1) * scale, (ty - 1) * scale, scale * 3, scale * 3);
          }
        } else if (code > 0) {
          ctx.fillStyle = '#1E1D2A';
          ctx.fillRect(tx * scale, ty * scale, scale, scale);
        }
      }
    }
  }, [map, canvasW, canvasH, scale, isOpenWorld]);

  const connectedPlayers = snapshot.players.filter((p) => p.connected);
  let pvpLeaderId: string | null = null;
  if (snapshot.pvpEnabled) {
    let topKills = 0;
    let tied = false;
    for (const pl of connectedPlayers) {
      const k = pl.kills || 0;
      if (k > topKills) {
        topKills = k;
        pvpLeaderId = pl.id;
        tied = false;
      } else if (k > 0 && k === topKills) {
        tied = true;
      }
    }
    if (tied || topKills <= 0) pvpLeaderId = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none pb-safe pt-safe pl-safe pr-safe">
      <div className="stone-panel w-full max-w-4xl max-h-[94dvh] flex flex-col overflow-hidden text-white rounded-none">

        {/* Header */}
        <div className="stone-plaque p-2.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-[#D9AA52] bg-[#252336] flex items-center justify-center font-mono font-bold text-xs text-[#FCD34D] shadow">
              [MAP]
            </div>
            <div>
              <div className="flex items-center gap-2 font-mono flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  {isOpenWorld
                    ? `${map.biomeTitle} · Open World`
                    : map.floor === 0
                      ? 'Sanctuary Tavern Hub'
                      : `Floor ${snapshot.floor}: ${map.biomeTitle}`}
                </h2>
                {!isOpenWorld && (
                  <span className="text-[10px] px-2 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                    SEED #{map.seed}
                  </span>
                )}
                {isOpenWorld ? (
                  <span className="text-[10px] px-2 py-0.5 border border-[#EF4444]/60 bg-[#7F1D1D]/40 text-[#FCA5A5] font-bold">
                    OPEN PVP
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]">
                    {snapshot.difficulty}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#A19FAF] font-mono mt-0.5 tabular-nums">
                {isOpenWorld
                  ? `Players Online: ${connectedPlayers.length} · Full-Map Radar · Press [M] or [Esc]`
                  : `Rooms ${snapshot.combatRoomsCleared ?? 0}/${snapshot.combatRoomsTotal ?? 0} · Boss Wards ${snapshot.bossWards ?? 0} · Guardians Left ${snapshot.guardiansRemaining ?? 0} · Press [M] or [Esc]`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-dark w-9 h-9 p-0 text-white font-mono font-bold text-base flex items-center justify-center"
            title="Close Map [M]"
          >
            ✕
          </button>
        </div>

        {/* Map Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 flex flex-col items-center justify-center space-y-5">

          {/* Map Graphic Container */}
          <div className="stone-input p-2 sm:p-4 flex items-center justify-center max-w-full overflow-auto">
            <div
              className="relative border-2 border-[#353442] bg-[#111018] shrink-0"
              style={{ width: canvasW, height: canvasH }}
            >
              <canvas
                ref={tileCanvasRef}
                width={canvasW}
                height={canvasH}
                className="block pixelated"
                style={{ width: canvasW, height: canvasH }}
              />

              {/* Rooms (Dungeon Mode only) */}
              {!isOpenWorld &&
                map.rooms.map((room) => {
                  const flags = flagMap.get(room.id);
                  const discovered = flags ? flags.discovered : room.discovered;
                  const cleared = flags ? flags.cleared : room.cleared;
                  const isGuardian = Boolean(room.guardian || flags?.guardian);

                  if (!discovered && room.type !== 'boss') {
                    return (
                      <div
                        key={`r_${room.id}`}
                        className="absolute bg-[#0D0C14] border border-[#1E1D2A]/60 flex items-center justify-center font-mono text-[9px] text-[#475569]"
                        style={{
                          left: room.x * scale,
                          top: room.y * scale,
                          width: room.w * scale,
                          height: room.h * scale,
                        }}
                      >
                        ?
                      </div>
                    );
                  }

                  let bgClass = 'bg-[#1E293B] border-[#475569]';
                  let typeTag = '[COMBAT]';
                  let tagColor = 'text-[#94A3B8]';

                  if (room.type === 'boss') {
                    bgClass = 'bg-[#7F1D1D] border-[#EF4444] animate-pulse';
                    typeTag = '[BOSS SANCTUM]';
                    tagColor = 'text-[#FCA5A5]';
                  } else if (room.type === 'treasure') {
                    bgClass = 'bg-[#78350F] border-[#F59E0B]';
                    typeTag = '[TREASURE VAULT]';
                    tagColor = 'text-[#FDE047]';
                  } else if (room.type === 'shrine') {
                    bgClass = 'bg-[#064E3B] border-[#10B981]';
                    typeTag = '[SANCTUARY SHRINE]';
                    tagColor = 'text-[#6EE7B7]';
                  } else if (room.type === 'start') {
                    bgClass = 'bg-[#1E293B] border-[#64748B]';
                    typeTag = '[START]';
                    tagColor = 'text-[#CBD5E1]';
                  } else if (isGuardian) {
                    bgClass = cleared
                      ? 'bg-[#064E3B]/70 border-[#10B981]'
                      : 'bg-[#451A03] border-[#F59E0B]';
                    typeTag = '[GUARDIAN]';
                    tagColor = cleared ? 'text-[#6EE7B7]' : 'text-[#FCD34D]';
                  } else if (!cleared) {
                    bgClass = 'bg-[#334155] border-[#64748B]';
                    typeTag = '[HOSTILE]';
                    tagColor = 'text-[#F87171]';
                  }

                  return (
                    <div
                      key={`r_${room.id}`}
                      className={`absolute border-2 ${bgClass} flex flex-col items-center justify-center p-1 text-center font-mono`}
                      style={{
                        left: room.x * scale,
                        top: room.y * scale,
                        width: room.w * scale,
                        height: room.h * scale,
                      }}
                    >
                      <span className={`text-[10px] font-bold ${tagColor}`}>
                        {typeTag}
                      </span>
                      {room.type !== 'start' && (
                        <span className="text-[9px] text-[#A19FAF]">
                          {cleared ? 'CLEARED' : isGuardian ? 'SEAL ACTIVE' : 'UNCLEARED'}
                        </span>
                      )}
                    </div>
                  );
                })}

              {/* Overworld Landmark Labels */}
              {isOpenWorld &&
                map.regions &&
                map.regions.map((region) => (
                  <div
                    key={`reg_${region.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap px-1"
                    style={{
                      left: (region.x / TILE_SIZE) * scale,
                      top: (region.y / TILE_SIZE) * scale - 10,
                      color: region.accentColor,
                      textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)',
                    }}
                  >
                    {region.name}
                  </div>
                ))}

              {/* Portal Marker (Dungeon & Tavern only) */}
              {map.portalPos && !isOpenWorld && (
                <div
                  className={`absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 flex items-center justify-center font-mono text-[8px] font-bold ${
                    snapshot.bossDefeated
                      ? 'bg-[#10B981] border-[#6EE7B7] text-black shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                      : snapshot.bossRoomCleared
                        ? 'bg-[#D97706] border-[#FCD34D] text-black'
                        : 'bg-[#0284C7] border-[#38BDF8] text-white'
                  }`}
                  style={{
                    left: Math.floor(map.portalPos.x / TILE_SIZE) * scale,
                    top: Math.floor(map.portalPos.y / TILE_SIZE) * scale,
                  }}
                  title={
                    snapshot.bossDefeated
                      ? 'Floor Portal (Unlocked)'
                      : snapshot.bossRoomCleared
                        ? `Floor Portal (Sealed by ${snapshot.guardiansRemaining ?? 0} Guardian Room)`
                        : 'Floor Portal (Sealed by Floor Boss)'
                  }
                >
                  P
                </div>
              )}

              {/* Open World Active War Font Beacon */}
              {isOpenWorld &&
                (() => {
                  const activeFont = snapshot.zones.find((z) => z.kind === 'overworld_font');
                  if (!activeFont) return null;
                  const fx = Math.floor(activeFont.x / TILE_SIZE) * scale;
                  const fy = Math.floor(activeFont.y / TILE_SIZE) * scale;
                  const isContested = activeFont.ownerId === 'contested';
                  return (
                    <div
                      className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 rotate-45 border-2 flex items-center justify-center font-mono text-[9px] font-bold shadow-lg ${
                        isContested
                          ? 'bg-[#EF4444] border-[#FEF08A] text-white'
                          : 'bg-[#F59E0B] border-[#FEF08A] text-black'
                      }`}
                      style={{ left: fx, top: fy }}
                      title={`War Font at ${activeFont.label || 'Borderlands'} · ${activeFont.stage ?? 0}%${isContested ? ' (CONTESTED)' : ''}`}
                    >
                      <span className="-rotate-45">W</span>
                    </div>
                  );
                })()}

              {/* Unclaimed Relics, Shrines & Unlocked Loot (Dungeon only) */}
              {!isOpenWorld &&
                snapshot.props &&
                snapshot.props.map((pr) => {
                  if (pr.opened) return null;
                  if (pr.kind !== 'relic_chest' && pr.kind !== 'shrine' && !(pr.kind === 'chest' && !pr.locked) && !(pr.kind === 'totem' && !pr.locked)) {
                    return null;
                  }
                  const px = Math.floor(pr.x / TILE_SIZE) * scale;
                  const py = Math.floor(pr.y / TILE_SIZE) * scale;
                  const markerStyle =
                    pr.kind === 'relic_chest'
                      ? 'w-2.5 h-2.5 -ml-1.25 -mt-1.25 rotate-45 bg-[#FDE047] border border-[#78350F]'
                      : pr.kind === 'shrine'
                        ? 'w-2.5 h-2.5 -ml-1.25 -mt-1.25 bg-[#34D399] border border-[#064E3B]'
                        : pr.kind === 'totem'
                          ? 'w-2 h-2 -ml-1 -mt-1 rounded-full bg-[#38BDF8] border border-[#0C4A6E]'
                          : 'w-2 h-2 -ml-1 -mt-1 bg-[#FBBF24] border border-[#78350F]';
                  const label =
                    pr.kind === 'relic_chest'
                      ? 'Unclaimed Relic Vault'
                      : pr.kind === 'shrine'
                        ? 'Sanctuary Shrine'
                        : pr.kind === 'totem'
                          ? 'Awakened Totem'
                          : 'Unlocked Chest';
                  return (
                    <div
                      key={`pr_${pr.id}`}
                      className={`absolute ${markerStyle}`}
                      style={{ left: px, top: py }}
                      title={label}
                    />
                  );
                })}

              {/* Enemy Dots */}
              {snapshot.enemies &&
                snapshot.enemies.map((en) => {
                  if (en.hp <= 0) return null;
                  const ex = Math.floor(en.x / TILE_SIZE) * scale;
                  const ey = Math.floor(en.y / TILE_SIZE) * scale;
                  if (en.kind === 'boss') {
                    return (
                      <div
                        key={`en_${en.id}`}
                        className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-[#DC2626] border-2 border-[#FCA5A5] flex items-center justify-center text-[8px] font-mono font-bold text-white shadow-lg"
                        style={{ left: ex, top: ey }}
                        title={`${en.name} (Boss)`}
                      >
                        B
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`en_${en.id}`}
                      className={`absolute w-2 h-2 -ml-1 -mt-1 rounded-full ${
                        en.elite ? 'bg-[#F97316]' : 'bg-[#EF4444]'
                      }`}
                      style={{ left: ex, top: ey }}
                    />
                  );
                })}

              {/* Players */}
              {snapshot.players.map((p) => {
                const isMe = p.id === playerId;
                const px = Math.floor(p.x / TILE_SIZE) * scale;
                const py = Math.floor(p.y / TILE_SIZE) * scale;
                const isRival = Boolean(snapshot.pvpEnabled && !isMe);
                const isPvpLeader = p.id === pvpLeaderId;

                return (
                  <div
                    key={`p_${p.id}`}
                    className="absolute -ml-2.5 -mt-2.5 flex flex-col items-center z-10 pointer-events-none"
                    style={{ left: px, top: py }}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center font-mono text-[9px] font-bold shadow-md ${
                        isMe
                          ? 'bg-[#FACC15] border-[#FEF08A] text-black'
                          : isRival
                            ? 'bg-[#EF4444] border-[#7F1D1D] text-white'
                            : 'bg-[#38BDF8] border-[#1E3A8A] text-black'
                      } ${isPvpLeader ? 'ring-2 ring-[#FACC15]' : ''}`}
                    >
                      {p.username.substring(0, 1).toUpperCase()}
                    </div>
                    <span className="text-[8px] font-mono bg-black/85 text-white px-1 border border-[#353442] whitespace-nowrap mt-0.5">
                      {isPvpLeader ? `★ ${p.username}` : p.username}
                    </span>
                  </div>
                );
              })}

            </div>
          </div>

          {/* Map Legend */}
          <div className="stone-plaque p-3 w-full font-mono text-xs flex flex-wrap items-center justify-around gap-4 text-[#A19FAF]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#FACC15] border border-[#854D0E]" />
              <span>You</span>
            </div>
            {snapshot.pvpEnabled ? (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#EF4444] border border-[#7F1D1D]" />
                <span>Rival Player (PvP)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#38BDF8] border border-[#1E3A8A]" />
                <span>Co-op Ally</span>
              </div>
            )}
            {isOpenWorld ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#7C5A3C] border border-[#353442]" />
                  <span>Roads</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#585D6E] border border-[#353442]" />
                  <span>Crossroads &amp; Ruins</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#1D4E89] border border-[#353442]" />
                  <span>Whispering Lake</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#143820] border border-[#353442]" />
                  <span>Forest Ridge</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rotate-45 bg-[#F59E0B] border border-[#FEF08A]" />
                  <span>War Font Objective</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#DC2626] border border-[#F87171]" />
                  <span>Floor Boss</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#451A03] border border-[#F59E0B]" />
                  <span>Guardian Chamber</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#78350F] border border-[#F59E0B]" />
                  <span>Treasure Room</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#064E3B] border border-[#10B981]" />
                  <span>Sanctuary Shrine</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#38BDF8] border border-white" />
                  <span>Floor Portal</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rotate-45 bg-[#FDE047] border border-[#78350F]" />
                  <span>Unclaimed Relic</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#34D399] border border-[#064E3B]" />
                  <span>Shrine</span>
                </div>
              </>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="stone-plaque p-3 px-6 flex items-center justify-between shrink-0 text-xs font-mono text-[#A19FAF]">
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white">M</kbd> or <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white">Esc</kbd> to close.
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-gold py-1.5 px-6 text-xs font-bold text-black"
          >
            {isOpenWorld ? 'Close World Map' : 'Close Tactical Map'}
          </button>
        </div>

      </div>
    </div>
  );
};
