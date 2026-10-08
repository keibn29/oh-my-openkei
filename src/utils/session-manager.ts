import type { AgentName } from '../config';

export interface ContextFile {
  path: string;
  lineCount: number;
  lineNumbers?: number[];
  lastReadAt: number;
}

export interface RememberedTaskSession {
  alias: string;
  taskId: string;
  agentType: AgentName;
  label: string;
  contextFiles: ContextFile[];
  createdAt: number;
  lastUsedAt: number;
  /**
   * Identities that currently need this entry kept in the resumable list.
   * Exempt from `maxSessionsPerAgent` trimming while non-empty, so unsettled
   * and interrupted delegations cannot evict each other. A set rather than a
   * count: re-adding the same owner is a no-op, and one owner finishing never
   * unprotects an entry another owner still needs.
   */
  protectionOwners: Set<string>;
}

type SessionGroupMap = Map<AgentName, RememberedTaskSession[]>;

const MIN_CONTEXT_FILE_LINES = 10;
const MAX_CONTEXT_FILES_PER_SESSION = 8;

interface SessionManagerOptions {
  readContextMinLines?: number;
  readContextMaxFiles?: number;
}

/**
 * Short alias prefixes. Typed as a total record so a newly registered agent
 * cannot silently fall back to an empty (ambiguous) prefix; a unit test keeps
 * the values unique and nonempty.
 */
const AGENT_ALIAS_PREFIX: Record<AgentName, string> = {
  orchestrator: 'orc',
  planner: 'pln',
  sprinter: 'spr',
  'business-analyst': 'bas',
  debugger: 'dbg',
  explorer: 'exp',
  librarian: 'lib',
  oracle: 'ora',
  designer: 'des',
  'frontend-developer': 'fed',
  'backend-developer': 'bed',
  'trigger-developer': 'trg',
  observer: 'obs',
};

function aliasPrefix(agentType: AgentName): string {
  return AGENT_ALIAS_PREFIX[agentType];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Characters that must not reach the prompt raw. */
const UNSAFE_PROMPT_CHARS = new Set(['"', "'", '\\', '`', '<', '>']);

/**
 * A value is safe to inline verbatim only when it is single-line and free of
 * markup characters. Anything else is JSON-encoded by `promptValue`.
 */
function isSafePromptValue(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
    if (UNSAFE_PROMPT_CHARS.has(char)) return false;
  }
  return true;
}

