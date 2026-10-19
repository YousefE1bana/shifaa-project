import type {
  ChildProcess,
  ExecFileSyncOptionsWithStringEncoding,
  ExecFileSyncOptionsWithBufferEncoding,
  SpawnOptions,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncReturns,
} from 'node:child_process';
export interface TestRuntime {
  name: 'shifaa-local-postgres' | 'shifaa-local-supabase';
  context: string;
  engine: string;
  endpoint: string;
  nonce: string;
  project: string;
  container: string;
  image: string;
  port: number;
  user: string;
  adminDatabase: string;
  workdir: string;
  servicePorts: number[];
  passwords: Record<string, string>;
}
export function testRuntime(runtime?: string): TestRuntime;
export function assertTestDatabaseEnvironment(): TestRuntime;
export function testConnectionOptions(
  role?: string,
  runtime?: string,
  database?: string,
): {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};
export function testDatabaseUrl(role?: string, runtime?: string, database?: string): string;
export function testDockerSync(
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string>;
export function testDockerSync(
  args: string[],
  options?: SpawnSyncOptionsWithBufferEncoding,
): SpawnSyncReturns<Buffer>;
export function testDockerExec(
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string;
export function testDockerExec(
  args: string[],
  options?: ExecFileSyncOptionsWithBufferEncoding,
): Buffer;
export function testDocker(args: string[], options?: SpawnOptions): ChildProcess;
export function testSupabaseStatus(): {
  API_URL: string;
  ANON_KEY: string;
  DB_URL: string;
  MAILPIT_URL: string;
  SERVICE_ROLE_KEY: string;
  [key: string]: string;
};
export function testSupabaseArgs(args: string[]): string[];
export function testSupabaseEnvironment(): NodeJS.ProcessEnv;
export function runTestSupabase(
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string;
export function runTestSupabase(
  args: string[],
  options?: ExecFileSyncOptionsWithBufferEncoding,
): Buffer;
export function testEvidenceDirectory(scope: string): string;
