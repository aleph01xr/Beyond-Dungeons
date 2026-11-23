# Beyond — Combat System Synchronization Plan

## Objective

Establish one consistent source of truth for attributes, weapon scaling, damage categories, combat calculations, and character stat projections.

This work is a **stability and synchronization pass**, not a content expansion. Do not add new weapons or vestments until all three phases are complete and verified.

## Scope and priorities

The review and implementation should focus on:

- Attribute-based weapon scaling
- Damage category selection and enemy resistance
- Direct damage and damage-over-time calculations
- Critical chance and critical damage
- Attack speed and charge mechanics
- Cooldown reduction
- Healing, shields, health, and survivability
- Movement speed
- Character stat projections and displayed DPS
- Multiplayer/server-authoritative consistency

Preserve existing class identities, weapon mechanics, equipment persistence, and intended balance unless a specific defect makes a correction necessary.

---

# Phase 1 — Unified Combat Architecture

## Goal

Create a shared, consistent weapon configuration and resolution path so weapon scaling and damage category are defined by the weapon rather than inferred from the character's class.

## Required work

### 1. Establish a unified weapon damage configuration

Each weapon should be able to define these independently:

- **Scaling attribute:** STR, DEX, INT, or FAITH.
- **Damage category:** Physical, Arcane, Divine, Fire, Frost, Lightning, Poison, or Bleed.
- **Damage type mode:** Fixed or Adaptive.

Use fixed damage type as the default so existing weapons retain their current behavior unless explicitly configured otherwise.

### 2. Implement adaptive damage type as an optional weapon mode

For weapons configured as Adaptive:

- STR greater than INT → Physical.
- INT greater than STR → Arcane.
- STR equal to INT → use the weapon's configured default category.

Adaptive damage category must not automatically change the weapon's scaling attribute. Scaling attribute and damage category are separate configuration choices.

Do not make all weapons adaptive by default.

### 3. Make weapon scaling independent of class defaults

A weapon should be able to scale with any supported attribute, regardless of the wielder's class.

Examples:

- A Vanguard weapon may scale with INT.
- A Ranger weapon may scale with INT.
- An Arcanist weapon may scale with STR if deliberately configured that way.

Class defaults should remain in place when no weapon-specific override is configured.

### 4. Centralize server-side resolution

The server should resolve the equipped weapon's scaling attribute and damage category before calculating damage.

Use the resolved configuration consistently for:

- Direct attacks
- Projectiles
- Charged attacks
- Damage-over-time effects
- Critical damage
- Any other weapon-derived damage effect

Remove redundant class-specific exceptions only when the shared configuration fully replaces them.

### 5. Preserve existing behavior

Do not redesign classes or remove existing weapon mechanics.

The Eclipse Bow should become:

- Scaling attribute: INT
- Damage category: Arcane
- Damage type mode: Fixed

Its existing charge, pierce, projectile, and critical modifiers must remain intact.

## Priority files to inspect and update

- `src/shared/types.ts`
- `src/shared/armaments.ts`
- `src/shared/statUtils.ts`
- `src/server/gameEngine.ts`

Other files may be changed when required, but avoid unrelated rewrites.

## Phase 1 acceptance criteria

- Existing weapons retain their intended behavior.
- Weapon scaling and damage category can be configured independently.
- A weapon can use an attribute that is not the wielder's class-primary attribute.
- Adaptive weapons correctly resolve STR-versus-INT category selection.
- Equal STR and INT use the weapon's configured default category.
- The server is authoritative for the resolved weapon configuration.
- Eclipse uses INT scaling and Arcane damage without losing its existing mechanics.
- No duplicated or conflicting weapon-resolution logic remains.

---

# Phase 2 — Synchronize Every Combat Calculation

## Goal

Ensure that actual server calculations, UI stat descriptions, and projected character statistics all use the same resolved combat rules.

## Required work

### 1. Synchronize direct damage and damage-over-time

- Ensure DoT uses the equipped weapon's resolved scaling attribute when the effect is weapon-derived.
- Preserve class-based defaults for effects that are genuinely class-based.
- Ensure damage category and enemy resistance are resolved consistently.
- Verify that Arcane and other categories use the intended resistance values and fallback behavior.

**Known issue to address:** Ranger DoT currently derives its primary attribute from class defaults, so an INT-scaling weapon such as Eclipse may still use DEX for DoT scaling. Align this with the weapon's resolved scaling attribute where appropriate.

### 2. Correct weapon-specific scaling projections

- Ensure Galewind's displayed DEX scaling reflects its `dexScalingMult` modifier.
- Ensure Eclipse displays INT scaling and Arcane damage.
- Ensure weapon descriptions, stat panels, and actual damage calculations agree.
- Check all other weapon-specific scaling modifiers for similar display/calculation mismatches.

### 3. Synchronize critical chance and critical damage

Verify that the displayed values match the server's actual formulas, including:

- Base critical chance
- Attribute contributions
- Weapon bonuses
- Vestment bonuses
- Relic bonuses
- Critical chance caps
- Base critical damage multiplier
- Weapon critical damage bonuses

Do not silently change balance values during synchronization.

### 4. Synchronize attack speed and charge behavior

- Ensure displayed attack speed matches actual attack cadence.
- Include applicable DEX, weapon, vestment, and class modifiers.
- Ensure charge attacks use their actual charge timing and damage multipliers.
- Make projected DPS account for charge time and charged-shot damage.
- Ensure Eclipse's projected charged-shot damage and DPS reflect its real behavior.

