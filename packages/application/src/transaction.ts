export interface TransactionRunner<TTransaction> {
  run<TResult>(work: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
}
