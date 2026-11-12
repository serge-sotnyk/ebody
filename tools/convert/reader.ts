/** Sequential little-endian reader over a byte buffer. */
export class ByteReader {
  pos = 0;

  constructor(readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  read(count: number): Uint8Array {
    if (count < 0 || this.pos + count > this.bytes.length) {
      throw new Error(`read past end: pos ${this.pos} + ${count} > ${this.bytes.length}`);
    }
    const out = this.bytes.subarray(this.pos, this.pos + count);
    this.pos += count;
    return out;
  }

  u8(): number {
    return this.read(1)[0]!;
  }

  u16(): number {
    const b = this.read(2);
    return b[0]! | (b[1]! << 8);
  }

  skip(count: number): void {
    this.read(count);
  }
}
