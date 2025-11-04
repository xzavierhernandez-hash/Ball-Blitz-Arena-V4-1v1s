// Ball Blitz Arena - Code.org Game Lab
// 1:1-feel dodgeball clone (original code, different names/colors).
// Copy & paste whole file into Game Lab JavaScript and Run.

// ---------- CANVAS ----------
var W = 480;
var H = 480;
createCanvas(W, H);

// ---------- CONFIG ----------
var PLAYER_SIZE = 36;
var PLAYER_SPEED = 3.0;
var BALL_SIZE = 14;
var THROW_SPEED = 9;
var MAX_BALLS = 8;
var POWERUP_SIZE = 18;
var POWERUP_SPAWN_MS = 6000;
var POWERUP_DURATION = 7000;
var ROUND_RESTART_MS = 1800;
var WAVE_INCREASE_EVERY = 12; // balls increase per X seconds

// ---------- PLAYERS CONFIG (changeable) ----------
var PLAYERS = [
  { id: 1, x: 80,  y: H/2, color: "#e94b4b", left:"A", right:"D", up:"W", down:"S", throwKey:"F", name:"Red" },
  { id: 2, x: W-80, y: H/2, color: "#3b82f6", left:"LEFT_ARROW", right:"RIGHT_ARROW", up:"UP_ARROW", down:"DOWN_ARROW", throwKey:"L", name:"Blue" }
  // Add more players here (ensure unique keys) if you want local 3/4 players
];

// ---------- STATE ----------
var players = [];     // sprites
var balls = [];       // ball sprites
var powerups = [];    // powerup sprites
var eliminated = {};  // id -> bool
var lives = {};       // id -> integer
var scoreboard = {};  // id -> wins
var roundActive = true;
var roundWinner = null;
var lastPowerupSpawn = millis();
var waveStart = millis();
var currentMaxBalls = 3;
var debug = false;
var showHints = true;

