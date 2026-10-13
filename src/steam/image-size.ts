export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Start-of-frame markers carry the dimensions; 0xC4, 0xC8 and 0xCC share the range but are not frames.
const isStartOfFrame = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

// Reads the header only, so a truncated or hostile file can at worst return undefined.
export function imageSize(bytes: Buffer): ImageSize | undefined {
  const size = bytes.length >= 24 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? readPng(bytes) : readJpeg(bytes);
  return size && size.width > 0 && size.height > 0 ? size : undefined;
}

function readPng(bytes: Buffer): ImageSize {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpeg(bytes: Buffer): ImageSize | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }

    const length = bytes.readUInt16BE(offset + 2);
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.length) return undefined;
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (length < 2) return undefined;
    offset += 2 + length;
  }
  return undefined;
}
