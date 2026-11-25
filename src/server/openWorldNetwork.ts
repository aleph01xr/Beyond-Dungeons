import type {
  FieldZoneState,
  FloatingEvent,
  GameSnapshot,
  PlayerState,
  ProjectileState,
} from '../shared/types.ts';

export const OPEN_WORLD_ENTITY_INTEREST_RADIUS = 1250;
export const OPEN_WORLD_EVENT_INTEREST_RADIUS = 1050;
export const OPEN_WORLD_FAR_SYNC_INTERVAL_TICKS = 10; // 4 Hz radar updates at 40 Hz sim tick
export const OPEN_WORLD_FAR_POSITION_QUANT_PX = 16;

function quantizeStepUp(ms: number | undefined, stepMs: number): number {
  if (!ms || ms <= 0) return 0;
  return Math.ceil(ms / stepMs) * stepMs;
}

function quantizeCoord(val: number, stepPx: number): number {
  return Math.round(val / stepPx) * stepPx;
}

/**
 * Strips private per-player arrays (Relic storage vault, draft choices,
 * unlocked armory catalogs) that remote observers never render or inspect.
 */
function sanitizeRemotePlayerBase(p: PlayerState): PlayerState {
  const cleaned: PlayerState = {
    ...p,
    storage: [],
    pendingRelicChoices: [],
    lastInputSeq: undefined,
  };
  if (cleaned.pendingScrollChoices !== undefined) {
    cleaned.pendingScrollChoices = undefined;
  }
  if (cleaned.ownedWeapons !== undefined) {
    cleaned.ownedWeapons = undefined;
  }
  if (cleaned.ownedVestments !== undefined) {
    cleaned.ownedVestments = undefined;
  }
  return cleaned;
}

/**
 * Produces a per-viewer interest-culled & tiered Open World snapshot:
 * - Local viewer: full 40 Hz fidelity.
 * - Nearby players (<= 1250px): full 40 Hz kinematics + quantized remote cooldown timers
 *   (preserves instant skill/dash audio/VFX cues while eliminating 40 Hz countdown churn).
 * - Distant players (> 1250px): 4 Hz, 16px-quantized minimap/radar & roster projection
 *   with zero velocity/aim/cooldown/status traffic.
 * - Projectiles, FieldZones, & FloatingEvents: culled to the viewer's extended viewport radius.
 */
