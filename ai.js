/**
 * ai.js — AI Cars with FSM + Rubber-Band
 * States: CRUISE | DODGE | ACCELERATE | OVERTAKE | BLOCK
 */

const AI_COLORS = ['#ff2266', '#ff8800', '#aa00ff', '#00ff88', '#ff44ff'];

const STATES = {
  CRUISE:     'CRUISE',
  DODGE:      'DODGE',
  ACCELERATE: 'ACCELERATE',
  OVERTAKE:   'OVERTAKE',
  BLOCK:      'BLOCK',
};

export class AICar {
  constructor(lane, y, laneCenters) {
    this.laneCenters = laneCenters;
    this.lane       = lane;
    this.x          = laneCenters[lane];
    this.y          = y;

    this.color  = AI_COLORS[Math.floor(Math.random() * AI_COLORS.length)];
    this.width  = 36;
    this.height = 62;

    this.state       = STATES.CRUISE;
    this._stateTimer = 0;

    // Personality
    this.aggression   = 0.4 + Math.random() * 0.55;  // 0.4–0.95
    this.reactionTime = Math.random() * 0.12;         // 0–0.12s
    this._reactionTimer = 0;

    // Movement
    this.targetLane          = lane;
    this.laneChangeCooldown  = 0;
    this.LANE_CHANGE_COOLDOWN = 0.75;
    this.LATERAL_SPEED       = 650;
    this.lookAhead           = 130;

    this._rubberBandMult = 1.0;
    this._playerBehind   = false;  // for overtake scoring
    this._blockTimer     = 0;
  }

  update(dt, gameSpeed, player, obstacles, peers = []) {
    // Difficulty scaling
    const speedT = Math.min((gameSpeed - 200) / 400, 1);
    this.lookAhead            = 130 + speedT * 90;
    this.LANE_CHANGE_COOLDOWN = Math.max(0.8, 1.5 - speedT * 0.5);
    this.reactionTime         = Math.max(0, this.reactionTime * (1 - speedT * 0.3));

    this._stateTimer -= dt;
    if (this.laneChangeCooldown > 0) this.laneChangeCooldown -= dt;

    this._updateRubberBand(player, gameSpeed);

    if (this._reactionTimer > 0) {
      this._reactionTimer -= dt;
    } else {
      this._think(player, obstacles, peers);
    }

    this._applyMovement(dt, gameSpeed);
  }

  _updateRubberBand(player, gameSpeed) {
    const delta = this.y - player.y; // positive = AI visually above player (ahead)

    if (delta > 220) {
      // Too far ahead — slow down
      this._rubberBandMult = 0.82;
    } else if (delta < -80) {
      // Too far behind — respawn ahead
      this._respawnAbove(player);
      this._rubberBandMult = 1.0;
    } else {
      this._rubberBandMult = 1.0;
    }
  }

  _respawnAbove(player) {
    this.y          = player.y - 740 - Math.random() * 300;
    this.lane       = Math.floor(Math.random() * 3);
    this.targetLane = this.lane;
    this.x          = this.laneCenters[this.lane];
    this.state      = STATES.CRUISE;
    this._playerBehind = false;
  }

  _think(player, obstacles, peers = []) {
    this._reactionTimer = this.reactionTime;

    // 1. Obstacle dodge — highest priority
    if (this._scanObstacle(obstacles) && this.state !== STATES.DODGE) {
      this.state       = STATES.DODGE;
      this._stateTimer = 1.2;
      this._dodge(obstacles, peers);
      return;
    }

    // 2. Rubber-band catch-up
    const delta = this.y - player.y;
    if (delta < -40) {
      this.state       = STATES.ACCELERATE;
      this._stateTimer = 0.6;
      return;
    }

    // 3. Aggressive behaviour when near player
    const vertDist = Math.abs(this.y - player.y);
    if (vertDist < 140) {
      if (this.aggression > 0.82 && this.state !== STATES.BLOCK && this._blockTimer <= 0) {
        // High aggression: BLOCK — move into player's lane to cut them off
        this.state       = STATES.BLOCK;
        this._stateTimer = 1.4;
        this._blockTimer = 3.0;
        this._planBlock(player, peers);
        return;
      } else if (this.aggression > 0.65 && this.state !== STATES.OVERTAKE) {
        // Medium aggression: OVERTAKE — move to free lane
        this.state       = STATES.OVERTAKE;
        this._stateTimer = 1.0;
        this._planOvertake(player, peers);
        return;
      }
    }

    if (this._blockTimer > 0) this._blockTimer -= this.reactionTime + 0.001;

    // Default
    if (this._stateTimer <= 0) this.state = STATES.CRUISE;
  }

  _scanObstacle(obstacles) {
    return obstacles.some(o =>
      Math.abs(o.x - this.x) < (this.width * 0.6 + o.width * 0.4) &&
      o.y > this.y - this.lookAhead &&
      o.y < this.y + this.height
    );
  }

