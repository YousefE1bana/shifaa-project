import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// A separate process has no inherited chat context and enforces a read-only
// sandbox. A role TOML alone cannot narrow a writable parent's permissions.
const brief = process.argv.slice(2).join(' ').trim();
if (!brief) {
  console.error('Usage: pnpm security:review "bounded scope, revision, contracts and evidence to inspect"');
  process.exitCode = 2;
} else {
  const instructions = readFileSync(resolve('.codex/agents/security-reviewer.toml'), 'utf8');
  const args = [
    'exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only',
    '--model', 'gpt-6.1-terra', '-c', 'model_reasoning_effort="high"',
    '-c', 'features.apps=false', '-c', 'features.plugins=false',
    '-c', 'features.memories=false', '-c', 'features.multi_agent_v2.enabled=false',
    '-C', process.cwd(), '-',
  ];
  const prompt = `Independent review. No prior conversation is available.\n${instructions}\n\nAssignment:\n${brief}\n`;
  // On Windows resolve the native binary, never run a shell with the brief.
  const command = process.env.SHIFAA_CODEX_EXECUTABLE || 'codex';
  const result = spawnSync(command, args, { input: prompt, stdio: ['pipe', 'inherit', 'inherit'], shell: false });
  if (result.error) console.error('Codex CLI could not start; set SHIFAA_CODEX_EXECUTABLE to its native executable path.');
  process.exitCode = result.status ?? 1;
}
