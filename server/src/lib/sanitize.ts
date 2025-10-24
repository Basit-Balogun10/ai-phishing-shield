export const sanitizePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const clone: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(payload)) {
    if (v == null) {
      clone[k] = v;
      continue;
    }

    if (typeof v === 'string') {
      // limit strings to 32k chars
      clone[k] = v.length > 32768 ? `${v.slice(0, 32765)}...` : v;
      continue;
    }

    if (typeof v === 'number' || typeof v === 'boolean') {
      clone[k] = v;
      continue;
    }

    // For objects/arrays, stringify but guard deeply nested structures
    try {
      const s = JSON.stringify(v);
      clone[k] = s.length > 32768 ? `${s.slice(0, 32765)}...` : JSON.parse(s);
    } catch {
      clone[k] = String(v);
    }
  }

  return clone;
};
