# Joster Dice System - Product Requirements Document

**Version:** 1.0  
**Last Updated:** 2026-07-13  
**Status:** Implementation Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Core Mechanics](#core-mechanics)
3. [Threshold and Difficulty](#threshold-and-difficulty)
4. [Advantage and Disadvantage](#advantage-and-disadvantage)
5. [Critical Successes and Fumbles](#critical-successes-and-fumbles)
6. [Risk Profile Analysis](#risk-profile-analysis)
7. [Implementation Requirements](#implementation-requirements)
8. [UI/UX Requirements](#uiux-requirements)
9. [Testing Requirements](#testing-requirements)
10. [Localization](#localization)

---

## Overview

The Joster dice system is a **3d20 roll-under mechanic** with narrative-driven advantage/disadvantage states. It features dynamic critical success/failure conditions that fundamentally alter risk profiles based on the character's situation, creating distinct "Plot Armor" and "Doom" scenarios.

### Design Philosophy

- **Roll-under system:** Lower rolls are better
- **Median-based stability:** The middle die provides consistent, predictable outcomes
- **Narrative risk:** Advantage/disadvantage states dramatically alter critical thresholds
- **GM-driven difficulty:** Modifiers applied in ±3 increments

---

## Core Mechanics

### The Standard Roll

**Process:**
1. Roll **3d20**
2. Discard the highest and lowest dice
3. The **middle die (median)** is the effective result
4. Compare against the threshold

**Success Condition:**
- The roll is **successful** if: `middle_die ≤ threshold`

**Example:**
```
Roll: [12, 19, 8]
Sorted: [8, 12, 19]
Middle die: 12
Threshold: 14
Result: SUCCESS (12 ≤ 14)
```

### Why the Median?

The median provides:
- **Stability:** Outliers don't skew results
- **Predictability:** More consistent outcomes than averaging
- **Clarity:** Easy to identify visually

---

## Threshold and Difficulty

### Threshold Calculation

```
Threshold = Attribute + Ability + Modifier
```

**Components:**
- **Attribute:** Character's base attribute value (e.g., Intelligence, Strength)
- **Ability:** Skill or proficiency value (e.g., Investigation, Economics)
- **Modifier:** GM-assigned difficulty adjustment

### Difficulty Modifiers

Modifiers are applied in **increments of ±3** only.

| Modifier | Effect | Example |
|----------|--------|---------|
| **+3** (Bonus) | Easier task | Amateur attempt, favorable conditions |
| **+6** (Double Bonus) | Much easier | Highly favorable circumstances |
| **-3** (Malus) | Harder task | Professional-grade challenge |
| **-6** (Double Malus) | Much harder | Expert-level difficulty |

**Example from Specification:**
```
Character: Tax inspector investigating a small business
Investigation skill: 5
Economics skill: 6
Modifier: +3 (amateur fraud)

Threshold = 5 + 6 + 3 = 14
```

### Modifier Guidelines for GMs

- **Routine task:** No modifier (0)
- **Slightly favorable:** +3
- **Very favorable:** +6
- **Slightly difficult:** -3
- **Very difficult:** -6
- **Exceptional challenge:** -9 or more

---

## Advantage and Disadvantage

Advantage and disadvantage states are **narrative tools** awarded by the GM for dramatic or situational reasons, not mechanical bonuses.

### States Overview

| State | Dice Pool | Effective Die | Use Case |
|-------|-----------|---------------|----------|
| **None** | 3d20 | Middle (median) | Standard situations |
| **Simple Advantage** | 2d20 | Lower (better) | Favorable circumstances, preparation |
| **Simple Disadvantage** | 2d20 | Higher (worse) | Unfavorable circumstances, hindrances |
| **Strong Advantage** | 3d20 | Lowest (best) | Heroic moment, "Plot Armor" |
| **Strong Disadvantage** | 3d20 | Highest (worst) | Desperate situation, "Doom" scenario |

### Examples of Narrative Triggers

**Simple Advantage:**
- Character has relevant tools
- Enemy is distracted
- Favorable terrain

**Simple Disadvantage:**
- Poor lighting
- Time pressure
- Injured or exhausted

**Strong Advantage:**
- Perfect preparation meets opportunity
- Divine intervention or destiny
- Ultimate "hero moment"

**Strong Disadvantage:**
- Suicide mission
- Overwhelmed by enemies
- Near-death desperation

---

## Critical Successes and Fumbles

Critical results **ignore the threshold** and result in automatic success or failure. The conditions vary dramatically based on advantage/disadvantage state.

### Standard Roll (3d20, middle die)

| Result | Condition | Probability |
|--------|-----------|-------------|
| **Critical Success** | ≥2 dice show **1** | ~0.7% |
| **Critical Fumble** | ≥2 dice show **20** | ~0.7% |

**Narrative Impact:** Rare but significant events that can swing either way.

---

### Simple Advantage (2d20, lower die)

| Result | Condition | Probability |
|--------|-----------|-------------|
| **Critical Success** | ≥1 die shows **1** | ~9.75% |
| **Critical Fumble** | Both dice show **20** | ~0.25% |

**Narrative Impact:**
- **High crit chance:** Heroic feats are highly achievable
- **Ultra-low fumble risk:** Near immunity to catastrophe
- **"Plot Armor Lite":** Favored by fortune

---

### Simple Disadvantage (2d20, higher die)

| Result | Condition | Probability |
|--------|-----------|-------------|
| **Critical Success** | Both dice show **1** | ~0.25% |
| **Critical Fumble** | ≥1 die shows **20** | ~9.75% |

**Narrative Impact:**
- **High fumble chance:** Catastrophe is highly probable
- **Ultra-low crit chance:** Miracles are nearly impossible
- **"Danger Zone":** Everything can go wrong

---

### Strong Advantage (3d20, lowest die)

| Result | Condition | Probability |
|--------|-----------|-------------|
| **Critical Success** | ≥1 die shows **1** | ~14.26% |
| **Critical Fumble** | All 3 dice show **20** | ~0.0125% (1 in 8,000) |

**Narrative Impact:**
- **Maximum crit potential:** Epic successes are common
- **Fumble immunity:** Catastrophe is statistically impossible
- **"Ultimate Plot Armor":** Total narrative control

---

### Strong Disadvantage (3d20, highest die)

| Result | Condition | Probability |
|--------|-----------|-------------|
| **Critical Success** | All 3 dice show **1** | ~0.0125% (1 in 8,000) |
| **Critical Fumble** | ≥1 die shows **20** | ~14.26% |

**Narrative Impact:**
- **Maximum fumble risk:** Failure is almost guaranteed
- **Crit impossibility:** Success requires divine intervention
- **"Doom Scenario":** Suicide mission territory

---

## Risk Profile Analysis

### Probability Summary Table

| State | Crit % | Fumble % | Risk Profile |
|-------|--------|----------|--------------|
| Strong Advantage | 14.26% | 0.0125% | **Plot Armor** |
| Simple Advantage | 9.75% | 0.25% | Heroic |
| **None** | 0.7% | 0.7% | **Balanced** |
| Simple Disadvantage | 0.25% | 9.75% | Dangerous |
| Strong Disadvantage | 0.0125% | 14.26% | **Doom** |

### Design Implications

1. **Strong Advantage = Invincibility Narrative**
   - Use for destined hero moments
   - Players can take risks without fear
   - Fumbles become "impossible" story beats

2. **Strong Disadvantage = Death Spiral**
   - Use for impossible odds
   - Every action is a gamble
   - Success becomes legendary

3. **Simple States = Asymmetric Risk**
   - Creates tension without extremes
   - Players feel impact of circumstances
   - GMs can fine-tune narrative pressure

---

## Implementation Requirements

### Core Functions

#### 1. Die Count Selection
```javascript
function dieCountFor(advantage) {
  return Math.abs(advantage) === 1 ? 2 : 3;
}
```

**Inputs:**
- `advantage`: Integer (-2 to +2)

**Outputs:**
- `2` for simple advantage/disadvantage
- `3` for none, strong advantage/disadvantage

---

#### 2. Counting Die Selection
```javascript
function pickCountingDie(values, advantage) {
  const sorted = [...values].sort((a, b) => a - b);
  
  switch (advantage) {
    case -2: // Strong Disadvantage
      return sorted[sorted.length - 1]; // Highest
    case -1: // Simple Disadvantage
      return sorted[sorted.length - 1]; // Highest
    case 0:  // None
      return sorted[Math.floor(sorted.length / 2)]; // Middle
    case 1:  // Simple Advantage
      return sorted[0]; // Lowest
    case 2:  // Strong Advantage
      return sorted[0]; // Lowest
  }
}
```

**Inputs:**
- `values`: Array of die results
- `advantage`: Integer (-2 to +2)

**Outputs:**
- The die value that counts toward the threshold

---

#### 3. Critical Detection
```javascript
function criticalResultFor(values, advantage) {
  const ones = values.filter(v => v === 1).length;
  const twenties = values.filter(v => v === 20).length;

  switch (advantage) {
    case 2: // Strong Advantage
      if (ones >= 1) return 'criticalSuccess';
      if (twenties === 3) return 'criticalFailure';
      return null;
      
    case 1: // Simple Advantage
      if (ones >= 1) return 'criticalSuccess';
      if (twenties >= 2) return 'criticalFailure';
      return null;
      
    case 0: // None
      if (ones >= 2) return 'criticalSuccess';
      if (twenties >= 2) return 'criticalFailure';
      return null;
      
    case -1: // Simple Disadvantage
      if (twenties >= 1) return 'criticalFailure';
      if (ones >= 2) return 'criticalSuccess';
      return null;
      
    case -2: // Strong Disadvantage
      if (twenties >= 1) return 'criticalFailure';
      if (ones === 3) return 'criticalSuccess';
      return null;
  }
}
```

**Inputs:**
- `values`: Array of die results
- `advantage`: Integer (-2 to +2)

**Outputs:**
- `'criticalSuccess'`: Automatic success
- `'criticalFailure'`: Automatic failure
- `null`: No critical result, check threshold

---

#### 4. Success Determination
```javascript
function determineSuccess(countingDie, threshold, critical) {
  if (critical === 'criticalSuccess') return true;
  if (critical === 'criticalFailure') return false;
  return countingDie <= threshold;
}
```

---

### Roll Execution Flow

```
1. Determine die count (2 or 3) based on advantage
2. Roll the dice
3. Check for critical results
   - If critical: Return success/failure immediately
   - If not critical: Continue to step 4
4. Select counting die based on advantage
5. Compare counting die to threshold
6. Return success/failure
```

---

## UI/UX Requirements

### Roll Dialog

**Required Fields:**
- Attribute selector (dropdown or preset)
- Ability selector (dropdown or preset)
- Bonus/Malus stepper (±3 increments)
- Advantage selector (5 states)
- Threshold display (auto-calculated)

**Layout:**
```
┌─────────────────────────────┐
│  Roll: [Skill Name]         │
├─────────────────────────────┤
│  Attribute: [Dropdown]  (5) │
│  Ability:   [Dropdown]  (6) │
│                             │
│  Modifier: [−] [+3] [+]     │
│                             │
│  Advantage:                 │
│  [SD] [D] [N] [A] [SA]      │
│                             │
│  Threshold: 14              │
│                             │
│         [ROLL]              │
└─────────────────────────────┘

SD = Strong Disadvantage
D  = Disadvantage
N  = None
A  = Advantage
SA = Strong Advantage
```

### Chat Card Display

**Required Elements:**
- Flavor text (skill/action name)
- All rolled dice (visual)
- Counting die (highlighted)
- Discarded dice (dimmed)
- Threshold value
- Advantage state (if not none)
- Outcome (success/failure/critical)

**Example Layout:**
```
┌─────────────────────────────┐
│  Investigation (Economics)  │
├─────────────────────────────┤
│  Dice: [8] 12 [19]          │
│        ↑        ↑            │
│     discard  discard        │
│                             │
│  Counting Die: 12           │
│  Threshold: 14              │
│  Advantage: None            │
│                             │
│  ✓ SUCCESS                  │
└─────────────────────────────┘

[x] = Discarded die (dimmed)
 x  = Counting die (highlighted)
```

### Critical Display

**Visual Treatment:**
- **Critical Success:** Green background, ⭐ icon
- **Critical Fumble:** Red background, 💥 icon

---

## Testing Requirements

### Unit Tests

#### Test Cases: Critical Detection

| Test ID | Dice | Advantage | Expected Critical |
|---------|------|-----------|-------------------|
| T1 | [1, 1, 15] | None (0) | criticalSuccess |
| T2 | [20, 20, 5] | None (0) | criticalFailure |
| T3 | [1, 10, 15] | None (0) | null |
| T4 | [1, 15] | Simple Adv (1) | criticalSuccess |
| T5 | [20, 20] | Simple Adv (1) | criticalFailure |
| T6 | [20, 10] | Simple Adv (1) | null |
| T7 | [20, 10] | Simple Dis (-1) | criticalFailure |
| T8 | [1, 1] | Simple Dis (-1) | criticalSuccess |
| T9 | [1, 10] | Simple Dis (-1) | null |
| T10 | [1, 15, 10] | Strong Adv (2) | criticalSuccess |
| T11 | [20, 20, 20] | Strong Adv (2) | criticalFailure |
| T12 | [20, 20, 10] | Strong Adv (2) | null |
| T13 | [20, 10, 5] | Strong Dis (-2) | criticalFailure |
| T14 | [1, 1, 1] | Strong Dis (-2) | criticalSuccess |
| T15 | [1, 1, 10] | Strong Dis (-2) | null |

#### Test Cases: Counting Die Selection

| Test ID | Dice | Advantage | Expected Die |
|---------|------|-----------|--------------|
| C1 | [12, 19, 8] | None (0) | 12 (middle) |
| C2 | [8, 15] | Simple Adv (1) | 8 (lower) |
| C3 | [8, 15] | Simple Dis (-1) | 15 (higher) |
| C4 | [8, 15, 12] | Strong Adv (2) | 8 (lowest) |
| C5 | [8, 15, 12] | Strong Dis (-2) | 15 (highest) |

#### Test Cases: Threshold Calculation

| Test ID | Attr | Ability | Modifier | Expected |
|---------|------|---------|----------|----------|
| TH1 | 5 | 6 | +3 | 14 |
| TH2 | 5 | 6 | -3 | 8 |
| TH3 | 5 | 6 | 0 | 11 |
| TH4 | 5 | 6 | +6 | 17 |

### Integration Tests

1. **Complete Roll Flow:**
   - Input: Threshold 14, Advantage None
   - Roll: [12, 19, 8]
   - Expected: Success (middle 12 ≤ 14)

2. **Critical Override:**
   - Input: Threshold 5, Advantage None
   - Roll: [1, 1, 15]
   - Expected: Critical Success (ignores threshold)

3. **Advantage Die Selection:**
   - Input: Threshold 10, Simple Advantage
   - Roll: [8, 15]
   - Expected: Success (lower 8 ≤ 10)

### Edge Cases

1. **All dice same value:**
   - [10, 10, 10] → Middle is still 10
   - [1, 1, 1] → Strong Dis: Critical Success

2. **Minimum/Maximum thresholds:**
   - Threshold 1: Almost always fails
   - Threshold 20: Almost always succeeds

3. **Zero or negative threshold:**
   - Should still function correctly

---

## Localization

### Required Translation Keys

**Roll Dialog:**
- `JOSTER.Roll.DialogTitle`
- `JOSTER.Roll.Attribute`
- `JOSTER.Roll.Ability`
- `JOSTER.Roll.Modifier`
- `JOSTER.Roll.Threshold`
- `JOSTER.Roll.RollButton`

**Advantage States:**
- `JOSTER.Advantage.StrongDisadvantage`
- `JOSTER.Advantage.Disadvantage`
- `JOSTER.Advantage.None`
- `JOSTER.Advantage.Advantage`
- `JOSTER.Advantage.StrongAdvantage`

**Outcomes:**
- `JOSTER.RollOutcome.Success`
- `JOSTER.RollOutcome.Failure`
- `JOSTER.RollOutcome.CriticalSuccess`
- `JOSTER.RollOutcome.CriticalFailure`

**Chat Card:**
- `JOSTER.Roll.CountingDie`
- `JOSTER.Roll.Threshold`
- `JOSTER.Roll.DiscardedDice`

---

## Future Considerations

### Potential Enhancements

1. **Roll History:**
   - Track crit/fumble frequency per character
   - Statistical analysis for balancing

2. **Sound Effects:**
   - Distinct sounds for crits/fumbles
   - Different dice rolling sounds per advantage state

3. **Visual Dice Animation:**
   - 3D dice that roll and settle
   - Highlight counting die dramatically

4. **Macro Support:**
   - Quick-roll buttons for common checks
   - Preset difficulty modifiers

5. **Mobile Optimization:**
   - Touch-friendly advantage selector
   - Optimized chat card layout

---

## Appendix A: Mathematical Formulas

### Probability Calculations

**Critical Success on Standard Roll (3d20, ≥2 ones):**
```
P(≥2 ones) = P(exactly 2) + P(exactly 3)
P(exactly 2) = C(3,2) × (1/20)² × (19/20) = 3 × 0.0025 × 0.95 = 0.007125
P(exactly 3) = (1/20)³ = 0.000125
P(≥2 ones) = 0.007125 + 0.000125 = 0.00725 ≈ 0.73%
```

**Critical Success on Simple Advantage (2d20, ≥1 one):**
```
P(≥1 one) = 1 - P(no ones)
P(no ones) = (19/20)² = 0.9025
P(≥1 one) = 1 - 0.9025 = 0.0975 = 9.75%
```

**Critical Success on Strong Advantage (3d20, ≥1 one):**
```
P(≥1 one) = 1 - P(no ones)
P(no ones) = (19/20)³ = 0.857375
P(≥1 one) = 1 - 0.857375 = 0.142625 ≈ 14.26%
```

---

## Appendix B: Implementation Checklist

- [x] Core dice rolling logic (`dice.mjs`)
- [x] Critical detection algorithm
- [x] Counting die selection
- [x] Threshold calculation
- [x] Roll dialog UI (`roll-dialog.mjs`)
- [x] Chat card template (`roll-card.hbs`)
- [x] Advantage/disadvantage selector
- [x] Modifier stepper (±3 increments)
- [x] Localization (EN/DE)
- [x] Unit tests (all scenarios)
- [x] Integration with actor sheets
- [x] Integration with item sheets
- [ ] Comprehensive documentation
- [ ] User guide with examples
- [ ] GM guide for assigning advantage/difficulty

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-07-13 | Initial PRD creation | System |

---

**End of Document**
