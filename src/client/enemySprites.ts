import type { BiomeId, EnemyState } from '../shared/types.ts';
import { resolveEnemyDirection8, type DirectionalPose } from './directionalFacing.ts';

function getEnemyPose(en: EnemyState, facing?: DirectionalPose) {
  const pose = facing ?? resolveEnemyDirection8(en);
  const mirrorX = !pose.isPureVertical && pose.facingLeft;
  const isBack = pose.verticalPlane === 'back';
  const isFront = pose.verticalPlane === 'front';
  const isSide = pose.verticalPlane === 'side';
  const gazeX = pose.isPureVertical ? 0 : pose.isDiagonal ? 1.5 : 2.5;
  return { pose, mirrorX, isBack, isFront, isSide, gazeX };
}

function isEnemyTelegraphing(en: EnemyState): boolean {
  return en.state === 'windup' || Boolean(en.charging) || (en.chargeWindupMs ?? 0) > 0;
}

/**
 * Draws the Corrosive Mire Slime with multi-lobed dark-rimmed jelly silhouette,
 * submerged skull/bone shard, caustic bubbling crown, and dynamic pounce stretch.
 */
export function drawSlimeSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  biome: BiomeId,
  facing?: DirectionalPose
): void {
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);
  const isMoving = en.state === 'chase' || en.state === 'charge';
  const isWindup = en.state === 'windup' || (en.chargeWindupMs ?? 0) > 0;
  const isCharging = Boolean(en.charging) && (en.chargeWindupMs ?? 0) <= 0;

  let stretchY = 1;
  let stretchX = 1;
  let yOffset = 0;

  if (isWindup) {
    stretchY = 0.68;
    stretchX = 1.38;
    yOffset = 3;
  } else if (isCharging) {
    stretchY = 1.28;
    stretchX = 0.82;
    yOffset = -7;
  } else if (isMoving) {
    const bouncePhase = (now * 0.013 + ex * 0.1) % (Math.PI * 2);
    stretchY = 1 + Math.sin(bouncePhase) * 0.24;
    stretchX = 1 / stretchY;
    yOffset = Math.abs(Math.sin(bouncePhase)) * -6;
  } else {
    const idleBounce = Math.sin(now * 0.0036 + ex * 0.2);
    stretchY = 1 + idleBounce * 0.12;
    const idleWobble = Math.cos(now * 0.0028 + ex * 0.15) * 0.05;
    stretchX = 1 / stretchY + idleWobble;
    yOffset = -Math.abs(idleBounce) * 1.4;
  }

  const sy = ey + yOffset;
  const r = en.radius;

  // Ground shadow
  const shadowW = r * (1 + (1 - stretchY) * 0.45) * 1.9;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + r - 1, shadowW / 2, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Biome-specific caustic palette
  let rimDark = '#052E16';
  let outerJelly = '#15803D';
  let innerJelly = '#22C55E';
  let nucleusColor = '#A3E635';
  let eyeColor = '#FEF08A';

  if (en.slowedMs > 0 || en.frozenMs > 0) {
    rimDark = '#082F49';
    outerJelly = '#0284C7';
    innerJelly = '#38BDF8';
    nucleusColor = '#BAE6FD';
    eyeColor = '#FFFFFF';
  } else if (biome === 'catacombs') {
    rimDark = '#042F2E';
    outerJelly = '#0D9488';
    innerJelly = '#2DD4BF';
    nucleusColor = '#99F6E4';
    eyeColor = '#FDE047';
  } else if (biome === 'ember') {
    rimDark = '#431407';
    outerJelly = '#C2410C';
    innerJelly = '#F97316';
    nucleusColor = '#FDE047';
    eyeColor = '#FEF9C3';
  } else if (biome === 'void') {
    rimDark = '#1E1B4B';
    outerJelly = '#5B21B6';
    innerJelly = '#8B5CF6';
    nucleusColor = '#F43F5E';
    eyeColor = '#FDA4AF';
  } else if (biome === 'astral') {
    rimDark = '#082F49';
    outerJelly = '#0369A1';
    innerJelly = '#0EA5E9';
    nucleusColor = '#FEF08A';
    eyeColor = '#FEF08A';
  }

  ctx.save();
  ctx.translate(ex, sy);
  ctx.scale(mirrorX ? -stretchX : stretchX, stretchY);

  // 1. Dark Silhouette Rim + Lobed Caustic Skirt
  ctx.fillStyle = rimDark;
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.5, Math.PI, 0, false);
  ctx.lineTo(r + 1.5, r * 0.65);
  ctx.quadraticCurveTo(r * 0.5, r * 0.98, 0, r * 0.78);
  ctx.quadraticCurveTo(-r * 0.5, r * 0.98, -(r + 1.5), r * 0.65);
  ctx.closePath();
  ctx.fill();

  // 2. Outer Translucent Jelly Dome
  ctx.fillStyle = outerJelly;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0, false);
  ctx.lineTo(r, r * 0.58);
  ctx.quadraticCurveTo(r * 0.45, r * 0.88, 0, r * 0.7);
  ctx.quadraticCurveTo(-r * 0.45, r * 0.88, -r, r * 0.58);
  ctx.closePath();
  ctx.fill();

  // 3. Inner Glowing Core & Viscous Tendrils
  ctx.fillStyle = innerJelly;
  ctx.beginPath();
  ctx.arc(0, 1, r * 0.76, Math.PI, 0, false);
  ctx.lineTo(r * 0.76, r * 0.44);
  ctx.quadraticCurveTo(0, r * 0.7, -r * 0.76, r * 0.44);
  ctx.closePath();
  ctx.fill();

  // Acidic crest spikes on top when enraged/winding up
  const crestPulse = Math.sin(now * 0.01 + ex) * 1.5;
  ctx.fillStyle = outerJelly;
  ctx.fillRect(-r * 0.42, -r * 1.04 + crestPulse * 0.4, 3, 3);
  ctx.fillRect(r * 0.2, -r * 1.08 - crestPulse * 0.4, 3, 4);

  // 4. Submerged Dissolved Bone & Glowing Nucleus Core
  const nucBob = isMoving ? Math.sin(now * 0.008) * 1.5 : Math.sin(now * 0.004 + ex) * 2;
  const nucX = gazeX * 0.55;
  const nucY = -1 + nucBob + pose.dirY;
  ctx.fillStyle = nucleusColor;
  ctx.beginPath();
  ctx.arc(nucX, nucY, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  // Floating tiny skull/bone fragment suspended inside jelly
  ctx.fillStyle = 'rgba(241, 245, 249, 0.75)';
  ctx.fillRect(nucX - 4, nucY + 2, 4, 2);
  ctx.fillRect(nucX - 3, nucY + 1, 2, 4);

  // 5. Specular Jelly Shine & Caustic Bubbles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillRect(-r * 0.58, -r * 0.76, r * 0.6, 2.5);
  ctx.fillRect(-r * 0.68, -r * 0.64, 2.5, r * 0.34);
  const b1 = Math.sin(now * 0.006 + ex) * 2;
  ctx.fillStyle = nucleusColor;
  ctx.fillRect(r * 0.32, -r * 0.35 + b1, 2.5, 2.5);

  // 6. Predatory Glowing Eyes with Angry Brow Slant during Windup/Charge
  if (!isBack) {
    const blink = !isWindup && !isCharging && Math.sin(now * 0.0028 + ex) > 0.95;
    const eyeY = -r * 0.14 + pose.dirY * 1.3;
    const eyeSpacing = r * 0.36;
    const eyeOffsetX = gazeX * 0.85;

    ctx.fillStyle = rimDark;
    ctx.fillRect(-eyeSpacing - 3.5 + eyeOffsetX, eyeY - 3, 6, 5);
    ctx.fillRect(eyeSpacing - 2.5 + eyeOffsetX, eyeY - 3, 6, 5);

    if (!blink) {
      ctx.fillStyle = isWindup || isCharging ? '#EF4444' : eyeColor;
      ctx.fillRect(-eyeSpacing - 2.5 + eyeOffsetX, eyeY - 2, 4, 3);
      ctx.fillRect(eyeSpacing - 1.5 + eyeOffsetX, eyeY - 2, 4, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-eyeSpacing - 1.5 + eyeOffsetX, eyeY - 2, 1.5, 1.5);
      ctx.fillRect(eyeSpacing - 0.5 + eyeOffsetX, eyeY - 2, 1.5, 1.5);
    }
  }

  ctx.restore();

  if (isMoving && Math.random() < 0.22) {
    ctx.fillStyle = nucleusColor;
    ctx.fillRect(ex + (Math.random() - 0.5) * 10, ey + r - 1, 2.5, 2.5);
  }
}

