/**
 * Seeded Random Number Generator for Reproducible Fuzzing
 * Uses xorshift128+ algorithm for speed and determinism
 *
 * Usage:
 *   const rng = new SeededRandom(12345);
 *   rng.next();        // Random uint32
 *   rng.nextFloat();   // Random float [0,1)
 *   rng.nextInt(0,10); // Random int [0,10]
 *   rng.choice([1,2,3]); // Random element
 */

export class SeededRandom {
  private state0: number;
  private state1: number;
  public readonly seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
    this.state0 = seed;
    this.state1 = seed ^ 0x49616E42; // Mix bits
  }

  /**
   * Generate next random uint32
   * xorshift128+ algorithm
   */
  next(): number {
    let s1 = this.state0;
    const s0 = this.state1;
    this.state0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.state1 = s1;
    return (this.state0 + this.state1) >>> 0;
  }

  /**
   * Generate random float [0, 1)
   */
  nextFloat(): number {
    return this.next() / 0xFFFFFFFF;
  }

  /**
   * Generate random integer [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Choose random element from array
   */
  choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Sample N random elements from array (without replacement)
   */
  sample<T>(array: T[], count: number): T[] {
    if (count > array.length) {
      count = array.length;
    }

    const shuffled = [...array].sort(() => this.nextFloat() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Shuffle array in-place
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Generate random boolean with given probability
   */
  bool(probability: number = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Generate random bytes
   */
  bytes(length: number): Buffer {
    const bytes = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.nextInt(0, 255);
    }
    return bytes;
  }

  /**
   * Generate random string
   */
  string(length: number, charset: string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(this.nextInt(0, charset.length - 1));
    }
    return result;
  }

  /**
   * Reset RNG to initial seed
   */
  reset(): void {
    this.state0 = this.seed;
    this.state1 = this.seed ^ 0x49616E42;
  }

  /**
   * Clone RNG with same state
   */
  clone(): SeededRandom {
    const cloned = new SeededRandom(this.seed);
    cloned.state0 = this.state0;
    cloned.state1 = this.state1;
    return cloned;
  }
}
