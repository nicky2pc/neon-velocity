/**
 * game.js — Neon Velocity
 * Top-down 2D racing, Canvas 480×720, 3 lanes
 */

import { SynthwaveAudio } from './audio.js';
import { AICar }          from './ai.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 480;
const CANVAS_H = 720;
const LANE_CENTERS = [80, 240, 400];
const LANE_COUNT   = 3;
const ROAD_LEFT    = 30;
const ROAD_RIGHT   = CANVAS_W - 30;

const BASE_SPEED = 200;
const MAX_SPEED  = 650;
const SPEED_RAMP = 16;   // px/s per second

const POINTS_PER_SECOND   = 1;
const POINTS_PER_OVERTAKE = 10;

const PLAYER_LIVES        = 3;
const INVINCIBLE_DURATION = 2.0;
const AUTO_SAVE_INTERVAL  = 15;

const AI_COUNT = 4;

const TRAFFIC_MAX = 8;

const GAME_ID = 'YOUR-GAME-UUID';

// ─── State machine ────────────────────────────────────────────────────────────

const STATE = { LOADING:'LOADING', MENU:'MENU', PLAYING:'PLAYING', PAUSED:'PAUSED', GAME_OVER:'GAME_OVER' };

// ─── Traffic Car types ────────────────────────────────────────────────────────
// Civilian cars travelling in the same direction as the player but slower.
// scroll() moves them at 45% of road speed so they drift toward the player
// from the top of the screen.

const TRAFFIC_TYPES = {
  SEDAN: { w: 32, h: 50, colors: ['#7799bb', '#99aacc', '#5588aa'], scrollFactor: 0.50 },
  SUV:   { w: 36, h: 54, colors: ['#aa7744', '#cc9955', '#886633'], scrollFactor: 0.38 },
  TRUCK: { w: 38, h: 66, colors: ['#778888', '#aabbbb', '#556677'], scrollFactor: 0.28 },
};

class TrafficCar {
  constructor(x, y) {
    const typeKeys = Object.keys(TRAFFIC_TYPES);
    const typeName = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    const def = TRAFFIC_TYPES[typeName];
    this.x = x;
    this.y = y;
    this.width  = def.w;
    this.height = def.h;
    this._targetX         = x;
    this._laneChangeTimer = 1.0 + Math.random() * 2.5;
    this._color        = def.colors[Math.floor(Math.random() * def.colors.length)];
    this._type         = typeName;
    this._scrollFactor = def.scrollFactor;
  }

