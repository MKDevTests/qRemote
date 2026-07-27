import { AxiosError } from 'axios';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isAxiosError(error: unknown): error is AxiosError {
  return error instanceof AxiosError || (error instanceof Error && 'isAxiosError' in error);
}

/**
 * HTTP status attached by the API client's error normalizer, when the request
 * got a response. Lets callers branch on the status instead of substring-matching
 * the human-readable message.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (error instanceof Error && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}
