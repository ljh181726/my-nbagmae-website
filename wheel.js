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
  }

  /* ── HiDPI ─────────────────────────────── */
  _setupHiDPI() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = rect.width;
    this.H = rect.height;
  }

  /* ── Update teams pool ─────────────────── */
  setTeams(teams) {
    this.teams = teams;
    this.rotation = 0;
    this.draw();
  }

  /* ── Main draw ─────────────────────────── */
  draw() {
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

      // Filled arc
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? team.primaryColor : this._lighten(team.primaryColor, 25);
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
      ctx.fillStyle = this._contrastColor(team.primaryColor);
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
    // Selected team is determined by: pointerAngle = (-PI/2 - rotation) % 2PI
    // We want pointerAngle = targetAngle
    // So targetAngle = -PI/2 - finalRotation => finalRotation = -PI/2 - targetAngle
    let desiredFinalRotation = (-Math.PI / 2 - targetAngle) % (2 * Math.PI);
    if (desiredFinalRotation < 0) desiredFinalRotation += 2 * Math.PI;

    // Current rotation
    const currentRotNorm = this.rotation % (2 * Math.PI);

    // Calculate delta rotation needed to reach desired final rotation
    let delta = desiredFinalRotation - currentRotNorm;
    if (delta <= 0) delta += 2 * Math.PI;

    // Add 5 full rotations for a nice spinning effect
    const totalDelta = delta + 5 * 2 * Math.PI;

    // Deceleration factor
    const deceleration = 0.985;
    
    // Sum of infinite series of velocity: v0 * d / (1 - d) = totalDelta
    // Therefore: v0 = totalDelta * (1 - d) / d
    this.spinVelocity = totalDelta * (0.015) / 0.985;

    const minVelocity  = 0.0008;

    const animate = () => {
      this.rotation    += this.spinVelocity;
      this.spinVelocity *= deceleration;

      // Normalize rotation
      this.rotation = this.rotation % (2 * Math.PI);

      this.draw();

      if (this.spinVelocity > minVelocity) {
        this.animId = requestAnimationFrame(animate);
      } else {
        // Stopped — determine result and fire callback
        this.spinning = false;
        this.rotation = desiredFinalRotation; // Snap to exact target center
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

  /* ── Utility: lighten a hex color ──────── */
  _lighten(hex, pct) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xFF) + pct);
    const g = Math.min(255, ((num >> 8)  & 0xFF) + pct);
    const b = Math.min(255, ((num)       & 0xFF) + pct);
    return `rgb(${r},${g},${b})`;
  }

  /* ── Utility: pick white or black text for contrast ── */
  _contrastColor(hex) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 0xFF;
    const g = (num >> 8)  & 0xFF;
    const b =  num        & 0xFF;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return luma > 140 ? '#1e1b2e' : '#ffffff';
  }

  /* ── Cleanup ───────────────────────────── */
  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }
}
