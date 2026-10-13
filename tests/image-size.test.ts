import { describe, expect, it } from "vitest";
import { imageSize } from "../src/steam/image-size.js";

const png = (width: number, height: number): Buffer => {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

// SOI, an APP0 segment to skip, then a SOF0 frame header.
const jpeg = (width: number, height: number, marker = 0xc0): Buffer => {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = marker;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
};

describe("imageSize", () => {
  it("reads a png", () => {
    expect(imageSize(png(460, 215))).toEqual({ width: 460, height: 215 });
  });

  it.each([0xc0, 0xc1, 0xc2])("reads a jpeg frame header (marker %#x)", (marker) => {
    expect(imageSize(jpeg(600, 900, marker))).toEqual({ width: 600, height: 900 });
  });

  it("skips non-frame markers such as DHT (0xc4)", () => {
    const dht = Buffer.concat([Buffer.from([0xff, 0xc4, 0x00, 0x04, 0, 0])]);
    const body = jpeg(300, 200);
    expect(imageSize(Buffer.concat([body.subarray(0, 2), dht, body.subarray(2)]))).toEqual({ width: 300, height: 200 });
  });

  it.each([
    ["empty", Buffer.alloc(0)],
    ["text", Buffer.from("not an image at all")],
    ["jpeg with no frame", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0])],
    ["jpeg cut mid-header", jpeg(10, 10).subarray(0, 25)],
    ["zero-sized png", png(0, 0)],
    ["jpeg with a zero-length segment", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0])],
  ])("returns undefined for %s", (_name, bytes) => {
    expect(imageSize(bytes)).toBeUndefined();
  });
});