export function projectOpenWorldSnapshotForClient(
  baseNetSnap: GameSnapshot,
  viewerId: string,
  tickIndex: number,
  prevClientBaseline?: GameSnapshot | null
): GameSnapshot {
  const viewer =
    baseNetSnap.players.find((p) => p.id === viewerId) || baseNetSnap.players[0];
  if (!viewer) {
    return baseNetSnap;
  }

  const vxCenter = viewer.x;
  const vyCenter = viewer.y;
  const nearRadiusSq = OPEN_WORLD_ENTITY_INTEREST_RADIUS * OPEN_WORLD_ENTITY_INTEREST_RADIUS;
  const eventRadiusSq = OPEN_WORLD_EVENT_INTEREST_RADIUS * OPEN_WORLD_EVENT_INTEREST_RADIUS;
  const isFarRefreshTick = tickIndex % OPEN_WORLD_FAR_SYNC_INTERVAL_TICKS === 0;

  let prevPlayerById: Map<string, PlayerState> | null = null;
  if (prevClientBaseline && prevClientBaseline.players.length > 0) {
    prevPlayerById = new Map<string, PlayerState>();
    for (let i = 0; i < prevClientBaseline.players.length; i++) {
      const pp = prevClientBaseline.players[i];
      prevPlayerById.set(pp.id, pp);
    }
  }

  const projectedPlayers: PlayerState[] = new Array(baseNetSnap.players.length);
  for (let i = 0; i < baseNetSnap.players.length; i++) {
    const p = baseNetSnap.players[i];
    if (p.id === viewerId) {
      projectedPlayers[i] = p;
      continue;
    }

    const dx = p.x - vxCenter;
    const dy = p.y - vyCenter;
    const distSq = dx * dx + dy * dy;

    if (distSq <= nearRadiusSq) {
      const nearP = sanitizeRemotePlayerBase(p);
      nearP.skillCooldownMs = quantizeStepUp(p.skillCooldownMs, 500);
      nearP.ultCooldownMs = quantizeStepUp(p.ultCooldownMs, 500);
      nearP.dashCooldownMs = quantizeStepUp(p.dashCooldownMs, 500);
      if (p.starRiftCooldownMs !== undefined) {
        nearP.starRiftCooldownMs = quantizeStepUp(p.starRiftCooldownMs, 500);
      }
      nearP.spawnProtectionMs = quantizeStepUp(p.spawnProtectionMs, 500);
      nearP.hasteMs = quantizeStepUp(p.hasteMs, 500);
      nearP.slowedMs = quantizeStepUp(p.slowedMs, 500);
      nearP.stunnedMs = quantizeStepUp(p.stunnedMs, 500);
      nearP.frozenMs = quantizeStepUp(p.frozenMs, 500);
      projectedPlayers[i] = nearP;
    } else {
      const prevP = prevPlayerById?.get(p.id);
      const wasNear = prevP
        ? (prevP.x - vxCenter) * (prevP.x - vxCenter) + (prevP.y - vyCenter) * (prevP.y - vyCenter) <= nearRadiusSq
        : false;
      const stateChanged =
        !prevP ||
        wasNear ||
        prevP.downed !== p.downed ||
        prevP.connected !== p.connected ||
        prevP.heroClass !== p.heroClass ||
        prevP.level !== p.level ||
        prevP.kills !== p.kills ||
        prevP.equippedWeapon !== p.equippedWeapon ||
        prevP.equippedVestment !== p.equippedVestment;

      const nextX =
        isFarRefreshTick || stateChanged
          ? quantizeCoord(p.x, OPEN_WORLD_FAR_POSITION_QUANT_PX)
          : prevP.x;
      const nextY =
        isFarRefreshTick || stateChanged
          ? quantizeCoord(p.y, OPEN_WORLD_FAR_POSITION_QUANT_PX)
          : prevP.y;

      const farP = sanitizeRemotePlayerBase(p);
      farP.x = nextX;
      farP.y = nextY;
      farP.vx = 0;
      farP.vy = 0;
      farP.aimAngle = 0;
      farP.attackAnimMs = 0;
      farP.attackComboStep = 0;
      farP.skillCooldownMs = 0;
      farP.ultCooldownMs = 0;
      farP.dashCooldownMs = 0;
      if (farP.starRiftCooldownMs !== undefined) farP.starRiftCooldownMs = 0;
      farP.spawnProtectionMs = (p.spawnProtectionMs || 0) > 0 ? 1000 : 0;
      farP.hasteMs = 0;
      farP.slowedMs = 0;
      farP.stunnedMs = 0;
      farP.frozenMs = 0;
      farP.statuses = [];
      projectedPlayers[i] = farP;
    }
  }

  const projectedProjectiles: ProjectileState[] = [];
  for (let i = 0; i < baseNetSnap.projectiles.length; i++) {
    const pr = baseNetSnap.projectiles[i];
    const dx = pr.x - vxCenter;
    const dy = pr.y - vyCenter;
    if (dx * dx + dy * dy <= nearRadiusSq || pr.ownerId === viewerId) {
      projectedProjectiles.push(pr);
    }
  }

  const projectedZones: FieldZoneState[] = [];
  for (let i = 0; i < baseNetSnap.zones.length; i++) {
    const z = baseNetSnap.zones[i];
    const maxReach = OPEN_WORLD_ENTITY_INTEREST_RADIUS + (z.radius || 0);
    const dx = z.x - vxCenter;
    const dy = z.y - vyCenter;
    if (dx * dx + dy * dy <= maxReach * maxReach || z.ownerId === viewerId) {
      if (z.maxTtlMs >= 1500) {
        projectedZones.push({
          ...z,
          ttlMs: quantizeStepUp(z.ttlMs, 150),
        });
      } else {
        projectedZones.push(z);
      }
    }
  }

  const projectedEvents: FloatingEvent[] = [];
  for (let i = 0; i < baseNetSnap.events.length; i++) {
    const ev = baseNetSnap.events[i];
    if (
      ev.attackerId === viewerId ||
      ev.hitTargetId === viewerId ||
      ev.targetPlayerId === viewerId
    ) {
      projectedEvents.push(ev);
      continue;
    }
    const dx = ev.x - vxCenter;
    const dy = ev.y - vyCenter;
    if (dx * dx + dy * dy <= eventRadiusSq) {
      projectedEvents.push(ev);
    }
  }

  return {
    ...baseNetSnap,
    players: projectedPlayers,
    projectiles: projectedProjectiles,
    zones: projectedZones,
    events: projectedEvents,
  };
}