  // Returns true if lane index l is occupied by any peer at close Y range.
  // Checks both current position AND targetLane to catch mid-lane-change cars.
  _laneOccupied(l, peers) {
    const lx = this.laneCenters[l];
    return peers.some(p =>
      p !== this &&
      Math.abs(p.y - this.y) < 80 &&
      (Math.abs(p.x - lx) < 44 || p.targetLane === l)
    );
  }

  _dodge(obstacles, peers = []) {
    if (this.laneChangeCooldown > 0) return;
    const safeLanes = [0, 1, 2].filter(l => {
      const lx = this.laneCenters[l];
      const hasObstacle = obstacles.some(o =>
        Math.abs(o.x - lx) < (this.width * 0.5 + o.width * 0.4) &&
        o.y > this.y - this.lookAhead &&
        o.y < this.y + this.height
      );
      return !hasObstacle && !this._laneOccupied(l, peers);
    });
    if (safeLanes.length === 0) return;
    safeLanes.sort((a, b) => Math.abs(a - this.lane) - Math.abs(b - this.lane));
    this._changeLane(safeLanes[0]);
  }

  _planOvertake(player, peers = []) {
    if (this.laneChangeCooldown > 0) return;
    const freeLanes = [0, 1, 2].filter(l =>
      l !== player.lane && !this._laneOccupied(l, peers)
    );
    if (!freeLanes.length) return;
    const best = freeLanes.reduce((a, b) =>
      Math.abs(a - this.lane) < Math.abs(b - this.lane) ? a : b
    );
    this._changeLane(best);
  }

  _planBlock(player, peers = []) {
    if (this.laneChangeCooldown > 0) return;
    if (!this._laneOccupied(player.lane, peers)) this._changeLane(player.lane);
  }

  _changeLane(newLane) {
    if (newLane < 0 || newLane > 2 || newLane === this.targetLane) return;
    this.targetLane          = newLane;
    this.laneChangeCooldown  = this.LANE_CHANGE_COOLDOWN;
  }

  _applyMovement(dt, gameSpeed) {
    let vMult = this._rubberBandMult;
    if (this.state === STATES.ACCELERATE) vMult *= 1.18;
    if (this.state === STATES.BLOCK)      vMult *= 1.05;

    const relSpeed = gameSpeed * (vMult - 1.0);
    this.y += relSpeed * dt;

    // Lateral lerp
    const targetX = this.laneCenters[this.targetLane];
    const dx      = targetX - this.x;
    const step    = this.LATERAL_SPEED * dt;
    if (Math.abs(dx) <= step) {
      this.x    = targetX;
      this.lane = this.targetLane;
    } else {
      this.x += Math.sign(dx) * step;
    }
  }

  scroll(amount) {
    this.y += amount;
  }

  draw(ctx) {
    const x    = this.x;
    const y    = this.y;
    const w    = this.width;
    const h    = this.height;
    const hw   = w / 2;
    const hh   = h / 2;
    const col  = this.color;

    ctx.save();

    // Body silhouette
    ctx.beginPath();
    ctx.moveTo(x - hw + 6,  y - hh);
    ctx.lineTo(x + hw - 6,  y - hh);
    ctx.lineTo(x + hw,      y - hh + 10);
    ctx.lineTo(x + hw,      y + hh - 10);
    ctx.lineTo(x + hw - 6,  y + hh);
    ctx.lineTo(x - hw + 6,  y + hh);
    ctx.lineTo(x - hw,      y + hh - 10);
    ctx.lineTo(x - hw,      y - hh + 10);
    ctx.closePath();
    ctx.fillStyle = '#0d0d1a';
    ctx.fill();

    // Neon outline
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 14;
    ctx.stroke();

    // Windshield (top portion)
    ctx.fillStyle = col + '55';
    ctx.fillRect(x - hw + 6, y - hh + 10, w - 12, h * 0.26);

    // Hood lines
    ctx.strokeStyle = col + '88';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.moveTo(x - hw + 10, y - hh + 6);
    ctx.lineTo(x - hw + 10, y);
    ctx.moveTo(x + hw - 10, y - hh + 6);
    ctx.lineTo(x + hw - 10, y);
    ctx.stroke();

    // Headlights (top = front)
    ctx.fillStyle  = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 18;
    // left
    ctx.beginPath();
    ctx.ellipse(x - hw + 9, y - hh + 8, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // right
    ctx.beginPath();
    ctx.ellipse(x + hw - 9, y - hh + 8, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail lights (bottom = back)
    ctx.fillStyle  = '#ff2200';
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur  = 10;
    ctx.fillRect(x - hw + 5,  y + hh - 6, 12, 4);
    ctx.fillRect(x + hw - 17, y + hh - 6, 12, 4);

    // State indicator — small dot on roof for BLOCK state
    if (this.state === STATES.BLOCK) {
      ctx.fillStyle  = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
