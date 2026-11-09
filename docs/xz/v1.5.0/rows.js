(function (root) {
  'use strict';
  class Store {
    constructor({ maxRows = 20, maxSamples = 1000000 } = {}) {
      this.maxRows = maxRows;
      this.maxSamples = maxSamples;
      this.samples = 0;
      this.rows = [];
      this.current = null;
      this.locked = false;
    }
    begin(config) {
      if (this.locked) throw new Error('当前扫描行已锁定');
      if (this.rows.length >= this.maxRows) throw new Error('历史扫描行已达上限');
      this.current = { ...config };
    }
    lock() {
      if (!this.current) throw new Error('扫描行尚未配置');
      this.locked = true;
    }
    finish(snapshot) {
      const retained = snapshot.raw.length + snapshot.partial.length;
      if (this.rows.length >= this.maxRows || this.samples + retained > this.maxSamples) throw new Error('history capacity');
      // The retired simulation hands off its arrays. No serialization or full copy on the UI thread.
      const row = { ...snapshot, config: this.current, id: this.rows.length + 1, rawCount: snapshot.rawCount ?? retained };
      this.rows.push(row);
      this.samples += retained;
      this.current = null;
      this.locked = false;
      return row;
    }
    list() { return this.rows.slice(); }
  }
  if (typeof module !== 'undefined') module.exports = { Store };
  else root.XZRows = { Store };
})(globalThis);
