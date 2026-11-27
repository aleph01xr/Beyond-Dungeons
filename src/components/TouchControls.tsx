import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  findBestAutoTarget,
  getAbilityTargetSpec,
  getPrimaryAttackRange,
  resolveSkillSmartTarget,
  type AbilityAimState,
  type AimableAction,
} from '../shared/abilityTargeting.ts';
import type {
  ClientMessage,
  DungeonMap,
  EnemyState,
  GameSnapshot,
  PlayerState,
} from '../shared/types.ts';
import { HERO_CLASSES, MAX_LEVEL } from '../shared/types.ts';
import { getArcanistScrollDef } from '../shared/arcanist.ts';
import { resolveActiveTacticalDef } from '../shared/armaments.ts';
import { TacticalSkillIcon } from './TacticalSkillIcon.tsx';

export type JoystickSizeOption = 'small' | 'medium' | 'large' | 'huge';
export type JoystickModeOption = 'fixed' | 'floating';
export type ButtonSizeOption = 'compact' | 'standard' | 'large';

export interface TouchSettings {
  joystickSize: JoystickSizeOption;
  joystickMode: JoystickModeOption;
  buttonSize: ButtonSizeOption;
  opacity: number;
  haptics: boolean;
}

const DEFAULT_TOUCH_SETTINGS: TouchSettings = {
  joystickSize: 'medium',
  joystickMode: 'floating',
  buttonSize: 'standard',
  opacity: 0.9,
  haptics: true,
};

const JOYSTICK_CONFIGS: Record<
  JoystickSizeOption,
  { basePx: number; knobPx: number; maxRadius: number }
> = {
  small: { basePx: 108, knobPx: 48, maxRadius: 38 },
  medium: { basePx: 136, knobPx: 58, maxRadius: 48 },
  large: { basePx: 166, knobPx: 68, maxRadius: 58 },
  huge: { basePx: 204, knobPx: 80, maxRadius: 74 },
};

const BUTTON_CONFIGS: Record<
  ButtonSizeOption,
  { util: number; skill: number; attack: number; icon: number }
> = {
  compact: { util: 44, skill: 58, attack: 78, icon: 20 },
  standard: { util: 50, skill: 68, attack: 90, icon: 24 },
  large: { util: 56, skill: 78, attack: 104, icon: 28 },
};

interface TouchControlsProps {
  player: PlayerState;
  enemies: EnemyState[];
  map?: DungeonMap;
  latestSnapshotRef?: React.MutableRefObject<GameSnapshot | null>;
  nearInteractable: boolean;
  abilityAimRef?: React.MutableRefObject<AbilityAimState | null>;
  onAbilityAimUiChange?: (
    ui: {
      action: AimableAction;
      cancelled: boolean;
      source: 'touch' | 'mouse' | 'keyboard';
    } | null
  ) => void;
  onStickMove: (stickX: number, stickY: number, aimAngle?: number) => void;
  onAttackPress: (pressed: boolean, aimAngle?: number) => void;
  onTriggerAction: (
    action: 'tactical' | 'ult' | 'potion' | 'interact' | 'dash',
    aimAngle: number,
    opts?: { aimDistance?: number; explicitAim?: boolean }
  ) => void;
  onSendPing: (label: string, x: number, y: number) => void;
  onSendCommand?: (msg: ClientMessage) => void;
  settings: TouchSettings;
  onOpenSettings: () => void;
}

