// Reads a body while counting bytes, so an oversized or endless response is cut off
// instead of being buffered whole before its size is checked.
export async function readCapped(response: Response, maxBytes: number): Promise<Buffer | undefined> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > maxBytes ? undefined : bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