export function deriveTaskSessionLabel(input: {
  description?: string;
  prompt?: string;
  agentType: AgentName;
}): string {
  const preferred = normalizeWhitespace(input.description ?? '');
  if (preferred) {
    return preferred.slice(0, 48);
  }

  const firstPromptLine = (input.prompt ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .find(Boolean);

  if (firstPromptLine) {
    return firstPromptLine.slice(0, 48);
  }

  return `recent ${input.agentType} task`;
}

export class SessionManager {
  private readonly maxSessionsPerAgent: number;
  private readonly readContextMinLines: number;
  private readonly readContextMaxFiles: number;
  private readonly sessionsByParent = new Map<string, SessionGroupMap>();
  private readonly nextAliasIndexByParent = new Map<
    string,
    Map<AgentName, number>
  >();
  private orderCounter = 0;

  constructor(
    maxSessionsPerAgent: number,
    options: SessionManagerOptions = {},
  ) {
    this.maxSessionsPerAgent = maxSessionsPerAgent;
    this.readContextMinLines =
      options.readContextMinLines ?? MIN_CONTEXT_FILE_LINES;
    this.readContextMaxFiles =
      options.readContextMaxFiles ?? MAX_CONTEXT_FILES_PER_SESSION;
  }

  remember(input: {
    parentSessionId: string;
    taskId: string;
    agentType: AgentName;
    label: string;
  }): RememberedTaskSession {
    const now = this.nextOrder();
    const group = this.getAgentGroup(
      input.parentSessionId,
      input.agentType,
      true,
    );
    if (!group) {
      throw new Error('Failed to initialize session group');
    }
    const existing = group.find((entry) => entry.taskId === input.taskId);

    if (existing) {
      existing.label = input.label;
      existing.lastUsedAt = this.nextOrder();
      return existing;
    }

    const remembered: RememberedTaskSession = {
      alias: this.nextAlias(input.parentSessionId, input.agentType),
      taskId: input.taskId,
      agentType: input.agentType,
      label: input.label,
      contextFiles: [],
      createdAt: now,
      lastUsedAt: now,
      protectionOwners: new Set(),
    };

    group.push(remembered);
    this.trimGroup(group);
    return remembered;
  }

  markUsed(parentSessionId: string, agentType: AgentName, key: string): void {
    const group = this.getAgentGroup(parentSessionId, agentType, false);
    const match = group?.find(
      (entry) => entry.alias === key || entry.taskId === key,
    );

    if (match) {
      match.lastUsedAt = this.nextOrder();
    }
  }

  resolve(parentSessionId: string, agentType: AgentName, key: string) {
    const group = this.getAgentGroup(parentSessionId, agentType, false);
    return group?.find((entry) => entry.alias === key || entry.taskId === key);
  }

  drop(parentSessionId: string, agentType: AgentName, key: string): void {
    const group = this.getAgentGroup(parentSessionId, agentType, false);
    if (!group) return;

    const next = group.filter(
      (entry) => entry.alias !== key && entry.taskId !== key,
    );
    this.setAgentGroup(parentSessionId, agentType, next);
  }

  dropTask(taskId: string): void {
    for (const [parentSessionId, groups] of this.sessionsByParent.entries()) {
      for (const [agentType, group] of groups.entries()) {
        const next = group.filter((entry) => entry.taskId !== taskId);
        this.setAgentGroup(parentSessionId, agentType, next);
      }
    }
  }

  taskIds(): Set<string> {
    const ids = new Set<string>();
    for (const groups of this.sessionsByParent.values()) {
      for (const group of groups.values()) {
        for (const entry of group) {
          ids.add(entry.taskId);
        }
      }
    }
    return ids;
  }

  /**
   * Ids remembered for one parent only. Used when a parent is deleted, so the
   * per-child state this plugin keeps alongside them can be cleared without
   * touching another parent's children.
   */
  taskIdsForParent(parentSessionId: string): Set<string> {
    const ids = new Set<string>();
    for (const group of this.sessionsByParent.get(parentSessionId)?.values() ??
      []) {
      for (const entry of group) {
        ids.add(entry.taskId);
      }
    }
    return ids;
  }

  addContext(taskId: string, files: ContextFile[]): void {
    if (files.length === 0) return;

    for (const groups of this.sessionsByParent.values()) {
      for (const group of groups.values()) {
        const match = group.find((entry) => entry.taskId === taskId);
        if (!match) continue;

        const existing = new Map(
          match.contextFiles.map((file) => [file.path, file]),
        );
        for (const file of files) {
          const previous = existing.get(file.path);
          if (previous) {
            previous.lineCount = Math.max(previous.lineCount, file.lineCount);
            previous.lastReadAt = Math.max(
              previous.lastReadAt,
              file.lastReadAt,
            );
            continue;
          }
          match.contextFiles.push({ ...file });
        }
        this.trimContextFiles(match);
      }
    }
  }

  clearParent(parentSessionId: string): void {
    this.sessionsByParent.delete(parentSessionId);
    this.nextAliasIndexByParent.delete(parentSessionId);
  }

  /**
   * Compact `agent: alias, alias` list of everything remembered for a parent,
   * most recently used first. Attached to an unknown-alias rejection so the
   * message names the references that do resolve.
   */
  aliasSummary(parentSessionId: string): string {
    const groups = this.sessionsByParent.get(parentSessionId);
    if (!groups || groups.size === 0) return 'none';

    return [...groups.entries()]
      .map(([agentType, entries]) => {
        const ranked = [...entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        return `${agentType}: ${ranked.map((entry) => entry.alias).join(', ')}`;
      })
      .join('; ');
  }

  formatForPrompt(parentSessionId: string): string | undefined {
    const groups = this.sessionsByParent.get(parentSessionId);
    if (!groups || groups.size === 0) return undefined;

    const lines = [...groups.entries()]
      .map(
        ([agentType, entries]) =>
          [
            agentType,
            [...entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt),
          ] as const,
      )
      .filter(([, entries]) => entries.length > 0)
      .sort((a, b) => b[1][0].lastUsedAt - a[1][0].lastUsedAt)
      .map(([agentType, entries]) =>
        [
          `- ${agentType}: ${entries
            .map((entry) => `${entry.alias} ${promptValue(entry.label)}`)
            .join('; ')}`,
          ...entries
            .map(
              (entry) =>
                [
                  entry,
                  formatContextFiles(entry.contextFiles, {
                    minLines: this.readContextMinLines,
                    maxFiles: this.readContextMaxFiles,
                  }),
                ] as const,
            )
            .filter(([, context]) => context.length > 0)
            .map(
              ([entry, context]) =>
                `  Context read by ${entry.alias}: ${context}`,
            ),
        ].join('\n'),
      );

    if (lines.length === 0) return undefined;

    return [
      '### Resumable Sessions',
      'Child sessions you already ran in this conversation. Reuse is always explicit:',
      '- Continue the same thread: call `task` again with the SAME subagent_type and task_id="<alias>".',
      '- New or unrelated topic: OMIT task_id so a fresh child session is created.',
      '- If several aliases fit, use the most recently used one for that specialist.',
      '- Never reuse an alias blindly; an alias that is unknown or evicted fails the call.',
      '',
      ...lines,
    ].join('\n');
  }

  private getAgentGroup(
    parentSessionId: string,
    agentType: AgentName,
    create: boolean,
  ): RememberedTaskSession[] | undefined {
    let groups = this.sessionsByParent.get(parentSessionId);
    if (!groups && create) {
      groups = new Map();
      this.sessionsByParent.set(parentSessionId, groups);
    }

    let group = groups?.get(agentType);
    if (!group && create && groups) {
      group = [];
      groups.set(agentType, group);
    }

    return group;
  }

  private setAgentGroup(
    parentSessionId: string,
    agentType: AgentName,
    entries: RememberedTaskSession[],
  ): void {
    const groups = this.sessionsByParent.get(parentSessionId);
    if (!groups) return;

    if (entries.length === 0) {
      groups.delete(agentType);
      if (groups.size === 0) {
        this.sessionsByParent.delete(parentSessionId);
        // Alias counters intentionally survive here: only clearParent()
        // resets them. Recycling `exp-1` for an unrelated child would make
        // a stale alias from an earlier message point somewhere new.
      }
      return;
    }

    groups.set(agentType, entries);
  }

  private nextAlias(parentSessionId: string, agentType: AgentName): string {
    let counters = this.nextAliasIndexByParent.get(parentSessionId);
    if (!counters) {
      counters = new Map();
      this.nextAliasIndexByParent.set(parentSessionId, counters);
    }

    const next = (counters.get(agentType) ?? 0) + 1;
    counters.set(agentType, next);
    return `${aliasPrefix(agentType)}-${next}`;
  }

  private trimGroup(group: RememberedTaskSession[]): void {
    group.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    // Protected entries are never evicted, so the group may exceed the window
    // while delegations are in flight or were interrupted. Settled history is
    // still capped, newest first.
    let settled = 0;
    const kept = group.filter((entry) => {
      if (entry.protectionOwners.size > 0) return true;
      settled += 1;
      return settled <= this.maxSessionsPerAgent;
    });
    if (kept.length !== group.length) {
      group.splice(0, group.length, ...kept);
    }
  }

  /**
   * Protect a child from `maxSessionsPerAgent` trimming on behalf of `owner`.
   * Idempotent: re-protecting for an owner that already holds it changes nothing,
   * so replayed events cannot inflate the set.
   */
  protect(taskId: string, owner: string): void {
    const found = this.findRemembered(taskId);
    if (!found) return;
    found.entry.protectionOwners.add(owner);
  }

  /**
   * Drop one owner's protection. The entry rejoins the capped history only once
   * no owner remains.
   */
  releaseProtection(taskId: string, owner: string): void {
    const found = this.findRemembered(taskId);
    if (!found) return;
    if (!found.entry.protectionOwners.delete(owner)) return;
    if (found.entry.protectionOwners.size > 0) return;

    const group = this.getAgentGroup(
      found.parentSessionId,
      found.agentType,
      false,
    );
    if (group) this.trimGroup(group);
  }

  private findRemembered(taskId: string):
    | {
        entry: RememberedTaskSession;
        parentSessionId: string;
        agentType: AgentName;
      }
    | undefined {
    for (const [parentSessionId, groups] of this.sessionsByParent) {
      for (const [agentType, group] of groups) {
        const entry = group.find((item) => item.taskId === taskId);
        if (entry) return { entry, parentSessionId, agentType };
      }
    }
    return undefined;
  }

  private trimContextFiles(entry: RememberedTaskSession): void {
    if (this.readContextMaxFiles === 0) {
      entry.contextFiles = [];
      return;
    }

    entry.contextFiles = entry.contextFiles
      .filter((file) => file.lineCount >= this.readContextMinLines)
      .sort((a, b) => b.lastReadAt - a.lastReadAt)
      .slice(0, this.readContextMaxFiles + 1);
  }

  private nextOrder(): number {
    this.orderCounter += 1;
    return this.orderCounter;
  }
}

function formatContextFiles(
  files: ContextFile[],
  options: { minLines: number; maxFiles: number },
): string {
  const eligible = files
    .filter((file) => file.lineCount >= options.minLines)
    .sort((a, b) => b.lastReadAt - a.lastReadAt);
  const shown = eligible.slice(0, options.maxFiles);
  const rest = eligible.length - shown.length;
  const rendered = shown.map(
    (file) => `${promptValue(file.path)} (${file.lineCount} lines)`,
  );
  return `${rendered.join(', ')}${rest > 0 ? ` (+${rest} more)` : ''}`;
}

/**
 * Readable, single-line rendering of untrusted prompt data. Filenames and
 * labels come from tool output, so a value carrying control characters,
 * quotes, or angle brackets is JSON-encoded instead of being able to inject a
 * new prompt line or instruction.
 */
function promptValue(value: string): string {
  return isSafePromptValue(value) ? value : JSON.stringify(value);
}