/**
 * Draws the Grimalkin Raider with hunched bandit silhouette, tattered crimson scarf,
 * bone fang pauldron, tusked jaw, curved hooked scimitar, and offhand dagger.
 */
export function drawGoblinSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase' || en.state === 'charge';
  const isWindup = isEnemyTelegraphing(en);
  const isCharging = Boolean(en.charging) && (en.chargeWindupMs ?? 0) <= 0;
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  const idleBreathing = Math.sin(now * 0.0062 + ex * 0.18) * 1.4;
  const walkBob = isMoving ? Math.sin(now * 0.019 + ex * 0.15) * 2.5 : idleBreathing;
  const legCycle = isMoving ? Math.sin(now * 0.022 + ex * 0.1) * 3.5 : 0;
  const legX = pose.isPureVertical ? 0 : legCycle;
  const legY = pose.isPureVertical ? legCycle * 0.75 : 0;
  const earTwitch = !isMoving && Math.sin(now * 0.0038 + ex) > 0.85 ? Math.sin(now * 0.04) * 2 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 12, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey + walkBob);
  if (mirrorX) ctx.scale(-1, 1);
  if (isCharging) ctx.rotate(0.18);

  const drawScimitar = () => {
    ctx.save();
    const swordAngle = isWindup
      ? -1.05
      : isCharging
        ? 0.95
        : isMoving
          ? 0.35 + Math.sin(now * 0.016) * 0.22
          : 0.28 + Math.sin(now * 0.005 + ex) * 0.08;
    ctx.translate(7, 2);
    ctx.rotate(swordAngle);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-1, -18, 6, 20);
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-2, -1, 4, 4);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-4, -2, 8, 2);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, -15, 3, 14);
    ctx.fillRect(1, -18, 4, 4); // hooked tip
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(2, -17, 1.5, 14);
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(0, -11, 2, 2); // blood stain notch
    ctx.restore();
  };

  if (isBack) drawScimitar();

  // Offhand Barbed Dagger (left side)
  if (!isBack) {
    ctx.save();
    ctx.translate(-8, 3);
    ctx.rotate(isWindup ? 0.5 : -0.35);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-1, -9, 2.5, 9);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, -9, 1, 7);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-2, 0, 4, 2);
    ctx.restore();
  }

  // 1. Digitigrade Bandit Legs & Straps
  ctx.fillStyle = '#1E1B18';
  ctx.fillRect(-6 + legX, 6 + legY, 5, 6);
  ctx.fillRect(2 - legX, 6 - legY, 5, 6);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-5 + legX, 8 + legY, 4, 3);
  ctx.fillRect(2 - legX, 8 - legY, 4, 3);

  // 2. Stitched Raider Jerkin & Crimson Bandit Scarf
  ctx.fillStyle = '#1C1917';
  ctx.fillRect(-7, -3, 14, 11);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-6, -2, 12, 9);
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(-7, -3, 14, 3); // Tattered red neck scarf
  if (!isBack) {
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-1, 4, 3, 2);
  } else {
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(-4, 0, 8, 6); // trailing scarf tail
  }
  // Bone Fang Pauldron on left shoulder
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-9, -4, 3, 4);
  ctx.fillRect(-10, -5, 2, 2);

  // 3. Goblin Head, Jagged Ears & Tusks
  ctx.fillStyle = '#1A2E05';
  ctx.fillRect(-7, -14, 14, 12);
  ctx.fillStyle = '#4D7C0F';
  ctx.fillRect(-6, -13, 12, 10);
  ctx.fillStyle = '#65A30D';
  ctx.fillRect(-5, -12, 10, 8);

  // Pointed Ears + Gold Hoop
  ctx.fillStyle = '#3F6212';
  ctx.fillRect(-11, -12 + earTwitch, 5, 4);
  ctx.fillRect(-14, -11 + earTwitch, 3, 2);
  ctx.fillRect(5, -13 - earTwitch, 5, 4);
  ctx.fillRect(9, -14 - earTwitch, 4, 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(8, -10 - earTwitch, 2, 3);

  if (!isBack) {
    const faceOffset = pose.isPureVertical ? -3 : pose.isDiagonal ? -1 + gazeX * 0.45 : gazeX * 0.5;
    // Glowing Amber/Crimson Raider Eyes
    ctx.fillStyle = '#1C1917';
    ctx.fillRect(faceOffset - 1, -10, 4, 3);
    ctx.fillRect(faceOffset + 4, -10, 4, 3);
    ctx.fillStyle = isWindup || isCharging ? '#EF4444' : '#FBBF24';
    ctx.fillRect(faceOffset, -9, 2.5, 2);
    ctx.fillRect(faceOffset + 4.5, -9, 2.5, 2);
    // Pointed snout + white tusks
    ctx.fillStyle = '#3F6212';
    ctx.fillRect(faceOffset + 2, -7, 3, 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(faceOffset, -5, 1.5, 2);
    ctx.fillRect(faceOffset + 5, -5, 1.5, 2);
  } else {
    ctx.fillStyle = '#365314';
    ctx.fillRect(-4, -12, 8, 6);
  }

  if (!isBack) drawScimitar();

  ctx.restore();
}

/**
 * Draws the Bone Marksman as a hooded undead skeletal archer with ribcage,
 * bone arrow quiver on back, spectral cyan skull eyes, and drawn bone recurve bow.
 */
export function drawSkeletonSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = isEnemyTelegraphing(en);
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  const idleRattle = Math.sin(now * 0.0034 + ex * 0.14) * 1.2;
  const walkBob = isMoving ? Math.sin(now * 0.016 + ex * 0.2) * 2 : idleRattle;
  const legCycle = isMoving ? Math.sin(now * 0.02 + ex * 0.1) * 4 : 0;
  const legX = pose.isPureVertical ? 0 : legCycle;
  const legY = pose.isPureVertical ? legCycle * 0.65 : 0;
  const jawDrop = !isMoving && Math.sin(now * 0.003 + ex) > 0.72 ? 1 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 12, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey + walkBob);
  if (mirrorX) ctx.scale(-1, 1);

  const drawRecurveBow = () => {
    ctx.save();
    ctx.translate(7, -1);
    const drawPull = isWindup ? -3 : 0;
    // Bowstring
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, -11);
    ctx.lineTo(-2 + drawPull, 0);
    ctx.lineTo(1, 11);
    ctx.stroke();
    // Carved Bone Bow Limbs
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, -12, 3, 24);
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(1, -11, 2.5, 10);
    ctx.fillRect(1, 1, 2.5, 10);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(2, -12, 2, 3);
    ctx.fillRect(2, 9, 2, 3);
    // Notched Cyan-Tipped Bone Arrow
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(-2 + drawPull, -0.5, 11, 1.5);
    ctx.fillStyle = isWindup ? '#38BDF8' : '#CBD5E1';
    ctx.fillRect(8 + drawPull, -1.5, 3, 3.5);
    ctx.restore();
  };

  const drawBackQuiver = () => {
    ctx.save();
    ctx.translate(-6, -4);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-2, 0, 4, 11);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(-1.5, -3, 1.5, 3);
    ctx.fillRect(0.5, -4, 1.5, 4);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1.5, -4, 1.5, 1.5);
    ctx.fillRect(0.5, -5, 1.5, 1.5);
    ctx.restore();
  };

  if (isBack) {
    drawRecurveBow();
  } else {
    drawBackQuiver();
  }

  // 1. Skeletal Bone Legs
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-4 + legX, 7 + legY, 2.5, 6);
  ctx.fillRect(2 - legX, 7 - legY, 2.5, 6);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-5 + legX, 11 + legY, 3.5, 2);
  ctx.fillRect(1 - legX, 11 - legY, 3.5, 2);

  // 2. Tattered Ranger Grave-Cloak & Shroud
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-7, -3, 14, 13);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-6, -2, 12, 11);

  // 3. Articulated Ribcage & Spine
  ctx.fillStyle = '#475569';
  ctx.fillRect(-1, -2, 2, 9);
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(-5, -2, 10, 2);
  ctx.fillRect(-5.5, 1, 11, 2);
  ctx.fillRect(-4.5, 4, 9, 2);
  if (isBack) {
    drawBackQuiver();
  }

  // 4. Hooded Skull with Cyan Spectral Eye Flames
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-7, -16, 14, 13);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-6, -15, 12, 11);
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(-5, -13, 10, 8);

  if (!isBack) {
    const faceX = gazeX * 0.45;
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-4, -5 + jawDrop, 8, 2);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-1 + faceX, -7.5, 2, 2);
    ctx.fillRect(-4.5 + faceX, -10.5, 3.5, 3);
    ctx.fillRect(1 + faceX, -10.5, 3.5, 3);

    const flameH = 2.5 + Math.sin(now * 0.018 + ex) * 0.6;
    ctx.fillStyle = isWindup ? '#7DD3FC' : '#38BDF8';
    ctx.fillRect(-4 + faceX, -10, 2.5, flameH);
    ctx.fillRect(1.5 + faceX, -10, 2.5, flameH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-3.5 + faceX, -9.5, 1, 1);
    ctx.fillRect(2 + faceX, -9.5, 1, 1);
  } else {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-4, -14, 8, 8);
  }

  if (!isBack) drawRecurveBow();

  ctx.restore();
}

