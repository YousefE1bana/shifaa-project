import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = resolve(import.meta.dirname, '../../..');
const { appendixSuccessorPath, toolingPolicyHistoricalInputs, toolingPolicyInputPaths } =
  await import(pathToFileURL(join(source, 'tools/tooling-history.mjs')).href);

const master = 'SHIFAA-Implementation-Plan-MASTER.md';
const recordPath = 'docs/governance/tooling-maintenance-v1/historical-compatibility.json';
type BindingInput = {
  path: string;
  predecessor: { gitBlob: string };
  appendix: { offset: number };
};
const binding: { inputs: BindingInput[] } = JSON.parse(
  readFileSync(join(source, appendixSuccessorPath), 'utf8'),
);
const record: { inputs: { path: string; historical: { gitBlob: string } }[] } = JSON.parse(
  readFileSync(join(source, recordPath), 'utf8'),
);

function fixture(run: (root: string) => void) {
  const parent = join(source, 'artifacts/feature-011/history-reader-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'fixture-'));
  try {
    for (const file of toolingPolicyInputPaths) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(source, file), join(root, file));
    }
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: source,
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(root, '.git'), `gitdir: ${gitDir}\n`);
    run(root);
  } finally {
    expect(dirname(resolve(root))).toBe(parent);
    rmSync(root, { recursive: true });
  }
}

describe('PR #509 exact append-only historical compatibility', () => {
  it('preserves every original historical Git blob and projects only the five approved predecessors', () => {
    fixture((root) => {
      const historical = toolingPolicyHistoricalInputs(root);
      expect([...historical.keys()].sort()).toEqual(
        [...new Set([...record.inputs, ...binding.inputs].map((input) => input.path))].sort(),
      );
      for (const input of record.inputs)
        expect(historical.get(input.path)).toEqual(
          execFileSync('git', ['cat-file', 'blob', input.historical.gitBlob], { cwd: source }),
        );
      for (const input of binding.inputs.filter((input) => input.path !== master))
        expect(historical.get(input.path)).toEqual(
          execFileSync('git', ['cat-file', 'blob', input.predecessor.gitBlob], { cwd: source }),
        );
    });
  });

  it.each(binding.inputs.map((input) => input.path))(
    'rejects live drift after a cached read: %s',
    (file) => {
      fixture((root) => {
        toolingPolicyHistoricalInputs(root);
        const current = readFileSync(join(root, file));
        const input = binding.inputs.find((entry) => entry.path === file)!;
        const prefixEdit = Buffer.from(current);
        prefixEdit[0] = current[0]! ^ 1;
        const appendixEdit = Buffer.from(current);
        appendixEdit[input.appendix.offset] = current[input.appendix.offset]! ^ 1;
        for (const changed of [
          prefixEdit,
          appendixEdit,
          current.subarray(0, input.appendix.offset),
          current.subarray(0, current.length - 1),
          Buffer.concat([current, Buffer.from('\nUNAUTHORIZED APPENDIX\n')]),
        ]) {
          writeFileSync(join(root, file), changed);
          expect(() => toolingPolicyHistoricalInputs(root)).toThrow(/successor .*drift/);
        }
      });
    },
  );

  it('rejects missing or tampered successor authority, including rewritten boundaries and hashes', () => {
    fixture((root) => {
      toolingPolicyHistoricalInputs(root);
      const path = join(root, appendixSuccessorPath);
      const raw = readFileSync(path);
      const changed = JSON.parse(raw.toString());
      changed.inputs[0].appendix.offset -= 1;
      changed.inputs[0].successor.sha256 = '0'.repeat(64);
      for (const bytes of [
        Buffer.concat([raw, Buffer.from(' ')]),
        Buffer.from(JSON.stringify(changed)),
      ]) {
        writeFileSync(path, bytes);
        expect(() => toolingPolicyHistoricalInputs(root)).toThrow(/binding drift/);
      }
      rmSync(path);
      expect(() => toolingPolicyHistoricalInputs(root)).toThrow(/Tooling policy source drift/);
    });
  });

  it('keeps the original exact-input path working without the optional successor', () => {
    fixture((root) => {
      rmSync(join(root, appendixSuccessorPath));
      for (const input of binding.inputs)
        writeFileSync(
          join(root, input.path),
          execFileSync('git', ['cat-file', 'blob', input.predecessor.gitBlob], { cwd: source }),
        );
      const historical = toolingPolicyHistoricalInputs(root);
      expect([...historical.keys()].sort()).toEqual(
        record.inputs.map((input) => input.path).sort(),
      );
      for (const input of record.inputs)
        expect(historical.get(input.path)).toEqual(
          execFileSync('git', ['cat-file', 'blob', input.historical.gitBlob], { cwd: source }),
        );
    });
  });

  it('runs the independent Python reader regression cases without any database or network operation', () => {
    const output = execFileSync(
      process.platform === 'win32' ? 'python' : 'python3',
      ['-B', '-m', 'unittest', 'test_tooling_history_successor', '-v'],
      { cwd: join(source, 'tools'), encoding: 'utf8', stdio: 'pipe' },
    );
    expect(output).toBe('');
  });
});
