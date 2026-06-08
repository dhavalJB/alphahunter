export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly source: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RateLimitError extends ApiError {
  constructor(source: string, message = "Rate limit exceeded") {
    super(message, 429, source, true);
    this.name = "RateLimitError";
  }
}

export class WalletDataError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "WalletDataError";
  }
}

export function toApiErrorResponse(error: unknown): {
  status: number;
  message: string;
  retryable: boolean;
} {
  if (error instanceof RateLimitError) {
    return {
      status: 503,
      message:
        "Blockchain data is temporarily rate-limited. Please wait a moment and try again.",
      retryable: true,
    };
  }

  if (error instanceof ApiError) {
    if (error.status === 429) {
      return {
        status: 503,
        message:
          "Blockchain data is temporarily rate-limited. Please wait a moment and try again.",
        retryable: true,
      };
    }
    return {
      status: error.status >= 500 ? 502 : 502,
      message: `${error.source} error: ${error.message}`,
      retryable: error.retryable,
    };
  }

  if (error instanceof WalletDataError) {
    return {
      status: 502,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return {
        status: 504,
        message: "Blockchain data request timed out. Please try again.",
        retryable: true,
      };
    }
    return { status: 502, message: error.message, retryable: false };
  }

  return { status: 502, message: "Analysis failed", retryable: false };
}