/**
 * Draws the Void Acolyte with jagged high-collared obsidian-plum mantle,
 * occult rune cowl, floating void grimoire/sigil ring, and crackling eldritch orb.
 */
export function drawCultistSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = isEnemyTelegraphing(en);
  const hoverBob = Math.sin(now * 0.0055 + ex * 0.1) * 3.5;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  const shadowScale = 1 - Math.abs(hoverBob) * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 13, 11 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey - 2 + hoverBob);
  if (mirrorX) ctx.scale(-1, 1);

  // Orbiting Dark Occult Ring behind robes
  ctx.strokeStyle = isWindup ? 'rgba(232, 121, 249, 0.85)' : 'rgba(168, 85, 247, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -1, en.radius + 3, 0, Math.PI * 2);
  ctx.stroke();

  // 1. Billowing Dark Vestments & High Jagged Mantle Collar
  const robeFlap = isMoving ? Math.sin(now * 0.015) * 2 : Math.sin(now * 0.004 + ex * 0.12) * 1.5;
  ctx.fillStyle = '#0F0718';
  ctx.fillRect(-9, -6, 18, 18);
  ctx.fillStyle = '#3B0764';
  ctx.fillRect(-8, -5, 16, 16);
  // High occult collar flares
  ctx.fillStyle = '#581C87';
  ctx.fillRect(-10, -9, 4, 6);
  ctx.fillRect(6, -9, 4, 6);

  // Frayed billowing hem
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-8 + robeFlap, 11, 4, 4);
  ctx.fillRect(-2, 12, 5, 4);
  ctx.fillRect(4 - robeFlap, 11, 4, 4);

  // Gold Runic Stole
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-7, 9, 14, 2);
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(-1.5, -3, 3, 9);
  ctx.fillRect(-4, 0, 8, 1.5);

  // 2. Pointed Horned Cowl
  ctx.fillStyle = '#1E0836';
  ctx.fillRect(-8, -17, 16, 13);
  ctx.fillStyle = '#4C1D95';
  ctx.fillRect(-7, -16, 14, 11);
  ctx.fillRect(-2.5, -20, 5, 4);
  ctx.fillStyle = '#A855F7';
  ctx.fillRect(-1, -21, 2, 2);

  if (!isBack) {
    const faceX = gazeX * 0.55;
    ctx.fillStyle = '#090710';
    ctx.fillRect(-5 + faceX, -13, 10, 7);
    ctx.fillStyle = isWindup ? '#F43F5E' : '#E879F9';
    ctx.fillRect(-3.5 + faceX, -10, 2.5, 2.5);
    ctx.fillRect(1 + faceX, -10, 2.5, 2.5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-3 + faceX, -9.5, 1, 1);
    ctx.fillRect(1.5 + faceX, -9.5, 1, 1);
  } else {
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-4, -5, 8, 1.5);
    ctx.fillStyle = '#6D28D9';
    ctx.fillRect(-1.5, -16, 3, 9);
  }

  // 3. Swirling Void Censer Orb + Counter-Orbiting Runes
  const orbBob = Math.sin(now * 0.008 + ex) * 2;
  const ox = 10;
  const oy = isWindup ? -6 : -1 + orbBob;
  ctx.fillStyle = 'rgba(168, 85, 247, 0.45)';
  ctx.beginPath();
  ctx.arc(ox, oy, isWindup ? 8 : 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6B21A8';
  ctx.beginPath();
  ctx.arc(ox, oy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isWindup ? '#FDA4AF' : '#E879F9';
  ctx.beginPath();
  ctx.arc(ox, oy, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(ox - 0.5, oy - 0.5, 1, 1);

  ctx.restore();
}

/**
 * Draws the Dread Halberdier in blackened iron plate armor with horned greathelm,
 * crimson war-cape, scarred bastion tower shield, and crimson-tasseled Dread Halberd.
 */
export function drawKnightSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = isEnemyTelegraphing(en);
  const isShielded = (en.shieldWallMs ?? 0) > 0;
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  const idleBob = Math.sin(now * 0.0028 + ex * 0.12) * 1.3;
  const walkBob = isMoving ? Math.sin(now * 0.014 + ex * 0.1) * 2.5 : idleBob;
  const legCycle = isMoving ? Math.sin(now * 0.016 + ex * 0.1) * 3 : 0;
  const legX = pose.isPureVertical ? 0 : legCycle;
  const legY = pose.isPureVertical ? legCycle * 0.7 : 0;
  const capeWave = Math.sin(now * 0.0036 + ex * 0.15) * 2;

  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 14, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey + walkBob);
  if (mirrorX) ctx.scale(-1, 1);

  const drawCape = () => {
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(-10, -5, 20 + capeWave * 0.5, 17);
    ctx.fillStyle = '#9F1239';
    ctx.fillRect(-9, -4, 18 + capeWave * 0.5, 14);
    if (isBack) {
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-9, 8, 18 + capeWave * 0.5, 2);
    }
  };

  if (!isBack) drawCape();

  // 1. Heavy Plate Greaves
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-6 + legX, 7 + legY, 5, 6);
  ctx.fillRect(2 - legX, 7 - legY, 5, 6);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-7 + legX, 11 + legY, 6, 3);
  ctx.fillRect(1 - legX, 11 - legY, 6, 3);

  // 2. Blackened Cuirass & Crimson Tabard
  ctx.fillStyle = '#090D16';
  ctx.fillRect(-9.5, -7, 19, 15);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-8, -6, 16, 13);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-7, -5, 14, 10);
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(-8, 3, 16, 3);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-2, 3, 4, 3);

  // 3. Spiked Steel Pauldrons
  ctx.fillStyle = '#475569';
  ctx.fillRect(-12, -9, 5, 7);
  ctx.fillRect(7, -9, 5, 7);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(-12, -11, 2, 3);
  ctx.fillRect(10, -11, 2, 3);

  if (isBack) drawCape();

  // 4. Horned Greathelm
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-8, -19, 16, 13);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-7, -18, 14, 11);
  // Swept Iron Horns
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-10, -21, 3, 5);
  ctx.fillRect(7, -21, 3, 5);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-2, -21, 4, 3);

  if (!isBack) {
    const visorX = gazeX * 0.65;
    ctx.fillStyle = '#090D16';
    ctx.fillRect(-5 + visorX, -14, 10, 4);
    ctx.fillStyle = isWindup ? '#FEF08A' : '#EF4444';
    ctx.fillRect(-4 + visorX, -13, 8, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2 + visorX, -13, 4, 1);
  } else {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-5, -13, 10, 4);
  }

  // 5. Tower Heater Shield (braces forward when shieldWallMs > 0)
  const shieldShiftX = isShielded ? 4 : 0;
  const shieldShiftY = isShielded ? -2 : 0;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-14 + shieldShiftX, -6 + shieldShiftY, 7, 17);
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(-13 + shieldShiftX, -5 + shieldShiftY, 5, 15);
  ctx.fillStyle = isShielded ? '#FEF08A' : '#D97706';
  ctx.fillRect(-13 + shieldShiftX, 0 + shieldShiftY, 5, 3);
  ctx.fillRect(-11.5 + shieldShiftX, -3 + shieldShiftY, 2, 9);

  // 6. Dread Halberd (Right Arm)
  ctx.save();
  const halberdAngle = isWindup ? -0.95 : 0.22 + (isMoving ? Math.sin(now * 0.014) * 0.18 : 0);
  ctx.translate(9, 0);
  ctx.rotate(halberdAngle);
  // Shaft
  ctx.fillStyle = '#451A03';
  ctx.fillRect(-1, -24, 2.5, 30);
  // Crimson tassel below axe-head
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(-2, -13, 4, 3);
  // Crescent Axe Blade + Spear Tip
  ctx.fillStyle = '#475569';
  ctx.fillRect(1, -23, 6, 9);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(5, -22, 2, 7);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(-1, -28, 3, 6);
  ctx.restore();

  ctx.restore();
}

