import React from 'react';
import type { ActiveTacticalId } from '../shared/armaments.ts';

interface TacticalSkillIconProps {
  tacticalId: ActiveTacticalId;
  color?: string;
  size?: number;
  className?: string;
}

/**
 * Crisp pixel/geometric SVG icon renderer for the Shared Tactical System:
 * Class Default Tacticals, Ascendant Weapon Tacticals, and Arcanist Spell Scrolls.
 */
export const TacticalSkillIcon: React.FC<TacticalSkillIconProps> = ({
  tacticalId,
  color,
  size = 18,
  className = '',
}) => {
  const c = color || '#E2E8F0';

  const renderGlyph = () => {
    switch (tacticalId) {
      case 'bastion_counter':
        return (
          <>
            <path d="M12 3l7 3v5c0 4.5-2.9 8.4-7 10-4.1-1.6-7-5.5-7-10V6l7-3z" stroke={c} strokeWidth="2" fill="none" />
            <path d="M9 12l3-3 3 3-3 4z" fill={c} />
          </>
        );
      case 'crimson_frenzy':
        return (
          <>
            <path d="M6 19L18 5" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M13 4c3.5 0 6 2.5 6 6-2.5-.5-4.5-2-6-6z" fill={c} />
            <path d="M5 14c0-3.2 2-5.5 5-6-1 2.8-1 4.5-5 6z" fill={c} opacity="0.85" />
          </>
        );
      case 'cyclone_break':
        return (
          <>
            <path d="M4 7c3-2 13-2 16 0-3 2-11 2-14 4 4 1.5 10 1.5 12 3-3 2-8 2-10 4" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" />
            <circle cx="12" cy="18" r="1.8" fill={c} />
          </>
        );
      case 'black_sun':
        return (
          <>
            <circle cx="12" cy="12" r="5" fill="#09090B" stroke={c} strokeWidth="2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" />
          </>
        );
      case 'seraphic_judgment':
        return (
          <>
            <path d="M12 3v18M5 10h14" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="10" r="3" fill="#FEF08A" />
          </>
        );
      case 'bulwark_dash':
        return (
          <>
            <path d="M4 12h12M11 6l6 6-6 6" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M19 6v12" stroke={c} strokeWidth="2" strokeLinecap="round" />
          </>
        );
      case 'frost_volley':
        return (
          <>
            <path d="M4 12l15-6M4 12h16M4 12l15 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="19" cy="12" r="1.5" fill={c} />
          </>
        );
      case 'astral_nova':
        return (
          <>
            <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" stroke={c} strokeWidth="1.8" fill="none" />
            <circle cx="12" cy="12" r="2" fill={c} />
          </>
        );
      case 'sanctified_pulse':
        return (
          <>
            <circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.8" fill="none" />
            <path d="M12 8v8M8 12h8" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
          </>
        );
      case 'arcane_meteor':
        return (
          <>
            <circle cx="14" cy="10" r="5" fill={c} />
            <path d="M4 20l6-6M7 21l4-4M3 16l4-4" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          </>
        );
      case 'fireball':
        return (
          <>
            <path d="M12 3c3 3 6 6 6 10a6 6 0 11-12 0c0-3 2-6 6-10z" stroke={c} strokeWidth="2" fill="none" />
            <circle cx="12" cy="14" r="2.5" fill={c} />
          </>
        );
      case 'chain_lightning':
        return (
          <path d="M13 3L6 13h6l-1 8 7-10h-6l1-8z" stroke={c} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        );
      case 'disintegration':
        return (
          <>
            <path d="M3 12h18" stroke={c} strokeWidth="3" strokeLinecap="round" />
            <path d="M15 7l5 5-5 5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </>
        );
      case 'frost_lance':
        return (
          <>
            <path d="M4 12h14M13 7l5 5-5 5M8 9l2 3-2 3" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </>
        );
      case 'arcane_orb':
        return (
          <>
            <circle cx="12" cy="12" r="6" stroke={c} strokeWidth="2" fill="none" />
            <circle cx="12" cy="12" r="2.5" fill={c} />
          </>
        );
      case 'arcane_barrage':
        return (
          <>
            <path d="M4 7l6 2-4 3zM14 5l6 2-4 3zM9 14l6 2-4 3z" fill={c} />
          </>
        );
      default:
        return <circle cx="12" cy="12" r="6" stroke={c} strokeWidth="2" fill="none" />;
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {renderGlyph()}
    </svg>
  );
};