### 5. Synchronize cooldown reduction

- Verify the INT contribution and all other CDR sources.
- Confirm cooldown floors/caps match actual ability cooldown calculations.
- Ensure the UI does not display a value that the server cannot actually apply.
- Check tactical and ultimate cooldown projections.

### 6. Synchronize healing, shields, and survivability

Verify displayed and actual values for:

- Maximum HP
- Health regeneration
- Healing output and Faith bonuses
- Shield generation and shield caps
- Physical and elemental resistance
- Crowd-control duration resistance
- Movement speed
- Equipment and passive modifiers

Ensure class-specific shield mechanics remain class-specific. Do not give non-Vanguard classes Vanguard-only shield bonuses as a side effect of shared calculations.

### 7. Remove duplicated formulas where practical

Where the UI and server independently implement the same formula, move toward shared calculation utilities or a single source of truth.

Do not force unrelated systems into one abstraction if their mechanics are genuinely different.

## Phase 2 acceptance criteria

- No known mismatch remains between actual weapon scaling and displayed scaling.
- Weapon-derived DoT uses the correct resolved attribute.
- Damage categories and enemy resistances agree.
- Critical chance and critical damage projections match server calculations.
- Attack speed and cooldown projections match actual behavior.
- Charged-weapon DPS accounts for charge timing and charge multipliers.
- HP, healing, shields, resistance, and movement projections match their actual calculations.
- Equipment and passive modifiers are reflected consistently.
- No unintended class identity or balance changes are introduced.

---

# Phase 3 — Regression and Balance Validation

## Goal

Validate the unified system across attributes, weapons, equipment, and multiplayer scenarios before resuming content expansion.

## Required test coverage

### 1. Weapon regression

Verify the expected configurations and behavior for:

| Weapon / category | Expected scaling | Expected damage category |
|---|---:|---|
| Vanguard — Sunforged | STR | Physical |
| Ranger — Ashwood | DEX | Physical |
| Ranger — Galewind | DEX | Physical |
| Ranger — Eclipse | INT | Arcane |
| Arcanist weapons | Configured attribute, normally INT | Configured category |
| Cleric weapons | Configured attribute, normally FAITH | Configured category |

Use the actual current weapon IDs and configurations in the repository when writing tests. The table describes expected behavior, not permission to rename or redesign existing content.

### 2. Adaptive damage regression

Test all three cases:

- STR greater than INT → Physical.
- INT greater than STR → Arcane.
- STR equal to INT → configured default category.

Also verify that the scaling attribute remains independent of the adaptive category result.

### 3. Attribute regression

Test STR, DEX, INT, FAITH, and VIT at representative values:

- 0
- 50
- 100

Check all applicable effects, including damage, DoT, critical chance, attack speed, movement speed, CDR, healing, resistance, HP, and regeneration.

Respect existing attribute caps and progression rules.

### 4. Equipment regression

Verify:

- Weapon modifiers
- Vestment modifiers
- Relic modifiers
- Passive replacement behavior
- Shield generation and caps
- Equipment persistence
- Correct class restrictions
- Correct stat projections after equipment changes

### 5. Multiplayer regression

Test host and joining players for:

- Weapon damage
- Adaptive damage resolution
- Charged attacks
- Enemy resistance
- Weapon switching
- Equipment changes
- Death and revival
- Rejoining a session
- Server-authoritative stats and damage

Confirm that clients cannot display or apply a different combat result from the server's authoritative result.

### 6. Build and automated verification

Run the checks supported by the repository, including:

- TypeScript checks
- Production build
- Existing automated tests
- New combat regression tests
- Relevant multiplayer tests

Do not report a test as passed unless it was actually executed. If a test cannot be run, state why and identify the remaining manual verification required.

## Phase 3 acceptance criteria

- All weapon configuration tests pass.
- Adaptive category tests pass.
- Attribute regression tests pass.
- Equipment and persistence tests pass.
- Multiplayer combat tests pass.
- TypeScript and production build checks pass.
- No critical combat regression remains.
- No known mismatch remains between server calculations and player-facing stat projections.

---

# Implementation Guardrails

1. Do not redesign existing classes.
2. Do not change weapon damage numbers merely to rebalance them.
3. Do not remove or simplify existing weapon mechanics.
4. Do not change class identity, passives, or intended class-specific behavior.
5. Do not introduce new weapons or vestments during this work.
6. Preserve database schemas and equipment persistence unless a migration is essential; document any required migration clearly.
7. Prefer shared calculations over duplicated formulas.
8. Fix defects directly related to this synchronization effort.
9. Record unrelated issues separately instead of expanding the scope.
10. Run relevant tests and report actual results.
11. Avoid unrelated game-engine rewrites.
12. Keep server-side combat resolution authoritative.

# Required Phase Reports

At the end of each phase, provide a concise report containing:

- Files modified
- Systems changed
- Bugs fixed
- Tests executed
- Exact test/build results
- Known remaining issues
- Any decisions or blockers requiring the developer's input

Do not claim a phase is complete if its acceptance criteria have not been verified.

# Completion Rule

**Do not add new weapons or vestments until Phases 1, 2, and 3 are complete and their acceptance criteria have been verified.**

The intended result is a stable combat foundation where weapon configuration, server calculations, enemy resistance, and player-facing stat projections all agree. Future weapons and vestments should be added on top of this foundation rather than requiring new class-specific exceptions.