  update(dt, peers = []) {
    this._laneChangeTimer -= dt;
    if (this._laneChangeTimer <= 0) {
      // Only move to a lane not occupied or targeted by another traffic car nearby
      const free = LANE_CENTERS.filter(lx =>
        !peers.some(p =>
          p !== this &&
          Math.abs(p.y - this.y) < 90 &&
          (Math.abs(p.x - lx) < 40 || Math.abs(p._targetX - lx) < 40)
        )
      );
      if (free.length > 0) {
        this._targetX = free[Math.floor(Math.random() * free.length)];
      }
      this._laneChangeTimer = 3.0 + Math.random() * 4.0;  // much less frequent
    }
    const dx = this._targetX - this.x;
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), 160 * dt);
  }

  // Drifts toward the player at type-specific fraction of road-scroll speed
  scroll(amount) {
    this.y += amount * this._scrollFactor;
  }

  draw(ctx) {
    const x   = this.x;
    const y   = this.y;
    const hw  = this.width  / 2;
    const hh  = this.height / 2;
    const col = this._color;

    ctx.save();

    if (this._type === 'SEDAN') {
      // ── Wheels ──
      ctx.fillStyle   = '#111118';
      ctx.strokeStyle = '#333';
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 0;
      for (const [wx, wy, ww, wh] of [
        [x - hw - 4, y - hh + 5,  7, 11],
        [x + hw - 3, y - hh + 5,  7, 11],
        [x - hw - 4, y + hh - 16, 7, 11],
        [x + hw - 3, y + hh - 16, 7, 11],
      ]) {
        ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 2); ctx.fill(); ctx.stroke();
      }
      // ── Body ──
      ctx.fillStyle   = '#0e1622';
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = col;
      ctx.shadowBlur  = 7;
      ctx.beginPath(); ctx.roundRect(x - hw, y - hh, this.width, this.height, 6); ctx.fill(); ctx.stroke();
      // ── Hood ──
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#16273a';
      ctx.fillRect(x - hw + 3, y - hh + 2, this.width - 6, 12);
      // ── Windshield ──
      ctx.fillStyle = col + '55';
      ctx.fillRect(x - hw + 3, y - hh + 14, this.width - 6, 10);
      // ── Roof ──
      ctx.fillStyle = '#1a2e3e';
      ctx.fillRect(x - hw + 5, y - hh + 24, this.width - 10, 11);
      // ── Headlights ──
      ctx.fillStyle   = '#cce0ff';
      ctx.shadowColor = '#aaaaff';
      ctx.shadowBlur  = 9;
      ctx.fillRect(x - hw + 2,  y - hh + 2, 7, 3);
      ctx.fillRect(x + hw - 9,  y - hh + 2, 7, 3);
      // ── Tail lights ──
      ctx.fillStyle   = '#ff2200';
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur  = 7;
      ctx.fillRect(x - hw + 2,  y + hh - 5, 7, 3);
      ctx.fillRect(x + hw - 9,  y + hh - 5, 7, 3);

    } else if (this._type === 'SUV') {
      // ── Wheels (wider) ──
      ctx.fillStyle   = '#111118';
      ctx.strokeStyle = '#444';
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 0;
      for (const [wx, wy, ww, wh] of [
        [x - hw - 5, y - hh + 5,  8, 12],
        [x + hw - 3, y - hh + 5,  8, 12],
        [x - hw - 5, y + hh - 17, 8, 12],
        [x + hw - 3, y + hh - 17, 8, 12],
      ]) {
        ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 2); ctx.fill(); ctx.stroke();
      }
      // ── Body ──
      ctx.fillStyle   = '#1a1008';
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = col;
      ctx.shadowBlur  = 7;
      ctx.beginPath(); ctx.roundRect(x - hw, y - hh, this.width, this.height, 4); ctx.fill(); ctx.stroke();
      // ── Hood ──
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#2a1a0a';
      ctx.fillRect(x - hw + 3, y - hh + 2, this.width - 6, 14);
      // ── Windshield (more vertical) ──
      ctx.fillStyle = col + '44';
      ctx.fillRect(x - hw + 3, y - hh + 16, this.width - 6, 11);
      // ── Roof ──
      ctx.fillStyle = '#221508';
      ctx.fillRect(x - hw + 4, y - hh + 27, this.width - 8, 13);
      // ── Roof rack ──
      ctx.strokeStyle = '#554433';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x - hw + 6, y - hh + 33); ctx.lineTo(x + hw - 6, y - hh + 33);
      ctx.stroke();
      // ── Headlights ──
      ctx.fillStyle   = '#ffffcc';
      ctx.shadowColor = '#ffff88';
      ctx.shadowBlur  = 9;
      ctx.fillRect(x - hw + 2,  y - hh + 2, 8, 4);
      ctx.fillRect(x + hw - 10, y - hh + 2, 8, 4);
      // ── Tail lights ──
      ctx.fillStyle   = '#ff3300';
      ctx.shadowColor = '#ff3300';
      ctx.shadowBlur  = 7;
      ctx.fillRect(x - hw + 2,  y + hh - 6, 8, 4);
      ctx.fillRect(x + hw - 10, y + hh - 6, 8, 4);

    } else {
      // TRUCK ─────────────────────────────────────────────────────────────────
      const cabH  = Math.round(this.height * 0.40);
      const bodyH = this.height - cabH;
      // ── Wheels (large) ──
      ctx.fillStyle   = '#111118';
      ctx.strokeStyle = '#444';
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 0;
      for (const [wx, wy, ww, wh] of [
        [x - hw - 5, y - hh + 4,   8, 14],
        [x + hw - 3, y - hh + 4,   8, 14],
        [x - hw - 5, y + hh - 18,  8, 14],
        [x + hw - 3, y + hh - 18,  8, 14],
      ]) {
        ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 2); ctx.fill(); ctx.stroke();
      }
      // ── Cargo body (lower) ──
      ctx.fillStyle   = '#0e1418';
      ctx.strokeStyle = col + 'aa';
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 0;
      ctx.fillRect(x - hw, y - hh + cabH, this.width, bodyH);
      ctx.strokeRect(x - hw, y - hh + cabH, this.width, bodyH);
      // ── Cab (upper) ──
      ctx.fillStyle   = '#151e22';
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = col;
      ctx.shadowBlur  = 7;
      ctx.beginPath(); ctx.roundRect(x - hw, y - hh, this.width, cabH, 4); ctx.fill(); ctx.stroke();
      // ── Cab/body divider ──
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = col + '88';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - hw, y - hh + cabH); ctx.lineTo(x + hw, y - hh + cabH);
      ctx.stroke();
      // ── Windshield ──
      ctx.fillStyle = col + '44';
      ctx.fillRect(x - hw + 3, y - hh + 5, this.width - 6, Math.round(cabH * 0.5));
      // ── Cargo lines ──
      ctx.strokeStyle = col + '33';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - hh + cabH + 4); ctx.lineTo(x, y + hh - 4);
      ctx.stroke();
      // ── Headlights ──
      ctx.fillStyle   = '#eeeeff';
      ctx.shadowColor = '#aaaaff';
      ctx.shadowBlur  = 8;
      ctx.fillRect(x - hw + 2,  y - hh + 2, 8, 4);
      ctx.fillRect(x + hw - 10, y - hh + 2, 8, 4);
      // ── Tail lights ──
      ctx.fillStyle   = '#ff2200';
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur  = 8;
      ctx.fillRect(x - hw + 2,  y + hh - 6, 8, 4);
      ctx.fillRect(x + hw - 10, y + hh - 6, 8, 4);
    }

    ctx.restore();
  }
}

// ─── StarField ────────────────────────────────────────────────────────────────

class StarField {
  constructor(count) {
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      size: Math.random() * 1.6 + 0.3,
      brightness: Math.random(),
    }));
  }

  update(speed, dt) {
    for (const s of this.stars) {
      s.y += speed * 0.04 * dt;
      if (s.y > CANVAS_H + 2) { s.y = -2; s.x = Math.random() * CANVAS_W; }
    }
  }

  draw(ctx) {
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(200,200,255,${0.3 + s.brightness * 0.7})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }
}

// ─── PlayerCar ────────────────────────────────────────────────────────────────

class PlayerCar {
  constructor() {
    this.x      = LANE_CENTERS[1];
    this.y      = CANVAS_H - 120;
    this.width  = 36;
    this.height = 64;

    this.lives           = PLAYER_LIVES;
    this.invincibleTimer = 0;
    this.nitroActive     = false;
    this.brakeActive     = false;

    // Exhaust particles
    this._particles = [];
  }

  get isInvincible() { return this.invincibleTimer > 0; }

  // Nearest lane index — used by AI for targeting logic
  get lane() {
    return LANE_CENTERS.reduce((best, lx, i) =>
      Math.abs(lx - this.x) < Math.abs(LANE_CENTERS[best] - this.x) ? i : best, 0);
  }

