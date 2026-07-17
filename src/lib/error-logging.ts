type ErrorContext = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

export function logServerError(scope: string, error: unknown, context: ErrorContext = {}) {
  console.error(JSON.stringify({
    level: "error",
    scope,
    timestamp: new Date().toISOString(),
    error: serializeError(error),
    ...context,
  }));
}
