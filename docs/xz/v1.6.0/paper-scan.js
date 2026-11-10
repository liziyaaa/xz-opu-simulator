(function (root) {
  'use strict';
  const P = typeof module !== 'undefined' ? require('../v1.3.0/physics.js') : root.XZPhysics;
  const S = typeof module !== 'undefined' ? require('../v1.3.0/samples.js') : root.XZSamples;
  const A = typeof module !== 'undefined' ? require('./camera-alignment.js') : root.XZCameraAlignment;
  const mean = (points, key) => points.reduce((sum, point) => sum + point[key], 0) / points.length;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  function waferRecipe({ sample, row, placement }, spot) {
    const { id } = sample;
    const margin = Math.max(2, spot / 2);
    const blocked = id === 'bump-2x3' ? S.bumpData.bumps.flatMap(b => {
      const [x, y] = placement.forward(b.x, b.y);
      const halfWidth = Math.sqrt((b.radius + margin) ** 2 - (row - y) ** 2);
      return Number.isFinite(halfWidth) ? [[x - halfWidth, x + halfWidth]] : [];
    }) : [];
    const inside = x => {
      const [u, v] = placement.inverse(x, row);
      return u >= margin && u <= sample.width - margin && v >= margin && v <= sample.depth - margin;
    };
    return (a, b = a) => id === 'bump-2x3' && inside(a) && inside(b) &&
      !blocked.some(([lo, hi]) => Math.min(a, b) <= hi && Math.max(a, b) >= lo);
  }

  function waferEvidence(sim, fit, rfMv) {
    const ref = sim.waferResponse;
    if (!fit || !Number.isFinite(fit.focus) || !Number.isFinite(rfMv) || !Number.isFinite(ref.rfMv)) return false;
    const slopeRatio = fit.slope / ref.slope;
    return slopeRatio >= 0.8 && slopeRatio <= 1.2 && Math.abs(rfMv - ref.rfMv) <= Math.abs(ref.rfMv) * sim.cfg.rfTolerance / 100;
  }

  function fitSweep(trace, offset, noise = 0) {
    const fail = reason => ({ reason });
    const bins = [];
    for (const point of trace) {
      if (!point.fesAvailable) continue;
      let bin = bins.at(-1);
      if (!bin || bin.z !== point.zEncoder) {
        bin = { z: point.zEncoder, sum: 0, n: 0 };
        bins.push(bin);
      }
      bin.sum += point.v - offset;
      bin.n++;
    }
    const points = bins.map(bin => ({ z: bin.z, v: bin.sum / bin.n }));
    if (points.length < 7) return fail(trace.length < 7 ? 'sweep_sampling' : 'sweep_range');
    let peak = 0;
    let valley = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].v > points[peak].v) peak = i;
      if (points[i].v < points[valley].v) valley = i;
    }
    const lobe = Math.min(points[peak].v, -points[valley].v);
    const shoulder = Math.max(4 * noise, lobe * 0.08);
    if (lobe < Math.max(5, 8 * noise) || peak >= valley ||
        points[peak].v - points[0].v < shoulder || points.at(-1).v - points[valley].v < shoulder) {
      return fail('sweep_range');
    }

    const crossings = [];
    for (let i = peak; i < valley; i++) {
      if (points[i].v >= 0 && points[i + 1].v < 0) crossings.push(i);
    }
    if (crossings.length !== 1) return fail('sweep_crossing');
    let first = crossings[0];
    let last = first + 1;
    const gate = lobe * 0.35;
    if (Math.max(Math.abs(points[first].v), Math.abs(points[last].v)) > gate) return fail('sweep_sampling');
    while (first > peak && Math.abs(points[first - 1].v) <= gate) first--;
    while (last < valley && Math.abs(points[last + 1].v) <= gate) last++;
    const central = points.slice(first, last + 1);
    if (central.length < 5 || central.filter(p => p.v > 0).length < 2 || central.filter(p => p.v < 0).length < 2) {
      return fail('sweep_sampling');
    }

    const zMean = mean(central, 'z');
    const vMean = mean(central, 'v');
    const sum = fn => central.reduce((total, p) => total + fn(p), 0);
    const slope = sum(p => (p.z - zMean) * (p.v - vMean)) / sum(p => (p.z - zMean) ** 2);
    const focus = zMean - vMean / slope;
    const r2 = 1 - sum(p => (p.v - vMean - slope * (p.z - zMean)) ** 2) / sum(p => (p.v - vMean) ** 2);
    if (!(slope < 0 && r2 >= 0.98 && focus >= central[0].z && focus <= central.at(-1).z)) return fail('sweep_fit');
    return { focus, slope, r2, n: central.length, from: central[0].z, to: central.at(-1).z };
  }

  function sweepTrigger(sim, signals, target, force) {
    const { cfg, anchor } = sim;
    if (force) return 'retry';
    if (!sim.baselineReady) return 'baseline';
    if (cfg.scanMode === 'every') return 'every_point';
    if (!sim.waferZone(target)) return 'not_wafer';
    if (!sim.waferZone(sim.currentX, target)) return 'wafer_entry';
    if (!sim.records.at(-1)?.valid) return 'after_invalid';
    if (!anchor?.wafer) return 'wafer_unconfirmed';
    const xDistance = Math.abs(target - sim.currentX);
    if (Math.min(xDistance, cfg.xSpeed / cfg.rawHz) > cfg.spot / 2) return 'x_sampling';
    if (anchor.rfMv === null || signals.some(p => !p.fesAvailable || !p.rfAvailable)) return 'signal_missing';
    const voltageBand = Math.abs(anchor.slope) * cfg.flatBand;
    if (voltageBand <= 2 * cfg.noise || signals.some(p => Math.abs(p.v - anchor.fes) + cfg.noise > voltageBand)) return 'fes_changed';
    const rfBand = Math.abs(anchor.rfMv) * cfg.rfTolerance / 100;
    if (signals.some(p => Math.abs(p.rfMv - anchor.rfMv) > rfBand)) return 'rf_changed';
    return '';
  }

  function* measure(sim, target, index, force = false) {
    const { cfg } = sim;
    const origin = sim.z;
    let x = sim.currentX;
    let z = origin;
    let time = sim.elapsed;
    let action = 'sweep';
    let reason = '';
    let trigger = '';
    let fit = null;
    let focus = null;
    let sweeps = 0;
    let sweepTrace = [];
    const raw = [], xTrace = [], judgeTrace = [], focusTrace = [], settleTrace = [], averages = [];

    function sample(kind, destination, dt = 1 / cfg.rawHz) {
      if (sim.raw.length + raw.length >= cfg.maxRaw) throw new Error('capture_limit');
      time += dt;
      const surface = sim.surface(x);
      const reflectance = surface.material === 'bump' ? cfg.bumpReflectance : cfg.baseReflectance;
      const s = P.sensor(surface.heightUm - sim.h0 + z, cfg, sim.raw.length + raw.length, reflectance);
      const point = { index, t: time, x, y: sim.row, z, zEncoder: P.encoder(z, cfg.q), v: s.v,
        fesAvailable: s.inDomain, rf: s.rf, rfMv: s.rfMv, rfAvailable: s.rfAvailable, returnQuality: s.returnQuality,
        material: surface.material, reflectance, u: s.u, valid: s.inDomain, kind };
      raw.push(point);
      destination.push(point);
      return point;
    }

    function* move(axis, to, speed, kind, destination) {
      const from = axis === 'x' ? x : z;
      const duration = Math.abs(to - from) / speed;
      if (duration < 1e-10) return;
      const count = Math.ceil(duration * cfg.rawHz - 1e-10);
      for (let i = 1; i <= count; i++) {
        const elapsed = Math.min(duration, i / cfg.rawHz);
        const position = from + (to - from) * elapsed / duration;
        if (axis === 'x') x = position;
        else z = position;
        const p = sample(kind, destination, elapsed - (i - 1) / cfg.rawHz);
        if (kind === 'z_sweep') sweepTrace.push(p);
        if (raw.length % 512 === 0) yield;
      }
    }

    function* hold(ms, kind, destination) {
      const duration = ms / 1000;
      for (let i = 0; i < Math.ceil(duration * cfg.rawHz); i++) {
        sample(kind, destination, Math.min(1 / cfg.rawHz, duration - i / cfg.rawHz));
        if (raw.length % 512 === 0) yield;
      }
    }

    function* sweep(span) {
      sweeps++;
      const lo = Math.max(-cfg.zLimit, origin - span);
      const hi = Math.min(cfg.zLimit, origin + span);
      yield* move('z', lo, cfg.zSpeed, 'sweep_approach', focusTrace);
      sweepTrace = [sample('z_sweep', focusTrace, 0)];
      yield* move('z', hi, cfg.zSpeed, 'z_sweep', focusTrace);
      return fitSweep(sweepTrace, cfg.offset, cfg.noise);
    }

    try {
      sample('x', xTrace, 0);
      yield* move('x', target, cfg.xSpeed, 'x', xTrace);
      yield* hold(cfg.xSettleMs, 'x_settle', judgeTrace);
      if (!sim.opticalQuality(x)) {
        action = 'edge';
        reason = 'edge';
      } else {
        yield* hold(cfg.averageMs, 'hold_probe', judgeTrace);
        trigger = sweepTrigger(sim, [...xTrace, ...judgeTrace], target, force);
        if (trigger) {
          const near = Math.min(cfg.search, Math.max(2 * cfg.linear, 0.75 / cfg.calibration.uPerUm));
          fit = yield* sweep(near);
          const canExpand = Math.max(-cfg.zLimit, origin - cfg.search) < Math.max(-cfg.zLimit, origin - near) ||
            Math.min(cfg.zLimit, origin + cfg.search) > Math.min(cfg.zLimit, origin + near);
          if (fit.reason && fit.reason !== 'sweep_sampling' && canExpand) fit = yield* sweep(cfg.search);
          reason = fit.reason || '';
          focus = fit.focus ?? null;
          yield* move('z', focus ?? origin, cfg.zSpeed, 'sweep_return', focusTrace);
          if (!reason) {
            yield* hold(cfg.zSettleMs, 'z_settle', settleTrace);
            yield* hold(cfg.averageMs, 'average', averages);
            for (const point of averages) settleTrace.push(point);
            const fitBand = Math.abs(fit.slope) * (Math.max(cfg.q, cfg.zSpeed / cfg.rawHz) + 0.1);
            if (averages.some(p => !p.fesAvailable) || Math.abs(mean(averages, 'v') - cfg.offset) > fitBand + 2 * cfg.noise) {
              reason = 'sweep_hold';
            }
          }
        } else {
          action = 'hold';
          for (const point of judgeTrace) if (point.kind === 'hold_probe') averages.push(point);
          // The latest local fit is used only inside the conservative hold band.
          const { anchor } = sim;
          focus = anchor.focus + mean(averages, 'zEncoder') - anchor.zEncoder - (mean(averages, 'v') - anchor.fes) / anchor.slope;
        }
      }
    } catch (error) {
      if (error.message !== 'capture_limit') throw error;
      action = reason = 'capture_limit';
      x = raw.at(-1)?.x ?? sim.currentX;
      z = raw.at(-1)?.z ?? sim.z;
    }

    const valid = !reason;
    const last = raw.at(-1);
    const signals = averages.length ? averages : last ? [last] : [];
    const rfAvailable = signals.length > 0 && signals.every(p => p.rfAvailable);
    const edgeContinued = reason === 'edge' && cfg.continueEdges && sim.baselineReady;
    return { i: index, target, x, xBefore: sim.currentX, zBefore: origin, zAfter: z, h: sim.height(x) - sim.h0,
      action, reason, valid, edgeContinued, halted: !valid && !edgeContinued, time, seconds: time - sim.elapsed,
      xTrace, judgeTrace, focusTrace, settleTrace, raw, sweepTrace, fit, focus, trigger, sweeps,
      mean: signals.length && signals.every(p => p.fesAvailable) ? mean(signals, 'v') : null, zMean: P.encoder(z, cfg.q),
      rfMv: rfAvailable ? mean(signals, 'rfMv') : null, rfAvailable,
      material: last?.material ?? '', reflectance: last?.reflectance ?? '', averageCount: averages.length };
  }

  class Simulation extends P.Simulation {
    constructor(id, cfg, opts) {
      super(id, cfg, opts);
      this.yaw = id === 'bump-2x3' ? (opts?.yaw ?? 0) : 0;
      this.placement = A.placement(this.yaw, this.sample.width, this.sample.depth);
      this.h0 = this.height(this.start);
      this.anchor = null;
      this.waferPlane = null;
      this.validCount = 0;
      this.maxError = 0;
      this.waferZone = waferRecipe(this, this.cfg.spot);
      const { cfg: c } = this;
      const center = P.sensor(0, c, 0, c.baseReflectance);
      const delta = 0.5;
      this.waferResponse = { rfMv: center.rfMv, slope: (P.sensor(delta, c, 0, c.baseReflectance).v -
        P.sensor(-delta, c, 0, c.baseReflectance).v) / (2 * delta) };
      this.preparing = null;
      this.sweepCount = 0;
      this.lastSweep = null;
    }

    surface(x) {
      return S.surfaceAt(this.sample.id, ...this.placement.inverse(x, this.row));
    }

    height(x) { return this.surface(x).heightUm; }

    opticalQuality(x) {
      const [u, v] = this.placement.inverse(x, this.row);
      return P.opticalQuality(this.sample.id, u, v, this.cfg.spot);
    }

    prepareSlice(deadline = Infinity) {
      if (this.done || this.halted) return null;
      if (this.pending) return this.pending;
      if (!this.preparing) {
        const i = this.records.length;
        this.preparing = measure(this, Math.min(this.end, this.start + i * this.step), i);
      }
      do {
        const next = this.preparing.next();
        if (next.done) {
          this.preparing = null;
          this.pending = next.value;
          return this.pending;
        }
      } while (performance.now() < deadline);
      return null;
    }

    prepare() { return this.prepareSlice(); }

    commit() {
      const p = this.pending || this.prepare();
      if (!p) return null;
      this.z = p.zAfter;
      this.currentX = p.x;
      this.elapsed = p.time;
      this.halted = p.halted;
      this.haltReason = p.reason;
      if (!this.raw.length) this.raw = p.raw.slice();
      else for (const point of p.raw) this.raw.push(point);
      if (p.sweeps) {
        this.lastSweep = p;
        this.sweepCount += p.sweeps;
      }
      if (p.valid && p.action === 'sweep') {
        const silicon = this.waferZone(p.x) && waferEvidence(this, p.fit, p.rfMv);
        if (silicon && this.waferPlane === null) this.waferPlane = p.focus;
        const wafer = silicon && Math.abs(p.focus - this.waferPlane) <= this.cfg.flatBand;
        this.anchor = { index: p.i, ...p.fit, fes: p.mean, zEncoder: p.zMean, rfMv: p.rfMv, wafer };
        if (!this.baselineReady) {
          this.z0 = p.focus;
          this.fes0 = this.cfg.offset;
          this.baselineReady = true;
        }
      }
      const estimate = p.valid ? this.z0 - p.focus : null;
      const record = { index: p.i, x: p.x, y: this.row, truth: p.h, zTrue: this.z, zEncoder: p.zMean,
        fes: p.mean, estimate, error: p.valid ? estimate - p.h : null, valid: p.valid, action: p.action,
        reason: p.reason, time: p.time, edgeContinued: p.edgeContinued, rfMv: p.rfMv, rfAvailable: p.rfAvailable,
        material: p.material, reflectance: p.reflectance, focusZ: p.valid ? p.focus : null,
        fitSlope: p.valid ? this.anchor.slope : null, fitR2: p.valid ? this.anchor.r2 : null,
        fitCount: p.valid ? this.anchor.n : null, anchorIndex: p.valid ? this.anchor.index : null,
        trigger: p.trigger, sweepAttempts: p.sweeps,
        waferState: !this.waferZone(p.x) ? 'outside_recipe' : p.valid && this.anchor.wafer ? 'confirmed' : 'unconfirmed' };
      if (p.valid) {
        this.validCount++;
        this.maxError = Math.max(this.maxError, Math.abs(record.error));
      } else this.losses++;
      if (p.action === 'hold') this.holds++;
      this.records.push(record);
      this.pending = null;
      this.done = this.records.length >= this.total;
      return record;
    }

    *recover() {
      if (!this.halted || this.haltReason === 'capture_limit') return { ok: false, reason: this.haltReason };
      const p = yield* measure(this, this.records.at(-1).x, this.records.length - 1, true);
      this.records.pop();
      this.losses--;
      this.done = false;
      this.pending = p;
      const record = this.commit();
      return { ok: record.valid, reason: record.reason, point: p };
    }
  }

  const api = { Simulation, fitSweep };
  if (typeof module !== 'undefined') module.exports = api;
  else root.XZPaperScan = api;
})(globalThis);