/**
 * Draws the Abyssal Stalker with jagged obsidian void cloak, undulating tendrils,
 * horned phantom mask, pulsing void-heart rune, and dual curved karambit blades.
 */
export function drawShadowStalkerSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = isEnemyTelegraphing(en);
  const isCharging = Boolean(en.charging) && (en.chargeWindupMs ?? 0) <= 0;
  const floatBob = Math.sin(now * 0.008 + ex * 0.2) * 3;
  const sy = ey + floatBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(24, 7, 36, 0.58)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 1, en.radius * 1.15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);
  if (isCharging) ctx.rotate(0.24);

  // 1. Pulsing Shadow Aura
  const mistPulse = Math.sin(now * 0.01 + ex) * 2;
  ctx.fillStyle = isCharging ? 'rgba(244, 63, 94, 0.28)' : 'rgba(88, 28, 135, 0.36)';
  ctx.beginPath();
  ctx.arc(0, 0, en.radius + mistPulse, 0, Math.PI * 2);
  ctx.fill();

  // 2. Five Jagged Abyssal Shadow Tendrils
  for (let i = -2; i <= 2; i++) {
    const wave = Math.sin(now * 0.014 + i * 1.7) * 3.5;
    ctx.fillStyle = i % 2 === 0 ? '#3B0764' : '#1E1B4B';
    ctx.fillRect(i * 4 - 2 + wave, 6, 4, 11 + Math.abs(i % 2) * 3);
  }

  // 3. Obsidian Shadow Cloak & Glowing Void-Heart Rune
  ctx.fillStyle = '#09040F';
  ctx.fillRect(-10, -10, 20, 18);
  ctx.fillStyle = '#2E1065';
  ctx.fillRect(-7, -8, 14, 14);
  if (!isBack) {
    ctx.fillStyle = isWindup || isCharging ? '#FB7185' : '#A855F7';
    ctx.fillRect(-2, -3, 4, 5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1, -1, 2, 2);
  }

  // 4. Horned Phantom Mask Cowl
  ctx.fillStyle = '#09040F';
  ctx.fillRect(-8, -20, 16, 12);
  ctx.fillStyle = '#4C1D95';
  ctx.fillRect(-6, -18, 12, 9);
  ctx.fillStyle = '#A855F7';
  ctx.fillRect(-9.5, -25, 3, 7);
  ctx.fillRect(6.5, -25, 3, 7);

  if (!isBack) {
    const eyeX = gazeX * 0.6;
    ctx.fillStyle = isWindup || isCharging ? '#FDA4AF' : '#F43F5E';
    ctx.fillRect(-5 + eyeX, -14, 3.5, 2.5);
    ctx.fillRect(1.5 + eyeX, -14, 3.5, 2.5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-4 + eyeX, -13.5, 1.5, 1);
    ctx.fillRect(2.5 + eyeX, -13.5, 1.5, 1);
  } else {
    ctx.fillStyle = '#7C3AED';
    ctx.fillRect(-1, -17, 2, 16);
  }

  // 5. Dual Curved Obsidian Mantis Karambits
  const bladeAngle = isWindup ? 0.75 : isCharging ? -0.85 : Math.sin(now * 0.008) * 0.2;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 11, 0);
    ctx.rotate(side * bladeAngle);
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-2.5, -16, 5, 20);
    ctx.fillStyle = '#9333EA';
    ctx.fillRect(-1.5, -15, 3, 18);
    ctx.fillStyle = '#F43F5E';
    ctx.fillRect(side > 0 ? -2 : 0, -14, 2, 15);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws the Celestial Sentinel astrolabe-golem with rotating dual rune rings,
 * chamfered star-forged torso, tri-eye prism visor, floating gauntlets, and shards.
 */
