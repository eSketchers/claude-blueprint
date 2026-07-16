// event-reader.mjs - Efficient incremental event reading

import { createReadStream, statSync } from 'node:fs';
import { EventEmitter } from 'node:events';

export class EventReader extends EventEmitter {
  constructor(filePath, options = {}) {
    super();
    this.filePath = filePath;
    this.lastOffset = 0;
    this.cache = [];
    this.maxCacheSize = options.maxCacheSize || 10000; // Keep last 10k events
    this.rotateThreshold = options.rotateThreshold || 100 * 1024 * 1024; // 100MB
  }

  /**
   * Read all events (from cache + new from file)
   */
  async readAll() {
    const stats = statSync(this.filePath);

    // Check if file was rotated (size decreased)
    if (stats.size < this.lastOffset) {
      console.log('[event-reader] File rotated, resetting cache');
      this.cache = [];
      this.lastOffset = 0;
    }

    // Read new events from file
    const newEvents = await this.readNew();

    // Add to cache
    for (const event of newEvents) {
      this.cache.push(event);

      // Trim cache if too large
      if (this.cache.length > this.maxCacheSize) {
        this.cache.shift();
      }
    }

    return [...this.cache];
  }

  /**
   * Read only new events since last read
   */
  async readNew() {
    const stats = statSync(this.filePath);

    if (stats.size <= this.lastOffset) {
      return []; // No new data
    }

    return new Promise((resolve, reject) => {
      const events = [];
      const stream = createReadStream(this.filePath, {
        start: this.lastOffset,
        encoding: 'utf8'
      });

      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');

        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              events.push(event);
              this.emit('event', event);
            } catch (err) {
              console.error('[event-reader] Invalid JSON:', line);
            }
          }
        }
      });

      stream.on('end', () => {
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            events.push(event);
            this.emit('event', event);
          } catch (err) {
            console.error('[event-reader] Invalid JSON in buffer:', buffer);
          }
        }

        this.lastOffset = stats.size;
        resolve(events);
      });

      stream.on('error', reject);
    });
  }

  /**
   * Check if rotation needed
   */
  shouldRotate() {
    try {
      const stats = statSync(this.filePath);
      return stats.size > this.rotateThreshold;
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.length,
      lastOffset: this.lastOffset,
      fileSize: statSync(this.filePath).size,
      shouldRotate: this.shouldRotate()
    };
  }
}