  hit() {
    if (this.isInvincible) return false;
    this.lives--;
    this.invincibleTimer = INVINCIBLE_DURATION;
    return true;
  }

  update(dt, gameSpeed, keys) {
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;

    // Continuous horizontal movement
    const goLeft  = keys['ArrowLeft']  || keys['KeyA'];
    const goRight = keys['ArrowRight'] || keys['KeyD'];
    const goUp    = keys['ArrowUp']    || keys['KeyW'];
    const goDown  = keys['ArrowDown']  || keys['KeyS'];

    const SPEED = 340; // px/s
    if (goLeft  && !goRight) this.x -= SPEED * dt;
    if (goRight && !goLeft)  this.x += SPEED * dt;
    this.x = Math.max(ROAD_LEFT + 20, Math.min(ROAD_RIGHT - 20, this.x));

    this.nitroActive = !!(goUp  && !goDown);
    this.brakeActive = !!(goDown && !goUp);

    // Exhaust particles — from bottom edge (rear of car), drifting downward
    const spawnRate = this.nitroActive ? 0.9 : (this.brakeActive ? 0.1 : 0.6);
    if (Math.random() < spawnRate) {
      this._particles.push({
        x: this.x + (Math.random() - 0.5) * 10,
        y: this.y + this.height / 2 - 4,   // bottom of car = rear
        vx: (Math.random() - 0.5) * 20,
        vy: gameSpeed * 0.06 + Math.random() * 25,  // drift downward (trail behind)
        life: 1, maxLife: 0.4 + Math.random() * 0.3,
        size: this.nitroActive ? 3 + Math.random() * 4 : 2 + Math.random() * 3,
        nitro: this.nitroActive,
      });
    }
    for (const p of this._particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this._particles = this._particles.filter(p => p.life > 0);
  }

  draw(ctx, t) {
    // Flash when invincible
    if (this.isInvincible && Math.floor(t * 8) % 2 === 0) return;

    const cx = Math.round(this.x);
    const cy = Math.round(this.y);
    const hw = this.width  / 2;   // 18
    const hh = this.height / 2;   // 32

    ctx.save();

    // DTP effect — semi-transparent during invincibility on visible frames
    if (this.isInvincible) ctx.globalAlpha = 0.55;

    // ── Exhaust particles ─────────────────────────────────────────
    for (const p of this._particles) {
      const alpha = (p.life / p.maxLife) * 0.6;
      const ratio = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.nitro
        ? `rgba(${Math.floor(100+ratio*155)},${Math.floor(180+ratio*75)},255,${alpha})`
        : `rgba(0,${Math.floor(180+ratio*75)},${Math.floor(200+ratio*55)},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    }

    const trimCol = this.nitroActive ? '#88ccff' : '#ddeeff';
    const glow    = (this.nitroActive ? 18 : 12) + 4 * Math.sin(t * 5);

    // ── Underglow ─────────────────────────────────────────────────
    ctx.shadowColor = trimCol;
    ctx.shadowBlur  = glow;
    ctx.strokeStyle = trimCol + '44';
    ctx.lineWidth   = 10;
    ctx.beginPath();
    ctx.ellipse(cx, cy + hh - 4, hw, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const fr = (lx, ly, lw, lh, col) => {
      ctx.fillStyle = col; ctx.fillRect(cx + lx, cy + ly, lw, lh);
    };
    const fg = (lx, ly, lw, lh, col, blur, gc) => {
      ctx.shadowColor = gc || col; ctx.shadowBlur = blur;
      ctx.fillStyle = col; ctx.fillRect(cx + lx, cy + ly, lw, lh);
      ctx.shadowBlur = 0;
    };

    // ── WHEELS — aligned to hood/trunk areas ──────────────────────
    // Front: y=-22 to -8  (beside hood)    Rear: y=+10 to +24 (beside trunk)
    fr(-hw-4, -hh+10,  6, 14, '#0b0b18');   // FL
    fr( hw-2, -hh+10,  6, 14, '#0b0b18');   // FR
    fr(-hw-4,  hh-22,  6, 14, '#0b0b18');   // RL
    fr( hw-2,  hh-22,  6, 14, '#0b0b18');   // RR
    fr(-hw-4, -hh+12,  6,  2, '#181828');   // FL tread
    fr( hw-2, -hh+12,  6,  2, '#181828');   // FR tread
    fr(-hw-4,  hh-20,  6,  2, '#181828');   // RL tread
    fr( hw-2,  hh-20,  6,  2, '#181828');   // RR tread

    // ── BODY (front → rear, 64 px total) ──────────────────────────
    // Layout:  4 nose | 8 headlight bg | 12 hood | 14 windshield |
    //         12 cabin | 6 rear-window | 8 trunk
    const B0 = '#06080f';
    const B1 = '#080c18';
    const B2 = '#0a1020';
    const B3 = '#0c1428';

    fr(-12, -hh,      24,  4, B0);           // nose tip (narrow)
    fr(-16, -hh+4,    32,  8, B1);           // headlight zone bg
    fr(-16, -hh+12,   32, 12, B1);           // hood outer
    fr(-12, -hh+12,   24, 12, B2);           // hood inner panel
    fr(-16, -hh+24,   32, 14, B1);           // windshield outer
    ctx.fillStyle = 'rgba(28,72,148,0.38)';
    ctx.fillRect(cx-12, cy-hh+24, 24, 14);   // windshield glass
    fr(-1,  -hh+24,    2, 14, B0);           // centre pillar
    fr(-12, -hh+26,    2, 10, '#050810');     // left A-pillar
    fr( 10, -hh+26,    2, 10, '#050810');     // right A-pillar
    fr(-16, -hh+38,   32, 12, B3);           // cabin outer
    fr(-12, -hh+38,   28, 12, B2);           // cabin inner
    fr(-16, -hh+50,   32,  6, B1);           // rear window outer
    ctx.fillStyle = 'rgba(18,50,100,0.28)';
    ctx.fillRect(cx-12, cy-hh+50, 24, 6);    // rear window glass
    fr(-16, -hh+56,   32,  8, B0);           // trunk
    fr(-12,  hh-2,    24,  2, B0);           // rear nose tip

    // ── PIXEL DETAILS ─────────────────────────────────────────────
    fr(-15, -hh+12,  2, 42, '#0e1830');      // left body groove
    fr( 13, -hh+12,  2, 42, '#0e1830');      // right body groove
    fr(-1,  -hh+12,  2, 12, '#0a1424');      // hood centre crease
    fr(-8,  -hh+57, 16,  1, '#0d1828');      // rear vent slat 1
    fr(-8,  -hh+59, 16,  1, '#0d1828');      // rear vent slat 2
    fr(-8,  -hh+61, 16,  1, '#0d1828');      // rear vent slat 3
    fr(-8,   hh- 3,  4,  2, '#1e2f3e');      // left exhaust
    fr( 4,   hh- 3,  4,  2, '#1e2f3e');      // right exhaust

    // ── NEON TRIM — two split segments per side, gap at cabin ─────
    // Front segment: alongside hood  (y: -20 → -8)
    fg(-16, -hh+12,  2, 12, trimCol, glow);  // left
    fg( 14, -hh+12,  2, 12, trimCol, glow);  // right
    // Rear segment: alongside rear window+trunk  (y: +14 → +26)
    fg(-16, -hh+46,  2, 12, trimCol, glow);  // left
    fg( 14, -hh+46,  2, 12, trimCol, glow);  // right

    // ── HEADLIGHTS (top, white, wide) ─────────────────────────────
    // Spans outer edge → center; trim connects at bottom
    fg(-16, -hh+4,   11,  8, '#ffffff', 24, '#ffffff');  // L block
    fg(  5, -hh+4,   11,  8, '#ffffff', 24, '#ffffff');  // R block
    fg(-16, -hh+5,   11,  4, '#e0eeff',  8, '#ffffff');  // L core
    fg(  5, -hh+5,   11,  4, '#e0eeff',  8, '#ffffff');  // R core
    fr(-4, -hh+4,     8,  8, '#030508');                 // grille gap

    // ── TAIL LIGHTS (bottom, red, narrower) ───────────────────────
    // Narrower + wider center gap than headlights → reference look
    fg(-16,  hh-6,    8,  6, '#ff1133', 22, '#ff0022');  // L block
    fg(  8,  hh-6,    8,  6, '#ff1133', 22, '#ff0022');  // R block
    fg(-16,  hh-5,    8,  3, '#ff6688',  8, '#ff2244');  // L core
    fg(  8,  hh-5,    8,  3, '#ff6688',  8, '#ff2244');  // R core
    fr(-7,   hh-6,   14,  6, '#030508');                 // wide centre gap

    // ── COCKPIT dot ───────────────────────────────────────────────
    ctx.shadowColor = '#aaddff';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#aaddff';
    ctx.beginPath();
    ctx.arc(cx, cy - hh + 38, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ─── SDK Wrapper ─────────────────────────────────────────────────────────────

class SDKWrapper {
  constructor() {
    this._sdk   = null;
    this._ready = false;
    this._mock  = false;
  }

  async init() {
    try {
      if (typeof OpenGameSDK !== 'undefined' && GAME_ID !== 'YOUR-GAME-UUID') {
        this._sdk = new OpenGameSDK({ gameId: GAME_ID, ui: { usePointsWidget: true } });
        await new Promise(resolve => {
          this._sdk.on('OnReady', () => { this._ready = true; console.log('[SDK] Ready'); resolve(); });
          setTimeout(resolve, 3000);
        });
      } else {
        throw new Error('SDK not available or GAME_ID not set');
      }
    } catch (e) {
      console.warn('[SDK] Mock mode:', e.message);
      this._mock = true; this._ready = true;
    }
  }

  addPoints(n) {
    if (!this._ready) return;
    const w = Math.floor(n);
    if (w <= 0) return;
    if (this._mock) console.log(`[SDK] addPoints(${w})`);
    else try { this._sdk.addPoints(w); } catch {}
  }

  savePoints() {
    if (!this._ready) return;
    if (this._mock) console.log('[SDK] savePoints()');
    else try { this._sdk.savePoints(); } catch {}
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.state  = STATE.LOADING;

    this.sdk   = new SDKWrapper();
    this.audio = new SynthwaveAudio();

    this.player      = new PlayerCar();
    this.aiCars      = [];
    this.trafficCars = [];
    this.stars       = new StarField(60);

    this.gameSpeed      = BASE_SPEED;
    this.score          = 0;
    this._scoreAccum    = 0;
    this._sdkPoints     = 0;
    this._autoSaveTimer = 0;

    this._trafficTimer     = this._nextTrafficDelay();
    this._totalTime        = 0;
    this._lastTime         = null;
    this._roadScrollY      = 0;
    this._audioInitPromise = null;
    this._displaySpeed     = BASE_SPEED;

    this._keys      = {};
    this._highScore = parseInt(localStorage.getItem('neonVelocity_hs') || '0');
    this._loadT0    = null;   // set on first loading-screen render

    this._bindInput();
  }

  async start() {
    // Start the render loop immediately so the loading screen shows at once
    requestAnimationFrame(ts => this._loop(ts));
    window.addEventListener('beforeunload', () => this.sdk.savePoints());
    await this.sdk.init();
    this.state = STATE.MENU;
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  _bindInput() {
    window.addEventListener('keydown', e => {
      if (this._keys[e.code]) return;
      this._keys[e.code] = true;
      this._onKey(e.code);
    });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });

    let _tx = 0;
    this.canvas.addEventListener('touchstart', e => { _tx = e.touches[0].clientX; }, { passive: true });
    this.canvas.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _tx;
      if (Math.abs(dx) <= 30) this._onTap();
    }, { passive: true });
  }

  _onKey(code) {
    this._triggerAudioInit();

    if (this.state === STATE.MENU) {
      if (code === 'Space' || code === 'Enter') this._startGame();
      return;
    }
    if (this.state === STATE.GAME_OVER) {
      if (code === 'Space' || code === 'Enter') this._returnToMenu();
      return;
    }
    if (this.state === STATE.PLAYING) {
      if (code === 'Escape' || code === 'KeyP') this._togglePause();
    } else if (this.state === STATE.PAUSED) {
      if (code === 'Escape' || code === 'KeyP' || code === 'Space') this._togglePause();
    }
  }

  _onTap() {
    this._triggerAudioInit();
    if      (this.state === STATE.MENU)      this._startGame();
    else if (this.state === STATE.GAME_OVER) this._returnToMenu();
    else if (this.state === STATE.PAUSED)    this._togglePause();
  }

  _triggerAudioInit() {
    if (!this._audioInitPromise) {
      this._audioInitPromise = this.audio.init();
    }
  }

  // ─── State transitions ────────────────────────────────────────────────────

  async _startGame() {
    await this.audio.init();

    this.player      = new PlayerCar();
    this.aiCars      = this._spawnAI();
    this.trafficCars = [];
    this.gameSpeed   = BASE_SPEED;
    this.score       = 0;
    this._scoreAccum    = 0;
    this._sdkPoints     = 0;
    this._autoSaveTimer = 0;
    this._trafficTimer  = this._nextTrafficDelay();
    this._totalTime     = 0;
    this._roadScrollY   = 0;

    this.state = STATE.PLAYING;
    this.audio.start();
    this.audio.playSFX('gamestart');
  }

  _togglePause() {
    if      (this.state === STATE.PLAYING) { this.state = STATE.PAUSED;  this.audio.stop(); }
    else if (this.state === STATE.PAUSED)  { this.state = STATE.PLAYING; this.audio.resume(); }
  }

  _gameOver() {
    this.state = STATE.GAME_OVER;
    this.audio.stop();
    this.audio.playSFX('collision');
    const final = Math.floor(this.score);
    if (final > this._highScore) {
      this._highScore = final;
      localStorage.setItem('neonVelocity_hs', String(final));
    }
    this.sdk.savePoints();
    console.log(`[SDK] Game over — score: ${final}`);
  }

  _returnToMenu() {
    this.audio.stop();
    this.state = STATE.MENU;
  }

  _spawnAI() {
    return Array.from({ length: AI_COUNT }, (_, i) => {
      const lane = Math.floor(Math.random() * 3);
      return new AICar(lane, -120 - i * 210, LANE_CENTERS);
    });
  }

  // Traffic spawn interval shrinks as speed increases
  _nextTrafficDelay() {
    const t   = Math.min((this.gameSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    const min = 2.2 - t * 1.2;  // 2.2s → 1.0s
    const max = 4.0 - t * 2.0;  // 4.0s → 2.0s
    return min + Math.random() * (max - min);
  }

  _safeLaneX(ySpawn) {
    const MIN_Y_GAP = 90;
    const lanes = [...LANE_CENTERS].sort(() => Math.random() - 0.5);
    for (const lx of lanes) {
      const blocked = this.trafficCars.some(
        tc => Math.abs(tc.x - lx) < 40 && Math.abs(tc.y - ySpawn) < MIN_Y_GAP
      );
      if (!blocked) return lx;
    }
    return null;
  }

  _spawnTraffic() {
    if (this.trafficCars.length >= TRAFFIC_MAX) return;
    const speedT = Math.min((this.gameSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    const count  = (speedT > 0.75 && this.trafficCars.length < TRAFFIC_MAX - 1) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      if (this.trafficCars.length >= TRAFFIC_MAX) break;
      const ySpawn = -80 - i * 100;
      const lx = this._safeLaneX(ySpawn);
      if (lx === null) break;
      this.trafficCars.push(new TrafficCar(lx, ySpawn));
    }
  }

  // ─── Loop ─────────────────────────────────────────────────────────────────

  _loop(ts) {
    if (this._lastTime === null) this._lastTime = ts;
    const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;

    if (this.state === STATE.PLAYING) this._update(dt);
    this._render(ts / 1000);
    requestAnimationFrame(t => this._loop(t));
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  _update(dt) {
    this._totalTime += dt;

    this.gameSpeed = Math.min(BASE_SPEED + this._totalTime * SPEED_RAMP, MAX_SPEED);
    this.audio.setSpeed(this.gameSpeed);

    // Score — nitro gives x1.5 multiplier
    const scoreMult = this.player.nitroActive ? 1.5 : 1.0;
    this._scoreAccum += POINTS_PER_SECOND * dt * scoreMult;
    if (this._scoreAccum >= 1) {
      const pts = Math.floor(this._scoreAccum);
      this._scoreAccum -= pts;
      this.score       += pts;
      this._sdkPoints  += pts;
    }
    if (this._sdkPoints > 0) { this.sdk.addPoints(this._sdkPoints); this._sdkPoints = 0; }

    this._autoSaveTimer += dt;
    if (this._autoSaveTimer >= AUTO_SAVE_INTERVAL) {
      this._autoSaveTimer = 0;
      this.sdk.savePoints();
      console.log('[SDK] Auto-save');
    }

    // Brake slows scroll 30%; nitro boosts scroll 35%
    let scrollSpeed = this.gameSpeed;
    if      (this.player.brakeActive) scrollSpeed *= 0.45;
    else if (this.player.nitroActive) scrollSpeed *= 1.60;
    this._displaySpeed = scrollSpeed;
    const scroll      = scrollSpeed * dt;
    this._roadScrollY = (this._roadScrollY + scroll) % 80;

    this.stars.update(scrollSpeed, dt);
    this.player.update(dt, this.gameSpeed, this._keys);

    // Traffic cars
    this._trafficTimer -= dt;
    if (this._trafficTimer <= 0) {
      this._trafficTimer = this._nextTrafficDelay();
      this._spawnTraffic();
    }
    for (const tc of this.trafficCars) {
      tc.update(dt, this.trafficCars);
      tc.scroll(scroll);
    }
    this.trafficCars = this.trafficCars.filter(tc => tc.y < CANVAS_H + 100);

    // AI cars — pass trafficCars so they can dodge slower traffic
    const pInfo = { x: this.player.x, y: this.player.y, lane: this.player.lane };
    for (const ai of this.aiCars) {
      ai.update(dt, this.gameSpeed, pInfo, this.trafficCars, this.aiCars);
      ai.scroll(scroll);
    }

    this._checkOvertakes();
    this._checkCollisions();
  }

  _checkOvertakes() {
    for (const ai of this.aiCars) {
      if (!ai._playerBehind && ai.y > this.player.y + 40) {
        ai._playerBehind = true;
      }
      if (ai._playerBehind && ai.y < this.player.y - 40) {
        ai._playerBehind = false;
        this.score       += POINTS_PER_OVERTAKE;
        this._sdkPoints  += POINTS_PER_OVERTAKE;
        this.audio.playSFX('overtake');
        console.log(`[Game] Overtake +${POINTS_PER_OVERTAKE}`);
      }
    }
  }

  _checkCollisions() {
    if (this.player.isInvincible) return;
    const px = this.player.x, py = this.player.y;
    const pw = this.player.width  * 0.88;
    const ph = this.player.height * 0.82;

    for (const tc of this.trafficCars) {
      if (this._overlap(px, py, pw, ph, tc.x, tc.y, tc.width * 0.88, tc.height * 0.85)) {
        this._onHit(); return;
      }
    }
    for (const ai of this.aiCars) {
      if (this._overlap(px, py, pw, ph, ai.x, ai.y, ai.width * 0.82, ai.height * 0.80)) {
        this._onHit(); return;
      }
    }
  }

  _overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
  }

  _onHit() {
    const died = this.player.hit();
    if (!died) return;
    this.audio.playSFX('collision');
    if (this.player.lives <= 0) this._gameOver();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render(t) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this._drawBg(ctx);

    if (this.state === STATE.LOADING)   { this._drawLoading(ctx, t);  this._drawScanlines(ctx); return; }
    if (this.state === STATE.MENU)      { this._drawMenu(ctx, t);     this._drawScanlines(ctx); return; }
    if (this.state === STATE.GAME_OVER) { this._drawGameOver(ctx, t); this._drawScanlines(ctx); return; }

    this.stars.draw(ctx);
    this._drawRoad(ctx);

    for (const tc of this.trafficCars) tc.draw(ctx);
    for (const ai of this.aiCars)      ai.draw(ctx);
    this.player.draw(ctx, t);

    this._drawHUD(ctx, t);
    if (this.state === STATE.PAUSED) this._drawPause(ctx);
    this._drawScanlines(ctx);
  }

  _drawBg(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, '#040010');
    g.addColorStop(0.5, '#090018');
    g.addColorStop(1, '#0e001e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  _drawRoad(ctx) {
    const rw = ROAD_RIGHT - ROAD_LEFT;

    // Road surface
    ctx.fillStyle = '#0c0c18';
    ctx.fillRect(ROAD_LEFT, 0, rw, CANVAS_H);

    // Horizontal grid
    ctx.strokeStyle = '#191932';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    const gridH = 80;
    const off   = this._roadScrollY % gridH;
    for (let y = -gridH + off; y < CANVAS_H + gridH; y += gridH) {
      ctx.beginPath(); ctx.moveTo(ROAD_LEFT, y); ctx.lineTo(ROAD_RIGHT, y); ctx.stroke();
    }

    // Lane dividers
    ctx.setLineDash([30, 20]);
    ctx.lineWidth = 1.5;
    for (let i = 1; i < LANE_COUNT; i++) {
      const lx = (LANE_CENTERS[i-1] + LANE_CENTERS[i]) / 2;
      ctx.strokeStyle    = '#280d4a';
      ctx.shadowColor    = '#5522aa';
      ctx.shadowBlur     = 5;
      ctx.lineDashOffset = -this._roadScrollY;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, CANVAS_H); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Edges
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur  = 12;
    ctx.beginPath(); ctx.moveTo(ROAD_LEFT,  0); ctx.lineTo(ROAD_LEFT,  CANVAS_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROAD_RIGHT, 0); ctx.lineTo(ROAD_RIGHT, CANVAS_H); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _drawHUD(ctx, t) {
    ctx.save();

    // Dark panel background
    const panelH = 62;
    const grad = ctx.createLinearGradient(0, 0, 0, panelH);
    grad.addColorStop(0,   'rgba(0,0,10,0.92)');
    grad.addColorStop(1,   'rgba(0,0,10,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, panelH);

    // Score
    ctx.font      = 'bold 20px "Courier New"';
    ctx.textAlign = 'left';
    ctx.fillStyle  = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 8;
    ctx.fillText(`SCORE  ${Math.floor(this.score).toString().padStart(6,'0')}`, 36, 26);

    // Speed — reflects effective scroll (brake / nitro)
    const kmh = Math.round(this._displaySpeed * 0.36);
    ctx.textAlign  = 'right';
    ctx.fillStyle  = '#ff44ff';
    ctx.shadowColor = '#ff44ff';
    ctx.fillText(`${kmh} km/h`, CANVAS_W - 36, 26);

    // Nitro / Brake indicator
    if (this.player.nitroActive && Math.floor(t * 6) % 2 === 0) {
      ctx.font        = 'bold 11px "Courier New"';
      ctx.fillStyle   = '#ffee00';
      ctx.shadowColor = '#ffee00';
      ctx.shadowBlur  = 10;
      ctx.fillText('NITRO', CANVAS_W - 36, 14);
    } else if (this.player.brakeActive) {
      ctx.font        = 'bold 11px "Courier New"';
      ctx.fillStyle   = '#44aaff';
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur  = 8;
      ctx.fillText('BRAKE', CANVAS_W - 36, 14);
    }

    // Lives
    ctx.textAlign  = 'left';
    ctx.font       = '15px "Courier New"';
    ctx.fillStyle  = '#ff2266';
    ctx.shadowColor = '#ff2266';
    ctx.shadowBlur  = 7;
    ctx.fillText('♥ '.repeat(this.player.lives).trimEnd(), 36, 50);

    // Best
    if (this._highScore > 0) {
      ctx.textAlign  = 'right';
      ctx.fillStyle  = '#ffcc0099';
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur  = 4;
      ctx.font        = '12px "Courier New"';
      ctx.fillText(`BEST ${this._highScore.toString().padStart(6,'0')}`, CANVAS_W - 36, 50);
    }

    // Speed bar
    const speedT  = (this.gameSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const barW    = 80;
    const barX    = CANVAS_W / 2 - barW / 2;
    ctx.strokeStyle = '#ff44ff44';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    ctx.strokeRect(barX, 46, barW, 6);
    const fillCol = speedT > 0.8 ? '#ff2244' : speedT > 0.5 ? '#ff8800' : '#ff44ff';
    ctx.fillStyle  = fillCol;
    ctx.shadowColor = fillCol;
    ctx.shadowBlur  = 6;
    ctx.fillRect(barX, 46, barW * speedT, 6);

    ctx.restore();
  }

  _drawMenu(ctx, t) {
    this.stars.draw(ctx);
    this._drawRoadStatic(ctx);
    ctx.save();

    const pulse = 0.85 + 0.15 * Math.sin(t * 2);
    ctx.textAlign = 'center';

    ctx.font        = 'bold 54px "Courier New"';
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur  = 32 * pulse;
    ctx.fillStyle   = `rgba(255,0,255,${pulse})`;
    ctx.fillText('NEON', CANVAS_W / 2, 215);

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 32 * pulse;
    ctx.fillStyle   = `rgba(0,255,255,${pulse})`;
    ctx.fillText('VELOCITY', CANVAS_W / 2, 278);

    ctx.font        = '15px "Courier New"';
    ctx.fillStyle   = '#ffffff88';
    ctx.shadowBlur  = 0;
    ctx.fillText('TOP-DOWN SYNTHWAVE RACING', CANVAS_W / 2, 318);

    ctx.font       = '13px "Courier New"';
    ctx.fillStyle  = '#ffffff44';
    ctx.fillText('← → / A D  steer   W/↑ nitro   S/↓ brake', CANVAS_W / 2, 380);
    ctx.fillText('ESC / P to pause', CANVAS_W / 2, 400);

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.font        = 'bold 20px "Courier New"';
      ctx.fillStyle   = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur  = 12;
      ctx.fillText('[ PRESS SPACE TO START ]', CANVAS_W / 2, 455);
    }
    if (this._highScore > 0) {
      ctx.font        = '15px "Courier New"';
      ctx.fillStyle   = '#ffcc00bb';
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur  = 6;
      ctx.fillText(`BEST: ${this._highScore}`, CANVAS_W / 2, 510);
    }

    ctx.restore();
  }

  _drawRoadStatic(ctx) {
    const rw = ROAD_RIGHT - ROAD_LEFT;
    ctx.fillStyle = '#0c0c18';
    ctx.fillRect(ROAD_LEFT, 0, rw, CANVAS_H);
    ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2;
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(ROAD_LEFT,  0); ctx.lineTo(ROAD_LEFT,  CANVAS_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROAD_RIGHT, 0); ctx.lineTo(ROAD_RIGHT, CANVAS_H); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _drawPause(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 42px "Courier New"';
    ctx.fillStyle   = '#ffff00';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur  = 22;
    ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2 - 18);
    ctx.font       = '15px "Courier New"';
    ctx.fillStyle  = '#ffffffaa';
    ctx.shadowBlur = 0;
    ctx.fillText('[ ESC or P to resume ]', CANVAS_W / 2, CANVAS_H / 2 + 20);
    ctx.restore();
  }

  _drawGameOver(ctx, t) {
    this._drawBg(ctx);
    this.stars.draw(ctx);
    this._drawRoadStatic(ctx);
    ctx.save();
    ctx.textAlign = 'center';

    ctx.font        = 'bold 48px "Courier New"';
    ctx.fillStyle   = '#ff2266';
    ctx.shadowColor = '#ff2266';
    ctx.shadowBlur  = 28;
    ctx.fillText('GAME OVER', CANVAS_W / 2, 215);

    ctx.font        = 'bold 26px "Courier New"';
    ctx.fillStyle   = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 14;
    ctx.fillText(`SCORE: ${Math.floor(this.score)}`, CANVAS_W / 2, 295);

    if (Math.floor(this.score) >= this._highScore && this._highScore > 0) {
      ctx.font        = 'bold 19px "Courier New"';
      ctx.fillStyle   = '#ffcc00';
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur  = 16;
      ctx.fillText('NEW HIGH SCORE!', CANVAS_W / 2, 336);
    }

    ctx.font       = '15px "Courier New"';
    ctx.fillStyle  = '#ffcc0099';
    ctx.shadowBlur = 4;
    ctx.fillText(`BEST: ${this._highScore}`, CANVAS_W / 2, 375);

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.font        = 'bold 18px "Courier New"';
      ctx.fillStyle   = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur  = 12;
      ctx.fillText('[ SPACE TO PLAY AGAIN ]', CANVAS_W / 2, 448);
    }

    ctx.restore();
  }

  _drawLoading(ctx, t) {
    if (this._loadT0 === null) this._loadT0 = t;
    const elapsed = (t - this._loadT0) / 1000;   // seconds since loading started
    const W = CANVAS_W, H = CANVAS_H;

    // ── Scrolling perspective grid ──────────────────────────────────────────
    const GRID_SPEED = 90;  // px/s
    const horizY     = H * 0.52;
    const vp         = { x: W / 2, y: horizY };

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth   = 1;

    // Vertical grid lines (perspective)
    const gridCols = 9;
    for (let i = 0; i <= gridCols; i++) {
      const frac  = i / gridCols;              // 0..1
      const xBot  = W * frac;
      const xTop  = vp.x + (xBot - vp.x) * 0.12;
      ctx.beginPath();
      ctx.moveTo(xTop, horizY);
      ctx.lineTo(xBot, H);
      ctx.stroke();
    }

    // Horizontal grid lines (scrolling)
    const hCount = 10;
    for (let i = 0; i < hCount; i++) {
      const phase = ((elapsed * GRID_SPEED / H) + i / hCount) % 1;  // 0..1
      const rawY  = horizY + (H - horizY) * Math.sqrt(phase);        // perspective squish
      const frac  = (rawY - horizY) / (H - horizY);
      const xL    = vp.x - (vp.x) * frac * 1.0;
      const xR    = vp.x + (W - vp.x) * frac * 1.0;
      ctx.globalAlpha = 0.08 + 0.20 * frac;
      ctx.beginPath();
      ctx.moveTo(xL, rawY);
      ctx.lineTo(xR, rawY);
      ctx.stroke();
    }
    ctx.restore();

    // ── "NEON VELOCITY" title ───────────────────────────────────────────────
    const hue   = (elapsed * 60) % 360;   // slow colour cycle
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3.5);

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // "NEON" — large
    const neonCol = `hsl(${hue},100%,65%)`;
    ctx.font        = 'bold 76px "Courier New", monospace';
    ctx.shadowColor = neonCol;
    ctx.shadowBlur  = 32 * pulse;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText('NEON', W / 2, H * 0.28);

    // "VELOCITY" — slightly smaller, offset hue
    const velCol = `hsl(${(hue + 150) % 360},100%,65%)`;
    ctx.font        = 'bold 48px "Courier New", monospace';
    ctx.shadowColor = velCol;
    ctx.shadowBlur  = 24 * pulse;
    ctx.fillStyle   = velCol;
    ctx.fillText('VELOCITY', W / 2, H * 0.38);

    // Subtitle
    ctx.font        = '13px "Courier New", monospace';
    ctx.shadowBlur  = 6;
    ctx.shadowColor = '#ff00ff';
    ctx.fillStyle   = '#cc88ff';
    ctx.fillText('TOP-DOWN SYNTHWAVE RACER', W / 2, H * 0.45);

    ctx.restore();

    // ── Progress bar ────────────────────────────────────────────────────────
    const BAR_W   = 260;
    const BAR_H   = 5;
    const barX    = (W - BAR_W) / 2;
    const barY    = H * 0.62;
    // Ease-out fill: fills to 95% in ~2s, then holds until SDK ready
    const rawProg = Math.min(elapsed / 2.2, 1.0);
    const prog    = 1 - Math.pow(1 - rawProg, 3);   // cubic ease-out → approaches 1 asymptotically
    const pct     = Math.min(Math.round(prog * 100), 99);  // never show 100% until actually done

    // Track bg
    ctx.save();
    ctx.fillStyle   = '#1a0030';
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur  = 6;
    ctx.fillRect(barX - 2, barY - 2, BAR_W + 4, BAR_H + 4);

    // Fill gradient
    const grad = ctx.createLinearGradient(barX, 0, barX + BAR_W, 0);
    grad.addColorStop(0,   '#ff00cc');
    grad.addColorStop(0.5, '#ff66ff');
    grad.addColorStop(1,   '#00ffee');
    ctx.fillStyle   = grad;
    ctx.shadowColor = '#ff44ff';
    ctx.shadowBlur  = 14;
    ctx.fillRect(barX, barY, BAR_W * prog, BAR_H);

    // Shimmer at fill edge
    const shimX = barX + BAR_W * prog - 6;
    if (prog > 0.01) {
      const shimA = 0.4 + 0.6 * Math.sin(elapsed * 8);
      ctx.globalAlpha = shimA;
      ctx.fillStyle   = '#ffffff';
      ctx.shadowBlur  = 20;
      ctx.fillRect(shimX, barY - 1, 6, BAR_H + 2);
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // Percentage text
    ctx.font        = '12px "Courier New", monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle   = '#cc88ff';
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur  = 8;
    ctx.fillText(`LOADING... ${pct}%`, W / 2, barY + BAR_H + 10);

    ctx.restore();
  }

  _drawScanlines(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    for (let y = 0; y < CANVAS_H; y += 4) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, CANVAS_W, 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
