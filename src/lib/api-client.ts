export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Fetch wrapper for internal API routes: JSON in/out, throws ApiError on non-2xx. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const body = (await res.json()) as { error?: string; details?: unknown };
      if (body.error) message = body.error;
      details = body.details;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, details);
  }
  return res.json() as Promise<T>;
}
