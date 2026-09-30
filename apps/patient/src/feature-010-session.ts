// Assurance is display/request context only. The server still authenticates and
// authorizes every operation. Bind it to the exact installed token so an old
// AAL2 session cannot elevate a replacement session.
let current: { token: string; aal: 1 | 2 } | undefined;

export function rememberFeature010Session(token: string, aal: 1 | 2 | undefined): void {
  current = aal === 1 || aal === 2 ? { token, aal } : undefined;
}

export function readFeature010SessionAal(token: string | undefined): 1 | 2 | undefined {
  return token && current?.token === token ? current.aal : undefined;
}
