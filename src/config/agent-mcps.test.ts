import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_AGENT_MCPS,
  getDefaultAgentMcps,
  parseList,
} from './agent-mcps';

describe('parseList', () => {
  test('empty list returns empty array', () => {
    expect(parseList([], ['mcp1', 'mcp2'])).toEqual([]);
  });

  test('wildcard includes all available', () => {
    expect(parseList(['*'], ['mcp1', 'mcp2', 'mcp3'])).toEqual([
      'mcp1',
      'mcp2',
      'mcp3',
    ]);
  });

  test('orchestrator wildcard excludes context7 but includes custom mcps', () => {
    expect(
      parseList(DEFAULT_AGENT_MCPS.orchestrator, [
        'websearch',
        'context7',
        'grep_app',
        'custom-mcp',
      ]),
    ).toEqual(['websearch', 'grep_app', 'custom-mcp']);
  });

  test('wildcard with exclusions', () => {
    expect(parseList(['*', '!mcp2'], ['mcp1', 'mcp2', 'mcp3'])).toEqual([
      'mcp1',
      'mcp3',
    ]);
  });

  test('exclude wildcard returns empty', () => {
    expect(parseList(['!*'], ['mcp1', 'mcp2'])).toEqual([]);
  });

  test('specific items only', () => {
    expect(
      parseList(['mcp1', 'mcp3'], ['mcp1', 'mcp2', 'mcp3', 'mcp4']),
    ).toEqual(['mcp1', 'mcp3']);
  });

  test('specific items with exclusions', () => {
    expect(
      parseList(['mcp1', 'mcp3', '!mcp3'], ['mcp1', 'mcp2', 'mcp3']),
    ).toEqual(['mcp1']);
  });

  test('exclusions without matching allows', () => {
    expect(parseList(['!mcp2'], ['mcp1', 'mcp2', 'mcp3'])).toEqual([]);
  });
});

describe('getDefaultAgentMcps', () => {
  test('returns default MCPs for orchestrator', () => {
    expect(getDefaultAgentMcps('orchestrator')).toEqual(['*', '!context7']);
  });

  test('returns default MCPs for librarian', () => {
    expect(getDefaultAgentMcps('librarian')).toEqual([
      'websearch',
      'context7',
      'grep_app',
    ]);
  });

  test('returns empty array for unknown agent', () => {
    expect(getDefaultAgentMcps('unknown-agent')).toEqual([]);
  });
});
