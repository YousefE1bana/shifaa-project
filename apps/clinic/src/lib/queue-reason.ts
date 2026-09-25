/** Validate the restricted reason before it crosses the queue mutation boundary. */
export const validQueueReorderReason = (value: string) =>
  [...value.trim()].length > 0 && [...value.trim()].length <= 500 && !/[\p{Cc}]/u.test(value);
