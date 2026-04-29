import { describe, expect, test } from 'bun:test';
import { ManualPlanSchema } from './schema';

/**
 * Tests for ManualPlanSchema, focusing on partial migration backfill.
 *
 * The schema must:
 * - Accept legacy `fixer` key for backward compat
 * - Fan out `fixer` to both frontend-developer and backend-developer when
 *   neither is present
 * - Backfill whichever of frontend-developer/backend-developer is missing when
 *   only one is present alongside fixer
 * - Strip `fixer` from the normalized output
 * - Validate successfully for partial migration cases (one new key exists,
 *   the other is inherited from fixer)
 */

const VALID_PLAN = {
  primary: 'openai/gpt-5.5',
  fallback1: 'anthropic/claude-opus-4-6',
  fallback2: 'chutes/kimi-k2.5',
  fallback3: 'opencode/gpt-5-nano',
};

describe('ManualPlanSchema fixer partial migration', () => {
  test('fan out fixer to both agents when neither frontend nor backend present', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
    };

    const result = ManualPlanSchema.parse(input);

    expect(result['frontend-developer']).toEqual(VALID_PLAN);
    expect(result['backend-developer']).toEqual(VALID_PLAN);
    expect(result).not.toHaveProperty('fixer');
  });

  test('backfill frontend-developer when only backend-developer is present', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'backend-developer': { ...VALID_PLAN, primary: 'backend/only-model' },
    };

    const result = ManualPlanSchema.parse(input);

    // backend-developer preserved as explicit
    expect(result['backend-developer'].primary).toBe('backend/only-model');
    // frontend-developer backfilled from fixer
    expect(result['frontend-developer']).toEqual(VALID_PLAN);
    expect(result).not.toHaveProperty('fixer');
  });

  test('backfill backend-developer when only frontend-developer is present', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'frontend-developer': { ...VALID_PLAN, primary: 'frontend/only-model' },
    };

    const result = ManualPlanSchema.parse(input);

    // frontend-developer preserved as explicit
    expect(result['frontend-developer'].primary).toBe('frontend/only-model');
    // backend-developer backfilled from fixer
    expect(result['backend-developer']).toEqual(VALID_PLAN);
    expect(result).not.toHaveProperty('fixer');
  });

  test('explicit frontend and backend override fixer without backfill', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'frontend-developer': { ...VALID_PLAN, primary: 'frontend/explicit' },
      'backend-developer': { ...VALID_PLAN, primary: 'backend/explicit' },
    };

    const result = ManualPlanSchema.parse(input);

    expect(result['frontend-developer'].primary).toBe('frontend/explicit');
    expect(result['backend-developer'].primary).toBe('backend/explicit');
    expect(result).not.toHaveProperty('fixer');
  });

  test('strip fixer from output when both frontend and backend are explicitly set', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'frontend-developer': VALID_PLAN,
      'backend-developer': VALID_PLAN,
    };

    const result = ManualPlanSchema.parse(input);

    expect(result).not.toHaveProperty('fixer');
    // Both agents still present and correct
    expect(result['frontend-developer']).toEqual(VALID_PLAN);
    expect(result['backend-developer']).toEqual(VALID_PLAN);
  });

  test('passes validation when one new key exists and other is inherited from fixer', () => {
    // This is the key partial migration case: partial migration where one
    // of frontend-developer/backend-developer is explicitly set and the other
    // is backfilled from fixer — should not produce a schema validation error.
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'frontend-developer': VALID_PLAN,
      // backend-developer is NOT set — backfilled from fixer
    };

    // Should parse successfully (no validation error)
    const result = ManualPlanSchema.parse(input);

    expect(result['frontend-developer']).toEqual(VALID_PLAN);
    expect(result['backend-developer']).toEqual(VALID_PLAN);
    expect(result).not.toHaveProperty('fixer');
  });

  test('fails validation when required agents are missing', () => {
    const input = {
      orchestrator: VALID_PLAN,
      // oracle missing
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'frontend-developer': VALID_PLAN,
      'backend-developer': VALID_PLAN,
    };

    expect(() => ManualPlanSchema.parse(input)).toThrow();
  });

  test('fails validation when fixer plan has duplicate models', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: {
        primary: 'openai/gpt-5.5',
        fallback1: 'openai/gpt-5.5', // duplicate with primary
        fallback2: 'anthropic/claude-opus-4-6',
        fallback3: 'opencode/gpt-5-nano',
      },
      'frontend-developer': VALID_PLAN,
      'backend-developer': VALID_PLAN,
    };

    expect(() => ManualPlanSchema.parse(input)).toThrow();
  });

  test('unrecognized keys are rejected', () => {
    const input = {
      orchestrator: VALID_PLAN,
      oracle: VALID_PLAN,
      designer: VALID_PLAN,
      explorer: VALID_PLAN,
      librarian: VALID_PLAN,
      fixer: VALID_PLAN,
      'frontend-developer': VALID_PLAN,
      'backend-developer': VALID_PLAN,
      'unknown-agent': VALID_PLAN,
    };

    expect(() => ManualPlanSchema.parse(input)).toThrow();
  });
});
