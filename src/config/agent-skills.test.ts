import { describe, expect, test } from 'bun:test';
import { DEFAULT_AGENT_SKILLS, getDefaultAgentSkills } from './agent-skills';

describe('DEFAULT_AGENT_SKILLS', () => {
  test('orchestrator gets wildcard', () => {
    expect(DEFAULT_AGENT_SKILLS.orchestrator).toEqual(['*']);
  });

  test('planner gets wildcard', () => {
    expect(DEFAULT_AGENT_SKILLS.planner).toEqual(['*']);
  });

  test('sprinter gets wildcard', () => {
    expect(DEFAULT_AGENT_SKILLS.sprinter).toEqual(['*']);
  });

  test('business-analyst gets wildcard like other primary agents', () => {
    expect(DEFAULT_AGENT_SKILLS['business-analyst']).toEqual(['*']);
  });

  test('designer gets agent-browser', () => {
    expect(DEFAULT_AGENT_SKILLS.designer).toEqual(['agent-browser']);
  });

  test('oracle gets simplify and requesting-code-review', () => {
    expect(DEFAULT_AGENT_SKILLS.oracle).toEqual([
      'simplify',
      'requesting-code-review',
    ]);
  });

  test('frontend-developer gets vercel-react-best-practices and karpathy-guidelines', () => {
    expect(DEFAULT_AGENT_SKILLS['frontend-developer']).toEqual([
      'vercel-react-best-practices',
      'karpathy-guidelines',
    ]);
  });

  test('backend-developer gets backend-developer and karpathy-guidelines', () => {
    expect(DEFAULT_AGENT_SKILLS['backend-developer']).toEqual([
      'backend-developer',
      'karpathy-guidelines',
    ]);
  });

  test('getDefaultAgentSkills returns empty array for unknown agent', () => {
    expect(getDefaultAgentSkills('unknown-agent')).toEqual([]);
  });
});