// ---------- UTILS ----------
function rand(min, max){ return Math.random()*(max-min) + min; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

// ---------- INITIALIZE ----------
function initRound() {
  // clear all sprites
  for (var i = allSprites.length-1; i >= 0; i--) {
    allSprites[i].remove();
  }
  players = [];
  balls = [];
  powerups = [];
  eliminated = {};
  lives = {};
  roundActive = true;
  roundWinner = null;
  lastPowerupSpawn = millis();
  waveStart = millis();
  currentMaxBalls = 3;

  for (var i=0; i<PLAYERS.length; i++){
    var cfg = PLAYERS[i];
    var s = createSprite(cfg.x, cfg.y, PLAYER_SIZE, PLAYER_SIZE);
    s.shapeColor = cfg.color;
    s.playerId = cfg.id;
    s.name = cfg.name;
    s.speed = PLAYER_SPEED;
    s.lastThrow = -9999;
    s.throwCooldown = 350;
    s.isAnimating = false;
    s.animEnd = 0;
    s.hasShieldUntil = 0;
    s.speedUntil = 0;
    s.multiUntil = 0;
    players.push(s);
    eliminated[cfg.id] = false;
    lives[cfg.id] = 1;
    scoreboard[cfg.id] = scoreboard[cfg.id] || 0;
  }
}

// ---------- BALL FUNCTIONS ----------
function spawnBall(x,y,vx,vy, owner) {
  if (balls.length >= MAX_BALLS) return null;
  var b = createSprite(x,y,BALL_SIZE,BALL_SIZE);
  b.shapeColor = "white";
  b.velocity.x = vx;
  b.velocity.y = vy;
  b.owner = owner;
  b.createdAt = millis();
  balls.push(b);
  return b;
}
function removeBall(b) {
  if (!b) return;
  var idx = balls.indexOf(b);
  if (idx !== -1) balls.splice(idx,1);
  b.remove();
}

// ---------- POWERUPS ----------
var POWER_TYPES = ["shield","speed","multi"];
function spawnPowerup() {
  var pu = createSprite(rand(40, W-40), rand(80, H-40), POWERUP_SIZE, POWERUP_SIZE);
  pu.type = POWER_TYPES[Math.floor(rand(0, POWER_TYPES.length))];
  if (pu.type === "shield") pu.shapeColor = "#7dd3fc";
  if (pu.type === "speed")  pu.shapeColor = "#bbf7d0";
  if (pu.type === "multi")  pu.shapeColor = "#fca5a5";
  pu.spawnAt = millis();
  powerups.push(pu);
}
function removePowerup(pu) {
  if (!pu) return;
  var idx = powerups.indexOf(pu);
  if (idx !== -1) powerups.splice(idx,1);
  pu.remove();
}
function applyPowerToPlayer(s, type) {
  if (type === "shield") {
    s.hasShieldUntil = millis() + POWERUP_DURATION;
  } else if (type === "speed") {
    s.speedUntil = millis() + POWERUP_DURATION;
  } else if (type === "multi") {
    s.multiUntil = millis() + POWERUP_DURATION;
  }
}

// ---------- SIMPLE "ANIMATIONS" ----------
// Throw animation: create a small "arm" sprite attached to player for short time
function showThrowAnim(s) {
  s.isAnimating = true;
  s.animEnd = millis() + 180;
  // create visual arm (temporary)
  var arm = createSprite(s.x, s.y, 12, 6);
  arm.shapeColor = lightenHex(s.shapeColor, 0.9);
  arm.rotation = Math.atan2(s.velocity.y, s.velocity.x) * 180 / Math.PI || 0;
  arm.ownerRef = s;
  arm.createdAt = millis();
  // store arm on sprite for cleanup
  s._arm = arm;
}
function cleanupThrowAnim(s) {
  if (s._arm) { s._arm.remove(); s._arm = null; }
  s.isAnimating = false;
  s.animEnd = 0;
}
function lightenHex(hex, factor) {
  // simple lighten (hex input like "#rrggbb")
  try {
    var c = hex.replace("#",""); if (c.length !== 6) return hex;
    var r = Math.round(parseInt(c.substring(0,2),16) + (255-parseInt(c.substring(0,2),16))*(1-factor));
    var g = Math.round(parseInt(c.substring(2,4),16) + (255-parseInt(c.substring(2,4),16))*(1-factor));
    var b = Math.round(parseInt(c.substring(4,6),16) + (255-parseInt(c.substring(4,6),16))*(1-factor));
    return "#" + toHex(r) + toHex(g) + toHex(b);
  } catch(e){ return hex; }
}
function toHex(n) { var s = n.toString(16); return s.length===1 ? "0"+s : s; }

// ---------- HIT / ELIMINATION ----------
function resolveHit(playerSprite, ball) {
  // shield active?
  if (playerSprite.hasShieldUntil && millis() < playerSprite.hasShieldUntil) {
    // consume shield and destroy ball
    playerSprite.hasShieldUntil = 0;
    // small shield pop (visual)
    var puff = createSprite(playerSprite.x, playerSprite.y, 6, 6);
    puff.shapeColor = "#7dd3fc";
    puff.life = 18;
    removeBall(ball);
    return;
  }
  // normal hit: lose life -> eliminated (single-life rounds)
  removeBall(ball);
  lives[playerSprite.playerId] -= 1;
  // flash red
  var old = playerSprite.shapeColor;
  playerSprite.shapeColor = "#ffffff";
  playerSprite.tintUntil = millis() + 220;
  if (lives[playerSprite.playerId] <= 0) {
    eliminated[playerSprite.playerId] = true;
    playerSprite.visible = false;
    // small explosion effect
    for (var i=0;i<6;i++){
      var p = createSprite(playerSprite.x, playerSprite.y, 6, 6);
      p.shapeColor = "#facc15";
      var ang = rand(0, Math.PI*2);
      p.velocity.x = Math.cos(ang)*rand(1.6,3.4);
      p.velocity.y = Math.sin(ang)*rand(1.6,3.4);
      p.life = 28;
    }
  } else {
    // short stun: stop movement
    playerSprite.velocity.x = 0;
    playerSprite.velocity.y = 0;
  }
}

// ---------- INPUT HANDLING ----------
function handlePlayerControls(s, cfg) {
  if (eliminated[s.playerId]) { s.velocity.x = 0; s.velocity.y = 0; return; }

  var vx = 0, vy = 0;
  if (keyDown(cfg.left))  vx -= 1;
  if (keyDown(cfg.right)) vx += 1;
  if (keyDown(cfg.up))    vy -= 1;
  if (keyDown(cfg.down))  vy += 1;

  var speed = s.speed;
  if (s.speedUntil && millis() < s.speedUntil) speed = s.speed * 1.6;
  if (vx !== 0 || vy !== 0) {
    var mag = Math.sqrt(vx*vx + vy*vy);
    vx = vx / mag * speed;
    vy = vy / mag * speed;
  } else { vx = 0; vy = 0; }

  s.velocity.x = vx;
  s.velocity.y = vy;

  // Throw
  if (keyWentDown(cfg.throwKey) && millis() - s.lastThrow >= s.throwCooldown) {
    s.lastThrow = millis();
    // determine facing from velocity; default to right if standing
    var fx = s.velocity.x !== 0 ? s.velocity.x/Math.abs(s.velocity.x) : 1;
    var fy = s.velocity.y !== 0 ? s.velocity.y/Math.abs(s.velocity.y) : 0;
    var px = s.x + fx*(PLAYER_SIZE/2 + 8);
    var py = s.y + fy*(PLAYER_SIZE/2 + 4);

    // multi-throw?
    if (s.multiUntil && millis() < s.multiUntil) {
      var spread = 0.35;
      for (var i=0;i<3;i++){
        var sx = fx + rand(-spread, spread);
        var sy = fy + rand(-spread, spread);
        var mag = Math.sqrt(sx*sx + sy*sy) || 1;
        spawnBall(px, py, (sx/mag)*THROW_SPEED, (sy/mag)*THROW_SPEED, s.playerId);
      }
    } else {
      spawnBall(px, py, fx*THROW_SPEED, fy*THROW_SPEED, s.playerId);
    }
    showThrowAnim(s);
  }
}

// ---------- MAIN DRAW LOOP ----------
initRound();
function draw() {
  background(18,18,20);

  // TOP HUD
  fill(255);
  textSize(12);
  textAlign(LEFT, TOP);
  text("Ball Blitz Arena  —  Press R to restart round", 10, 8);

  // spawn powerups periodically
  if (millis() - lastPowerupSpawn > POWERUP_SPAWN_MS && powerups.length < 3) {
    spawnPowerup();
    lastPowerupSpawn = millis();
  }

  // wave difficulty: slowly increase balls allowed
  var secs = Math.floor((millis() - waveStart) / 1000);
  currentMaxBalls = 3 + Math.floor(secs / 10);

  // player input & update
  for (var i=0;i<players.length;i++) {
    var s = players[i];
    var cfg = PLAYERS[i];
    handlePlayerControls(s, cfg);

    // clean up throw anim
    if (s.isAnimating && millis() > s.animEnd) cleanupThrowAnim(s);

    // tint restore
    if (s.tintUntil && millis() > s.tintUntil) {
      s.tintUntil = 0;
      s.shapeColor = PLAYERS[i].color;
    }
  }

  // ball physics + collisions
  for (var bi = balls.length-1; bi >= 0; bi--) {
    var b = balls[bi];
    // bounce off walls (respect HUD top area 56px)
    if (b.x < BALL_SIZE/2) { b.x = BALL_SIZE/2; b.velocity.x *= -1; }
    if (b.x > W - BALL_SIZE/2) { b.x = W - BALL_SIZE/2; b.velocity.x *= -1; }
    if (b.y < 72) { b.y = 72; b.velocity.y *= -1; }
    if (b.y > H - BALL_SIZE/2) { b.y = H - BALL_SIZE/2; b.velocity.y *= -1; }

    // owner invulnerability short window
    for (var pi=0; pi<players.length; pi++){
      var p = players[pi];
      if (eliminated[p.playerId]) continue;
      // check overlap (Game Lab overlap works)
      if (b.overlap(p) && b.owner !== p.playerId) {
        resolveHit(p, b);
        break;
      }
    }

    // lifetime
    if (millis() - b.createdAt > 11000) removeBall(b);
  }

  // powerup pickups
  for (var pu_i = powerups.length-1; pu_i >= 0; pu_i--) {
    var pu = powerups[pu_i];
    for (var pi=0; pi<players.length; pi++){
      var p = players[pi];
      if (eliminated[p.playerId]) continue;
      if (pu.overlap(p)) {
        applyPowerToPlayer(p, pu.type);
        // set timers on player object
        if (pu.type === "multi") p.multiUntil = millis() + POWERUP_DURATION;
        if (pu.type === "speed") p.speedUntil = millis() + POWERUP_DURATION;
        if (pu.type === "shield") p.hasShieldUntil = millis() + POWERUP_DURATION;
        removePowerup(pu);
        break;
      }
    }
    // expire powerup after 12s
    if (millis() - pu.spawnAt > 12000) removePowerup(pu);
  }

  // draw sprites last so HUD stays on top
  drawSprites();

  // draw throw arm if present (move arm to player's facing)
  for (var i=0;i<players.length;i++){
    var s = players[i];
    if (s._arm) {
      s._arm.x = s.x + (s.velocity.x !== 0 ? s.velocity.x/Math.abs(s.velocity.x) : 1)* (PLAYER_SIZE/2 + 8);
      s._arm.y = s.y + (s.velocity.y || 0) * 4;
      // remove arm when time passed
      if (millis() > s.animEnd && s._arm) { s._arm.remove(); s._arm = null; }
    }
  }

  // HUD: Players status
  textSize(12);
  textAlign(LEFT, TOP);
  for (var i=0;i<PLAYERS.length;i++){
    var id = PLAYERS[i].id;
    var label = "P" + id + " (" + PLAYERS[i].name + "): " + (eliminated[id] ? "ELIM" : "Alive") +
                "  Lives:" + lives[id] + "  Wins:" + scoreboard[id];
    text(label, 10, 32 + i*18);
  }

  // show number of balls available / active
  textAlign(RIGHT, TOP);
  text("Balls Active: " + balls.length + "  Max: " + clamp(currentMaxBalls,1,MAX_BALLS), W-10, 8);

  // allow spawn of random balls occasionally to simulate opponents
  if (balls.length < clamp(currentMaxBalls,1,MAX_BALLS) && Math.random() < 0.02) {
    // spawn a ball from random edge that drifts inward
    var edge = Math.floor(rand(0,4));
    var sx = W/2, sy = H/2;
    var vx = 0, vy = 0;
    if (edge === 0) { sx = 10; sy = rand(80,H-10); vx = rand(1.2,3.2); vy = rand(-1.4,1.4); }
    if (edge === 1) { sx = W-10; sy = rand(80,H-10); vx = rand(-3.2,-1.2); vy = rand(-1.4,1.4); }
    if (edge === 2) { sx = rand(40,W-40); sy = 80; vx = rand(-1.6,1.6); vy = rand(1.2,3.2); }
    if (edge === 3) { sx = rand(40,W-40); sy = H-10; vx = rand(-1.6,1.6); vy = rand(-3.2,-1.2); }
    // owner 0 for world balls
    spawnBall(sx, sy, vx, vy, 0);
  }

  // check win condition
  var alive = players.filter(function(p){ return !eliminated[p.playerId]; });
  if (alive.length <= 1 && roundActive) {
    roundActive = false;
    if (alive.length === 1) {
      roundWinner = alive[0].playerId;
      scoreboard[roundWinner] = (scoreboard[roundWinner]||0) + 1;
    } else {
      roundWinner = null;
    }
    // delay and then allow restart by pressing R
    setTimeout(function(){ /* no-op placeholder for compatibility */ }, ROUND_RESTART_MS);
  }

  // end round display
  if (!roundActive) {
    fill(0,0,0,160);
    rect(0,0,W,H);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(26);
    text(roundWinner ? ("Player " + roundWinner + " wins!") : "Round Over", W/2, H/2 - 18);
    textSize(14);
    text("Press R to start new round", W/2, H/2 + 12);

    if (keyDown("R")) {
      initRound();
    }
  }

  // debug hint
  if (showHints) {
    textSize(10);
    textAlign(LEFT, BOTTOM);
    text("Controls: P1 WASD + F  |  P2 Arrows + L   -  Press H to toggle hints", 10, H-6);
  }
  if (keyWentDown("H")) showHints = !showHints;

  // remove any leftover very-old particles (life property handled by Game Lab)
  // Note: Game Lab auto-decrements life if life property set on a sprite
}

// ---------- KEY UTILITIES for Game Lab ----------
// keyWentDown / keyDown used directly by Game Lab environment

// Start first round
initRound();

// ---------- END SCRIPT ----------
