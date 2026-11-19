export async function uploadBatch<T, Result>(
  items: T[],
  upload: (item: T) => Promise<Result>,
  discard?: (results: Result[]) => Promise<void>,
): Promise<Result[]> {
  const outcomes = await Promise.allSettled(items.map(async item => upload(item)));
  const failure = outcomes.find(outcome => outcome.status === 'rejected');
  const uploaded = outcomes.flatMap(outcome => outcome.status === 'fulfilled' ? [outcome.value] : []);
  if (failure) {
    await discard?.(uploaded);
    throw failure.reason;
  }
  return uploaded;
}
