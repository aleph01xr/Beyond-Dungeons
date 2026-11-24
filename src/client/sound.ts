/**
 * Web Audio API Sound Engine for "Beyond"
 * Preserves SoundManager routing and public `sfx` APIs while synthesizing:
 * - Organic pitch, volume, timing, and timbre variations (no repetitive robotic loops)
 * - Multi-layered combat SFX (transients, body, harmonic tail, stereo spread)
 * - Distinct acoustic identities per class (Vanguard, Ranger, Arcanist, Cleric) & weapon
 * - Movement- & stride-synced footsteps across 5 surfaces (stone, dirt, grass, wood, metal)
 * - Spatial audio culling, distance attenuation, and stereo panning for nearby players & enemies
 * - Distinct procedural ambient soundscapes for Tavern (Floor 0) + all 10 Dungeon Floors
 * - Dynamic multi-layered Boss Ability SFX for Floors 1–10
 * - Strict AudioNode disconnect cleanup and voice/concurrency budgeting
 */

import { soundManager, type SpatialRouteHandle } from './soundManager.ts';
import { playBossAbilitySfx } from './bossSfxRedesign_v2.ts';
import { TILE_SIZE, type BiomeId, type DungeonMap } from '../shared/types.ts';

export type UiSoundType = 'default' | 'confirm' | 'cancel' | 'toggle' | 'hover';
export type AttackHeroStyle = 'vanguard' | 'ranger' | 'arcanist' | 'cleric' | string;
export type FootstepSurface = 'stone' | 'dirt' | 'grass' | 'wood' | 'metal';
export type ExplosionKind = 'fire' | 'arcane' | 'frost' | 'void' | 'holy' | 'physical';

export interface SpatialSfxOptions {
  worldPos?: { x: number; y: number } | null;
  volume?: number;
  pitch?: number;
  isLocal?: boolean;
}

export interface PlayAttackOptions extends SpatialSfxOptions {
  comboStep?: number;
  weaponId?: string | null;
  playerId?: string;
}

export interface PlaySkillOptions extends SpatialSfxOptions {
  heroClass?: AttackHeroStyle;
  skillId?: string | null;
}

export interface PlayDashOptions extends SpatialSfxOptions {
  heroClass?: AttackHeroStyle;
}

export interface PlayHitOptions extends SpatialSfxOptions {
  damageCategory?: string;
  comboStep?: number;
}

export interface PlayFootstepOptions extends SpatialSfxOptions {
  playerId?: string;
  surface?: FootstepSurface;
  heroClass?: AttackHeroStyle;
  speed?: number;
  isRunning?: boolean;
  strideIndex?: number;
}

type NoiseColor = 'white' | 'brown';

interface AmbientSession {
  floor: number;
  biome: string;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
  oscillators: OscillatorNode[];
  nodesToDisconnect: AudioNode[];
  musicInterval: ReturnType<typeof setInterval> | null;
  accentInterval: ReturnType<typeof setInterval> | null;
  active: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const randRange = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randJitter = (base: number, pct: number) => base * (1 + (Math.random() * 2 - 1) * pct);
const pickOne = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function safeDisconnect(nodes: Array<AudioNode | null | undefined>): void {
  for (const node of nodes) {
    if (!node) continue;
    try {
      node.disconnect();
    } catch {
      // ignore
    }
  }
}

/**
 * Deterministically resolves the ground surface material under a world coordinate
 * across Floor 0 (Tavern) and Floors 1–10 (Dungeon biomes).
 */
export function resolveFootstepSurface(
  map:
    | Pick<DungeonMap, 'floor' | 'biome' | 'width' | 'height' | 'tiles' | 'portalPos' | 'rooms'>
    | null
    | undefined,
  worldX: number,
  worldY: number
): FootstepSurface {
  if (!map || !map.tiles || map.width <= 0 || map.height <= 0) {
    return 'stone';
  }

  const tx = clamp(Math.floor(worldX / TILE_SIZE), 0, map.width - 1);
  const ty = clamp(Math.floor(worldY / TILE_SIZE), 0, map.height - 1);
  const code = map.tiles[ty * map.width + tx] ?? 1;
  const hash = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;

  // Floor 0 Tavern: wood floorboards, velvet carpet, cobblestone hearth, sand training pit
  if (map.floor === 0) {
    if (code === 5) return 'stone'; // Fireplace cobblestone hearth
    if (code === 6) return 'dirt'; // Training grounds sand/dirt ring
    if (code === 4) return 'dirt'; // Muffled woven velvet rug
    return 'wood'; // Polished oak planks
  }

  // Grand descent portal dais always features runic metalwork
  if (map.portalPos) {
    const portalDist = Math.hypot(worldX - map.portalPos.x, worldY - map.portalPos.y);
    if (portalDist <= TILE_SIZE * 1.45) {
      return 'metal';
    }
  }

  // Check room context if available
  const room = map.rooms?.find(
    (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h
  );
  if (room?.type === 'treasure' && (hash % 3 === 0 || code === 5)) {
    return 'wood';
  }
  if (room?.type === 'shrine' && hash % 4 === 0) {
    return 'metal';
  }

  const biome = map.biome as BiomeId;

  if (code === 5) {
    if (biome === 'ember' || biome === 'reliquary' || biome === 'wardengate') {
      return 'metal';
    }
    return 'stone';
  }

  if (biome === 'courtyard') {
    if (hash % 11 === 0) return 'grass';
    if (hash % 7 === 0) return 'dirt';
    return 'stone';
  }

  if (biome === 'catacombs') {
    if (hash % 11 === 0) return 'dirt';
    if (hash % 17 === 0) return 'grass'; // damp crypt moss
    return 'stone';
  }

  if (biome === 'ember') {
    if (hash % 13 === 0) return 'metal'; // forged iron floor grates
    if (hash % 9 === 0) return 'dirt'; // volcanic ash/cinders
    return 'stone';
  }

  if (biome === 'reliquary') {
    if (hash % 11 === 0) return 'metal'; // reliquary brass plates
    if (hash % 7 === 0) return 'dirt'; // thick bone/ash dust
    return 'stone';
  }

  if (biome === 'wardengate') {
    if (hash % 6 === 0) return 'metal'; // bastion iron inlays
    return 'stone';
  }

  if (biome === 'hymns' || biome === 'nave') {
    if (hash % 13 === 0) return 'metal'; // gilded floor plates
    if (biome === 'hymns' && hash % 19 === 0) return 'grass'; // overgrown sanctuary moss
    return 'stone';
  }

  if (biome === 'scripture') {
    if (hash % 9 === 0) return 'wood'; // archive floorboard inlays
    return 'stone';
  }

  // void, astral, default
  if (hash % 15 === 0) return 'dirt';
  return 'stone';
}

class RetroAudioEngine {
  private noiseCache = new WeakMap<AudioContext, { white: AudioBuffer; brown: AudioBuffer }>();
  private ambientSession: AmbientSession | null = null;

  // Per-channel / per-key throttling & overload guards
  private lastAttackSfxByActor = new Map<string, number>();
  private lastFootstepSfxByActor = new Map<string, number>();
  private lastEnemyHitSfxAt = 0;
  private lastEnemyCritSfxAt = 0;
  private lastExplosionSfxAt = 0;
  private lastHealSfxAt = 0;
  private lastCoinSfxAt = 0;
  private lastBossSfxByKey = new Map<string, number>();

  constructor() {
    try {
      const saved = localStorage.getItem('beyond_sfx_muted');
      if (saved === 'true') {
        soundManager.setMasterMuted(true);
      }
    } catch {
      // ignore
    }
  }

  public ensureContext(): AudioContext | null {
    if (soundManager.isMasterMuted() || soundManager.isSfxMuted()) return null;
    return soundManager.ensureContext();
  }

  public unlockAudio(): void {
    soundManager.unlockAudio();
  }

  public isMuted(): boolean {
    return soundManager.isMasterMuted() || soundManager.isSfxMuted();
  }

  public toggleMute(): boolean {
    return soundManager.toggleMasterMute();
  }

  public setVolume(vol: number): void {
    soundManager.setMasterVolume(vol);
    soundManager.setSfxVolume(vol);
  }

  private getDestination(): AudioNode | null {
    return soundManager.getSfxDestination() || soundManager.getMasterDestination();
  }

  /**
   * Returns a cached noise buffer for the current AudioContext (avoiding per-SFX buffer churn).
   */
  public getNoiseBuffer(color: NoiseColor = 'white'): AudioBuffer | null {
    const ctx = this.ensureContext() || soundManager.getAudioContext();
    if (!ctx) return null;
    let entry = this.noiseCache.get(ctx);
    if (!entry) {
      const sr = ctx.sampleRate || 44100;
      const whiteLen = Math.max(1, Math.floor(sr * 0.55));
      const white = ctx.createBuffer(1, whiteLen, sr);
      const wData = white.getChannelData(0);
      for (let i = 0; i < whiteLen; i++) {
        wData[i] = Math.random() * 2 - 1;
      }

      const brownLen = Math.max(1, Math.floor(sr * 1.1));
      const brown = ctx.createBuffer(1, brownLen, sr);
      const bData = brown.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < brownLen; i++) {
        const w = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.022 * w) / 1.022;
        bData[i] = clamp(lastOut * 3.4, -1, 1);
      }

      entry = { white, brown };
      this.noiseCache.set(ctx, entry);
    }
    return color === 'brown' ? entry.brown : entry.white;
  }

  private acquireSpatialBus(
    opts?: SpatialSfxOptions,
    priority = 50,
    spatialCfg: { minDistance?: number; maxDistance?: number; panSpread?: number } = {}
  ): { ctx: AudioContext; route: SpatialRouteHandle; doneVoice: () => void } | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (!soundManager.canPlayProceduralVoice(priority)) return null;

    const useSpatial = Boolean(opts?.worldPos && !opts?.isLocal);
    const route = useSpatial
      ? soundManager.acquireSpatialDestination(opts?.worldPos, spatialCfg, 'sfx')
      : soundManager.acquireSpatialDestination(null, spatialCfg, 'sfx');
    if (!route) return null;