export function drawAstralSentinelSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = isEnemyTelegraphing(en);
  const floatBob = Math.sin(now * 0.005 + ex * 0.15) * 2.5;
  const sy = ey + floatBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(14, 116, 144, 0.42)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius, en.radius * 1.15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 1. Dual Counter-Rotating Astrolabe Rings
  const rotA = now * 0.0022;
  ctx.strokeStyle = isWindup ? 'rgba(254, 240, 138, 0.85)' : 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, en.radius + 4, rotA, rotA + Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, en.radius + 7, -rotA, -rotA + Math.PI * 1.2);
  ctx.stroke();

  // 2. Chamfered Star-Forged Cuirass
  ctx.fillStyle = '#081326';
  ctx.fillRect(-11, -9, 22, 20);
  ctx.fillStyle = '#0369A1';
  ctx.fillRect(-8, -7, 16, 16);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-9, -9, 4, 2);
  ctx.fillRect(5, -9, 4, 2);

  // 3. Starlight Core
  ctx.fillStyle = isWindup ? '#FEF08A' : '#38BDF8';
  if (!isBack) {
    ctx.fillRect(-5, -4, 10, 10);
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(-3, -2, 6, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1.5, -0.5, 3, 3);
  } else {
    ctx.fillRect(-1.5, -6, 3, 12);
  }

  // 4. Floating Runic Shoulder Slabs & Energy Gauntlets
  const padShift = Math.sin(now * 0.006) * 1.8;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-17, -13 + padShift, 7, 12);
  ctx.fillRect(10, -13 - padShift, 7, 12);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-16, -12 + padShift, 5, 10);
  ctx.fillRect(11, -12 - padShift, 5, 10);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-15, -9 + padShift, 3, 4);
  ctx.fillRect(12, -9 - padShift, 3, 4);

  // 5. Diamond Prism Head
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-7, -21, 14, 12);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-5, -19, 10, 8);
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(-2, -23, 4, 3);
  if (!isBack) {
    const visorX = gazeX * 0.55;
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-4 + visorX, -16, 8, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2 + visorX, -15, 4, 1);
  } else {
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1, -19, 2, 7);
  }

  // 6. Orbiting Faceted Crystal Shards
  for (let s = 0; s < 3; s++) {
    const ang = now * 0.0038 + (s * Math.PI * 2) / 3;
    const sx = Math.cos(ang) * (en.radius + 8);
    const syOrb = Math.sin(ang) * (en.radius * 0.55);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(sx - 2, syOrb - 2.5, 4, 5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(sx - 1, syOrb - 1, 2, 2);
  }

  ctx.restore();
}

/**
 * Hymn Phantom — Spectral choir spirit with gilded cathedral mitre,
 * sacred ivory-gold stole wings, resonance bell-staff, and harmonic rings.
 */
