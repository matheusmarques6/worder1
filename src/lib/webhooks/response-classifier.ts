export type DeliveryOutcome = 'delivered' | 'failed' | 'retrying';

export function classifyResponse(
  status: number,
  attempt: number,
  maxAttempts: number = 5
): DeliveryOutcome {
  if (status >= 200 && status < 300) return 'delivered';
  const retryable = status >= 500 || status === 408 || status === 429;
  if (retryable && attempt < maxAttempts) return 'retrying';
  return 'failed';
}
