/**
 * Bounded cache of parsed SVG sources for outlines (Combine, Offset, Array previews).
 */

/** Least recently used cache with a fixed number of entries. */
export class LruCache<K, V> {
    private readonly entries = new Map<K, V>();

    private readonly capacity: number;

    public constructor(capacity: number) {
        this.capacity = capacity;
    }

    public get size(): number {
        return this.entries.size;
    }

    public has(key: K): boolean {
        return this.entries.has(key);
    }

    public get(key: K): V | undefined {
        if (!this.entries.has(key)) {
            return undefined;
        }
        // a Map keeps insertion order: move the entry to the end (most recent)
        const value = this.entries.get(key);
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    public set(key: K, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, value);
        while (this.entries.size > this.capacity) {
            this.entries.delete(this.entries.keys().next().value);
        }
    }
}

/**
 * Flattening tolerance rounded down to a power of two: every size of a file within a factor of two
 * shares one parsed copy, which is at least as fine as asked.
 */
export function toleranceBucket(tolerance: number): number {
    return 2 ** Math.floor(Math.log2(tolerance));
}
