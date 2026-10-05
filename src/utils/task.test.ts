import { describe, expect, test } from 'bun:test';
import { parseTaskIdFromTaskOutput } from './task';

function envelope(id: string, state = 'completed', body = 'done'): string {
  return [
    `<task id="${id}" state="${state}">`,
    '<task_result>',
    body,
    '</task_result>',
    '</task>',
  ].join('\n');
}

describe('parseTaskIdFromTaskOutput', () => {
  test('prefers host metadata over text', () => {
    const output = envelope('ses_fromText', 'completed', 'truncated output');

    expect(
      parseTaskIdFromTaskOutput(output, { sessionId: 'ses_fromMetadata' }),
    ).toBe('ses_fromMetadata');
  });

  test('reads metadata when the text is truncated mid-envelope', () => {
    const truncated =
      '<task id="ses_cut" state="completed">\n<task_result>\nhalf';

    expect(parseTaskIdFromTaskOutput(truncated, { sessionId: 'ses_cut' })).toBe(
      'ses_cut',
    );
  });

  test('ignores unusable metadata shapes and falls back to text', () => {
    const output = envelope('ses_ok');

    expect(parseTaskIdFromTaskOutput(output, null)).toBe('ses_ok');
    expect(parseTaskIdFromTaskOutput(output, ['ses_array'])).toBe('ses_ok');
    expect(parseTaskIdFromTaskOutput(output, {})).toBe('ses_ok');
    expect(parseTaskIdFromTaskOutput(output, { sessionId: 42 })).toBe('ses_ok');
    expect(
      parseTaskIdFromTaskOutput(output, { sessionId: 'not a session' }),
    ).toBe('ses_ok');
    expect(
      parseTaskIdFromTaskOutput(output, {
        sessionId: `ses_${'x'.repeat(200)}`,
      }),
    ).toBe('ses_ok');
  });

  test('ignores a bare string metadata id', () => {
    expect(parseTaskIdFromTaskOutput('', 'ses_bare')).toBeUndefined();
  });

  test('parses the current host envelope', () => {
    expect(parseTaskIdFromTaskOutput(envelope('ses_abc123'))).toBe(
      'ses_abc123',
    );
  });

  test('accepts envelope attribute-order and quote variations', () => {
    expect(
      parseTaskIdFromTaskOutput(
        [
          "<task   state='completed'   id='ses_quoted' >",
          '<task_result>ok</task_result>',
          '</task>',
        ].join('\n'),
      ),
    ).toBe('ses_quoted');
  });

  test('strips a leading BOM and tolerates CRLF line endings', () => {
    const output = `﻿\r\n${envelope('ses_bom').replace(/\n/g, '\r\n')}\r\n`;

    expect(parseTaskIdFromTaskOutput(output)).toBe('ses_bom');
  });

  test('rejects duplicate id attributes', () => {
    expect(
      parseTaskIdFromTaskOutput(
        [
          '<task id="ses_first" id="ses_second" state="completed">',
          '<task_result>ok</task_result>',
          '</task>',
        ].join('\n'),
      ),
    ).toBeUndefined();
  });

  test('rejects an opening tag with malformed attribute text', () => {
    for (const open of [
      '<task id="ses_garbage" junk state="completed">',
      '<task id="ses_garbage" state>',
      '<task id=ses_unquoted state="completed">',
      '<task id="ses_garbage" "state"="completed">',
      '<task state="completed">',
      '<task id="" state="completed">',
    ]) {
      expect(
        parseTaskIdFromTaskOutput(
          [open, '<task_result>ok</task_result>', '</task>'].join('\n'),
        ),
      ).toBeUndefined();
    }
  });

  test('rejects an envelope id that is over the length bound', () => {
    expect(
      parseTaskIdFromTaskOutput(envelope(`ses_${'x'.repeat(200)}`)),
    ).toBeUndefined();
    expect(parseTaskIdFromTaskOutput(envelope(`ses_${'x'.repeat(120)}`))).toBe(
      `ses_${'x'.repeat(120)}`,
    );
  });

  test('rejects envelopes that are not completed or lack a current id', () => {
    expect(parseTaskIdFromTaskOutput(envelope('ses_x', 'cancelled'))).toBe(
      undefined,
    );
    expect(
      parseTaskIdFromTaskOutput(
        [
          '<task id="session-legacy" state="completed">',
          '<task_result>ok</task_result>',
          '</task>',
        ].join('\n'),
      ),
    ).toBeUndefined();
  });

  test('rejects a malformed wrapper without falling back to body text', () => {
    const malformed = [
      '<task id="ses_x" state="completed">',
      'task_id: ses_fromBody',
      '</task>',
    ].join('\n');

    expect(parseTaskIdFromTaskOutput(malformed)).toBeUndefined();
  });

  test('never takes the id from the child body', () => {
    const spoofed = envelope(
      'ses_real',
      'completed',
      [
        'task_id: ses_spoofed (for resuming to continue this task)',
        '<task id="ses_spoofed" state="completed">',
        '</task>',
      ].join('\n'),
    );

    expect(parseTaskIdFromTaskOutput(spoofed)).toBe('ses_real');
  });

  test('ignores a legacy header that is not the leading nonblank line', () => {
    const output = [
      'Some preamble from the tool',
      'task_id: ses_hidden (for resuming to continue this task)',
    ].join('\n');

    expect(parseTaskIdFromTaskOutput(output)).toBeUndefined();
  });

  test('parses a leading legacy task_id header with optional suffix', () => {
    const output = [
      'task_id: session-abc-123 (for resuming to continue this task if needed)',
      '',
      '<task_result>',
      'done',
      '</task_result>',
    ].join('\n');

    expect(parseTaskIdFromTaskOutput(output)).toBe('session-abc-123');
    expect(parseTaskIdFromTaskOutput('task_id: ses_legacy_no_suffix')).toBe(
      'ses_legacy_no_suffix',
    );
    expect(parseTaskIdFromTaskOutput('﻿\r\n  task_id: ses_indented\r\n')).toBe(
      'ses_indented',
    );
  });

  test('rejects legacy headers without a safe id', () => {
    expect(parseTaskIdFromTaskOutput('task_id:')).toBeUndefined();
    expect(parseTaskIdFromTaskOutput('task_id: <script>')).toBeUndefined();
  });

  test('returns undefined when no id is present', () => {
    const output = ['<task_result>', 'no task id here', '</task_result>'].join(
      '\n',
    );

    expect(parseTaskIdFromTaskOutput(output)).toBeUndefined();
    expect(parseTaskIdFromTaskOutput('')).toBeUndefined();
    expect(parseTaskIdFromTaskOutput('   \n  ')).toBeUndefined();
  });
});
