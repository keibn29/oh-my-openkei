import { describe, expect, test } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import type { PluginConfig } from '../../config';
import {
  createFilterAvailableSkillsHook,
  filterAvailableSkillsText,
} from './index';

const mockCtx = {} as PluginInput;

function skillBlock(name: string): string {
  return `<skill>
  <name>${name}</name>
  <description>${name} description</description>
  <location>file:///tmp/${name}</location>
</skill>`;
}

function availableSkillsBlock(...names: string[]): string {
  return `<available_skills>
${names.map((name) => skillBlock(name)).join('\n')}
</available_skills>`;
}

describe('filterAvailableSkillsText', () => {
  test('keeps only allowed skills using exact skill names', () => {
    const text = availableSkillsBlock('skill1', 'skill2', 'skill3');
    const result = filterAvailableSkillsText(text, {
      '*': 'deny',
      skill1: 'allow',
      skill3: 'allow',
    });

    expect(result).toContain('<name>skill1</name>');
    expect(result).not.toContain('<name>skill2</name>');
    expect(result).toContain('<name>skill3</name>');
  });

  test('renders No skills available when nothing is allowed', () => {
    const result = filterAvailableSkillsText(availableSkillsBlock('skill1'), {
      '*': 'deny',
    });

    expect(result).toContain('No skills available.');
    expect(result).not.toContain('<name>skill1</name>');
  });
});

describe('createFilterAvailableSkillsHook', () => {
  test('filters system prompt skill blocks for explicit agent skills', async () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          skills: ['skill1', 'skill3'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, config);
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill1', 'skill2', 'skill3'),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).not.toContain('<name>skill2</name>');
    expect(resultText).toContain('<name>skill3</name>');
  });

  test('shows no skills for agents configured with an empty skills list', async () => {
    const config: PluginConfig = {
      agents: {
        'frontend-developer': {
          skills: [],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, config);
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [{ type: 'text', text: availableSkillsBlock('skill1') }],
        },
        {
          info: { role: 'user', agent: 'frontend-developer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('No skills available.');
    expect(resultText).not.toContain('<name>skill1</name>');
  });

  test('preserves orchestrator default wildcard allow', async () => {
    const hook = createFilterAvailableSkillsHook(mockCtx, {});
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            { type: 'text', text: availableSkillsBlock('skill1', 'skill2') },
          ],
        },
        {
          info: { role: 'user', agent: 'orchestrator' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).toContain('<name>skill2</name>');
  });

  test('supports wildcard allow with explicit exclusions', async () => {
    const config: PluginConfig = {
      agents: {
        designer: {
          skills: ['*', '!skill2'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, config);
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            { type: 'text', text: availableSkillsBlock('skill1', 'skill2') },
          ],
        },
        {
          info: { role: 'user', agent: 'designer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).not.toContain('<name>skill2</name>');
  });

  test('defaults to orchestrator when no agent is present', async () => {
    const hook = createFilterAvailableSkillsHook(mockCtx, {});
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [{ type: 'text', text: availableSkillsBlock('skill1') }],
        },
        {
          info: { role: 'user' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toContain('<name>skill1</name>');
  });

  test('filters multiple skill blocks across messages', async () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          skills: ['skill1'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, config);
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: `Intro\n${availableSkillsBlock('skill1', 'skill2')}`,
            },
          ],
        },
        {
          info: { role: 'developer' },
          parts: [
            { type: 'text', text: availableSkillsBlock('skill2', 'skill3') },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toContain('<name>skill1</name>');
    expect(output.messages[0].parts[0].text).not.toContain(
      '<name>skill2</name>',
    );
    expect(output.messages[1].parts[0].text).toContain('No skills available.');
  });

  test('reuses permission rules without caching the final skills block text', async () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          skills: ['skill1', 'skill3'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, config);
    const firstOutput = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill1', 'skill2'),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };
    const secondOutput = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill2', 'skill3'),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, firstOutput);
    await hook['experimental.chat.messages.transform']({}, secondOutput);

    expect(firstOutput.messages[0].parts[0].text).toContain(
      '<name>skill1</name>',
    );
    expect(firstOutput.messages[0].parts[0].text).not.toContain(
      '<name>skill3</name>',
    );
    expect(secondOutput.messages[0].parts[0].text).not.toContain(
      '<name>skill1</name>',
    );
    expect(secondOutput.messages[0].parts[0].text).toContain(
      '<name>skill3</name>',
    );
  });

  test('resolves agent via sessionID for delegated subagent sessions', async () => {
    const config: PluginConfig = {
      agents: {
        'backend-developer': {
          skills: ['skill1'],
        },
      },
    };

    const sessionAgentMap = new Map<string, string>();
    sessionAgentMap.set('session-123', 'backend-developer');

    const hook = createFilterAvailableSkillsHook(mockCtx, config, {
      getSessionAgent: (sessionID: string) => sessionAgentMap.get(sessionID),
    });

    // Simulate a delegated session where parent orchestrator messages
    // appear AFTER the current session's messages. Without sessionID
    // resolution, getCurrentAgent would find the orchestrator message
    // and show all skills.
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill1', 'skill2', 'skill3'),
            },
          ],
        },
        {
          info: {
            role: 'user',
            agent: 'backend-developer',
            sessionID: 'session-123',
          },
          parts: [{ type: 'text', text: 'check skills' }],
        },
        {
          info: { role: 'user', agent: 'orchestrator' },
          parts: [{ type: 'text', text: 'parent context' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).not.toContain('<name>skill2</name>');
    expect(resultText).not.toContain('<name>skill3</name>');
  });
});
