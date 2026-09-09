// Keep the last successful value and its timestamp when one source fails.
export async function loadSource({ load, previous, previousMeta, fallbackTime, now = new Date().toISOString() }) {
  try {
    const result = await load();
    return { value: result.value, meta: { state: 'fresh', lastSuccessAt: now, ...result.meta, attemptedAt: now } };
  } catch (error) {
    const available = previous != null;
    return {
      value: available ? previous : null,
      meta: {
        state: available ? 'stale' : 'unavailable',
        lastSuccessAt: available ? (previousMeta?.lastSuccessAt ?? fallbackTime ?? null) : null,
        attemptedAt: now,
        // Callers provide sanitized errors: never serialize curl arguments/tokens.
        error: error.message,
      },
    };
  }
}