export function loadSavedTouchSettings(): TouchSettings {
  try {
    const raw = localStorage.getItem('beyond_touch_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TOUCH_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_TOUCH_SETTINGS;
}

export function saveTouchSettings(s: TouchSettings): void {
  try {
    localStorage.setItem('beyond_touch_settings', JSON.stringify(s));
  } catch {
    // ignore
  }
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  player,
  enemies,
  map,
  latestSnapshotRef,
  nearInteractable,
  abilityAimRef,
  onAbilityAimUiChange,
  onStickMove,
  onAttackPress,
  onTriggerAction,
  onSendPing,
  onSendCommand,
  settings,
  onOpenSettings,
}) => {
  const joystickTouchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickActive, setIsStickActive] = useState(false);

  // Position of floating joystick base in screen coordinates
  const [floatingOrigin, setFloatingOrigin] = useState<{ x: number; y: number } | null>(null);
  const fixedBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const attackTouchIdRef = useRef<number | null>(null);
  const [attackAiming, setAttackAiming] = useState(false);
  const attackAimingRef = useRef(false);
  const lastStickAngleRef = useRef<number>(player.aimAngle || 0);
  const playerRef = useRef(player);
  playerRef.current = player;
  const enemiesRef = useRef(enemies);
  enemiesRef.current = enemies;
  const mapRef = useRef(map);
  mapRef.current = map;
  const onAttackPressRef = useRef(onAttackPress);
  onAttackPressRef.current = onAttackPress;

  // Ability drag-to-aim tracking
  const abilityTouchRef = useRef<{
    id: number;
    action: AimableAction;
    originX: number;
    originY: number;
    dragDist: number;
  } | null>(null);
  const cancelZoneRef = useRef<HTMLDivElement | null>(null);
  const [skillWheelUi, setSkillWheelUi] = useState<{
    action: AimableAction;
    originX: number;
    originY: number;
    knobX: number;
    knobY: number;
    cancelled: boolean;
    accentColor: string;
    label: string;
  } | null>(null);

  const heroDef = HERO_CLASSES[player.heroClass] || HERO_CLASSES.vanguard;
  const equippedScroll =
    player.heroClass === 'arcanist' ? getArcanistScrollDef(player.equippedScrollId) : null;
  const activeTactical = resolveActiveTacticalDef(
    player.heroClass,
    player.equippedWeapon,
    player.equippedScrollId
  );
  const tacticalLabel = activeTactical.shortTitle;
  const isChronoSuspended = (player.chronoSuspendedMs || 0) > 0;
  const isChanneling = Boolean(player.disintegrationState?.active);
  const tacSec = Math.ceil(player.skillCooldownMs / 1000);
  const ultSec = Math.ceil(player.ultCooldownMs / 1000);
  const dashSec = Math.ceil((player.dashCooldownMs || 0) / 1000);
  const isSilenced = Boolean(player.statuses && player.statuses.some((s) => s.type === 'silenced'));

  const [viewportDims, setViewportDims] = useState(() => ({
    w: typeof window !== 'undefined' ? window.visualViewport?.width || window.innerWidth : 400,
    h: typeof window !== 'undefined' ? window.visualViewport?.height || window.innerHeight : 800,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateDims = () => {
      setViewportDims({
        w: Math.round(window.visualViewport?.width || window.innerWidth),
        h: Math.round(window.visualViewport?.height || window.innerHeight),
      });
    };
    window.addEventListener('resize', updateDims);
    window.addEventListener('orientationchange', updateDims);
    window.visualViewport?.addEventListener('resize', updateDims);
    return () => {
      window.removeEventListener('resize', updateDims);
      window.removeEventListener('orientationchange', updateDims);
      window.visualViewport?.removeEventListener('resize', updateDims);
    };
  }, []);

  const isLandscapeMobile = viewportDims.w >= 540 && viewportDims.h < 520;

  // Gentle scaling only on ultra-narrow (<360px) or short landscape (<400px) screens while enforcing >=44px touch targets
  const mobileViewportScale = React.useMemo(() => {
    const minDim = Math.min(viewportDims.w, viewportDims.h);
    if (minDim < 340) return 0.88;
    if (isLandscapeMobile && viewportDims.h < 400) return 0.88;
    if (minDim < 380) return 0.93;
    return 1;
  }, [viewportDims, isLandscapeMobile]);

  const baseJoySpec = JOYSTICK_CONFIGS[settings.joystickSize] || JOYSTICK_CONFIGS.medium;
  const joySpec = React.useMemo(() => {
    if (mobileViewportScale === 1) return baseJoySpec;
    return {
      basePx: Math.max(96, Math.round(baseJoySpec.basePx * mobileViewportScale)),
      knobPx: Math.max(44, Math.round(baseJoySpec.knobPx * mobileViewportScale)),
      maxRadius: Math.max(34, Math.round(baseJoySpec.maxRadius * mobileViewportScale)),
    };
  }, [baseJoySpec, mobileViewportScale]);

  const baseBtnSpec = BUTTON_CONFIGS[settings.buttonSize] || BUTTON_CONFIGS.standard;
  const btnSpec = React.useMemo(() => {
    if (mobileViewportScale === 1) return baseBtnSpec;
    return {
      util: Math.max(44, Math.round(baseBtnSpec.util * mobileViewportScale)),
      skill: Math.max(56, Math.round(baseBtnSpec.skill * mobileViewportScale)),
      attack: Math.max(76, Math.round(baseBtnSpec.attack * mobileViewportScale)),
      icon: Math.max(18, Math.round(baseBtnSpec.icon * mobileViewportScale)),
    };
  }, [baseBtnSpec, mobileViewportScale]);

  const arcDims = React.useMemo(() => {
    const maxPortraitW = Math.max(184, Math.round(viewportDims.w * 0.56));
    const desiredW = Math.round(btnSpec.attack * 2.45);
    const width = isLandscapeMobile ? desiredW : Math.min(maxPortraitW, desiredW);
    const height = Math.round(btnSpec.attack * 2.02);
    return { width, height };
  }, [btnSpec.attack, isLandscapeMobile, viewportDims.w]);

  const triggerHaptic = (ms = 12) => {
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore
      }
    }
  };

  const getPvpTargetsForTouch = (liveSnap: GameSnapshot | null | undefined, myId: string) =>
    liveSnap?.pvpEnabled
      ? liveSnap.players
          .filter(
            (p) =>
              p.id !== myId &&
              p.connected &&
              !p.downed &&
              (p.spawnProtectionMs || 0) <= 0
          )
          .map((p) => ({ id: p.id, x: p.x, y: p.y, radius: 14 }))
      : undefined;

  const getAutoTarget = (maxRangeOverride?: number) => {
    const liveSnap = latestSnapshotRef?.current;
    const fallbackPlayer = playerRef.current;
    const livePlayer =
      liveSnap?.players.find((p) => p.id === fallbackPlayer.id) ?? fallbackPlayer;
    const liveEnemies = liveSnap?.enemies ?? enemiesRef.current;
    const liveDummies = liveSnap?.trainingDummies;
    const pvpPlayers = getPvpTargetsForTouch(liveSnap, livePlayer.id);
    const baseAngle = lastStickAngleRef.current;
    const maxDist =
      typeof maxRangeOverride === 'number'
        ? maxRangeOverride
        : getPrimaryAttackRange(livePlayer.heroClass);

    return findBestAutoTarget({
      playerX: livePlayer.x,
      playerY: livePlayer.y,
      maxRange: maxDist,
      preferredAngle: baseAngle,
      minDot: -1,
      map: mapRef.current,
      props: liveSnap?.props,
      enemies: liveEnemies,
      pvpPlayers,
      trainingDummies: liveDummies,
    });
  };

  const getAutoTargetAngle = (maxRangeOverride?: number) => {
    return getAutoTarget(maxRangeOverride)?.angle ?? lastStickAngleRef.current;
  };

  const getSkillSmartAim = (action: AimableAction) => {
    const liveSnap = latestSnapshotRef?.current;
    const fallbackPlayer = playerRef.current;
    const livePlayer =
      liveSnap?.players.find((p) => p.id === fallbackPlayer.id) ?? fallbackPlayer;
    const spec = getAbilityTargetSpec(
      livePlayer.heroClass,
      action,
      livePlayer.equippedScrollId,
      livePlayer.equippedWeapon
    );
    const liveEnemies = liveSnap?.enemies ?? enemiesRef.current;
    const liveDummies = liveSnap?.trainingDummies;
    const pvpPlayers = getPvpTargetsForTouch(liveSnap, livePlayer.id);
    const smart = resolveSkillSmartTarget({
      spec,
      playerX: livePlayer.x,
      playerY: livePlayer.y,
      fallbackAngle: lastStickAngleRef.current,
      fallbackDistance: spec.defaultDist,
      preferCursorCone: false,
      allowFullRangeFallback: true,
      map: mapRef.current,
      props: liveSnap?.props,
      enemies: liveEnemies,
      pvpPlayers,
      trainingDummies: liveDummies,
    });
    return { spec, ...smart };
  };

  // Touch handlers for floating zone on the left half of screen
  const handleLeftZoneTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchIdRef.current = touch.identifier;

    let cx = 0;
    let cy = 0;

    if (settings.joystickMode === 'floating') {
      cx = touch.clientX;
      cy = touch.clientY;
      setFloatingOrigin({ x: cx, y: cy });
    } else {
      const rect = fixedBaseRef.current?.getBoundingClientRect();
      if (rect) {
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      } else {
        cx = touch.clientX;
        cy = touch.clientY;
      }
    }

    joystickCenterRef.current = { x: cx, y: cy };
    setKnobPos({ x: 0, y: 0 });
    setIsStickActive(true);
    triggerHaptic(10);
  };

  const handleLeftZoneTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        const cx = joystickCenterRef.current.x;
        const cy = joystickCenterRef.current.y;
        const dx = touch.clientX - cx;
        const dy = touch.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const maxR = joySpec.maxRadius;
        const clampedDist = Math.min(dist, maxR);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;

        setKnobPos({ x: kx, y: ky });

        // Normalize -1 to 1 with smooth deadzone
        const deadzone = 8;
        if (clampedDist > deadzone) {
          const normMagnitude = (clampedDist - deadzone) / (maxR - deadzone);
          const normX = Math.cos(angle) * normMagnitude;
          const normY = Math.sin(angle) * normMagnitude;
          lastStickAngleRef.current = angle;
          onStickMove(normX, normY, attackAimingRef.current ? undefined : angle);
        } else {
          onStickMove(
            0,
            0,
            attackAimingRef.current ? undefined : lastStickAngleRef.current
          );
        }
        break;
      }
    }
  };

  const handleLeftZoneTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        setIsStickActive(false);
        setFloatingOrigin(null);
        onStickMove(
          0,
          0,
          attackAimingRef.current ? undefined : lastStickAngleRef.current
        );
        break;
      }
    }
  };

  const lastSentTouchAimRef = useRef<number | null>(null);

  // Attack Touch
  const handleAttackStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (attackTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    attackTouchIdRef.current = touch.identifier;
    attackAimingRef.current = true;
    setAttackAiming(true);
    triggerHaptic(18);
    sfx.playAttack(player.heroClass, {
      weaponId: player.equippedWeapon,
      comboStep: player.attackComboStep,
      playerId: player.id,
      isLocal: true,
    });
    const targetAngle = getAutoTargetAngle();
    lastSentTouchAimRef.current = targetAngle;
    onAttackPress(true, targetAngle);
  };

  const handleAttackEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (attackTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === attackTouchIdRef.current) {
        attackTouchIdRef.current = null;
        attackAimingRef.current = false;
        lastSentTouchAimRef.current = null;
        setAttackAiming(false);
        onAttackPress(false);
        break;
      }
    }
  };

  // Continuous auto-target tracking while holding attack button (only emits on meaningful aim change)
  useEffect(() => {
    if (!attackAiming) return;
    const interval = setInterval(() => {
      const angle = getAutoTargetAngle();
      const prev = lastSentTouchAimRef.current;
      let diff = prev === null ? Math.PI : Math.abs(angle - prev);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff >= 0.04) {
        lastSentTouchAimRef.current = angle;
        onAttackPressRef.current(true, angle);
      }
    }, 65);
    return () => clearInterval(interval);
  }, [attackAiming]);

  // Clear active ability aim on unmount
  useEffect(() => {
    return () => {
      abilityTouchRef.current = null;
      if (abilityAimRef) abilityAimRef.current = null;
      onAbilityAimUiChange?.(null);
    };
  }, [abilityAimRef, onAbilityAimUiChange]);

  const canAimAbility = (action: AimableAction): boolean => {
    const liveSnap = latestSnapshotRef?.current;
    const livePlayer = liveSnap?.players.find((p) => p.id === player.id) ?? player;
    if (livePlayer.downed) return false;
    const silenced = Boolean(
      livePlayer.statuses && livePlayer.statuses.some((s) => s.type === 'silenced')
    );
    if (action !== 'dash' && silenced) {
      sfx.playUiClick();
      return false;
    }
    if (action === 'tactical' && (livePlayer.skillCooldownMs > 0 || livePlayer.spellCastState || livePlayer.disintegrationState?.active || (livePlayer.chronoSuspendedMs || 0) > 0)) return false;
    if (action === 'ult' && livePlayer.ultCooldownMs > 0) return false;
    if (action === 'dash' && (livePlayer.dashCooldownMs || 0) > 0) return false;
    return true;
  };

  const handleAbilityTouchStart = (
    action: AimableAction,
    e: React.TouchEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    if (abilityTouchRef.current !== null) return;
    if (!canAimAbility(action)) return;

    const livePlayer =
      latestSnapshotRef?.current?.players.find((p) => p.id === player.id) ?? player;
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const { spec, aimAngle: defaultAngle, aimDistance: defaultDist } =
      getSkillSmartAim(action);

    abilityTouchRef.current = {
      id: touch.identifier,
      action,
      originX,
      originY,
      dragDist: 0,
    };

    if (abilityAimRef) {
      abilityAimRef.current = {
        action,
        source: 'touch',
        aimAngle: defaultAngle,
        magnitude: spec.range > 0 ? Math.min(1, defaultDist / spec.range) : 0,
        aimDistance: defaultDist,
        cancelled: false,
      };
    }

    if (
      action === 'tactical' &&
      livePlayer.heroClass === 'arcanist' &&
      livePlayer.equippedScrollId === 'disintegration' &&
      onSendCommand
    ) {
      sfx.playArcanistSpell('disintegration', { isLocal: true });
      onSendCommand({
        type: 'player:channel_start',
        spellId: 'disintegration',
        aimAngle: defaultAngle,
      });
    }

    onAbilityAimUiChange?.({ action, cancelled: false, source: 'touch' });
    setSkillWheelUi({
      action,
      originX,
      originY,
      knobX: 0,
      knobY: 0,
      cancelled: false,
      accentColor: spec.accentColor,
      label: spec.label,
    });
    triggerHaptic(10);
  };

  const handleAbilityTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const active = abilityTouchRef.current;
    if (!active) return;

    let matched: React.Touch | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === active.id) {
        matched = e.changedTouches[i];
        break;
      }
    }
    if (!matched) return;

    const dx = matched.clientX - active.originX;
    const dy = matched.clientY - active.originY;
    const dist = Math.hypot(dx, dy);
    active.dragDist = Math.max(active.dragDist, dist);

    const wheelRadius = 46;
    const deadzone = 10;
    const clampedDist = Math.min(dist, wheelRadius);
    const angle = Math.atan2(dy, dx);
    const knobX = dist > 0.5 ? Math.cos(angle) * clampedDist : 0;
    const knobY = dist > 0.5 ? Math.sin(angle) * clampedDist : 0;

    // Check cancel target bounding box (with thumb forgiveness padding)
    let isCancelled = false;
    const cancelRect = cancelZoneRef.current?.getBoundingClientRect();
    if (cancelRect) {
      const pad = 14;
      if (
        matched.clientX >= cancelRect.left - pad &&
        matched.clientX <= cancelRect.right + pad &&
        matched.clientY >= cancelRect.top - pad &&
        matched.clientY <= cancelRect.bottom + pad
      ) {
        isCancelled = true;
      }
    }

    const livePlayer =
      latestSnapshotRef?.current?.players.find((p) => p.id === player.id) ?? player;
    const spec = getAbilityTargetSpec(
      livePlayer.heroClass,
      active.action,
      livePlayer.equippedScrollId,
      livePlayer.equippedWeapon
    );
    const prevCancelled = abilityAimRef?.current?.cancelled ?? false;

    if (dist > deadzone) {
      const mag = Math.min(1, (dist - deadzone) / (wheelRadius - deadzone));
      const aimDistance =
        spec.kind === 'ground_aoe'
          ? Math.round(mag * spec.range)
          : spec.kind === 'dash'
          ? Math.round(Math.max(36, mag * spec.range))
          : spec.range;
      if (abilityAimRef?.current) {
        abilityAimRef.current.aimAngle = angle;
        abilityAimRef.current.magnitude = mag;
        abilityAimRef.current.aimDistance = aimDistance;
        abilityAimRef.current.cancelled = isCancelled;
      }
      if (
        active.action === 'tactical' &&
        livePlayer.heroClass === 'arcanist' &&
        livePlayer.equippedScrollId === 'disintegration' &&
        onSendCommand
      ) {
        onSendCommand({ type: 'player:channel_update', aimAngle: angle });
      }
    } else {
      const smart = getSkillSmartAim(active.action);
      if (abilityAimRef?.current) {
        abilityAimRef.current.aimAngle = smart.aimAngle;
        abilityAimRef.current.magnitude =
          spec.range > 0 ? Math.min(1, smart.aimDistance / spec.range) : 0;
        abilityAimRef.current.aimDistance = smart.aimDistance;
        abilityAimRef.current.cancelled = isCancelled;
      }
    }

    if (isCancelled !== prevCancelled) {
      if (isCancelled) triggerHaptic(14);
      onAbilityAimUiChange?.({
        action: active.action,
        cancelled: isCancelled,
        source: 'touch',
      });
    }

    setSkillWheelUi((prev) =>
      prev
        ? {
            ...prev,
            knobX,
            knobY,
            cancelled: isCancelled,
          }
        : null
    );
  };

  const handleAbilityTouchEnd = (
    e: React.TouchEvent<HTMLButtonElement>,
    forceCancel = false
  ) => {
    e.stopPropagation();
    const active = abilityTouchRef.current;
    if (!active) return;

    let found = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === active.id) {
        found = true;
        break;
      }
    }
    if (!found) return;

    const currentAim = abilityAimRef?.current ? { ...abilityAimRef.current } : null;
    abilityTouchRef.current = null;
    if (abilityAimRef) abilityAimRef.current = null;
    setSkillWheelUi(null);
    onAbilityAimUiChange?.(null);

    const livePlayer =
      latestSnapshotRef?.current?.players.find((p) => p.id === player.id) ?? player;
    if (
      active.action === 'tactical' &&
      livePlayer.heroClass === 'arcanist' &&
      livePlayer.equippedScrollId === 'disintegration' &&
      onSendCommand
    ) {
      onSendCommand({ type: 'player:channel_stop' });
      triggerHaptic(8);
      return;
    }

    if (forceCancel || currentAim?.cancelled) {
      sfx.playUiClick();
      triggerHaptic(8);
      return;
    }

    const smartQuick = getSkillSmartAim(active.action);
    const dragged = active.dragDist > 10;

    const castAngle = dragged
      ? currentAim?.aimAngle ?? lastStickAngleRef.current
      : active.action === 'dash'
      ? lastStickAngleRef.current
      : smartQuick.aimAngle;
    const castDist = dragged
      ? currentAim?.aimDistance ?? smartQuick.spec.defaultDist
      : smartQuick.aimDistance;

    if (active.action === 'dash') {
      sfx.playDash({ heroClass: livePlayer.heroClass, isLocal: true });
      triggerHaptic(14);
    } else if (active.action === 'tactical') {
      if (livePlayer.heroClass === 'arcanist' && livePlayer.equippedScrollId) {
        sfx.playArcanistSpell(livePlayer.equippedScrollId, { isLocal: true });
      } else {
        sfx.playSkill('tactical', {
          heroClass: livePlayer.heroClass,
          skillId: livePlayer.equippedWeapon,
          isLocal: true,
        });
      }
      triggerHaptic(16);
    } else {
      if (livePlayer.heroClass === 'arcanist') {
        sfx.playChronoWell({ isLocal: true });
      } else {
        sfx.playSkill('ult', { heroClass: livePlayer.heroClass, isLocal: true });
      }
      triggerHaptic(25);
    }

    onTriggerAction(active.action, castAngle, {
      aimDistance: castDist,
      explicitAim: dragged,
    });
  };

  return (
    <div
      aria-label="Mobile Touch Gamepad"
      style={{ opacity: settings.opacity }}
      className="fixed inset-0 pointer-events-none select-none z-20 touch-none"
    >
      {/* LEFT JOYSTICK CATCH AREA (Bounded cleanly so right combat cluster never overlaps) */}
      <div
        onTouchStart={handleLeftZoneTouchStart}
        onTouchMove={handleLeftZoneTouchMove}
        onTouchEnd={handleLeftZoneTouchEnd}
        onTouchCancel={handleLeftZoneTouchEnd}
        className={`pointer-events-auto absolute left-0 bottom-0 touch-none flex items-end p-2.5 sm:p-5 pl-safe pb-safe ${
          isLandscapeMobile
            ? 'top-14 w-[35vw] max-w-[300px]'
            : 'top-36 w-[40vw] max-w-[240px]'
        }`}
      >
        {/* Floating Joystick Base */}
        {settings.joystickMode === 'floating' && floatingOrigin && isStickActive && (
          <div
            style={{
              position: 'fixed',
              left: `${floatingOrigin.x}px`,
              top: `${floatingOrigin.y}px`,
              width: `${joySpec.basePx}px`,
              height: `${joySpec.basePx}px`,
              marginLeft: `-${joySpec.basePx / 2}px`,
              marginTop: `-${joySpec.basePx / 2}px`,
            }}
            className="rounded-full bg-[#181822]/85 border-3 border-[#5B5872] shadow-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              <div className="w-full h-0.5 bg-[#A19EB3]" />
              <div className="h-full w-0.5 bg-[#A19EB3] absolute" />
            </div>
            <div
              style={{
                width: `${joySpec.knobPx}px`,
                height: `${joySpec.knobPx}px`,
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
              }}
              className="rounded-full bg-[#7D7B91] border-3 border-[#343243] shadow-[0_4px_16px_rgba(0,0,0,0.6)] flex items-center justify-center"
            >
              <div className="w-4 h-4 rounded-full bg-[#E5E3F2]" />
            </div>
          </div>
        )}

        {/* Fixed Joystick Base */}
        {settings.joystickMode === 'fixed' && (
          <div
            ref={fixedBaseRef}
            style={{
              width: `${joySpec.basePx}px`,
              height: `${joySpec.basePx}px`,
            }}
            className="relative rounded-full bg-[#181822]/85 border-3 border-[#5B5872] shadow-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-35">
              <div className="w-full h-0.5 bg-[#A19EB3]" />
              <div className="h-full w-0.5 bg-[#A19EB3] absolute" />
            </div>
            <div
              style={{
                width: `${joySpec.knobPx}px`,
                height: `${joySpec.knobPx}px`,
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
                transition: isStickActive ? 'none' : 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="rounded-full bg-[#7D7B91] border-3 border-[#343243] shadow-[0_4px_16px_rgba(0,0,0,0.6)] flex items-center justify-center"
            >
              <div className="w-4 h-4 rounded-full bg-[#E5E3F2]" />
            </div>
          </div>
        )}

        {settings.joystickMode === 'floating' && !isStickActive && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#D1CFDC]/85 bg-[#161622]/65 px-3 py-1.5 border border-[#3C3A4D] pointer-events-none">
            <span>Touch to Move</span>
          </div>
        )}
      </div>

      {/* LANDSCAPE BOTTOM-CENTER MICRO UTILITIES (Keeps right combat cluster compact & below minimap) */}
      {isLandscapeMobile && (
        <div className="pointer-events-auto fixed bottom-2.5 left-1/2 -translate-x-1/2 pb-safe flex items-center gap-3 z-20">
          <div className="flex flex-col items-center gap-0.5 mr-1">
            <div className="text-[10px] font-mono font-bold text-[#FCD34D] bg-[#181822]/80 px-2 py-0.5 border border-[#3C3A4D]">
              {player.level >= MAX_LEVEL ? 'MAX' : `LV.${player.level}`}
            </div>
            <div className="w-16 h-1 bg-[#12111A]/85 border border-[#3C3A52] relative overflow-hidden">
              {player.level >= MAX_LEVEL ? (
                <div className="absolute inset-0 bg-[#FCD34D]" />
              ) : (
                <div
                  className="h-full bg-gradient-to-r from-[#D9AA52] to-[#FDE68A]"
                  style={{ width: `${Math.min(100, (player.xp / Math.max(1, player.nextXp)) * 100)}%` }}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              triggerHaptic(12);
              onOpenSettings();
            }}
            onClick={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              onOpenSettings();
            }}
            style={{ width: `${Math.max(44, btnSpec.util - 4)}px`, height: `${Math.max(44, btnSpec.util - 4)}px` }}
            className="rounded-full bg-[#242332]/92 border-2 border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
            aria-label="Touch Controls Settings"
            title="Touch Controls Settings"
          >
            <svg width={btnSpec.icon} height={btnSpec.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>

          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              triggerHaptic(14);
              onSendPing('Rally Here', player.x, player.y - 18);
            }}
            style={{ width: `${Math.max(44, btnSpec.util - 4)}px`, height: `${Math.max(44, btnSpec.util - 4)}px` }}
            className="rounded-full bg-[#242332]/92 border-2 border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
            aria-label="Rally Ping"
          >
            <svg width={btnSpec.icon} height={btnSpec.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </button>
        </div>
      )}

      {/* RIGHT ACTION CLUSTER (Compact horizontal width, spacious radial gaps) */}
      <div
        className={`pointer-events-auto absolute right-2.5 sm:right-5 bottom-2.5 sm:bottom-5 pr-safe pb-safe flex ${
          isLandscapeMobile ? 'flex-row items-end gap-4' : 'flex-col items-end gap-3'
        }`}
      >
        {/* Portrait Top Utility Row (Split cleanly into 2 spacious rows instead of 1 jammed 5-button strip) */}
        {!isLandscapeMobile && (
          <div className="flex flex-col items-end gap-2.5">
            {/* Micro Utility + Level Row */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end gap-1 mr-0.5">
                <div className="text-[10px] font-mono font-bold text-[#FCD34D] bg-[#181822]/75 px-2 py-0.5 border border-[#3C3A4D]">
                  {player.level >= MAX_LEVEL ? 'MAX LEVEL' : `LV.${player.level}`}
                </div>
                <div className="w-20 h-1.5 bg-[#12111A]/85 border border-[#3C3A52] relative overflow-hidden">
                  {player.level >= MAX_LEVEL ? (
                    <div className="absolute inset-0 bg-[#FCD34D]" />
                  ) : (
                    <div
                      className="h-full bg-gradient-to-r from-[#D9AA52] to-[#FDE68A]"
                      style={{ width: `${Math.min(100, (player.xp / Math.max(1, player.nextXp)) * 100)}%` }}
                    />
                  )}
                </div>
              </div>

              <button
                type="button"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  sfx.playUiClick();
                  triggerHaptic(12);
                  onOpenSettings();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  sfx.playUiClick();
                  onOpenSettings();
                }}
                style={{ width: `${Math.max(44, btnSpec.util - 4)}px`, height: `${Math.max(44, btnSpec.util - 4)}px` }}
                className="rounded-full bg-[#242332]/92 border-2 border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
                aria-label="Touch Controls Settings"
                title="Touch Controls Settings"
              >
                <svg width={btnSpec.icon} height={btnSpec.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>

              <button
                type="button"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  sfx.playUiClick();
                  triggerHaptic(14);
                  onSendPing('Rally Here', player.x, player.y - 18);
                }}
                style={{ width: `${Math.max(44, btnSpec.util - 4)}px`, height: `${Math.max(44, btnSpec.util - 4)}px` }}
                className="rounded-full bg-[#242332]/92 border-2 border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
                aria-label="Rally Ping"
              >
                <svg width={btnSpec.icon} height={btnSpec.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v20M2 12h20" />
                </svg>
              </button>
            </div>

            {/* Flask + Interact Row */}
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  if (player.potions > 0) {
                    sfx.playHeal();
                    triggerHaptic(20);
                    onTriggerAction('potion', player.aimAngle);
                  }
                }}
                style={{ width: `${btnSpec.util + 4}px`, height: `${btnSpec.util + 4}px` }}
                className={`rounded-full border-2 flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer ${
                  player.potions > 0
                    ? 'bg-[#3D1A22]/95 border-[#E11D48] text-[#FDA4AF]'
                    : 'bg-[#1E1E28]/85 border-[#38364C] text-[#6E6C7D]'
                }`}
                aria-label="Healing Flask"
              >
                <span className="text-[13px] font-mono font-bold leading-none tabular-nums">
                  {player.potions}
                </span>
                <span className="text-[9.5px] font-mono font-bold leading-none mt-0.5">HEAL</span>
              </button>

              <button
                type="button"
                onTouchStart={(e) => {
                  e.stopPropagation();
                  sfx.playUiClick();
                  triggerHaptic(16);
                  onTriggerAction('interact', player.aimAngle);
                }}
                style={{ width: `${btnSpec.util + 4}px`, height: `${btnSpec.util + 4}px` }}
                className={`rounded-full border-2 flex flex-col items-center justify-center font-display text-xs font-bold active:scale-95 transition-all shadow-md cursor-pointer ${
                  nearInteractable
                    ? 'bg-[#1E3A8A]/95 border-[#60A5FA] text-white animate-pulse'
                    : 'bg-[#222332]/90 border-[#47455E] text-[#D1CFDC]'
                }`}
                aria-label="Interact"
              >
                <span className="text-[12px] font-mono font-bold leading-none">USE</span>
              </button>
            </div>
          </div>
        )}

        {/* Landscape Wing: Flask + Interact stacked vertically beside Combat Arc */}
        {isLandscapeMobile && (
          <div className="flex flex-col items-center gap-3.5 pb-1">
            <button
              type="button"
              onTouchStart={(e) => {
                e.stopPropagation();
                if (player.potions > 0) {
                  sfx.playHeal();
                  triggerHaptic(20);
                  onTriggerAction('potion', player.aimAngle);
                }
              }}
              style={{ width: `${btnSpec.util + 4}px`, height: `${btnSpec.util + 4}px` }}
              className={`rounded-full border-2 flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer ${
                player.potions > 0
                  ? 'bg-[#3D1A22]/95 border-[#E11D48] text-[#FDA4AF]'
                  : 'bg-[#1E1E28]/85 border-[#38364C] text-[#6E6C7D]'
              }`}
              aria-label="Healing Flask"
            >
              <span className="text-[13px] font-mono font-bold leading-none tabular-nums">
                {player.potions}
              </span>
              <span className="text-[9.5px] font-mono font-bold leading-none mt-0.5">HEAL</span>
            </button>

            <button
              type="button"
              onTouchStart={(e) => {
                e.stopPropagation();
                sfx.playUiClick();
                triggerHaptic(16);
                onTriggerAction('interact', player.aimAngle);
              }}
              style={{ width: `${btnSpec.util + 4}px`, height: `${btnSpec.util + 4}px` }}
              className={`rounded-full border-2 flex flex-col items-center justify-center font-display text-xs font-bold active:scale-95 transition-all shadow-md cursor-pointer ${
                nearInteractable
                  ? 'bg-[#1E3A8A]/95 border-[#60A5FA] text-white animate-pulse'
                  : 'bg-[#222332]/90 border-[#47455E] text-[#D1CFDC]'
              }`}
              aria-label="Interact"
            >
              <span className="text-[12px] font-mono font-bold leading-none">USE</span>
            </button>
          </div>
        )}

        {/* Combat Arc: Attack + Tactical + Ult + Dash with generous radial gaps */}
        <div
          style={{
            width: `${arcDims.width}px`,
            height: `${arcDims.height}px`,
          }}
          className="relative flex items-end justify-end"
        >
          {/* Skill 1: Tactical - Hold & Drag to Aim */}
          <button
            type="button"
            onTouchStart={(e) => handleAbilityTouchStart('tactical', e)}
            onTouchMove={handleAbilityTouchMove}
            onTouchEnd={(e) => handleAbilityTouchEnd(e, false)}
            onTouchCancel={(e) => handleAbilityTouchEnd(e, true)}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
              bottom: '4px',
              left: '0px',
              borderColor:
                skillWheelUi?.action === 'tactical' || isSilenced || tacSec > 0
                  ? undefined
                  : activeTactical.accentColor,
            }}
            className={`absolute rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-lg cursor-pointer ${
              skillWheelUi?.action === 'tactical'
                ? 'scale-110 bg-[#1E1B4B]/95 border-[#38BDF8] text-white ring-2 ring-[#38BDF8]/70'
                : isSilenced
                ? 'bg-[#251B33]/90 border-[#A855F7] text-[#D8B4FE]'
                : tacSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#282738]/95 border-[#818CF8] text-[#C7D2FE] active:scale-95'
            }`}
            aria-label={tacticalLabel}
          >
            {isSilenced || isChanneling || tacSec > 0 ? (
              <span className="text-sm font-mono font-bold leading-none tabular-nums">
                {isSilenced ? 'SIL' : isChanneling ? 'CHAN' : `${tacSec}s`}
              </span>
            ) : (
              <TacticalSkillIcon tacticalId={activeTactical.id} color={activeTactical.accentColor} size={Math.round(btnSpec.icon * 0.9)} />
            )}
            <span className="text-[10px] font-display truncate max-w-[54px] mt-0.5 leading-tight">
              {isSilenced
                ? 'Sealed'
                : isChanneling
                ? 'Beam'
                : tacSec > 0
                ? 'Wait'
                : tacticalLabel.split(' ')[0]}
            </span>
          </button>

          {/* Skill 2: Ultimate - Hold & Drag to Aim */}
          <button
            type="button"
            onTouchStart={(e) => handleAbilityTouchStart('ult', e)}
            onTouchMove={handleAbilityTouchMove}
            onTouchEnd={(e) => handleAbilityTouchEnd(e, false)}
            onTouchCancel={(e) => handleAbilityTouchEnd(e, true)}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
              top: `${Math.round(arcDims.height * 0.08)}px`,
              left: `${Math.round(arcDims.width * 0.08)}px`,
            }}
            className={`absolute rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-lg cursor-pointer ${
              skillWheelUi?.action === 'ult'
                ? 'scale-110 bg-[#451A03]/95 border-[#FEF08A] text-white ring-2 ring-[#F59E0B]/80'
                : isSilenced
                ? 'bg-[#251B33]/90 border-[#A855F7] text-[#D8B4FE]'
                : ultSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#372A18]/95 border-[#F59E0B] text-[#FEF08A] active:scale-95'
            }`}
            aria-label={heroDef.ultName}
          >
            <span className="text-sm font-mono font-bold leading-none tabular-nums">
              {isSilenced ? 'SIL' : ultSec > 0 ? `${ultSec}s` : 'ULT'}
            </span>
            <span className="text-[9.5px] font-display truncate max-w-[54px] mt-0.5 leading-tight">
              {isSilenced ? 'Sealed' : ultSec > 0 ? 'Wait' : heroDef.ultName.split(' ')[0]}
            </span>
          </button>

          {/* Dash Button (Anchored neatly above Attack inside the radial arc) */}
          <button
            type="button"
            onTouchStart={(e) => handleAbilityTouchStart('dash', e)}
            onTouchMove={handleAbilityTouchMove}
            onTouchEnd={(e) => handleAbilityTouchEnd(e, false)}
            onTouchCancel={(e) => handleAbilityTouchEnd(e, true)}
            style={{
              width: `${btnSpec.util + 6}px`,
              height: `${btnSpec.util + 6}px`,
              top: '0px',
              right: '4px',
            }}
            className={`absolute rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-md cursor-pointer ${
              skillWheelUi?.action === 'dash'
                ? 'scale-110 bg-[#422006]/95 border-[#FEF08A] text-[#FEF08A] ring-2 ring-[#F59E0B]/70'
                : dashSec > 0
                ? 'bg-[#1E1E28]/85 border-[#38364C] text-[#6E6C7D]'
                : 'bg-[#2A2314]/95 border-[#F59E0B] text-[#FDE68A] active:scale-95'
            }`}
            aria-label="Dash Evasion"
          >
            <span className="text-[11px] font-mono font-bold leading-none tabular-nums">
              {dashSec > 0 ? `${dashSec}s` : 'DASH'}
            </span>
            <span className="text-[8.5px] font-mono leading-none mt-0.5 opacity-85">
              EVADE
            </span>
          </button>

          {/* Giant Primary Attack Button */}
          <button
            type="button"
            onTouchStart={handleAttackStart}
            onTouchEnd={handleAttackEnd}
            onTouchCancel={handleAttackEnd}
            style={{
              width: `${btnSpec.attack}px`,
              height: `${btnSpec.attack}px`,
            }}
            className={`rounded-full border-3 flex items-center justify-center shadow-2xl transition-transform cursor-pointer ${
              attackAiming
                ? 'scale-105 bg-[#DC2626] border-[#FECACA] text-white'
                : 'bg-[#B91C1C] border-[#F87171] text-white active:scale-95'
            }`}
            aria-label="Attack"
          >
            <svg
              width={btnSpec.attack * 0.44}
              height={btnSpec.attack * 0.44}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
              <path d="M13 19l6-6" />
              <path d="M16 16l4 4" />
              <path d="M19 21l2-2" />
            </svg>
          </button>
        </div>
      </div>

      {/* MOBILE LEGENDS-STYLE SKILL AIM WHEEL & CANCEL TARGET OVERLAY */}
      {skillWheelUi && (
        <>
          {/* Cancel Cast Drop Zone */}
          <div
            ref={cancelZoneRef}
            className={`fixed right-44 sm:right-56 bottom-48 sm:bottom-56 z-30 w-18 h-18 rounded-full border-2 flex flex-col items-center justify-center pointer-events-none transition-all shadow-2xl ${
              skillWheelUi.cancelled
                ? 'scale-115 bg-[#991B1B]/95 border-[#FECACA] text-white ring-4 ring-[#EF4444]/60'
                : 'bg-[#1E1418]/90 border-[#EF4444]/80 text-[#FCA5A5]'
            }`}
          >
            <span className="text-sm font-mono font-bold leading-none">✕</span>
            <span className="text-[8px] font-mono font-bold tracking-wider uppercase mt-0.5">
              Cancel
            </span>
          </div>

          {/* Floating Mini Skill Joystick Wheel centered on pressed skill button */}
          <div
            style={{
              position: 'fixed',
              left: `${skillWheelUi.originX}px`,
              top: `${skillWheelUi.originY}px`,
              width: '96px',
              height: '96px',
              marginLeft: '-48px',
              marginTop: '-48px',
              borderColor: skillWheelUi.cancelled
                ? '#EF4444'
                : skillWheelUi.accentColor,
            }}
            className="z-30 rounded-full border-2 bg-[#14131E]/65 backdrop-blur-[2px] flex items-center justify-center pointer-events-none shadow-2xl"
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-[#12111A]/90 border border-[#3C3A52] text-[9px] font-mono whitespace-nowrap text-white">
              {skillWheelUi.cancelled ? 'Cancel Cast' : skillWheelUi.label}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-30">
              <div className="w-full h-px bg-white" />
              <div className="h-full w-px bg-white absolute" />
            </div>
            <div
              style={{
                width: '30px',
                height: '30px',
                transform: `translate3d(${skillWheelUi.knobX}px, ${skillWheelUi.knobY}px, 0)`,
                backgroundColor: skillWheelUi.cancelled
                  ? '#EF4444'
                  : skillWheelUi.accentColor,
              }}
              className="rounded-full border-2 border-white/90 shadow-lg"
            />
          </div>
        </>
      )}
    </div>
  );
};
