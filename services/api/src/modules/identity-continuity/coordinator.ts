import { ApiPolicyError } from '../identity-onboarding/errors.js';

export interface StagedCommandJournal<Prepared, NativeResult> {
  reserve(): Promise<Prepared>;
  nativeCompleted(prepared: Prepared, nativeResult: NativeResult): Promise<void>;
  committed(prepared: Prepared): Promise<void>;
  failed(prepared: Prepared, stage: 'native' | 'commit'): Promise<void>;
}

export class StagedNativeCommandCoordinator {
  public async execute<Prepared, NativeResult, Result>(input: {
    journal: StagedCommandJournal<Prepared, NativeResult>;
    runNative(prepared: Prepared): Promise<NativeResult>;
    commit(prepared: Prepared, nativeResult: NativeResult): Promise<Result>;
  }): Promise<Result> {
    const prepared = await input.journal.reserve();
    let nativeResult: NativeResult;
    try {
      nativeResult = await input.runNative(prepared);
      await input.journal.nativeCompleted(prepared, nativeResult);
    } catch (error) {
      await input.journal.failed(prepared, 'native');
      throw error;
    }
    try {
      const committed = await input.commit(prepared, nativeResult);
      await input.journal.committed(prepared);
      return committed;
    } catch (error) {
      await input.journal.failed(prepared, 'commit');
      throw new ApiPolicyError(
        'continuity-reconciliation-required',
        503,
        'The security command is safe but requires reconciliation before access continues.',
      );
    }
  }
}
