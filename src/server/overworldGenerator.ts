import {
  TILE_SIZE,
  type DungeonMap,
  type EnemyState,
  type NpcState,
  type OverworldRegion,
  type PropState,
  type TrainingDummyState,
} from '../shared/types.ts';

function createSeededRng(seed: number): () => number {
  let s = (Math.floor(seed) || 777) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedOverworld {
  map: DungeonMap;
  enemies: EnemyState[];
  props: PropState[];
  npcs: NpcState[];
  trainingDummies: TrainingDummyState[];
  spawnPoint: { x: number; y: number };
}

/**
 * Tile legend for `biome: 'overworld'`:
 * - 0: Outer world abyss border (x/y near edges) OR inland lake water pockets
 * - 1: Emerald meadow grass (walkable)
 * - 2: Dense forest trees / perimeter mountain ridge (solid obstacle)
 * - 3: Ruin monolith pillars & quarry boulders (solid obstacle)
 * - 4: Packed dirt roads & organic trails (walkable)
 * - 5: Ancient cobblestone plazas, ruin floors & stone bridges (walkable)
 * - 6: Sunlit sand & shoreline / clearing glades (walkable)
 */
export function generateOpenWorldMap(seed = 777): GeneratedOverworld {
  const width = 120;
  const height = 90;
  const tiles = new Array<number>(width * height).fill(1);
  const protectedWalkable = new Uint8Array(width * height);
  const rng = createSeededRng(seed);

  const inInnerBounds = (tx: number, ty: number) =>
    tx >= 3 && tx < width - 3 && ty >= 3 && ty < height - 3;

  const setTile = (tx: number, ty: number, code: number, protectWalk = false) => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return;
    tiles[ty * width + tx] = code;
    if (protectWalk && code !== 0 && code !== 2 && code !== 3) {
      protectedWalkable[ty * width + tx] = 1;
    }
  };

  const getTile = (tx: number, ty: number): number => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return 0;
    return tiles[ty * width + tx];
  };

  const fillDisc = (
    cx: number,
    cy: number,
    radius: number,
    code: number,
    opts?: { onlyIf?: number; wobble?: number; protectWalk?: boolean }
  ) => {
    const wobble = opts?.wobble ?? 0;
    const minX = Math.floor(cx - radius - wobble - 1);
    const maxX = Math.ceil(cx + radius + wobble + 1);
    const minY = Math.floor(cy - radius - wobble - 1);
    const maxY = Math.ceil(cy + radius + wobble + 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!inInnerBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const localR =
          wobble > 0
            ? radius +
              Math.sin(angle * 3 + cx * 0.4) * wobble * 0.55 +
              Math.cos(angle * 5 - cy * 0.3) * wobble * 0.45
            : radius;
        if (dist <= localR) {
          if (opts?.onlyIf === undefined || getTile(x, y) === opts.onlyIf) {
            setTile(x, y, code, opts?.protectWalk);
          }
        }
      }
    }
  };

  const fillRect = (
    x0: number,
    y0: number,
    w: number,
    h: number,
    code: number,
    protectWalk = false
  ) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (inInnerBounds(x, y)) {
          setTile(x, y, code, protectWalk);
        }
      }
    }
  };

  const fillOctagon = (
    cx: number,
    cy: number,
    radius: number,
    chamferCut: number,
    code: number,
    protectWalk = false
  ) => {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!inInnerBounds(x, y)) continue;
        const adx = Math.abs(x - cx);
        const ady = Math.abs(y - cy);
        if (adx <= radius && ady <= radius && adx + ady <= chamferCut) {
          setTile(x, y, code, protectWalk);
        }
      }
    }
  };

  const carveOrganicTrail = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    halfWidth: number,
    amplitude: number,
    frequency: number,
    phase: number,
    code = 4
  ) => {
    const totalDist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(12, Math.ceil(totalDist * 2.5));
    const ux = (x1 - x0) / Math.max(1, totalDist);
    const uy = (y1 - y0) / Math.max(1, totalDist);
    const nx = -uy;
    const ny = ux;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const taper = Math.sin(t * Math.PI); // 0 at endpoints so junctions meet cleanly
      const offset = Math.sin(t * Math.PI * frequency + phase) * amplitude * taper;
      const px = x0 + (x1 - x0) * t + nx * offset;
      const py = y0 + (y1 - y0) * t + ny * offset;
      fillDisc(px, py, halfWidth, code, { protectWalk: true });
    }
  };

  // 1. World boundaries: 2-tile outer cliff void (0) + organic 2-5 tile forest/ridge fringe (2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) {
        setTile(x, y, 0);
      } else if (x === 2 || x >= width - 3 || y === 2 || y >= height - 3) {
        setTile(x, y, 2);
      } else {
        const edgeDist = Math.min(x - 2, width - 3 - x, y - 2, height - 3 - y);
        const waveDepth =
          1.4 +
          Math.sin(x * 0.24 + y * 0.17) * 0.85 +
          Math.cos(x * 0.11 - y * 0.29) * 0.65;
        if (edgeDist <= Math.floor(waveDepth) || (edgeDist <= 2 && rng() < 0.36)) {
          setTile(x, y, 2);
        }
      }
    }
  }

  // 2. Subtle sunlit meadow glades & sandy patches across the plains
  for (let i = 0; i < 46; i++) {
    const px = 7 + Math.floor(rng() * (width - 14));
    const py = 7 + Math.floor(rng() * (height - 14));
    const r = 2.2 + rng() * 3.0;
    fillDisc(px, py, r, 6, { onlyIf: 1, wobble: 0.7 });
  }

  // 3. Organic Winding Dirt Trails & Quadrant Roads (4)
  // West-East Royal Road
  carveOrganicTrail(8, 45, 51, 45, 1.6, 2.2, 2.0, 0.3, 4);
  carveOrganicTrail(69, 45, width - 9, 45, 1.6, 2.2, 2.0, 1.7, 4);
  // North-South Pilgrimage Road
  carveOrganicTrail(60, 8, 60, 36, 1.6, 2.0, 1.8, 0.9, 4);
  carveOrganicTrail(60, 54, 60, height - 9, 1.6, 2.0, 1.8, 2.4, 4);
  // Quadrant Scenic Loop & Landmark Connectors
  carveOrganicTrail(16, 45, 19, 25, 1.3, 1.8, 1.5, 0.4, 4);
  carveOrganicTrail(19, 25, 31, 22, 1.35, 1.2, 1.2, 1.1, 4);
  carveOrganicTrail(31, 22, 60, 15, 1.35, 2.1, 2.0, 0.6, 4);
  carveOrganicTrail(60, 15, 89, 23, 1.35, 2.0, 2.0, 2.0, 4);
  carveOrganicTrail(89, 23, 104, 45, 1.35, 2.1, 1.6, 0.8, 4);
  carveOrganicTrail(104, 45, 102, 66, 1.3, 1.6, 1.3, 1.5, 4);
  carveOrganicTrail(102, 66, 88, 66, 1.35, 1.0, 1.0, 0.2, 4);
  carveOrganicTrail(88, 66, 60, 75, 1.35, 2.0, 1.8, 2.5, 4);
  carveOrganicTrail(60, 75, 43, 66, 1.35, 1.6, 1.5, 0.7, 4);
  carveOrganicTrail(16, 45, 16, 66, 1.3, 1.5, 1.4, 1.9, 4);
  carveOrganicTrail(30, 53, 31, 26, 1.25, 1.9, 1.8, 0.9, 4);
  carveOrganicTrail(60, 45, 82, 28, 1.2, 1.8, 1.6, 1.3, 4);
  carveOrganicTrail(60, 45, 79, 60, 1.2, 1.8, 1.6, 2.1, 4);

  // 4. Landmark #1 — NW: Emerald Woods & Sylvan Ring Glade (center ~31, 22)
  fillDisc(31, 22, 7.2, 6, { wobble: 0.9, protectWalk: true });
  fillDisc(31, 22, 4.4, 1, { wobble: 0.4, protectWalk: true });
  fillDisc(31, 22, 1.8, 5, { protectWalk: true }); // Ancient mossy ring stone center
  // 4 weathered standing stones ringing the glade
  const sylvanStones = [
    [26, 18],
    [36, 18],
    [26, 26],
    [36, 26],
  ] as const;
  for (const [sx, sy] of sylvanStones) {
    setTile(sx, sy, 3);
  }
  const nwGroves = [
    [21, 18, 2.5],
    [40, 17, 2.4],
    [44, 30, 2.3],
    [23, 33, 2.1],
    [13, 24, 2.5],
    [39, 9, 2.3],
    [50, 22, 2.0],
    [14, 13, 2.2],
  ] as const;
  for (const [gx, gy, gr] of nwGroves) {
    for (let dy = -Math.ceil(gr); dy <= Math.ceil(gr); dy++) {
      for (let dx = -Math.ceil(gr); dx <= Math.ceil(gr); dx++) {
        const tx = gx + dx;
        const ty = gy + dy;
        if (!inInnerBounds(tx, ty) || protectedWalkable[ty * width + tx]) continue;
        if (dx * dx + dy * dy <= gr * gr) {
          setTile(tx, ty, 2);
        }
      }
    }
  }

  // 5. Landmark #2 — NE: Sunlit Quarry & Amberstone Canyon (center ~89, 23)
  fillDisc(89, 23, 15.2, 6, { wobble: 1.4, protectWalk: true });
  fillDisc(89, 23, 9.4, 4, { wobble: 1.0, protectWalk: true });
  fillDisc(89, 23, 3.6, 5, { wobble: 0.4, protectWalk: true }); // Quarry stone terrace hub
  fillRect(88, 12, 3, 6, 5, true); // North stone quarry ramp
  fillRect(96, 22, 6, 3, 5, true); // East stone quarry ramp
  const neCanyonOutcrops = [
    [77, 17, 2.0],
    [83, 16, 1.5],
    [96, 17, 2.0],
    [99, 28, 2.1],
    [80, 30, 1.8],
    [72, 26, 2.0],
    [106, 24, 2.2],
    [92, 34, 1.7],
    [85, 32, 1.4],
  ] as const;
  for (const [bx, by, br] of neCanyonOutcrops) {
    for (let dy = -Math.ceil(br); dy <= Math.ceil(br); dy++) {
      for (let dx = -Math.ceil(br); dx <= Math.ceil(br); dx++) {
        const tx = bx + dx;
        const ty = by + dy;
        if (!inInnerBounds(tx, ty) || protectedWalkable[ty * width + tx]) continue;
        if (dx * dx + dy * dy <= br * br) {
          setTile(tx, ty, 3);
        }
      }
    }
  }

  // 6. Landmark #3 — SW: Whispering Lake, Bastion Island & Twin/Triple Bridges (center ~30, 67)
  // Warm sandy shore halo
  fillDisc(29, 67, 14.5, 6, { wobble: 1.5 });
  fillDisc(38, 63, 9.2, 6, { wobble: 1.1 });
  // Organic lake water basin
  fillDisc(29, 67, 10.6, 0, { wobble: 1.25 });
  fillDisc(38, 63, 6.8, 0, { wobble: 0.95 });
  fillDisc(25, 59, 5.2, 0, { wobble: 0.7 });
  // Central Bastion Island
  fillDisc(30, 66, 4.7, 6, { wobble: 0.35, protectWalk: true });
  fillDisc(30, 66, 3.6, 5, { protectWalk: true });
  // 3 Stone Bridges + Southern Sandbar Pier
  fillRect(28, 52, 4, 11, 5, true); // North bridge
  fillRect(15, 65, 12, 4, 5, true); // West bridge
  fillRect(33, 63, 13, 4, 5, true); // East bridge
  fillDisc(30, 77, 4.2, 6, { wobble: 0.5, protectWalk: true }); // Southern sandbar
  fillRect(28, 70, 4, 6, 5, true); // Southern stone pier connecting toward South spawn

  // 7. Landmark #4 — SE: Shattered Sanctum Ruins & Dais (center ~88, 66)
  fillOctagon(88, 66, 13, 21, 6, true);
  fillOctagon(88, 66, 10, 16, 5, true);
  fillDisc(88, 66, 6.2, 1, { wobble: 0.5, protectWalk: true }); // Overgrown grassy courtyard ring
  fillDisc(88, 66, 3.3, 5, { protectWalk: true }); // Central Elevated Dais
  // Colonnade ruin walls & broken pillars (with wide cardinal doorways)
  const sePillars = [
    [79, 58],
    [80, 58],
    [79, 59],
    [96, 58],
    [97, 58],
    [97, 59],
    [79, 73],
    [80, 73],
    [79, 72],
    [96, 73],
    [97, 73],
    [97, 72],
    [83, 62],
    [93, 62],
    [83, 70],
    [93, 70],
    [73, 61],
    [103, 62],
    [74, 72],
    [102, 72],
  ] as const;
  for (const [rx, ry] of sePillars) {
    setTile(rx, ry, 3);
  }

  // 8. Landmark #5 — Center: Crossroads Bastion Octagonal Plaza (center 60, 45)
  fillOctagon(60, 45, 11, 17, 6, true);
  fillOctagon(60, 45, 9, 14, 5, true);
  // Symmetrical L-shaped tactical cover pillars around plaza perimeter (keeping center wide open)
  const centerCornerClusters = [
    [54, 40, -1, -1],
    [66, 40, 1, -1],
    [54, 50, -1, 1],
    [66, 50, 1, 1],
  ] as const;
  for (const [px, py, sx, sy] of centerCornerClusters) {
    setTile(px, py, 3);
    setTile(px + sx, py, 3);
    setTile(px, py + sy, 3);
  }

  // Ensure Crossroads center disc stays 100% open & walkable
  fillDisc(60, 45, 4.2, 5, { protectWalk: true });

  // 9. Scattered borderland trees & quarry rocks outside protected roads/landmarks/lakes
  for (let i = 0; i < 72; i++) {
    const tx = 6 + Math.floor(rng() * (width - 12));
    const ty = 6 + Math.floor(rng() * (height - 12));
    if (protectedWalkable[ty * width + tx]) continue;
    const cur = getTile(tx, ty);
    if (cur !== 1 && cur !== 6) continue;
    if (Math.hypot(tx - 60, ty - 45) <= 13.5) continue;
    if (tx >= 20 && tx <= 46 && ty >= 51 && ty <= 81) continue; // Keep lakeside bridges clean
    if (tx >= 74 && tx <= 102 && ty >= 54 && ty <= 78) continue; // Keep sanctum courtyard clean
    const obsCode = tx < 58 ? 2 : 3;
    setTile(tx, ty, obsCode);
    if (
      rng() < 0.4 &&
      inInnerBounds(tx + 1, ty) &&
      !protectedWalkable[ty * width + (tx + 1)] &&
      (getTile(tx + 1, ty) === 1 || getTile(tx + 1, ty) === 6)
    ) {
      setTile(tx + 1, ty, obsCode);
    }
  }

  // 10. Guaranteed safe spawn clearings (8 distributed spawn points)
  const spawnTiles: Array<{ tx: number; ty: number; padCode: number }> = [
    { tx: 60, ty: 15, padCode: 4 }, // North Pilgrimage Trail
    { tx: 60, ty: 75, padCode: 4 }, // South Pilgrimage Trail
    { tx: 15, ty: 45, padCode: 4 }, // West Royal Road
    { tx: 105, ty: 45, padCode: 4 }, // East Royal Road
    { tx: 31, ty: 22, padCode: 6 }, // NW Emerald Woods Sylvan Ring
    { tx: 89, ty: 23, padCode: 5 }, // NE Sunlit Quarry Terrace
    { tx: 30, ty: 77, padCode: 6 }, // SW Whispering Lake South Pier
    { tx: 88, ty: 66, padCode: 5 }, // SE Shattered Sanctum Dais
  ];

  const spawnPoints: Array<{ x: number; y: number }> = [];
  for (const sp of spawnTiles) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = sp.tx + dx;
        const cy = sp.ty + dy;
        if (inInnerBounds(cx, cy)) {
          const cur = getTile(cx, cy);
          if (cur === 0 || cur === 2 || cur === 3) {
            setTile(cx, cy, sp.padCode, true);
          }
        }
      }
    }
    spawnPoints.push({
      x: (sp.tx + 0.5) * TILE_SIZE,
      y: (sp.ty + 0.5) * TILE_SIZE,
    });
  }

  const regions: OverworldRegion[] = [
    {
      id: 'crossroads_bastion',
      name: 'Crossroads Bastion',
      subtitle: 'Ancient Cobblestone Hub',
      x: 60.5 * TILE_SIZE,
      y: 45.5 * TILE_SIZE,
      radius: 440,
      accentColor: '#F59E0B',
    },
    {
      id: 'emerald_woods',
      name: 'Emerald Woods',
      subtitle: 'Sylvan Ring & Timber Trails',
      x: 31.5 * TILE_SIZE,
      y: 22.5 * TILE_SIZE,
      radius: 560,
      accentColor: '#34D399',
    },
    {
      id: 'sunlit_quarry',
      name: 'Sunlit Quarry',
      subtitle: 'Amberstone Canyon & Ramps',
      x: 89.5 * TILE_SIZE,
      y: 23.5 * TILE_SIZE,
      radius: 540,
      accentColor: '#FBBF24',
    },
    {
      id: 'whispering_lake',
      name: 'Whispering Lake',
      subtitle: 'Bastion Isle & Stone Bridges',
      x: 30.5 * TILE_SIZE,
      y: 66.5 * TILE_SIZE,
      radius: 560,
      accentColor: '#38BDF8',
    },
    {
      id: 'shattered_sanctum',
      name: 'Shattered Sanctum',
      subtitle: 'Overgrown Colonnade Ruins',
      x: 88.5 * TILE_SIZE,
      y: 66.5 * TILE_SIZE,
      radius: 540,
      accentColor: '#A78BFA',
    },
  ];

  const map: DungeonMap = {
    floor: 1,
    biome: 'overworld',
    biomeTitle: 'Verdant Borderlands',
    width,
    height,
    tiles,
    rooms: [],
    torches: [],
    portalPos: { x: 60.5 * TILE_SIZE, y: 45.5 * TILE_SIZE },
    portalActive: false,
    seed,
    spawnPoints,
    regions,
  };

  return {
    map,
    enemies: [],
    props: [],
    npcs: [],
    trainingDummies: [],
    spawnPoint: spawnPoints[0],
  };
}