    const doneVoice = soundManager.trackProceduralVoice(0.28);
    return { ctx, route, doneVoice };
  }

  private scheduleTone(
    ctx: AudioContext,
    dest: AudioNode,
    t: number,
    opts: {
      type?: OscillatorType;
      from: number;
      to?: number;
      duration: number;
      peak: number;
      attack?: number;
      detuneCents?: number;
      filterType?: BiquadFilterType;
      filterFreq?: number;
      filterTo?: number;
      filterQ?: number;
      onClean?: () => void;
    }
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let filter: BiquadFilterNode | null = null;

    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(18, opts.from), t);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(18, opts.to),
        t + Math.max(0.01, opts.duration)
      );
    }
    if (opts.detuneCents && osc.detune) {
      osc.detune.setValueAtTime(opts.detuneCents, t);
    }

    const atk = Math.max(0.002, opts.attack ?? 0.004);
    const dur = Math.max(atk + 0.015, opts.duration);
    const peak = clamp(opts.peak, 0.0005, 0.36);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    if (opts.filterType && opts.filterFreq) {
      filter = ctx.createBiquadFilter();
      filter.type = opts.filterType;
      filter.frequency.setValueAtTime(Math.max(25, opts.filterFreq), t);
      if (opts.filterTo !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(25, opts.filterTo), t + dur);
      }
      if (opts.filterQ !== undefined) {
        filter.Q.setValueAtTime(opts.filterQ, t);
      }
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(dest);
    osc.onended = () => {
      safeDisconnect([osc, filter, gain]);
      opts.onClean?.();
    };
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private scheduleNoise(
    ctx: AudioContext,
    dest: AudioNode,
    t: number,
    opts: {
      color?: NoiseColor;
      filterType: BiquadFilterType;
      fromFreq: number;
      toFreq?: number;
      q?: number;
      duration: number;
      peak: number;
      attack?: number;
      playbackRate?: number;
      onClean?: () => void;
    }
  ): void {
    const buffer = this.getNoiseBuffer(opts.color ?? 'white');
    if (!buffer) {
      opts.onClean?.();
      return;
    }

    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    src.buffer = buffer;
    if (opts.playbackRate && src.playbackRate) {
      src.playbackRate.setValueAtTime(clamp(opts.playbackRate, 0.4, 2.2), t);
    }

    const dur = Math.max(0.02, opts.duration);
    const atk = Math.max(0.002, opts.attack ?? 0.003);
    const peak = clamp(opts.peak, 0.0005, 0.36);

    filter.type = opts.filterType;
    filter.frequency.setValueAtTime(Math.max(30, opts.fromFreq), t);
    if (opts.toFreq !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, opts.toFreq), t + dur);
    }
    if (opts.q !== undefined) {
      filter.Q.setValueAtTime(opts.q, t);
    }

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.onended = () => {
      safeDisconnect([src, filter, gain]);
      opts.onClean?.();
    };
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ==========================================
  // UI SOUND EFFECTS
  // ==========================================

  public playUiClick(tone: UiSoundType = 'default'): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const pMul = randJitter(1, 0.035);

    if (tone === 'hover') {
      this.scheduleTone(ctx, dest, now, {
        type: 'sine',
        from: 880 * pMul,
        duration: 0.028,
        peak: 0.018,
      });
      return;
    }

    if (tone === 'toggle') {
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: 690 * pMul,
        to: 960 * pMul,
        duration: 0.072,
        peak: 0.055,
      });
      return;
    }

    if (tone === 'confirm') {
      [587.33, 880].forEach((freq, i) => {
        this.scheduleTone(ctx, dest, now + i * 0.062, {
          type: 'triangle',
          from: freq * pMul,
          to: freq * pMul * 1.01,
          duration: 0.145,
          peak: 0.065,
        });
      });
      return;
    }

    if (tone === 'cancel') {
      this.scheduleTone(ctx, dest, now, {
        type: 'sine',
        from: 460 * pMul,
        to: 270 * pMul,
        duration: 0.088,
        peak: 0.055,
      });
      return;
    }

    this.scheduleTone(ctx, dest, now, {
      type: 'triangle',
      from: 540 * pMul,
      to: 780 * pMul,
      duration: 0.065,
      peak: 0.068,
    });
  }

  public playUiHover(): void {
    this.playUiClick('hover');
  }

  public playUiConfirm(): void {
    this.playUiClick('confirm');
  }

  public playUiCancel(): void {
    this.playUiClick('cancel');
  }

  // ==========================================
  // CLASS-DISTINCT LAYERED ATTACK SOUND EFFECTS
  // ==========================================

  public playAttack(style: AttackHeroStyle = 'vanguard', opts: PlayAttackOptions = {}): void {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const actorKey = opts.playerId || (opts.isLocal === false ? `remote_${style}` : 'local');
    const lastAt = this.lastAttackSfxByActor.get(actorKey) ?? 0;
    if (perfNow - lastAt < 55) return;

    const bus = this.acquireSpatialBus(opts, opts.isLocal === false ? 48 : 72, {
      minDistance: 130,
      maxDistance: 980,
      panSpread: 520,
    });
    if (!bus) return;

    this.lastAttackSfxByActor.set(actorKey, perfNow);
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;

    const comboStep = Math.max(0, opts.comboStep ?? 0);
    const isFinisher = comboStep >= 2;
    const comboPitchBias = comboStep === 1 ? 1.07 : isFinisher ? 0.92 : 1.0;
    const pVar = (opts.pitch ?? 1) * comboPitchBias * randJitter(1, 0.065);
    const vVar = (opts.volume ?? 1) * (opts.isLocal === false ? 0.72 : 1) * randJitter(1, 0.09);
    const dVar = randJitter(1, 0.08);
    const wpn = (opts.weaponId || '').toLowerCase();

    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    if (style === 'vanguard') {
      const isAxe = wpn.includes('crimson') || wpn.includes('axe');
      const isFlail = wpn.includes('stormbreaker') || wpn.includes('flail');
      const isSunforged = wpn.includes('sunforged');

      // Layer 1: Air cleave whoosh
      this.scheduleNoise(ctx, dest, now, {
        color: isAxe ? 'brown' : 'white',
        filterType: 'bandpass',
        fromFreq: (isAxe ? 1150 : 1550) * pVar,
        toFreq: (isAxe ? 230 : 340) * pVar,
        q: isAxe ? 1.7 : 2.1,
        duration: (isFinisher ? 0.165 : 0.125) * dVar,
        peak: 0.092 * vVar,
      });

      // Layer 2: Heavy blade weight / impact body
      this.scheduleTone(ctx, dest, now, {
        type: 'sawtooth',
        from: (isAxe ? 210 : isFlail ? 240 : 275) * pVar,
        to: (isFinisher ? 58 : 74) * pVar,
        duration: (isFinisher ? 0.15 : 0.115) * dVar,
        peak: (isFinisher ? 0.092 : 0.075) * vVar,
        filterType: 'lowpass',
        filterFreq: 1400,
        filterTo: 280,
      });

      // Layer 3: Steel harmonic bite / weapon signature overtone
      this.scheduleTone(ctx, dest, now + 0.006, {
        type: 'triangle',
        from: (isSunforged ? 1120 : isFlail ? 760 : 880) * pVar,
        to: (isSunforged ? 740 : 410) * pVar,
        duration: (isFinisher ? 0.17 : 0.105) * dVar,
        peak: (isFinisher ? 0.036 : 0.022) * vVar,
        onClean: releaseAll,
      });
    } else if (style === 'ranger') {
      const isTwin = wpn.includes('galewind');
      const isEclipse = wpn.includes('eclipse');

      // Layer 1: Bowstring snap / wood knock
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: (isEclipse ? 620 : 840) * pVar,
        to: (isEclipse ? 210 : 285) * pVar,
        duration: 0.088 * dVar,
        peak: 0.072 * vVar,
      });

      // Layer 2: Riser wood/string pluck harmonic (plus crisp double flutter on Twinbow)
      this.scheduleTone(ctx, dest, now + (isTwin ? 0.018 : 0.004), {
        type: 'sine',
        from: (isTwin ? 1280 : isEclipse ? 420 : 1080) * pVar,
        to: (isEclipse ? 170 : 540) * pVar,
        duration: 0.075 * dVar,
        peak: 0.032 * vVar,
      });

      // Layer 3: Arrow fletching wind zip
      this.scheduleNoise(ctx, dest, now + 0.005, {
        color: 'white',
        filterType: 'highpass',
        fromFreq: (isEclipse ? 2600 : 3900) * pVar,
        toFreq: 1900,
        q: 0.9,
        duration: (isFinisher ? 0.09 : 0.065) * dVar,
        peak: 0.044 * vVar,
        onClean: releaseAll,
      });
    } else if (style === 'arcanist') {
      const isFire = wpn.includes('cinder');
      const isChrono = wpn.includes('chrono');
      const rootFreq = (isFire ? 310 : isChrono ? 440 : 365) * pVar;

      // Layer 1: Soft magic release air pop
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'bandpass',
        fromFreq: (isFire ? 1400 : 2600) * pVar,
        toFreq: (isFire ? 450 : 1100) * pVar,
        q: 2.4,
        duration: 0.085 * dVar,
        peak: 0.034 * vVar,
      });

      // Layer 2 & 3: Dual harmonic shimmer pair
      [rootFreq, rootFreq * 1.98].forEach((freq, idx) => {
        this.scheduleTone(ctx, dest, now + idx * 0.016, {
          type: isFire ? 'triangle' : 'sine',
          from: freq,
          to: freq * (isChrono ? 1.85 : 2.15),
          detuneCents: idx === 1 ? randRange(-14, 14) : 0,
          duration: (0.115 + idx * 0.02) * dVar,
          peak: (idx === 0 ? 0.056 : 0.036) * vVar,
          onClean: idx === 1 ? releaseAll : undefined,
        });
      });
    } else {
      // Cleric: consecrated mace/crozier sweep + warm bronze bell chime
      const isSeraphim = wpn.includes('seraph');
      const isSolaris = wpn.includes('solar');
      const baseBell = (isSeraphim ? 660 : isSolaris ? 610 : 570) * pVar;

      // Layer 1: Soft weapon air swish
      this.scheduleNoise(ctx, dest, now, {
        color: 'brown',
        filterType: 'bandpass',
        fromFreq: 950 * pVar,
        toFreq: 340 * pVar,
        q: 1.5,
        duration: 0.1 * dVar,
        peak: 0.045 * vVar,
      });

      // Layer 2: Warm mace punch
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: baseBell,
        to: baseBell * 0.52,
        duration: 0.125 * dVar,
        peak: 0.068 * vVar,
      });

      // Layer 3: Radiant temple chime overtone
      this.scheduleTone(ctx, dest, now + 0.005, {
        type: 'sine',
        from: baseBell * 2.02,
        to: baseBell * 1.98,
        duration: (isFinisher ? 0.24 : 0.185) * dVar,
        peak: (isFinisher ? 0.048 : 0.034) * vVar,
        onClean: releaseAll,
      });
    }
  }

  // ==========================================
  // CLASS-DISTINCT SKILLS, SPELLS, DASHES & EXPLOSIONS
  // ==========================================

  public playSkill(kind: 'tactical' | 'ult', opts: PlaySkillOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, opts.isLocal === false ? 58 : 85, {
      minDistance: 150,
      maxDistance: 1120,
      panSpread: 560,
    });
    if (!bus) return;

    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const hero = (opts.heroClass || '').toLowerCase();
    const skillId = (opts.skillId || '').toLowerCase();
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.045);
    const vVar = (opts.volume ?? 1) * (opts.isLocal === false ? 0.72 : 1) * randJitter(1, 0.07);

    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    if (kind === 'tactical') {
      if (hero === 'vanguard' || skillId.includes('bulwark') || skillId.includes('bastion') || skillId.includes('crimson')) {
        // Vanguard tactical: heavy plate surge + battle roar / shield brace clang
        const isCrimson = skillId.includes('crimson');
        const isBastion = skillId.includes('bastion');
        this.scheduleNoise(ctx, dest, now, {
          color: 'brown',
          filterType: 'bandpass',
          fromFreq: (isCrimson ? 380 : 680) * pVar,
          toFreq: (isCrimson ? 1850 : 1400) * pVar,
          q: 1.8,
          duration: 0.22,
          peak: 0.09 * vVar,
        });
        this.scheduleTone(ctx, dest, now, {
          type: 'sawtooth',
          from: (isCrimson ? 165 : 220) * pVar,
          to: (isCrimson ? 460 : 520) * pVar,
          duration: 0.21,
          peak: 0.078 * vVar,
          filterType: 'lowpass',
          filterFreq: 1600,
        });
        this.scheduleTone(ctx, dest, now + 0.025, {
          type: 'triangle',
          from: (isBastion ? 920 : 640) * pVar,
          to: (isBastion ? 580 : 420) * pVar,
          duration: 0.24,
          peak: 0.055 * vVar,
          onClean: releaseAll,
        });
        return;
      }

      if (hero === 'ranger' || skillId.includes('frost_volley') || skillId.includes('cyclone') || skillId.includes('black_sun')) {
        // Ranger tactical: crisp multi-arrow wind burst / eclipse hum
        const isBlackSun = skillId.includes('black_sun');
        this.scheduleNoise(ctx, dest, now, {
          color: 'white',
          filterType: 'bandpass',
          fromFreq: (isBlackSun ? 900 : 2800) * pVar,
          toFreq: (isBlackSun ? 280 : 1200) * pVar,
          q: 2.0,
          duration: 0.21,
          peak: 0.075 * vVar,
        });
        [0, 1, 2].forEach((i) => {
          this.scheduleTone(ctx, dest, now + i * 0.032, {
            type: isBlackSun ? 'sine' : 'triangle',
            from: (isBlackSun ? 360 - i * 45 : 940 + i * 110) * pVar,
            to: (isBlackSun ? 130 : 380) * pVar,
            duration: 0.14,
            peak: 0.048 * vVar,
            onClean: i === 2 ? releaseAll : undefined,
          });
        });
        return;
      }

      if (hero === 'cleric' || skillId.includes('sanctified') || skillId.includes('seraph')) {
        // Cleric tactical: sacred harmonic bell swell
        const chord = skillId.includes('seraph') ? [523.25, 783.99, 1046.5] : [440, 659.25, 880];
        this.scheduleNoise(ctx, dest, now, {
          color: 'white',
          filterType: 'bandpass',
          fromFreq: 1800 * pVar,
          toFreq: 3200 * pVar,
          q: 2.4,
          duration: 0.22,
          peak: 0.036 * vVar,
        });
        chord.forEach((f, idx) => {
          this.scheduleTone(ctx, dest, now + idx * 0.022, {
            type: idx === 0 ? 'triangle' : 'sine',
            from: f * pVar,
            to: f * pVar * 1.02,
            duration: 0.26,
            peak: (0.056 - idx * 0.01) * vVar,
            onClean: idx === chord.length - 1 ? releaseAll : undefined,
          });
        });
        return;
      }

      // Generic / Arcanist astral nova tactical
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'highpass',
        fromFreq: 1600 * pVar,
        toFreq: 4200 * pVar,
        duration: 0.18,
        peak: 0.05 * vVar,
      });
      this.scheduleTone(ctx, dest, now, {
        type: 'sawtooth',
        from: 310 * pVar,
        to: 780 * pVar,
        duration: 0.22,
        peak: 0.068 * vVar,
        filterType: 'lowpass',
        filterFreq: 2100,
        onClean: releaseAll,
      });
      return;
    }

    // ULTIMATE SKILLS (multi-layered power surge + harmonic chord + sub anchor)
    this.scheduleTone(ctx, dest, now, {
      type: 'sine',
      from: (hero === 'vanguard' ? 110 : 145) * pVar,
      to: 55 * pVar,
      duration: 0.34,
      peak: 0.11 * vVar,
    });
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'bandpass',
      fromFreq: 340 * pVar,
      toFreq: 2200 * pVar,
      q: 1.4,
      duration: 0.3,
      peak: 0.075 * vVar,
    });

    const ultChord =
      hero === 'vanguard'
        ? [130.81, 196.0, 261.63, 392.0]
        : hero === 'ranger'
          ? [293.66, 440.0, 587.33, 880.0]
          : hero === 'cleric'
            ? [261.63, 329.63, 392.0, 523.25]
            : [196.0, 293.66, 392.0, 587.33];

    ultChord.forEach((freq, idx) => {
      this.scheduleTone(ctx, dest, now + idx * 0.036, {
        type: hero === 'cleric' ? 'sine' : 'triangle',
        from: freq * pVar,
        to: freq * pVar * (hero === 'ranger' ? 1.25 : 1.48),
        duration: 0.31,
        peak: 0.058 * vVar,
        onClean: idx === ultChord.length - 1 ? releaseAll : undefined,
      });
    });
  }

  public playArcanistSpell(spellId: string, opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, opts.isLocal === false ? 56 : 80, {
      minDistance: 140,
      maxDistance: 1080,
      panSpread: 550,
    });
    if (!bus) return;

    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.05);
    const vVar = (opts.volume ?? 1) * (opts.isLocal === false ? 0.72 : 1) * randJitter(1, 0.08);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    if (spellId === 'fireball' || spellId === 'arcane_meteor') {
      const isMeteor = spellId === 'arcane_meteor';
      this.scheduleTone(ctx, dest, now, {
        type: 'sawtooth',
        from: (isMeteor ? 150 : 225) * pVar,
        to: 44 * pVar,
        duration: isMeteor ? 0.32 : 0.26,
        peak: 0.095 * vVar,
        filterType: 'lowpass',
        filterFreq: 1100,
      });
      this.scheduleNoise(ctx, dest, now, {
        color: 'brown',
        filterType: 'lowpass',
        fromFreq: (isMeteor ? 1200 : 950) * pVar,
        toFreq: 160,
        duration: 0.25,
        peak: 0.088 * vVar,
        onClean: releaseAll,
      });
    } else if (spellId === 'frost_lance') {
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'highpass',
        fromFreq: 4200 * pVar,
        toFreq: 1900,
        duration: 0.14,
        peak: 0.042 * vVar,
      });
      [880, 1320].forEach((freq, i) => {
        this.scheduleTone(ctx, dest, now + i * 0.028, {
          type: 'triangle',
          from: freq * pVar,
          to: freq * pVar * 1.42,
          duration: 0.14,
          peak: 0.056 * vVar,
          onClean: i === 1 ? releaseAll : undefined,
        });
      });
    } else if (spellId === 'chain_lightning') {
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'bandpass',
        fromFreq: 5200 * pVar,
        toFreq: 1400,
        q: 1.9,
        duration: 0.16,
        peak: 0.058 * vVar,
      });
      [1120, 780, 1520].forEach((freq, i) => {
        this.scheduleTone(ctx, dest, now + i * 0.03, {
          type: 'square',
          from: freq * pVar,
          to: freq * pVar * 0.48,
          duration: 0.09,
          peak: 0.044 * vVar,
          filterType: 'lowpass',
          filterFreq: 2800,
          onClean: i === 2 ? releaseAll : undefined,
        });
      });
    } else if (spellId === 'disintegration') {
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'bandpass',
        fromFreq: 1800 * pVar,
        toFreq: 3400 * pVar,
        q: 2.2,
        duration: 0.22,
        peak: 0.045 * vVar,
      });
      this.scheduleTone(ctx, dest, now, {
        type: 'sawtooth',
        from: 225 * pVar,
        to: 465 * pVar,
        duration: 0.22,
        peak: 0.068 * vVar,
        filterType: 'lowpass',
        filterFreq: 1900,
        onClean: releaseAll,
      });
    } else if (spellId === 'arcane_barrage') {
      [520, 690, 880].forEach((freq, i) => {
        this.scheduleTone(ctx, dest, now + i * 0.028, {
          type: 'sine',
          from: freq * pVar,
          to: freq * pVar * 1.52,
          duration: 0.115,
          peak: 0.048 * vVar,
          onClean: i === 2 ? releaseAll : undefined,
        });
      });
    } else {
      this.scheduleTone(ctx, dest, now, {
        type: 'sine',
        from: 315 * pVar,
        to: 640 * pVar,
        duration: 0.24,
        peak: 0.072 * vVar,
        onClean: releaseAll,
      });
    }
  }

  public playChronoWell(opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, opts.isLocal === false ? 58 : 84, {
      minDistance: 150,
      maxDistance: 1100,
      panSpread: 540,
    });
    if (!bus) return;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.035);
    const vVar = (opts.volume ?? 1) * (opts.isLocal === false ? 0.72 : 1);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'bandpass',
      fromFreq: 2400 * pVar,
      toFreq: 520 * pVar,
      q: 2.6,
      duration: 0.34,
      peak: 0.04 * vVar,
    });
    [523.25, 392.0, 261.63].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.048, {
        type: 'sine',
        from: freq * pVar,
        to: freq * pVar * 0.5,
        duration: 0.36,
        peak: 0.068 * vVar,
        onClean: i === 2 ? releaseAll : undefined,
      });
    });
  }

  public playDash(opts: PlayDashOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, opts.isLocal === false ? 42 : 68, {
      minDistance: 120,
      maxDistance: 920,
      panSpread: 500,
    });
    if (!bus) return;

    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const hero = (opts.heroClass || '').toLowerCase();
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.07);
    const vVar = (opts.volume ?? 1) * (opts.isLocal === false ? 0.65 : 1) * randJitter(1, 0.08);

    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    this.scheduleNoise(ctx, dest, now, {
      color: hero === 'vanguard' ? 'brown' : 'white',
      filterType: 'bandpass',
      fromFreq: (hero === 'vanguard' ? 300 : 480) * pVar,
      toFreq: (hero === 'arcanist' ? 2400 : 1850) * pVar,
      q: hero === 'arcanist' ? 3.2 : 2.6,
      duration: 0.16,
      peak: 0.074 * vVar,
    });

    if (hero === 'vanguard') {
      // Heavy iron rush + faint plate clack
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: 210 * pVar,
        to: 460 * pVar,
        duration: 0.13,
        peak: 0.064 * vVar,
      });
      this.scheduleTone(ctx, dest, now + 0.015, {
        type: 'sine',
        from: 1380 * pVar,
        to: 920 * pVar,
        duration: 0.06,
        peak: 0.018 * vVar,
        onClean: releaseAll,
      });
    } else if (hero === 'arcanist') {
      // Ethereal phase warp shimmer
      this.scheduleTone(ctx, dest, now, {
        type: 'sine',
        from: 460 * pVar,
        to: 1120 * pVar,
        duration: 0.14,
        peak: 0.056 * vVar,
        onClean: releaseAll,
      });
    } else if (hero === 'cleric') {
      // Radiant glide breeze + soft harmonic
      this.scheduleTone(ctx, dest, now, {
        type: 'sine',
        from: 360 * pVar,
        to: 840 * pVar,
        duration: 0.14,
        peak: 0.056 * vVar,
        onClean: releaseAll,
      });
    } else {
      // Ranger nimble wind-step
      this.scheduleTone(ctx, dest, now, {
        type: 'sine',
        from: 330 * pVar,
        to: 760 * pVar,
        duration: 0.13,
        peak: 0.058 * vVar,
        onClean: releaseAll,
      });
    }
  }

  public playExplosion(
    kind: ExplosionKind = 'fire',
    radius = 90,
    opts: SpatialSfxOptions = {}
  ): void {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (perfNow - this.lastExplosionSfxAt < 65) return;

    const bus = this.acquireSpatialBus(opts, 76, {
      minDistance: 160,
      maxDistance: 1200,
      panSpread: 560,
    });
    if (!bus) return;

    this.lastExplosionSfxAt = perfNow;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const scale = clamp(radius / 95, 0.72, 1.35);
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.06);
    const vVar = (opts.volume ?? 1) * randJitter(1, 0.08);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    // Layer 1: Sub-bass detonation punch
    this.scheduleTone(ctx, dest, now, {
      type: 'sine',
      from: (kind === 'void' ? 95 : 135) * pVar,
      to: 28 * pVar,
      duration: 0.28 * scale,
      peak: 0.135 * vVar,
    });

    // Layer 2: Combustion / shockwave roar
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'lowpass',
      fromFreq: (kind === 'frost' ? 3200 : kind === 'holy' ? 2800 : 1900) * pVar,
      toFreq: 85,
      q: 0.85,
      duration: 0.34 * scale,
      peak: 0.115 * vVar,
      onClean: kind !== 'frost' && kind !== 'holy' && kind !== 'arcane' ? releaseAll : undefined,
    });

    // Layer 3: Elemental tail (ice shatter / celestial ring / arcane spark)
    if (kind === 'frost' || kind === 'holy' || kind === 'arcane') {
      this.scheduleTone(ctx, dest, now + 0.02, {
        type: kind === 'frost' ? 'triangle' : 'sine',
        from: (kind === 'frost' ? 1680 : kind === 'holy' ? 980 : 720) * pVar,
        to: (kind === 'frost' ? 840 : 490) * pVar,
        duration: 0.24,
        peak: 0.042 * vVar,
        onClean: releaseAll,
      });
    }
  }

  public playPropBreak(kind = 'crate', opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, 40, {
      minDistance: 110,
      maxDistance: 860,
      panSpread: 480,
    });
    if (!bus) return;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = randJitter(1, 0.08);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    if (kind === 'chest' || kind === 'relic_chest') {
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: 640 * pVar,
        to: 960 * pVar,
        duration: 0.11,
        peak: 0.055,
      });
      this.scheduleTone(ctx, dest, now + 0.04, {
        type: 'sine',
        from: 1280 * pVar,
        duration: 0.14,
        peak: 0.036,
        onClean: releaseAll,
      });
      return;
    }

    // Wooden crate shatter crunch
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'bandpass',
      fromFreq: 1400 * pVar,
      toFreq: 380 * pVar,
      q: 1.4,
      duration: 0.12,
      peak: 0.075,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'triangle',
      from: 230 * pVar,
      to: 85 * pVar,
      duration: 0.095,
      peak: 0.058,
      onClean: releaseAll,
    });
  }

  // ==========================================
  // PROCEDURAL FOOTSTEPS (SURFACES + CLASS + SYNC)
  // ==========================================

  public playFootstep(opts: PlayFootstepOptions = {}): void {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const actorKey = opts.playerId || (opts.isLocal === false ? 'remote' : 'local');
    const isRunning = Boolean(opts.isRunning || (opts.speed ?? 0) > 215);
    const minCooldown = isRunning ? 85 : 115;
    const lastStepAt = this.lastFootstepSfxByActor.get(actorKey) ?? 0;
    if (perfNow - lastStepAt < minCooldown) return;

    const bus = this.acquireSpatialBus(opts, opts.isLocal === false ? 20 : 35, {
      minDistance: 95,
      maxDistance: 720,
      panSpread: 440,
    });
    if (!bus) return;

    this.lastFootstepSfxByActor.set(actorKey, perfNow);
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;

    const surface: FootstepSurface = opts.surface ?? 'stone';
    const hero = (opts.heroClass || '').toLowerCase();
    const strideParity = ((opts.strideIndex ?? 0) % 2 === 0) ? 1.0 : 0.94;
    const runGainScale = isRunning ? 1.18 : 0.92;
    const runPitchScale = isRunning ? 1.07 : 1.0;

    const classWeight =
      hero === 'vanguard' ? 1.18 : hero === 'arcanist' ? 0.78 : hero === 'ranger' ? 0.88 : 1.0;
    const classDurationScale =
      hero === 'vanguard' ? 1.1 : hero === 'ranger' ? 0.84 : hero === 'arcanist' ? 0.88 : 1.0;

    const pVar = (opts.pitch ?? 1) * strideParity * runPitchScale * randJitter(1, 0.09);
    const vVar =
      (opts.volume ?? 1) *
      (opts.isLocal === false ? 0.56 : 0.72) *
      runGainScale *
      classWeight *
      randJitter(1, 0.12);
    const dVar = classDurationScale * randJitter(1, 0.08);

    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    if (surface === 'stone') {
      // Crisp mineral tap + firm heel thud
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'bandpass',
        fromFreq: 1850 * pVar,
        toFreq: 860 * pVar,
        q: 1.9,
        duration: 0.038 * dVar,
        peak: 0.028 * vVar,
      });
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: 195 * pVar,
        to: 88 * pVar,
        duration: 0.044 * dVar,
        peak: 0.026 * vVar,
        onClean: hero === 'vanguard' || hero === 'arcanist' || hero === 'cleric' ? undefined : releaseAll,
      });
    } else if (surface === 'dirt') {
      // Granular gritty crunch + soft low weight
      this.scheduleNoise(ctx, dest, now, {
        color: 'brown',
        filterType: 'bandpass',
        fromFreq: 720 * pVar,
        toFreq: 260 * pVar,
        q: 1.2,
        duration: 0.068 * dVar,
        peak: 0.036 * vVar,
      });
      this.scheduleTone(ctx, dest, now + 0.005, {
        type: 'sine',
        from: 118 * pVar,
        to: 58 * pVar,
        duration: 0.052 * dVar,
        peak: 0.024 * vVar,
        onClean: hero === 'vanguard' || hero === 'arcanist' || hero === 'cleric' ? undefined : releaseAll,
      });
    } else if (surface === 'grass') {
      // Soft leaf/blade swish rustle + whisper-light foot plant
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'bandpass',
        fromFreq: 2300 * pVar,
        toFreq: 4100 * pVar,
        q: 1.4,
        duration: 0.078 * dVar,
        attack: 0.009,
        peak: 0.024 * vVar,
      });
      this.scheduleTone(ctx, dest, now + 0.004, {
        type: 'sine',
        from: 105 * pVar,
        to: 64 * pVar,
        duration: 0.042 * dVar,
        peak: 0.014 * vVar,
        onClean: hero === 'vanguard' || hero === 'arcanist' || hero === 'cleric' ? undefined : releaseAll,
      });
    } else if (surface === 'wood') {
      // Warm hollow oak plank thock + subtle scuff
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: 148 * pVar,
        to: 72 * pVar,
        duration: 0.058 * dVar,
        peak: 0.032 * vVar,
      });
      this.scheduleNoise(ctx, dest, now, {
        color: 'brown',
        filterType: 'bandpass',
        fromFreq: 440 * pVar,
        toFreq: 220 * pVar,
        q: 2.3,
        duration: 0.052 * dVar,
        peak: 0.024 * vVar,
        onClean: hero === 'vanguard' || hero === 'arcanist' || hero === 'cleric' ? undefined : releaseAll,
      });
    } else {
      // Metal grates/plates: crisp metallic clink + inharmonic plate resonance
      this.scheduleNoise(ctx, dest, now, {
        color: 'white',
        filterType: 'highpass',
        fromFreq: 3400 * pVar,
        toFreq: 1600 * pVar,
        q: 1.1,
        duration: 0.032 * dVar,
        peak: 0.026 * vVar,
      });
      this.scheduleTone(ctx, dest, now, {
        type: 'triangle',
        from: 790 * pVar,
        to: 540 * pVar,
        duration: 0.068 * dVar,
        peak: 0.022 * vVar,
      });
      this.scheduleTone(ctx, dest, now + 0.002, {
        type: 'sine',
        from: 1340 * pVar,
        to: 1020 * pVar,
        duration: 0.058 * dVar,
        peak: 0.014 * vVar,
        onClean: hero === 'vanguard' || hero === 'arcanist' || hero === 'cleric' ? undefined : releaseAll,
      });
    }

    // Subtle class-specific acoustic texture over the surface step
    if (hero === 'vanguard') {
      // Subtle armor/greave metallic clink
      this.scheduleTone(ctx, dest, now + 0.007, {
        type: 'sine',
        from: 2250 * pVar,
        to: 1750 * pVar,
        duration: 0.032,
        peak: 0.0085 * vVar,
        onClean: releaseAll,
      });
    } else if (hero === 'arcanist') {
      // Subtle airy arcane robe chime whisper
      this.scheduleTone(ctx, dest, now + 0.006, {
        type: 'sine',
        from: 1680 * pVar,
        to: 1920 * pVar,
        duration: 0.045,
        peak: 0.006 * vVar,
        onClean: releaseAll,
      });
    } else if (hero === 'cleric') {
      // Subtle sacred censer charm overtone
      this.scheduleTone(ctx, dest, now + 0.006, {
        type: 'sine',
        from: 1120 * pVar,
        to: 1080 * pVar,
        duration: 0.048,
        peak: 0.007 * vVar,
        onClean: releaseAll,
      });
    }
  }

  /**
   * Immediately halts any ongoing footstep cadence tracking for a player when they stop moving.
   */
  public stopFootstepsForPlayer(playerId?: string): void {
    if (!playerId) {
      this.lastFootstepSfxByActor.clear();
      return;
    }
    this.lastFootstepSfxByActor.delete(playerId);
  }

  // ==========================================
  // DAMAGE, HITS & REWARDS
  // ==========================================

  public playHurt(opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, 88, {
      minDistance: 140,
      maxDistance: 900,
      panSpread: 500,
    });
    if (!bus) return;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = randJitter(1, 0.05);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    this.scheduleTone(ctx, dest, now, {
      type: 'sawtooth',
      from: 178 * pVar,
      to: 44 * pVar,
      duration: 0.165,
      peak: 0.115,
      filterType: 'lowpass',
      filterFreq: 850,
    });

    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'lowpass',
      fromFreq: 700 * pVar,
      toFreq: 130,
      duration: 0.13,
      peak: 0.095,
      onClean: releaseAll,
    });
  }

  public playShieldBreak(opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, 82, {
      minDistance: 140,
      maxDistance: 960,
      panSpread: 520,
    });
    if (!bus) return;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = randJitter(1, 0.045);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'highpass',
      fromFreq: 3800 * pVar,
      toFreq: 1100,
      duration: 0.14,
      peak: 0.055,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'triangle',
      from: 1060 * pVar,
      to: 270 * pVar,
      duration: 0.19,
      peak: 0.08,
      onClean: releaseAll,
    });
  }

  public playPlayerDowned(opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, 95, {
      minDistance: 180,
      maxDistance: 1200,
      panSpread: 540,
    });
    if (!bus) return;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    [220, 185, 146.83, 110].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.095, {
        type: 'sawtooth',
        from: freq,
        to: freq * 0.95,
        duration: 0.23,
        peak: 0.068,
        filterType: 'lowpass',
        filterFreq: 950,
        onClean: i === 3 ? releaseAll : undefined,
      });
    });
  }

  public playEnemyHit(isCrit = false, opts: PlayHitOptions = {}): void {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (isCrit) {
      if (perfNow - this.lastEnemyCritSfxAt < 40) return;
    } else if (perfNow - this.lastEnemyHitSfxAt < 40) {
      return;
    }

    const bus = this.acquireSpatialBus(opts, isCrit ? 70 : 52, {
      minDistance: 130,
      maxDistance: 960,
      panSpread: 520,
    });
    if (!bus) return;

    if (isCrit) {
      this.lastEnemyCritSfxAt = perfNow;
      this.lastEnemyHitSfxAt = perfNow;
    } else {
      this.lastEnemyHitSfxAt = perfNow;
    }

    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const cat = (opts.damageCategory || 'physical').toLowerCase();
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.08);
    const vVar = (opts.volume ?? 1) * randJitter(1, 0.1);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    // Layer 1: Tactile hit thud
    this.scheduleTone(ctx, dest, now, {
      type: 'triangle',
      from: (isCrit ? 485 : 345) * pVar,
      to: 105 * pVar,
      duration: 0.088,
      peak: (isCrit ? 0.088 : 0.066) * vVar,
    });

    // Layer 2: Impact texture based on damage category
    this.scheduleNoise(ctx, dest, now, {
      color: cat === 'fire' || cat === 'poison' ? 'brown' : 'white',
      filterType: cat === 'frost' || cat === 'lightning' ? 'highpass' : 'bandpass',
      fromFreq:
        (cat === 'frost' ? 3800 : cat === 'lightning' ? 4400 : cat === 'fire' ? 1200 : 2100) * pVar,
      toFreq: 520 * pVar,
      q: 1.5,
      duration: 0.055,
      peak: (isCrit ? 0.048 : 0.032) * vVar,
      onClean: !isCrit && cat === 'physical' ? releaseAll : undefined,
    });

    // Layer 3: Damage-type signature / Critical metallic ring
    if (isCrit) {
      this.scheduleTone(ctx, dest, now + 0.004, {
        type: 'square',
        from: 1340 * pVar,
        to: 980 * pVar,
        duration: 0.145,
        peak: 0.042 * vVar,
        filterType: 'lowpass',
        filterFreq: 3200,
        onClean: releaseAll,
      });
    } else if (cat === 'frost') {
      this.scheduleTone(ctx, dest, now + 0.005, {
        type: 'sine',
        from: 1760 * pVar,
        to: 1180 * pVar,
        duration: 0.09,
        peak: 0.026 * vVar,
        onClean: releaseAll,
      });
    } else if (cat === 'lightning') {
      this.scheduleTone(ctx, dest, now + 0.004, {
        type: 'square',
        from: 1580 * pVar,
        to: 540 * pVar,
        duration: 0.07,
        peak: 0.025 * vVar,
        onClean: releaseAll,
      });
    } else if (cat === 'holy' || cat === 'radiant' || cat === 'arcane') {
      this.scheduleTone(ctx, dest, now + 0.005, {
        type: 'sine',
        from: (cat === 'arcane' ? 860 : 1040) * pVar,
        to: 640 * pVar,
        duration: 0.1,
        peak: 0.026 * vVar,
        onClean: releaseAll,
      });
    }
  }

  public playHeal(opts: SpatialSfxOptions = {}): void {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (perfNow - this.lastHealSfxAt < 75) return;

    const bus = this.acquireSpatialBus(opts, 55, {
      minDistance: 140,
      maxDistance: 920,
      panSpread: 500,
    });
    if (!bus) return;
    this.lastHealSfxAt = perfNow;

    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = randJitter(1, 0.03);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.scheduleTone(ctx, dest, now + idx * 0.048, {
        type: 'sine',
        from: freq * pVar,
        duration: 0.165,
        peak: 0.058,
        onClean: idx === notes.length - 1 ? releaseAll : undefined,
      });
    });
  }

  public playCoin(opts: SpatialSfxOptions = {}): void {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (perfNow - this.lastCoinSfxAt < 45) return;

    const bus = this.acquireSpatialBus(opts, 45, {
      minDistance: 140,
      maxDistance: 900,
      panSpread: 480,
    });
    if (!bus) return;
    this.lastCoinSfxAt = perfNow;

    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = randJitter(1, 0.055);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };

    this.scheduleTone(ctx, dest, now, {
      type: 'triangle',
      from: 987.77 * pVar,
      duration: 0.055,
      peak: 0.044,
    });
    this.scheduleTone(ctx, dest, now + 0.048, {
      type: 'sine',
      from: 1318.51 * pVar,
      duration: 0.145,
      peak: 0.046,
      onClean: releaseAll,
    });
  }

  public playRelicChime(opts: SpatialSfxOptions = {}): void {
    const bus = this.acquireSpatialBus(opts, 75, {
      minDistance: 160,
      maxDistance: 1100,
      panSpread: 540,
    });
    if (!bus) return;
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;
    const now = ctx.currentTime;
    const pVar = randJitter(1, 0.025);
    const releaseAll = () => {
      doneVoice();
      route.release();
    };
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.068, {
        type: 'triangle',
        from: freq * pVar,
        duration: 0.25,
        peak: 0.068,
        onClean: i === notes.length - 1 ? releaseAll : undefined,
      });
    });
  }

  // ==========================================
  // BOSS ABILITY SFX — FLOORS 1 TO 10
  // ==========================================

  public playBossAbility(boss: string, ability: string, opts: SpatialSfxOptions = {}): void {
    const key = `${boss.toLowerCase()}_${ability.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '_')}`;
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lastAt = this.lastBossSfxByKey.get(key) ?? 0;
    if (perfNow - lastAt < 85) return;

    const bus = this.acquireSpatialBus(opts, 92, {
      minDistance: 220,
      maxDistance: 1450,
      panSpread: 650,
    });
    if (!bus) return;

    this.lastBossSfxByKey.set(key, perfNow);
    const { ctx, route, doneVoice } = bus;
    const dest = route.destination;

    if (
      playBossAbilitySfx(ctx, dest, boss, ability, {
        pan: route.pan,
        gainScale: opts.volume ?? 1,
        pitchScale: opts.pitch ?? 1,
      })
    ) {
      const releaseTimer = setTimeout(() => {
        doneVoice();
        route.release();
      }, 950);
      if (typeof (releaseTimer as unknown as { unref?: () => void }).unref === 'function') {
        (releaseTimer as unknown as { unref: () => void }).unref();
      }
      return;
    }

    const releaseAll = () => {
      doneVoice();
      route.release();
    };
    const pVar = (opts.pitch ?? 1) * randJitter(1, 0.04);
    const vVar = (opts.volume ?? 1) * randJitter(1, 0.06);

    switch (key) {
      // ——— FLOOR 6: Elyndor, Keeper of the Last Hymn ———
      case 'elyndor_resonant_crescendo':
        this.playElyndorResonantCrescendo(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'elyndor_lament_of_the_forgotten':
        this.playElyndorLamentOfTheForgotten(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'elyndor_divine_chorus_beams':
        this.playElyndorDivineChorusBeams(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'elyndor_chorus_of_remembrance':
        this.playElyndorChorusOfRemembrance(ctx, dest, pVar, vVar, releaseAll);
        break;

      // ——— FLOOR 7: Zadkiel, Keeper of the Ashen Reliquary ———
      case 'zadkiel_ashen_procession':
        this.playZadkielAshenProcession(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'zadkiel_chain_of_the_departed':
        this.playZadkielChainOfTheDeparted(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'zadkiel_reliquary_awakening':
        this.playZadkielReliquaryAwakening(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'zadkiel_judgment_of_the_departed':
        this.playZadkielJudgmentOfTheDeparted(ctx, dest, pVar, vVar, releaseAll);
        break;

      // ——— FLOOR 8: Sariel, Warden of the Veiled Scripture ———
      case 'sariel_scripture_of_binding':
        this.playSarielScriptureOfBinding(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'sariel_forbidden_verses':
        this.playSarielForbiddenVerses(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'sariel_seal_of_silence':
        this.playSarielSealOfSilence(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'sariel_heretical_volley':
        this.playSarielHereticalVolley(ctx, dest, pVar, vVar, releaseAll);
        break;

      // ——— FLOOR 9: Seraphel, Sentinel of the Final Seal ———
      case 'seraphel_heavens_piercing_line':
      case 'seraphel_heavens_piercing_line!':
        this.playSeraphelHeavensPiercingLine(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'seraphel_lancefall_sequence':
        this.playSeraphelLancefallSequence(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'seraphel_aerial_judgment':
        this.playSeraphelAerialJudgment(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'seraphel_sentinel_spearfall_cascade':
        this.playSeraphelSentinelSpearfallCascade(ctx, dest, pVar, vVar, releaseAll);
        break;

      // ——— FLOOR 10: Oriphiel, The Last Warden ———
      case 'oriphiel_wardens_edict':
      case 'oriphiel_wardens_edict!_find_safe_quadrant!':
        this.playOriphielWardensEdict(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'oriphiel_unbroken_judgment':
      case 'oriphiel_unbroken_judgment!_(aegis_parry)':
        this.playOriphielUnbrokenJudgment(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'oriphiel_the_final_verdict_combo':
        this.playOriphielTheFinalVerdictCombo(ctx, dest, pVar, vVar, releaseAll);
        break;
      case 'oriphiel_bastion_ground_shatter':
        this.playOriphielBastionGroundShatter(ctx, dest, pVar, vVar, releaseAll);
        break;

      default:
        releaseAll();
        console.warn(`[sfx] Unknown boss ability: ${boss} / ${ability}`);
    }
  }

  // ——— FLOOR 6: Elyndor (Sacred Cathedral Hymn, Golden Organ & Bell Resonance) ———

  private playElyndorResonantCrescendo(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleTone(ctx, dest, now, {
      type: 'sine',
      from: 130.81 * p,
      to: 65.4 * p,
      duration: 0.52,
      peak: 0.11 * v,
    });
    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'bandpass',
      fromFreq: 680 * p,
      toFreq: 2400 * p,
      q: 2.8,
      duration: 0.45,
      peak: 0.048 * v,
    });
    [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.07, {
        type: 'triangle',
        from: freq * p,
        to: freq * p * 1.03,
        duration: 0.56,
        peak: 0.072 * v,
        onClean: i === 3 ? onDone : undefined,
      });
    });
  }

  private playElyndorLamentOfTheForgotten(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'bandpass',
      fromFreq: 1400 * p,
      toFreq: 320 * p,
      q: 3.2,
      duration: 0.65,
      peak: 0.052 * v,
    });
    [440, 293.66].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.04, {
        type: i === 0 ? 'sine' : 'triangle',
        from: freq * p,
        to: freq * p * 0.52,
        duration: 0.68,
        peak: (0.068 - i * 0.018) * v,
        onClean: i === 1 ? onDone : undefined,
      });
    });
  }

  private playElyndorDivineChorusBeams(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'highpass',
      fromFreq: 4800 * p,
      toFreq: 1600 * p,
      duration: 0.36,
      peak: 0.045 * v,
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.045, {
        type: 'sine',
        from: freq * p,
        to: freq * p * 1.18,
        duration: 0.42,
        peak: 0.058 * v,
        onClean: i === 3 ? onDone : undefined,
      });
    });
  }

  private playElyndorChorusOfRemembrance(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.06;
      this.scheduleTone(ctx, dest, t, {
        type: i % 2 === 0 ? 'triangle' : 'sine',
        from: (340 + i * 58) * p,
        to: (175 + i * 18) * p,
        duration: 0.3,
        peak: 0.052 * v,
        onClean: i === 5 ? onDone : undefined,
      });
    }
  }

  // ——— FLOOR 7: Zadkiel (Ashen Reliquary, Heavy Iron Chains & Deep Censer Tolls) ———

  private playZadkielAshenProcession(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'lowpass',
      fromFreq: 760 * p,
      toFreq: 110 * p,
      q: 1.1,
      duration: 0.56,
      peak: 0.125 * v,
    });
    this.scheduleTone(ctx, dest, now + 0.03, {
      type: 'sine',
      from: 112 * p,
      to: 46 * p,
      duration: 0.48,
      peak: 0.092 * v,
      onClean: onDone,
    });
  }

  private playZadkielChainOfTheDeparted(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.068;
      this.scheduleNoise(ctx, dest, t, {
        color: 'white',
        filterType: 'highpass',
        fromFreq: 3600 * p,
        toFreq: 1200 * p,
        duration: 0.075,
        peak: 0.045 * v,
      });
      this.scheduleTone(ctx, dest, t, {
        type: 'triangle',
        from: (620 - i * 48) * p,
        to: 165 * p,
        duration: 0.14,
        peak: 0.062 * v,
        onClean: i === 3 ? onDone : undefined,
      });
    }
  }

  private playZadkielReliquaryAwakening(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'bandpass',
      fromFreq: 220 * p,
      toFreq: 1400 * p,
      q: 1.5,
      duration: 0.58,
      peak: 0.078 * v,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'sawtooth',
      from: 82 * p,
      to: 245 * p,
      duration: 0.58,
      peak: 0.092 * v,
      filterType: 'lowpass',
      filterFreq: 1150,
    });
    this.scheduleTone(ctx, dest, now + 0.14, {
      type: 'sine',
      from: 587.33 * p,
      to: 572 * p,
      duration: 0.48,
      peak: 0.048 * v,
      onClean: onDone,
    });
  }

  private playZadkielJudgmentOfTheDeparted(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleTone(ctx, dest, now, {
      type: 'sawtooth',
      from: 148 * p,
      to: 34 * p,
      duration: 0.52,
      peak: 0.125 * v,
      filterType: 'lowpass',
      filterFreq: 900,
    });
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'lowpass',
      fromFreq: 1800 * p,
      toFreq: 95,
      duration: 0.45,
      peak: 0.105 * v,
      onClean: onDone,
    });
  }

  // ——— FLOOR 8: Sariel (Veiled Scripture, Tome Whisper, Arcane Seals & Silence) ———

  private playSarielScriptureOfBinding(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'bandpass',
      fromFreq: 2800 * p,
      toFreq: 720 * p,
      q: 2.6,
      duration: 0.36,
      peak: 0.052 * v,
    });
    [600, 900].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.02, {
        type: 'triangle',
        from: freq * p,
        to: (freq * 0.35) * p,
        duration: 0.4,
        peak: (0.068 - i * 0.024) * v,
        onClean: i === 1 ? onDone : undefined,
      });
    });
  }

  private playSarielForbiddenVerses(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const t = now + i * 0.055;
      this.scheduleNoise(ctx, dest, t, {
        color: 'white',
        filterType: 'bandpass',
        fromFreq: (2200 + i * 240) * p,
        toFreq: 750 * p,
        q: 2.2,
        duration: 0.1,
        peak: 0.032 * v,
      });
      this.scheduleTone(ctx, dest, t, {
        type: 'sawtooth',
        from: (310 + i * 58) * p,
        to: 95 * p,
        duration: 0.16,
        peak: 0.052 * v,
        filterType: 'lowpass',
        filterFreq: 1600,
        onClean: i === 4 ? onDone : undefined,
      });
    }
  }

  private playSarielSealOfSilence(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'bandpass',
      fromFreq: 4200 * p,
      toFreq: 190 * p,
      q: 3.4,
      duration: 0.36,
      peak: 0.058 * v,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'sine',
      from: 1180 * p,
      to: 88 * p,
      duration: 0.38,
      peak: 0.088 * v,
      onClean: onDone,
    });
  }

  private playSarielHereticalVolley(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.042;
      this.scheduleTone(ctx, dest, t, {
        type: i % 2 === 0 ? 'square' : 'triangle',
        from: (420 + i * 38) * p,
        to: 145 * p,
        duration: 0.125,
        peak: 0.042 * v,
        filterType: 'lowpass',
        filterFreq: 1900,
        onClean: i === 5 ? onDone : undefined,
      });
    }
  }

  // ——— FLOOR 9: Seraphel (Radiant Spears, Aerial Sonic Booms, Divine Choir) ———

  private playSeraphelHeavensPiercingLine(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'bandpass',
      fromFreq: 4600 * p,
      toFreq: 680 * p,
      q: 1.8,
      duration: 0.42,
      peak: 0.082 * v,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'sawtooth',
      from: 890 * p,
      to: 165 * p,
      duration: 0.48,
      peak: 0.105 * v,
      filterType: 'lowpass',
      filterFreq: 2400,
    });
    this.scheduleTone(ctx, dest, now + 0.01, {
      type: 'sine',
      from: 1760 * p,
      to: 880 * p,
      duration: 0.32,
      peak: 0.045 * v,
      onClean: onDone,
    });
  }

  private playSeraphelLancefallSequence(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const t = now + i * 0.068;
      this.scheduleNoise(ctx, dest, t, {
        color: 'white',
        filterType: 'highpass',
        fromFreq: 3800 * p,
        toFreq: 1200 * p,
        duration: 0.09,
        peak: 0.04 * v,
      });
      this.scheduleTone(ctx, dest, t, {
        type: 'triangle',
        from: (680 - i * 48) * p,
        to: 118 * p,
        duration: 0.16,
        peak: 0.074 * v,
        onClean: i === 4 ? onDone : undefined,
      });
    }
  }

  private playSeraphelAerialJudgment(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'bandpass',
      fromFreq: 520 * p,
      toFreq: 2800 * p,
      q: 1.5,
      duration: 0.42,
      peak: 0.072 * v,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'sawtooth',
      from: 210 * p,
      to: 760 * p,
      duration: 0.25,
      peak: 0.092 * v,
      filterType: 'lowpass',
      filterFreq: 2100,
    });
    this.scheduleTone(ctx, dest, now + 0.24, {
      type: 'sine',
      from: 320 * p,
      to: 58 * p,
      duration: 0.34,
      peak: 0.11 * v,
      onClean: onDone,
    });
  }

  private playSeraphelSentinelSpearfallCascade(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.042;
      this.scheduleTone(ctx, dest, t, {
        type: i % 2 === 0 ? 'sawtooth' : 'triangle',
        from: (720 - i * 32) * p,
        to: 145 * p,
        duration: 0.125,
        peak: 0.052 * v,
        filterType: 'lowpass',
        filterFreq: 2200,
        onClean: i === 7 ? onDone : undefined,
      });
    }
  }

  // ——— FLOOR 10: Oriphiel, The Last Warden (Sanctuary Brass, Parry Clangs, Tectonic Judgment) ———

  private playOriphielWardensEdict(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'lowpass',
      fromFreq: 1600 * p,
      toFreq: 240,
      duration: 0.55,
      peak: 0.08 * v,
    });
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      this.scheduleTone(ctx, dest, now + i * 0.015, {
        type: i < 2 ? 'triangle' : 'sine',
        from: freq * p,
        to: freq * p * 0.99,
        duration: 0.56,
        peak: (0.058 - i * 0.01) * v,
        onClean: i === 3 ? onDone : undefined,
      });
    });
  }

  private playOriphielUnbrokenJudgment(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleNoise(ctx, dest, now, {
      color: 'white',
      filterType: 'highpass',
      fromFreq: 4200 * p,
      toFreq: 1200 * p,
      duration: 0.16,
      peak: 0.058 * v,
    });
    this.scheduleTone(ctx, dest, now, {
      type: 'triangle',
      from: 880 * p,
      to: 440 * p,
      duration: 0.24,
      peak: 0.092 * v,
    });
    this.scheduleTone(ctx, dest, now + 0.08, {
      type: 'sine',
      from: 320 * p,
      to: 95 * p,
      duration: 0.34,
      peak: 0.088 * v,
      onClean: onDone,
    });
  }

  private playOriphielTheFinalVerdictCombo(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    [0, 0.145, 0.29].forEach((delay, i) => {
      const t = now + delay;
      this.scheduleNoise(ctx, dest, t, {
        color: 'brown',
        filterType: 'bandpass',
        fromFreq: (1500 + i * 350) * p,
        toFreq: 260 * p,
        q: 1.5,
        duration: 0.18,
        peak: 0.078 * v,
      });
      this.scheduleTone(ctx, dest, t, {
        type: 'sawtooth',
        from: (150 + i * 55) * p,
        to: 38 * p,
        duration: 0.26,
        peak: 0.105 * v,
        filterType: 'lowpass',
        filterFreq: 1250,
        onClean: i === 2 ? onDone : undefined,
      });
    });
  }

  private playOriphielBastionGroundShatter(
    ctx: AudioContext,
    dest: AudioNode,
    p: number,
    v: number,
    onDone: () => void
  ): void {
    const now = ctx.currentTime;
    this.scheduleTone(ctx, dest, now, {
      type: 'sine',
      from: 95 * p,
      to: 24 * p,
      duration: 0.72,
      peak: 0.16 * v,
    });
    this.scheduleTone(ctx, dest, now + 0.01, {
      type: 'sawtooth',
      from: 78 * p,
      to: 20 * p,
      duration: 0.65,
      peak: 0.095 * v,
      filterType: 'lowpass',
      filterFreq: 680,
    });
    this.scheduleNoise(ctx, dest, now, {
      color: 'brown',
      filterType: 'lowpass',
      fromFreq: 1300 * p,
      toFreq: 55,
      duration: 0.78,
      peak: 0.14 * v,
      onClean: onDone,
    });
  }

  // ==========================================
  // FLOOR & TAVERN AMBIENT SOUNDSCAPES
  // ==========================================

  /**
   * Starts unique atmospheric ambient soundscapes for Floor 0 (Tavern) and Floors 1–10.
   * Safe against repeated calls on the same floor and cleans up cleanly on transitions.
   */
  public startFloorAmbience(floor: number, biome?: string, forceUnmute = false): void {
    if (forceUnmute) {
      soundManager.setMasterMuted(false);
      soundManager.setMusicMuted(false);
    }
    if (soundManager.isMasterMuted() || soundManager.isMusicMuted()) return;

    const resolvedBiome = (biome || (floor === 0 ? 'tavern' : 'courtyard')).toLowerCase();
    if (
      this.ambientSession &&
      this.ambientSession.active &&
      this.ambientSession.floor === floor &&
      this.ambientSession.biome === resolvedBiome
    ) {
      return;
    }

    // Stop any previous floor ambience immediately before starting the new one
    this.stopFloorAmbience(0.2);

    const ctx = soundManager.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (floor === 0) {
      this.startTavernAmbience(false);
      return;
    }

    const dest = soundManager.getMusicDestination() || this.getDestination();
    if (!dest) return;

    const now = ctx.currentTime;
    const sessionGain = ctx.createGain();
    sessionGain.gain.setValueAtTime(0.001, now);
    sessionGain.gain.linearRampToValueAtTime(0.14, now + 0.85);
    sessionGain.connect(dest);

    const session: AmbientSession = {
      floor,
      biome: resolvedBiome,
      gain: sessionGain,
      sources: [],
      oscillators: [],
      nodesToDisconnect: [sessionGain],
      musicInterval: null,
      accentInterval: null,
      active: true,
    };
    this.ambientSession = session;

    // 1. Procedural biome-colored ambient air / cavern / furnace loop (4s seamless buffer)
    const sr = ctx.sampleRate || 44100;
    const len = sr * 4;
    const loopBuf = ctx.createBuffer(1, len, sr);
    const ch = loopBuf.getChannelData(0);
    let last = 0;
    const isEmber = resolvedBiome === 'ember' || floor === 3;
    const isVoid = resolvedBiome === 'void' || floor === 4;
    const isReliquary = resolvedBiome === 'reliquary' || floor === 7;
    const crackleChance = isEmber ? 0.0025 : isReliquary ? 0.0005 : 0;

    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      const smooth = isVoid ? 0.012 : isEmber ? 0.025 : 0.02;
      last = (last + smooth * w) / (1 + smooth);
      let burst = 0;
      if (crackleChance > 0 && Math.random() < crackleChance) {
        burst = (Math.random() * 2 - 1) * (isEmber ? 0.65 : 0.25);
      }
      ch[i] = clamp(last * 1.45 + burst, -1, 1);
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = loopBuf;
    noiseSrc.loop = true;

    const filter = ctx.createBiquadFilter();
    const filterMap: Record<string, { type: BiquadFilterType; freq: number; q: number }> = {
      courtyard: { type: 'bandpass', freq: 520, q: 0.7 },
      catacombs: { type: 'lowpass', freq: 380, q: 1.1 },
      ember: { type: 'lowpass', freq: 440, q: 0.9 },
      void: { type: 'lowpass', freq: 240, q: 1.4 },
      astral: { type: 'bandpass', freq: 720, q: 0.8 },
      hymns: { type: 'bandpass', freq: 430, q: 1.2 },
      reliquary: { type: 'lowpass', freq: 340, q: 1.0 },
      scripture: { type: 'bandpass', freq: 620, q: 1.1 },
      nave: { type: 'bandpass', freq: 780, q: 0.9 },
      wardengate: { type: 'lowpass', freq: 390, q: 1.1 },
    };
    const fSpec = filterMap[resolvedBiome] || filterMap.courtyard;
    filter.type = fSpec.type;
    filter.frequency.setValueAtTime(fSpec.freq, now);
    filter.Q.setValueAtTime(fSpec.q, now);

    // Subtle slow breeze LFO modulating ambient filter cutoff
    const breezeLfo = ctx.createOscillator();
    const breezeDepth = ctx.createGain();
    breezeLfo.frequency.setValueAtTime(0.11, now);
    breezeDepth.gain.setValueAtTime(fSpec.freq * 0.22, now);
    breezeLfo.connect(breezeDepth);
    breezeDepth.connect(filter.frequency);
    breezeLfo.start(now);

    noiseSrc.connect(filter);
    filter.connect(sessionGain);
    noiseSrc.start(now);

    session.sources.push(noiseSrc);
    session.oscillators.push(breezeLfo);
    session.nodesToDisconnect.push(noiseSrc, filter, breezeLfo, breezeDepth);

    // 2. Subtle tonal pad specific to the dungeon floor's mood
    const padFreqs: Record<string, number[]> = {
      courtyard: [146.83, 220.0],
      catacombs: [110.0, 164.81, 246.94],
      ember: [73.42, 110.0],
      void: [55.0, 82.41, 116.54],
      astral: [220.0, 329.63, 493.88],
      hymns: [196.0, 293.66, 349.23],
      reliquary: [98.0, 146.83],
      scripture: [146.83, 220.0, 311.13],
      nave: [261.63, 392.0, 587.33],
      wardengate: [82.41, 123.47, 164.81],
    };
    const chord = padFreqs[resolvedBiome] || [146.83, 220.0];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = isVoid || isEmber ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.016 / (1 + idx * 0.35), now);
      osc.connect(g);
      g.connect(sessionGain);
      osc.start(now);
      session.oscillators.push(osc);
      session.nodesToDisconnect.push(osc, g);
    });

    // 3. Sparse procedural floor accents (water drips, distant bells, astral chimes, stone creaks)
    if (typeof window !== 'undefined') {
      const emitAccent = () => {
        if (!session.active || soundManager.isMasterMuted() || soundManager.isMusicMuted()) return;
        const c = soundManager.ensureContext();
        if (!c || c.state === 'suspended') return;
        const t = c.currentTime + 0.02;

        if (resolvedBiome === 'catacombs' || floor === 2) {
          // Cavern water droplet ping
          const drop = randRange(1150, 1680);
          this.scheduleTone(c, sessionGain, t, {
            type: 'sine',
            from: drop,
            to: drop * 1.32,
            duration: 0.14,
            peak: 0.024,
          });
        } else if (resolvedBiome === 'astral' || resolvedBiome === 'nave' || floor === 5 || floor === 9) {
          // Ethereal starlight chime
          const note = pickOne([659.25, 783.99, 987.77, 1174.66, 1318.51]);
          this.scheduleTone(c, sessionGain, t, {
            type: 'sine',
            from: note,
            to: note * 1.005,
            duration: 0.65,
            peak: 0.018,
          });
        } else if (resolvedBiome === 'reliquary' || resolvedBiome === 'hymns' || floor === 6 || floor === 7) {
          // Distant temple/reliquary toll
          const bell = pickOne([293.66, 349.23, 392.0]);
          this.scheduleTone(c, sessionGain, t, {
            type: 'triangle',
            from: bell,
            to: bell * 0.99,
            duration: 0.9,
            peak: 0.02,
          });
        } else if (resolvedBiome === 'void' || resolvedBiome === 'scripture' || floor === 4 || floor === 8) {
          // Arcane whisper sweep
          this.scheduleNoise(c, sessionGain, t, {
            color: 'white',
            filterType: 'bandpass',
            fromFreq: randRange(900, 1800),
            toFreq: randRange(320, 620),
            q: 3.2,
            duration: 0.55,
            peak: 0.018,
          });
        } else {
          // Courtyard wind gust / ember ash / wardengate iron creak
          this.scheduleNoise(c, sessionGain, t, {
            color: 'brown',
            filterType: 'bandpass',
            fromFreq: randRange(280, 640),
            toFreq: randRange(180, 420),
            q: 1.5,
            duration: 0.65,
            peak: 0.022,
          });
        }
      };

      const intervalMs = resolvedBiome === 'catacombs' ? 2800 : 4200;
      const timer = setInterval(emitAccent, intervalMs);
      if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
        (timer as unknown as { unref: () => void }).unref();
      }
      session.accentInterval = timer;
    }
  }

  public stopFloorAmbience(fadeSec = 0.45): void {
    const session = this.ambientSession;
    if (!session) return;
    this.ambientSession = null;
    session.active = false;

    if (session.musicInterval !== null) {
      clearInterval(session.musicInterval);
      session.musicInterval = null;
    }
    if (session.accentInterval !== null) {
      clearInterval(session.accentInterval);
      session.accentInterval = null;
    }

    const cleanupNow = () => {
      for (const src of session.sources) {
        try {
          src.stop();
        } catch {
          // ignore
        }
      }
      for (const osc of session.oscillators) {
        try {
          osc.stop();
        } catch {
          // ignore
        }
      }
      safeDisconnect(session.nodesToDisconnect);
    };

    const ctx = soundManager.getAudioContext();
    if (ctx && fadeSec > 0.02) {
      try {
        const now = ctx.currentTime;
        session.gain.gain.setValueAtTime(session.gain.gain.value || 0.05, now);
        session.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        const timer = setTimeout(cleanupNow, Math.ceil(fadeSec * 1000) + 40);
        if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
          (timer as unknown as { unref: () => void }).unref();
        }
        return;
      } catch {
        // fallback immediate cleanup
      }
    }
    cleanupNow();
  }

  /**
   * Floor 0 Tavern Ambience: crackling fireplace hearth, soft tavern chatter & lute/flute music.
   */
  public startTavernAmbience(forceUnmute = false): void {
    if (forceUnmute) {
      soundManager.setMasterMuted(false);
      soundManager.setMusicMuted(false);
    }
    if (soundManager.isMasterMuted() || soundManager.isMusicMuted()) return;
    if (this.ambientSession?.active && this.ambientSession.floor === 0) return;

    this.stopFloorAmbience(0.2);

    const ctx = soundManager.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const dest = soundManager.getMusicDestination() || this.getDestination();
    if (!dest) return;

    const now = ctx.currentTime;
    const ambientGain = ctx.createGain();
    ambientGain.gain.setValueAtTime(0.001, now);
    ambientGain.gain.linearRampToValueAtTime(0.18, now + 0.6);
    ambientGain.connect(dest);

    const session: AmbientSession = {
      floor: 0,
      biome: 'tavern',
      gain: ambientGain,
      sources: [],
      oscillators: [],
      nodesToDisconnect: [ambientGain],
      musicInterval: null,
      accentInterval: null,
      active: true,
    };
    this.ambientSession = session;

    // 1. Fireplace Hearth Crackle & Wood Pop Sparks
    const sampleRate = ctx.sampleRate || 44100;
    const bufferSize = sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03;

      let crackle = 0;
      const rand = Math.random();
      if (rand < 0.0018) {
        crackle = (Math.random() * 2 - 1) * 0.95;
      } else if (rand < 0.007) {
        crackle = (Math.random() * 2 - 1) * 0.45;
      }
      channelData[i] = clamp(lastOut * 0.45 + crackle, -1, 1);
    }

    const ambientSource = ctx.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;

    const ambientFilter = ctx.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.setValueAtTime(580, now);

    ambientSource.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientSource.start(now);

    session.sources.push(ambientSource);
    session.nodesToDisconnect.push(ambientSource, ambientFilter);

    // 2. Low-volume Distant Tavern Crowd Murmur Chord (fixed lfoGain connection)
    const chord = [130.81, 164.81, 196.0, 246.94];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.18 + idx * 0.12, now);
      lfoGain.gain.setValueAtTime(2.2, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);

      oscGain.gain.setValueAtTime(0.006, now);
      osc.connect(oscGain);
      oscGain.connect(ambientGain);
      osc.start(now);

      session.oscillators.push(osc, lfo);
      session.nodesToDisconnect.push(osc, oscGain, lfo, lfoGain);
    });

    // 3. Medieval Tavern Lute & Flute Folk Music Loop
    this.startTavernMusic(session);
  }

  public startTavernMusic(existingSession?: AmbientSession): void {
    const session = existingSession ?? this.ambientSession;
    if (!session || !session.active || session.musicInterval !== null) return;

    const acousticChords = [
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [130.81, 164.81, 196.0, 246.94],
      [196.0, 246.94, 293.66, 349.23],
    ];

    const melodyPhrases = [
      [
        { note: 440.0, dur: 0.6, delay: 0.0 },
        { note: 523.25, dur: 0.5, delay: 0.6 },
        { note: 659.25, dur: 0.9, delay: 1.1 },
        { note: 587.33, dur: 0.5, delay: 2.0 },
        { note: 523.25, dur: 0.8, delay: 2.5 },
        { note: 440.0, dur: 1.1, delay: 3.3 },
        { note: 392.0, dur: 0.6, delay: 4.4 },
        { note: 440.0, dur: 1.0, delay: 5.0 },
      ],
      [
        { note: 659.25, dur: 0.7, delay: 0.0 },
        { note: 698.46, dur: 0.5, delay: 0.7 },
        { note: 659.25, dur: 0.8, delay: 1.2 },
        { note: 587.33, dur: 0.6, delay: 2.0 },
        { note: 523.25, dur: 0.9, delay: 2.6 },
        { note: 493.88, dur: 0.6, delay: 3.5 },
        { note: 440.0, dur: 0.8, delay: 4.1 },
        { note: 523.25, dur: 1.0, delay: 4.9 },
      ],
    ];

    let phraseIdx = 0;
    const playTavernBar = () => {
      if (!session.active || soundManager.isMasterMuted() || soundManager.isMusicMuted()) return;
      const ctx = soundManager.ensureContext();
      if (!ctx || ctx.state === 'suspended') return;
      const now = ctx.currentTime;

      const busFilter = ctx.createBiquadFilter();
      busFilter.type = 'lowpass';
      busFilter.frequency.setValueAtTime(750, now);

      const busGain = ctx.createGain();
      busGain.gain.setValueAtTime(0.065, now);

      const dest = soundManager.getMusicDestination() || this.getDestination() || ctx.destination;
      busFilter.connect(busGain);
      busGain.connect(dest);

      const chord = acousticChords[phraseIdx % acousticChords.length];
      const melody = melodyPhrases[phraseIdx % melodyPhrases.length];
      phraseIdx++;

      chord.forEach((freq, idx) => {
        this.scheduleTone(ctx, busFilter, now + idx * 0.28, {
          type: 'triangle',
          from: freq,
          duration: 1.8,
          attack: 0.06,
          peak: 0.34,
        });
      });

      melody.forEach((m, mIdx) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'sine';
        const t = now + m.delay;
        osc.frequency.setValueAtTime(m.note, t);

        const vib = ctx.createOscillator();
        const vibGain = ctx.createGain();
        vib.frequency.setValueAtTime(4.8, t);
        vibGain.gain.setValueAtTime(3.5, t);
        vib.connect(vibGain);
        vibGain.connect(osc.frequency);
        vib.start(t);
        vib.stop(t + m.dur + 0.05);

        noteGain.gain.setValueAtTime(0.001, t);
        noteGain.gain.linearRampToValueAtTime(0.28, t + 0.08);
        noteGain.gain.exponentialRampToValueAtTime(0.001, t + m.dur + 0.1);

        osc.connect(noteGain);
        noteGain.connect(busFilter);
        osc.onended = () => {
          safeDisconnect([osc, noteGain, vib, vibGain]);
          if (mIdx === melody.length - 1) {
            safeDisconnect([busFilter, busGain]);
          }
        };
        osc.start(t);
        osc.stop(t + m.dur + 0.15);
      });
    };

    playTavernBar();
    if (typeof window !== 'undefined') {
      const interval = setInterval(playTavernBar, 6000);
      if (typeof (interval as unknown as { unref?: () => void }).unref === 'function') {
        (interval as unknown as { unref: () => void }).unref();
      }
      session.musicInterval = interval;
    }
  }

  public stopTavernAmbience(): void {
    this.stopFloorAmbience(0.6);
  }
}

export const sfx = new RetroAudioEngine();
export { soundManager };

if (typeof window !== 'undefined') {
  const handleFirstInteraction = () => {
    sfx.unlockAudio();
    soundManager.unlockAudio();
    window.removeEventListener('pointerdown', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
  };
  window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
  window.addEventListener('keydown', handleFirstInteraction, { passive: true });
}
