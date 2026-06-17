const cache = new Map<string, string>();

export async function hexToColorName(hex: string): Promise<string> {
  const h = hex.replace('#', '').toLowerCase();
  if (!h || h.length < 6) return hex;
  if (cache.has(h)) return cache.get(h)!;
  try {
    const res = await fetch(`https://www.thecolorapi.com/id?hex=${h}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error('non-ok');
    const data = await res.json();
    const name: string = data?.name?.value ?? hex;
    cache.set(h, name);
    return name;
  } catch {
    return hex;
  }
}
