import { execFileSync } from 'node:child_process';

export function evidenceHeadBelongsToCurrentHistory(root, capturedHead, authorizedCapture) {
  if (!/^[a-f0-9]{40}$/.test(capturedHead ?? '')) return false;
  if (
    authorizedCapture &&
    (authorizedCapture.head !== capturedHead ||
      !/^[a-f0-9]{40}$/.test(authorizedCapture.baseline ?? ''))
  )
    return false;
  try {
    // A SHA-bound capture record survives squash integration. The caller must
    // authenticate that record and still verify every current source digest.
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', authorizedCapture?.baseline ?? capturedHead, 'HEAD'],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return true;
  } catch {
    return false;
  }
}
