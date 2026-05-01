import { describe, expect, it } from 'bun:test';
import { getSkillPermissionsForAgent } from './skills';

describe('skills permissions', () => {
  it('should allow all skills for orchestrator by default', () => {
    const permissions = getSkillPermissionsForAgent('orchestrator');
    expect(permissions['*']).toBe('allow');
  });

  it('should allow all skills for sprinter by default', () => {
    const permissions = getSkillPermissionsForAgent('sprinter');
    expect(permissions['*']).toBe('allow');
  });

  it('should deny all skills for other agents by default', () => {
    const permissions = getSkillPermissionsForAgent('designer');
    expect(permissions['*']).toBe('deny');
  });

  it('should allow recommended skills for specific agents', () => {
    // Designer should have agent-browser allowed
    const designerPerms = getSkillPermissionsForAgent('designer');
    expect(designerPerms['agent-browser']).toBe('allow');

    // Oracle should have simplify allowed by default
    const oraclePerms = getSkillPermissionsForAgent('oracle');
    expect(oraclePerms.simplify).toBe('allow');

    // Frontend-developer should have bundled frontend skills allowed
    const frontendPerms = getSkillPermissionsForAgent('frontend-developer');
    expect(frontendPerms['vercel-react-best-practices']).toBe('allow');
    expect(frontendPerms['karpathy-guidelines']).toBe('allow');

    // Backend-developer should have bundled backend skills allowed
    const backendPerms = getSkillPermissionsForAgent('backend-developer');
    expect(backendPerms['backend-developer']).toBe('allow');
    expect(backendPerms['karpathy-guidelines']).toBe('allow');
  });

  it('should honor explicit skill list overrides', () => {
    // Override with empty list
    const emptyPerms = getSkillPermissionsForAgent('orchestrator', []);
    expect(emptyPerms['*']).toBe('deny');
    expect(Object.keys(emptyPerms).length).toBe(1);

    // Override with specific list
    const specificPerms = getSkillPermissionsForAgent('designer', [
      'my-skill',
      '!bad-skill',
    ]);
    expect(specificPerms['*']).toBe('deny');
    expect(specificPerms['my-skill']).toBe('allow');
    expect(specificPerms['bad-skill']).toBe('deny');
  });

  it('should honor wildcard in explicit list', () => {
    const wildcardPerms = getSkillPermissionsForAgent('designer', ['*']);
    expect(wildcardPerms['*']).toBe('allow');
  });

  it('should allow wildcard for business-analyst like other primary agents', () => {
    const baPerms = getSkillPermissionsForAgent('business-analyst');
    expect(baPerms['*']).toBe('allow');
  });
});
