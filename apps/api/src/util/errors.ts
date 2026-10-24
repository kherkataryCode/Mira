/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Please sign in');
export const forbidden = () => new HttpError(403, 'forbidden', 'Not allowed');
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
