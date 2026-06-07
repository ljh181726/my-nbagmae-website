// ─────────────────────────────────────────────
//  wheel.js  –  Canvas-based Lucky Wheel
// ─────────────────────────────────────────────

export class LuckyWheel {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Array} teams  – current pool of available team objects
   * @param {Function} onResult – callback(team) after spin completes
   */
  constructor(canvas, teams, onResult) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.teams   = teams;
    this.onResult = onResult;

    this.rotation     = 0;       // current rotation in radians
    this.spinning     = false;
    this.spinVelocity = 0;
    this.animId       = null;

    // High-DPI canvas
    this._setupHiDPI();
    this.draw();

    // Listen to window resize to handle responsiveness
    this._resizeHandler = () => this.draw();
    window.addEventListener('resize', this._resizeHandler);

    // If layout hasn't finished (e.g. container was hidden), schedule a deferred setup
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) {
      setTimeout(() => {
        this.draw();
      }, 50);
    }
  }

  /* ── HiDPI ─────────────────────────────── */
  _setupHiDPI() {
    const dpr  = window.devicePixelRatio || 1;
    let rect = this.canvas.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    // Fallback if hidden or not yet laid out
    if (width === 0 || height === 0) {
      width = this.canvas.offsetWidth;
      height = this.canvas.offsetHeight;
    }
    if (width === 0 || height === 0) {
      const styleWidth = parseFloat(this.canvas.style.width);
      const styleHeight = parseFloat(this.canvas.style.height);
      width = !isNaN(styleWidth) ? styleWidth : (this.canvas.width ? this.canvas.width / dpr : 380);
      height = !isNaN(styleHeight) ? styleHeight : (this.canvas.height ? this.canvas.height / dpr : 380);
    }

    this.canvas.width  = width  * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = width;
    this.H = height;
  }

  /* ── Update teams pool ─────────────────── */
  setTeams(teams) {
    this.teams = teams;
    this.rotation = 0;
    this.draw();
  }

  /* ── Main draw ─────────────────────────── */
  draw() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.width !== this.W) {
      this._setupHiDPI();
    }
    const ctx = this.ctx;
    const cx  = this.W / 2;
    const cy  = this.H / 2;
    const R   = Math.min(cx, cy) - 12;
    const n   = this.teams.length;
    if (n === 0) return;

    const arc = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, this.W, this.H);

    // ── Outer glow ring ──
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(139,92,246,0.45)';
    ctx.lineWidth   = 4;
    ctx.shadowColor = '#8b5cf6';
    ctx.shadowBlur  = 18;
    ctx.stroke();
    ctx.restore();

    // ── Segments ──
    for (let i = 0; i < n; i++) {
      const startAngle = this.rotation + i * arc;
      const endAngle   = startAngle + arc;
      const team = this.teams[i];

      // Filled arc - safely parse primaryColor
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      const baseColor = this._safeHex(team.primaryColor);
      ctx.fillStyle = i % 2 === 0 ? baseColor : this._lighten(baseColor, 28);
      ctx.fill();

      // Segment border
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── Text label ──
      ctx.save();
      const midAngle = startAngle + arc / 2;
      ctx.translate(cx, cy);
      ctx.rotate(midAngle);

      // Adaptive label: abbreviation when >10 teams, full name when <=10
      const label = n > 10 ? team.abbreviation : team.name;
      const maxLen = R * 0.72;
      let fontSize = n > 10
        ? Math.min(16, Math.max(9, (arc * R) / 2.2))
        : Math.min(13, Math.max(8, (arc * R) / 4));

      ctx.font      = `bold ${fontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = this._contrastColor(this._safeHex(team.primaryColor));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      // Truncate if still overflows
      let display = label;
      while (ctx.measureText(display).width > maxLen && display.length > 3) {
        display = display.slice(0, -1);
      }
      if (display !== label) display += '…';

      ctx.fillText(display, R - 14, 0);
      ctx.restore();
    }

    // ── Center circle ──
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.13, 0, 2 * Math.PI);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.13);
    grad.addColorStop(0, '#6d28d9');
    grad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // ── Center text ──
    ctx.fillStyle    = '#fff';
    ctx.font         = `bold ${Math.max(11, R * 0.07)}px 'Outfit', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy);

    // ── Pointer (top-center triangle) ──
    this._drawPointer(cx, cy, R);
  }

  /* ── Pointer triangle ──────────────────── */
  _drawPointer(cx, _cy, R) {
    const ctx = this.ctx;
    const py  = _cy - R - 6;
    const sz  = 18;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, py + sz + 4);
    ctx.lineTo(cx - sz * 0.65, py - 2);
    ctx.lineTo(cx + sz * 0.65, py - 2);
    ctx.closePath();

    ctx.fillStyle   = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur  = this.spinning ? 14 : 6;
    ctx.fill();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /* ── Spin ──────────────────────────────── */
  spin() {
    if (this.spinning || this.teams.length === 0) return;
    // Fallback to random spin if no target is specified
    const randomTeam = this.teams[Math.floor(Math.random() * this.teams.length)];
    this.spinTo(randomTeam);
  }

  /* ── Synced Multiplayer Spin to Target Team ── */
  spinTo(targetTeam) {
    if (this.spinning || this.teams.length === 0) return;
    this.spinning = true;

    const n = this.teams.length;
    const arc = (2 * Math.PI) / n;
    const targetIndex = this.teams.findIndex(t => t.abbreviation === targetTeam.abbreviation);
    
    if (targetIndex === -1) {
      this.spinning = false;
      return;
    }

    // Target angle (where the pointer should land, mid-point of target segment)
    const targetAngle = (targetIndex + 0.5) * arc;

    // Pointer is at -PI/2.
    let desiredFinalRotation = (-Math.PI / 2 - targetAngle) % (2 * Math.PI);
    if (desiredFinalRotation < 0) desiredFinalRotation += 2 * Math.PI;

    // Current rotation (normalized)
    const currentRotNorm = ((this.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Calculate delta rotation needed to reach desired final rotation
    let delta = desiredFinalRotation - currentRotNorm;
    if (delta <= 0) delta += 2 * Math.PI;

    // Add 5 full rotations for a nice spinning effect
    const totalDelta = delta + 5 * 2 * Math.PI;

    // Use cubic easing for predictable 2 second spin duration
    const DURATION_MS = 2000;
    let startTime = null;
    const startRotation = this.rotation;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(1, elapsed / DURATION_MS);
      // Cubic ease-out: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3);

      this.rotation = startRotation + totalDelta * eased;
      this.draw();

      if (t < 1) {
        this.animId = requestAnimationFrame(animate);
      } else {
        // Stopped — snap to exact target and fire callback
        this.spinning = false;
        this.rotation = startRotation + totalDelta; // Keep full rotation value
        this.draw();
        this.onResult(targetTeam);
      }
    };
    this.animId = requestAnimationFrame(animate);
  }

  /* ── Determine which segment the pointer points to ── */
  _getSelectedTeam() {
    const n   = this.teams.length;
    const arc = (2 * Math.PI) / n;

    // Pointer is at top (negative Y → angle = -π/2 = 3π/2)
    // Wheel rotation is applied, so we need the segment at -π/2 - rotation
    let pointerAngle = ((-Math.PI / 2) - this.rotation) % (2 * Math.PI);
    if (pointerAngle < 0) pointerAngle += 2 * Math.PI;

    const index = Math.floor(pointerAngle / arc);
    return this.teams[index % n];
  }

  /* ── Utility: ensure a valid hex color ────── */
  _safeHex(hex) {
    if (!hex || typeof hex !== 'string') return '#4b5563';
    const cleaned = hex.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) return cleaned;
    if (/^#[0-9A-Fa-f]{3}$/.test(cleaned)) {
      // Expand shorthand
      const r = cleaned[1] + cleaned[1];
      const g = cleaned[2] + cleaned[2];
      const b = cleaned[3] + cleaned[3];
      return `#${r}${g}${b}`;
    }
    return '#4b5563'; // Fallback gray
  }

  /* ── Utility: lighten a hex color ──────── */
  _lighten(hex, pct) {
    const safe = this._safeHex(hex);
    const num = parseInt(safe.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xFF) + pct);
    const g = Math.min(255, ((num >> 8)  & 0xFF) + pct);
    const b = Math.min(255, ((num)       & 0xFF) + pct);
    return `rgb(${r},${g},${b})`;
  }

  /* ── Utility: pick white or black text for contrast ── */
  _contrastColor(hex) {
    const safe = this._safeHex(hex);
    const num = parseInt(safe.replace('#', ''), 16);
    const r = (num >> 16) & 0xFF;
    const g = (num >> 8)  & 0xFF;
    const b =  num        & 0xFF;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return luma > 140 ? '#1e1b2e' : '#ffffff';
  }

  /* ── Cleanup ───────────────────────────── */
  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._resizeHandler);
  }
}