export function drawHymnPhantomSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = isEnemyTelegraphing(en);
  const floatBob = Math.sin(now * 0.0055 + ex * 0.18) * 3.5;
  const sy = ey + floatBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  const shadowAlpha = 0.3 + Math.sin(now * 0.004) * 0.08;
  ctx.fillStyle = `rgba(245, 158, 11, ${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius + 1, en.radius * 1.15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);

  ctx.save();
  if (mirrorX) ctx.scale(-1, 1);

  if (isWindup) {
    const ringPulse = (now * 0.012) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, en.radius + 4 + Math.sin(ringPulse) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ethereal Tail
  const tailSway = Math.sin(now * 0.007 + ex) * 3;
  ctx.fillStyle = 'rgba(217, 119, 6, 0.78)';
  ctx.beginPath();
  ctx.moveTo(-en.radius * 0.75, 4);
  ctx.quadraticCurveTo(-en.radius * 0.4 + tailSway, en.radius * 0.9, tailSway, en.radius * 1.3);
  ctx.quadraticCurveTo(en.radius * 0.4 + tailSway, en.radius * 0.9, en.radius * 0.75, 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(254, 243, 199, 0.94)';
  ctx.beginPath();
  ctx.moveTo(-en.radius * 0.5, 6);
  ctx.quadraticCurveTo(tailSway * 0.6, en.radius * 0.8, tailSway * 0.8, en.radius * 1.12);
  ctx.quadraticCurveTo(tailSway * 0.6, en.radius * 0.7, en.radius * 0.5, 6);
  ctx.closePath();
  ctx.fill();

  // Flowing Seraph Stole Side Wings
  const wingFlap = Math.sin(now * 0.008 + ex) * 2;
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-en.radius * 0.95, -en.radius * 0.25 + wingFlap, 5, en.radius * 0.75);
  ctx.fillRect(en.radius * 0.65, -en.radius * 0.25 - wingFlap, 5, en.radius * 0.75);

  // Layered Choir Robes
  ctx.fillStyle = '#292524';
  ctx.fillRect(-en.radius * 0.7, -en.radius * 0.45, en.radius * 1.4, en.radius * 0.95);
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(-en.radius * 0.55, -en.radius * 0.35, en.radius * 1.1, en.radius * 0.8);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-2.5, -en.radius * 0.3, 5, en.radius * 0.8);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-1, -en.radius * 0.15, 2, en.radius * 0.55);

  // Tall Cathedral Mitre & Shadow Veil
  ctx.fillStyle = '#F3EFE6';
  ctx.fillRect(-en.radius * 0.55, -en.radius * 1.25, en.radius * 1.1, en.radius * 0.95);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-en.radius * 0.3, -en.radius * 1.45, en.radius * 0.6, 4);
  if (!isBack) {
    const faceX = gazeX * 0.45;
    ctx.fillStyle = '#292524';
    ctx.fillRect(-en.radius * 0.4 + faceX, -en.radius * 1.05, en.radius * 0.8, en.radius * 0.65);
    ctx.fillStyle = isWindup ? '#FFFFFF' : '#FEF08A';
    ctx.fillRect(-en.radius * 0.3 + faceX, -en.radius * 0.85, 3, 2.5);
    ctx.fillRect(en.radius * 0.12 + faceX, -en.radius * 0.85, 3, 2.5);
  }

  // Choir Halo
  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, -en.radius * 1.28, en.radius * 0.65, 2.6, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Brass Resonance Bell-Staff
  const chimeBob = Math.sin(now * 0.008) * 1.5;
  ctx.fillStyle = '#78350F';
  ctx.fillRect(en.radius * 0.6, -en.radius * 0.5 + chimeBob, 2, en.radius * 1.2);
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(en.radius * 0.45, -en.radius * 0.55 + chimeBob, 6, 5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(en.radius * 0.55, -en.radius * 0.5 + chimeBob, 2, 2);

  ctx.restore();

  // Orbiting Musical Notes
  for (let k = 0; k < 3; k++) {
    const rAng = now * 0.003 + (k * Math.PI * 2) / 3;
    const rx = Math.cos(rAng) * (en.radius + 7);
    const ry = Math.sin(rAng) * (en.radius * 0.45) - 2;
    ctx.fillStyle = '#FEF08A';
    ctx.font = '700 7px serif';
    ctx.fillText(k === 0 ? '♪' : k === 1 ? '♫' : '♩', rx - 2, ry + 2);
  }

  ctx.restore();
}

/**
 * Relic Golem — Towering ancient bronze and basalt reliquary colossus
 * with glowing amber rune fissures, chained shoulder plates, and siege fists.
 */
export function drawRelicGolemSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = isEnemyTelegraphing(en);
  const stompGait = isMoving ? Math.sin(now * 0.012 + ex) * 2.5 : Math.sin(now * 0.003) * 1;
  const sy = ey + stompGait;
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.54)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 1, en.radius * 1.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  const legSwing = isMoving ? Math.sin(now * 0.012 + ex) * 4 : 0;
  const legX = pose.isPureVertical ? 0 : legSwing * 0.35;
  const legY = pose.isPureVertical ? legSwing * 0.75 : legSwing;

  // Heavy Stone Legs
  ctx.fillStyle = '#1C1917';
  ctx.fillRect(-en.radius * 0.72 + legX, en.radius * 0.38 + legY, en.radius * 0.58, en.radius * 0.65);
  ctx.fillRect(en.radius * 0.14 - legX, en.radius * 0.38 - legY, en.radius * 0.58, en.radius * 0.65);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(-en.radius * 0.72 + legX, en.radius * 0.85 + legY, en.radius * 0.58, 3);
  ctx.fillRect(en.radius * 0.14 - legX, en.radius * 0.85 - legY, en.radius * 0.58, 3);

  // Monolithic Torso
  ctx.fillStyle = '#1C1917';
  ctx.fillRect(-en.radius * 0.95, -en.radius * 0.75, en.radius * 1.9, en.radius * 1.3);
  ctx.fillStyle = '#57534E';
  ctx.fillRect(-en.radius * 0.82, -en.radius * 0.62, en.radius * 1.64, en.radius * 1.08);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(-en.radius * 0.78, -en.radius * 0.58, en.radius * 1.56, 3);
  ctx.fillRect(-en.radius * 0.78, en.radius * 0.32, en.radius * 1.56, 3);

  // Glowing Molten-Amber Relic Fissure Core
  if (!isBack) {
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-en.radius * 0.34, -en.radius * 0.24, en.radius * 0.68, en.radius * 0.54);
    ctx.fillStyle = '#F97316';
    ctx.fillRect(-en.radius * 0.22, -en.radius * 0.14, en.radius * 0.44, en.radius * 0.36);
    ctx.fillStyle = isWindup ? '#FFFFFF' : '#FEF08A';
    ctx.fillRect(-2.5, -2.5, 5, 5);
  } else {
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-en.radius * 0.2, -en.radius * 0.45, en.radius * 0.4, en.radius * 0.75);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-1.5, -en.radius * 0.35, 3, en.radius * 0.55);
  }

  // Rune-Engraved Shoulder Monoliths
  ctx.fillStyle = '#292524';
  ctx.fillRect(-en.radius * 1.2, -en.radius * 0.92, en.radius * 0.48, en.radius * 0.8);
  ctx.fillRect(en.radius * 0.72, -en.radius * 0.92, en.radius * 0.48, en.radius * 0.8);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-en.radius * 1.1, -en.radius * 0.78, en.radius * 0.28, 2.5);
  ctx.fillRect(en.radius * 0.82, -en.radius * 0.78, en.radius * 0.28, 2.5);
  ctx.fillRect(-en.radius * 1.1, -en.radius * 0.55, en.radius * 0.28, 2.5);
  ctx.fillRect(en.radius * 0.82, -en.radius * 0.55, en.radius * 0.28, 2.5);

  // Horned Monolith Stone Head
  ctx.fillStyle = '#1C1917';
  ctx.fillRect(-en.radius * 0.48, -en.radius * 1.28, en.radius * 0.96, en.radius * 0.62);
  ctx.fillStyle = '#44403C';
  ctx.fillRect(-en.radius * 0.36, -en.radius * 1.16, en.radius * 0.72, en.radius * 0.45);
  if (!isBack) {
    const eyeX = gazeX * 0.55;
    ctx.fillStyle = isWindup ? '#FEF08A' : '#F59E0B';
    ctx.fillRect(-en.radius * 0.26 + eyeX, -en.radius * 0.96, en.radius * 0.52, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1 + eyeX, -en.radius * 0.96, 2, 2);
  }

  // Dual Siege Fists (Right raised during windup)
  const fistRise = isWindup ? -9 : 0;
  ctx.fillStyle = '#1C1917';
  ctx.fillRect(-en.radius * 1.32, -en.radius * 0.15, en.radius * 0.45, en.radius * 0.78);
  ctx.fillRect(en.radius * 0.86, -en.radius * 0.35 + fistRise, en.radius * 0.52, en.radius * 0.85);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(en.radius * 0.82, en.radius * 0.2 + fistRise, en.radius * 0.6, 6);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(en.radius * 0.92, en.radius * 0.28 + fistRise, 3.5, 3.5);

  ctx.restore();
}

/**
 * Veiled Heretic — Corrupted inquisitor acolyte with spiked brass crown,
 * blood-stained blindfold veil, iron chains, and severed-sun void censer staff.
 */
export function drawVeiledHereticSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = isEnemyTelegraphing(en);
  const walkBob = en.state === 'chase' ? Math.sin(now * 0.014 + ex) * 2 : Math.sin(now * 0.003) * 1;
  const sy = ey + walkBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 1, en.radius * 1.15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  if (isWindup) {
    ctx.strokeStyle = 'rgba(232, 121, 249, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, en.radius * 0.75, en.radius * 0.95, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tattered Obsidian-Crimson Robes
  const hemSway = Math.sin(now * 0.006 + ex) * 2;
  ctx.fillStyle = '#09090B';
  ctx.beginPath();
  ctx.moveTo(-en.radius * 0.74, -en.radius * 0.35);
  ctx.lineTo(-en.radius * 0.84 + hemSway, en.radius * 0.92);
  ctx.lineTo(en.radius * 0.84 + hemSway, en.radius * 0.92);
  ctx.lineTo(en.radius * 0.74, -en.radius * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#3B0764';
  ctx.fillRect(-en.radius * 0.56, -en.radius * 0.22, en.radius * 1.12, en.radius * 1.05);
  ctx.fillStyle = '#7F1D1D';
  ctx.fillRect(-en.radius * 0.34, -en.radius * 0.12, en.radius * 0.68, en.radius * 0.88);

  if (!isBack) {
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-3.5, -en.radius * 0.05, 7, 7);
    ctx.fillStyle = '#F43F5E';
    ctx.fillRect(-1.5, 1, 3, 3);
  } else {
    ctx.fillStyle = '#6D28D9';
    ctx.fillRect(-1.5, -en.radius * 0.15, 3, en.radius * 0.7);
  }

  // Spiked Brass Crown + Blood-Veiled Cowl
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-en.radius * 0.56, -en.radius * 1.12, en.radius * 1.12, en.radius * 0.9);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-en.radius * 0.52, -en.radius * 1.24, en.radius * 1.04, 3);
  ctx.fillRect(-en.radius * 0.4, -en.radius * 1.38, 2, 4);
  ctx.fillRect(-1, -en.radius * 1.44, 2, 5);
  ctx.fillRect(en.radius * 0.3, -en.radius * 1.38, 2, 4);

  if (!isBack) {
    const faceX = gazeX * 0.5;
    // Veiled blindfold strip + bleeding crimson eyes
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-en.radius * 0.42 + faceX, -en.radius * 0.85, en.radius * 0.84, 4);
    ctx.fillStyle = isWindup ? '#FDA4AF' : '#E11D48';
    ctx.fillRect(-en.radius * 0.28 + faceX, -en.radius * 0.78, 2.5, 2);
    ctx.fillRect(en.radius * 0.1 + faceX, -en.radius * 0.78, 2.5, 2);
  } else {
    ctx.fillStyle = '#3B0764';
    ctx.fillRect(-en.radius * 0.35, -en.radius * 0.95, en.radius * 0.7, en.radius * 0.6);
  }

  // Twisted Bone Scripture Staff
  const wandTilt = isWindup ? -0.55 : 0.16;
  ctx.save();
  ctx.translate(en.radius * 0.68, 0);
  ctx.rotate(wandTilt);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-1.5, -en.radius * 0.95, 3, en.radius * 1.2);
  ctx.fillStyle = '#A855F7';
  ctx.fillRect(-3.5, -en.radius * 1.15, 7, 5);
  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(-1.5, -en.radius * 1.1, 3, 3);
  ctx.restore();

  ctx.restore();
}

/**
 * Celestial Arbiter — Winged divine paladin-judge with layered seraphic light-wings,
 * ivory-gold plate, split solar halo crown, and radiant judgement greatsword.
 */
export function drawCelestialArbiterSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = isEnemyTelegraphing(en);
  const isCharging = Boolean(en.charging) && (en.chargeWindupMs ?? 0) <= 0;
  const hoverBob = Math.sin(now * 0.0055 + ex * 0.15) * 3;
  const sy = ey + hoverBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(234, 179, 8, 0.3)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius, en.radius * 1.15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);
  if (isCharging) ctx.rotate(0.2);

  // 1. Seraphic Radiant Wings
  const wingSpread = Math.sin(now * 0.007 + ex) * 2;
  ctx.fillStyle = isCharging ? 'rgba(254, 240, 138, 0.9)' : 'rgba(56, 189, 248, 0.78)';
  ctx.fillRect(-en.radius * 1.55, -en.radius * 0.8 + wingSpread, en.radius * 0.7, 4);
  ctx.fillRect(-en.radius * 1.35, -en.radius * 0.45 + wingSpread, en.radius * 0.55, 4);
  ctx.fillRect(en.radius * 0.85, -en.radius * 0.8 + wingSpread, en.radius * 0.7, 4);
  ctx.fillRect(en.radius * 0.8, -en.radius * 0.45 + wingSpread, en.radius * 0.55, 4);

  // 2. Solar Ring Halo
  const haloRot = now * 0.0022;
  ctx.save();
  ctx.rotate(haloRot);
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -en.radius * 0.4, en.radius + 4, 0, Math.PI * 2);
  ctx.stroke();
  for (let s = 0; s < 4; s++) {
    const sAng = (s * Math.PI) / 2;
    const sx = Math.cos(sAng) * (en.radius + 4);
    const syH = Math.sin(sAng) * (en.radius + 4) - en.radius * 0.4;
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(sx - 1.5, syH - 1.5, 3, 3);
  }
  ctx.restore();

  // 3. Ivory & Solar-Gold Armor
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-en.radius * 0.72, -en.radius * 0.6, en.radius * 1.44, en.radius * 1.18);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-en.radius * 0.65, -en.radius * 0.55, en.radius * 1.3, en.radius * 1.1);
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-en.radius * 0.45, -en.radius * 0.38, en.radius * 0.9, 3);
  ctx.fillRect(-en.radius * 0.45, en.radius * 0.14, en.radius * 0.9, 3);
  if (!isBack) {
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(-2, -en.radius * 0.16, 4, 4.5);
  } else {
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-en.radius * 0.3, -en.radius * 0.3, en.radius * 0.6, en.radius * 0.8);
  }

  // 4. Winged Diadem Helm
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(-en.radius * 0.46, -en.radius * 1.26, en.radius * 0.92, en.radius * 0.7);
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-en.radius * 0.58, -en.radius * 1.3, en.radius * 1.16, 3);
  ctx.fillRect(-en.radius * 0.52, -en.radius * 1.5, 3, 6);
  ctx.fillRect(en.radius * 0.34, -en.radius * 1.5, 3, 6);
  if (!isBack) {
    const visorX = gazeX * 0.5;
    ctx.fillStyle = isWindup || isCharging ? '#FEF08A' : '#38BDF8';
    ctx.fillRect(-en.radius * 0.3 + visorX, -en.radius * 0.95, en.radius * 0.6, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-en.radius * 0.15 + visorX, -en.radius * 0.95, en.radius * 0.3, 2);
  }

  // 5. Blazing Judgement Greatsword
  ctx.save();
  ctx.translate(en.radius * 0.82, -en.radius * 0.1);
  ctx.rotate(isWindup ? -0.65 : isCharging ? 0.9 : Math.sin(now * 0.008) * 0.08);
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-4, 0, 8, 3);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(-1, 3, 2, 5);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-2.5, -en.radius * 1.5, 5, en.radius * 1.5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-1, -en.radius * 1.45, 2, en.radius * 1.4);
  ctx.restore();

  ctx.restore();
}

/**
 * Warden Enforcer — Imposing bastion juggernaut with cobalt-steel fortress plate,
 * reinforced pavise shield, horned helm, and colossal azure-runed Warden Halberd.
 */
export function drawWardenEnforcerSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = isEnemyTelegraphing(en);
  const isCharging = Boolean(en.charging) && (en.chargeWindupMs ?? 0) <= 0;
  const isShielded = (en.shieldWallMs ?? 0) > 0;
  const marchBob = isMoving ? Math.sin(now * 0.013 + ex) * 2.5 : Math.sin(now * 0.003) * 1;
  const sy = ey + marchBob;
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 1, en.radius * 1.4, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  const legOffset = isMoving ? Math.sin(now * 0.013 + ex) * 4 : 0;
  const legX = pose.isPureVertical ? 0 : legOffset * 0.35;
  const legY = pose.isPureVertical ? legOffset * 0.75 : legOffset;

  // Heavy Greaves
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-en.radius * 0.65 + legX, en.radius * 0.45 + legY, en.radius * 0.52, en.radius * 0.62);
  ctx.fillRect(en.radius * 0.13 - legX, en.radius * 0.45 - legY, en.radius * 0.52, en.radius * 0.62);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-en.radius * 0.65 + legX, en.radius * 0.75 + legY, en.radius * 0.52, 3);
  ctx.fillRect(en.radius * 0.13 - legX, en.radius * 0.75 - legY, en.radius * 0.52, 3);

  // Cobalt-Steel Fortress Cuirass
  ctx.fillStyle = '#090D16';
  ctx.fillRect(-en.radius * 0.9, -en.radius * 0.65, en.radius * 1.8, en.radius * 1.22);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-en.radius * 0.78, -en.radius * 0.54, en.radius * 1.56, en.radius * 1.02);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-en.radius * 0.62, -en.radius * 0.42, en.radius * 1.24, en.radius * 0.8);

  if (!isBack) {
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(-2.5, -en.radius * 0.36, 5, en.radius * 0.72);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1, -en.radius * 0.25, 2, en.radius * 0.5);
  } else {
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(-en.radius * 0.55, -en.radius * 0.45, en.radius * 1.1, en.radius * 0.9);
  }

  // Spiked Bastion Pauldrons
  ctx.fillStyle = '#475569';
  ctx.fillRect(-en.radius * 1.2, -en.radius * 0.84, en.radius * 0.48, en.radius * 0.7);
  ctx.fillRect(en.radius * 0.72, -en.radius * 0.84, en.radius * 0.48, en.radius * 0.7);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-en.radius * 1.15, -en.radius * 1.06, 3.5, 5);
  ctx.fillRect(en.radius * 0.96, -en.radius * 1.06, 3.5, 5);

  // Horned Fortress Greathelm
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-en.radius * 0.52, -en.radius * 1.28, en.radius * 1.04, en.radius * 0.72);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-en.radius * 0.42, -en.radius * 1.18, en.radius * 0.84, en.radius * 0.56);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-en.radius * 0.64, -en.radius * 1.4, 3, 6);
  ctx.fillRect(en.radius * 0.46, -en.radius * 1.4, 3, 6);
  if (!isBack) {
    const visorX = gazeX * 0.55;
    ctx.fillStyle = isWindup || isCharging ? '#FEF08A' : '#38BDF8';
    ctx.fillRect(-en.radius * 0.28 + visorX, -en.radius * 0.96, en.radius * 0.56, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2 + visorX, -en.radius * 0.96, 4, 2);
  }

  // Colossal Warden Halberd
  const halberdTilt = isWindup ? -0.82 : isCharging ? 0.68 : 0.2;
  ctx.save();
  ctx.translate(en.radius * 0.78, 0);
  ctx.rotate(halberdTilt);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-2, -en.radius * 1.65, 4, en.radius * 2.25);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(1.5, -en.radius * 1.55, en.radius * 0.8, en.radius * 0.7);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(1.5 + en.radius * 0.68, -en.radius * 1.5, 3, en.radius * 0.6);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-en.radius * 0.45, -en.radius * 1.4, en.radius * 0.45, 3);
  ctx.restore();

  // Reinforced Bastion Pavise Buckler (braces forward when shieldWallMs > 0)
  const shX = isShielded ? 4 : 0;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-en.radius * 1.2 + shX, -en.radius * 0.3, 6.5, en.radius * 0.95);
  ctx.fillStyle = '#1E3A8A';
  ctx.fillRect(-en.radius * 1.14 + shX, -en.radius * 0.22, 5, en.radius * 0.8);
  ctx.fillStyle = isShielded ? '#FEF08A' : '#38BDF8';
  ctx.fillRect(-en.radius * 1.12 + shX, 0, 4, 4);

  ctx.restore();
}

/**
 * Generic Fallback Enemy — Dark fantasy mercenary shadow silhouette.
 */
export function drawGenericEnemySprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const walkBob = Math.sin(now * 0.005 + ex) * 1.5;
  const sy = ey + walkBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, en.radius * 1.2, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  ctx.fillStyle = '#1F2937';
  ctx.fillRect(-en.radius * 0.65, -en.radius * 0.5, en.radius * 1.3, en.radius * 1.1);
  ctx.fillStyle = '#374151';
  ctx.fillRect(-en.radius * 0.5, -en.radius * 0.4, en.radius, en.radius * 0.9);

  ctx.fillStyle = '#111827';
  ctx.fillRect(-en.radius * 0.45, -en.radius * 1.1, en.radius * 0.9, en.radius * 0.65);

  if (!isBack) {
    const eyeX = gazeX * 0.5;
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-en.radius * 0.25 + eyeX, -en.radius * 0.85, 3, 2);
    ctx.fillRect(en.radius * 0.1 + eyeX, -en.radius * 0.85, 3, 2);
  }

  ctx.fillStyle = '#9CA3AF';
  ctx.fillRect(en.radius * 0.6, -en.radius * 0.5, 3, en.radius * 0.9);

  ctx.restore();
}
