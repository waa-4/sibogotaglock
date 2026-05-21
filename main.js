/*
  Sibo Got a Glock - v1
  Fake-3D pixel raycaster shooter.
  Uses original uploaded assets from /assets/.
*/

const ASSETS = {
  gun: "assets/sibogun.png",
  hand: "assets/sibohand.png",
  wall1: "assets/rusttile1.png",
  wall2: "assets/rusttile2.png",
  wall3: "assets/rusttile3.png",
  wall4: "assets/rusttile4.png",
  heart: "assets/siboheart.png",
  halfHeart: "assets/sibohalfheart.png",
  deadHeart: "assets/sibodeadheart.png",
  zombie1: "assets/zombiewalk1.png",
  zombie2: "assets/zombiewalk2.png",
  bullet: "assets/bulletdot.png"
};

const CONFIG = {
  renderWidth: 426,
  renderHeight: 240,
  fov: Math.PI / 3,
  moveSpeed: 3.1,
  turnSpeed: 2.6,
  mouseSensitivity: 0.0024,
  enemySpeed: 0.75,
  enemyDamageCooldown: 0.8,
  shootCooldown: 0.18,
  maxAmmo: 60
};

const MAP = [
  "################",
  "#P.....#.......#",
  "#.###..#..Z....#",
  "#...#.....###..#",
  "###.#.###......#",
  "#.....#....Z...#",
  "#.#####.#####..#",
  "#.....A.....#..#",
  "#.###...###.#..#",
  "#...#..Z..#....#",
  "#.#.#####.####.#",
  "#.#..........#G#",
  "#.############.#",
  "#..............#",
  "################"
];

const $ = id => document.getElementById(id);
const canvas = $("view");
const ctx = canvas.getContext("2d");
canvas.width = CONFIG.renderWidth;
canvas.height = CONFIG.renderHeight;
ctx.imageSmoothingEnabled = false;

const keys = {};
const touch = { left: false, right: false, forward: false, shoot: false };

const img = {};
let game = null;
let raf = null;
let lastTime = 0;
let mouseLocked = false;
let messageTimer = 0;

function loadImages() {
  const entries = Object.entries(ASSETS);
  return Promise.all(entries.map(([key, src]) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
    img[key] = image;
  })));
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");

  if (id !== "game") {
    stopGame();
  }
}

function stopGame() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  game = null;
}

function newGame() {
  const spawn = findTile("P") || { x: 1.5, y: 1.5 };

  game = {
    player: {
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      hp: 6,
      ammo: 36,
      cooldown: 0,
      hurtCooldown: 0
    },
    enemies: [],
    mod: {
      god: false,
      ammo: false,
      speed: false,
      fog: true
    },
    won: false,
    dead: false
  };

  MAP.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "Z") {
        game.enemies.push({
          x: x + 0.5,
          y: y + 0.5,
          hp: 3,
          alive: true,
          anim: Math.random() * 10
        });
      }
    });
  });

  updateHUD();
}

function findTile(tile) {
  for (let y = 0; y < MAP.length; y++) {
    const x = MAP[y].indexOf(tile);
    if (x !== -1) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}

function tileAt(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);

  if (gy < 0 || gy >= MAP.length || gx < 0 || gx >= MAP[gy].length) return "#";
  return MAP[gy][gx];
}

function isWall(x, y) {
  return tileAt(x, y) === "#";
}

function startGame() {
  showScreen("game");
  newGame();
  lastTime = performance.now();
  raf = requestAnimationFrame(loop);
  showMessage("Find the exit. Zombies are not friendly.", 2.2);
}

function loop(now) {
  if (!game) return;

  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  update(dt);
  draw();

  raf = requestAnimationFrame(loop);
}

function update(dt) {
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) $("message").style.display = "none";
  }

  const p = game.player;
  if (game.dead || game.won) return;

  const speed = CONFIG.moveSpeed * (game.mod.speed ? 1.7 : 1);
  const move = (keys.KeyW || keys.ArrowUp || touch.forward ? 1 : 0) -
               (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const turn = (keys.KeyE || keys.ArrowRight || touch.right ? 1 : 0) -
               (keys.KeyQ || keys.ArrowLeft || touch.left ? 1 : 0);

  p.angle += turn * CONFIG.turnSpeed * dt;

  const forwardX = Math.cos(p.angle);
  const forwardY = Math.sin(p.angle);
  const rightX = Math.cos(p.angle + Math.PI / 2);
  const rightY = Math.sin(p.angle + Math.PI / 2);

  const nx = p.x + (forwardX * move + rightX * strafe) * speed * dt;
  const ny = p.y + (forwardY * move + rightY * strafe) * speed * dt;

  if (!isWall(nx, p.y)) p.x = nx;
  if (!isWall(p.x, ny)) p.y = ny;

  p.cooldown -= dt;
  p.hurtCooldown -= dt;

  if ((keys.MouseDown || touch.shoot) && p.cooldown <= 0) {
    shoot();
  }

  updateEnemies(dt);

  if (tileAt(p.x, p.y) === "A") {
    p.ammo = CONFIG.maxAmmo;
    showMessage("Ammo restocked.", 1.2);
  }

  if (tileAt(p.x, p.y) === "G") {
    game.won = true;
    showMessage("YOU ESCAPED THE RUST MAZE.", 999);
  }

  updateHUD();
}

function updateEnemies(dt) {
  const p = game.player;
  const aliveEnemies = game.enemies.filter(e => e.alive);

  for (const e of aliveEnemies) {
    e.anim += dt * 6;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.25) {
      const speed = CONFIG.enemySpeed * (dist < 5 ? 1.35 : 0.55);
      const nx = e.x + (dx / dist) * speed * dt;
      const ny = e.y + (dy / dist) * speed * dt;

      if (!isWall(nx, e.y)) e.x = nx;
      if (!isWall(e.x, ny)) e.y = ny;
    }

    if (dist < 0.55 && p.hurtCooldown <= 0 && !game.mod.god) {
      p.hp -= 1;
      p.hurtCooldown = CONFIG.enemyDamageCooldown;
      showMessage("Zombie bonk.", 0.5);

      if (p.hp <= 0) {
        p.hp = 0;
        game.dead = true;
        showMessage("SIBO HAS BEEN BONKED. Press R.", 999);
      }
    }
  }
}

function shoot() {
  const p = game.player;

  if (!game.mod.ammo && p.ammo <= 0) {
    showMessage("No ammo.", 0.5);
    return;
  }

  if (!game.mod.ammo) p.ammo--;
  p.cooldown = CONFIG.shootCooldown;
  $("gunImg").classList.add("shoot");
  setTimeout(() => $("gunImg").classList.remove("shoot"), 60);

  let best = null;
  let bestAngle = 0.09;

  for (const e of game.enemies) {
    if (!e.alive) continue;

    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    const angleTo = Math.atan2(dy, dx);
    const diff = Math.abs(angleDiff(p.angle, angleTo));

    if (diff < bestAngle && hasLineOfSight(p.x, p.y, e.x, e.y)) {
      bestAngle = diff;
      best = e;
    }
  }

  if (best) {
    best.hp -= 1;
    showMessage("hit", 0.16);
    if (best.hp <= 0) {
      best.alive = false;
      showMessage("zombie deleted", 0.45);
    }
  }

  updateHUD();
}

function hasLineOfSight(x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 12);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (isWall(x, y)) return false;
  }

  return true;
}

function angleDiff(a, b) {
  let d = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  return d < -Math.PI ? d + Math.PI * 2 : d;
}

function draw() {
  drawSkyFloor();
  drawWalls();
  drawSprites();
  drawCrosshair();

  if (game.dead || game.won) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawSkyFloor() {
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, canvas.width, canvas.height / 2);

  ctx.fillStyle = "#181818";
  ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);

  for (let y = canvas.height / 2; y < canvas.height; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "#202020" : "#141414";
    ctx.fillRect(0, y, canvas.width, 4);
  }
}

function drawWalls() {
  const p = game.player;
  const rays = canvas.width;

  for (let x = 0; x < rays; x++) {
    const cameraX = (x / rays) - 0.5;
    const rayAngle = p.angle + cameraX * CONFIG.fov;
    const hitInfo = castRay(rayAngle);

    const corrected = hitInfo.dist * Math.cos(rayAngle - p.angle);
    const wallHeight = Math.min(canvas.height * 2, canvas.height / Math.max(corrected, 0.05));
    const y = (canvas.height - wallHeight) / 2;

    const shade = clamp(1 - corrected / 9, 0.14, 1);
    ctx.globalAlpha = 1;

    const tex = [img.wall1, img.wall2, img.wall3, img.wall4][hitInfo.wallType % 4];
    if (tex && tex.complete && tex.naturalWidth > 0) {
      const tx = Math.floor(hitInfo.textureX * tex.width);
      ctx.drawImage(tex, tx, 0, 1, tex.height, x, y, 1, wallHeight);
      if (game.mod.fog) {
        ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
        ctx.fillRect(x, y, 1, wallHeight);
      }
    } else {
      const c = Math.floor(220 * shade);
      ctx.fillStyle = `rgb(${c},${c},${c})`;
      ctx.fillRect(x, y, 1, wallHeight);
    }
  }
}

function castRay(angle) {
  const p = game.player;
  const step = 0.025;
  let dist = 0;

  while (dist < 20) {
    dist += step;
    const x = p.x + Math.cos(angle) * dist;
    const y = p.y + Math.sin(angle) * dist;

    if (isWall(x, y)) {
      const fx = x - Math.floor(x);
      const fy = y - Math.floor(y);
      const textureX = Math.abs(fx - 0.5) > Math.abs(fy - 0.5) ? fy : fx;
      const wallType = (Math.floor(x) + Math.floor(y)) % 4;
      return { dist, textureX, wallType };
    }
  }

  return { dist: 20, textureX: 0, wallType: 0 };
}

function drawSprites() {
  const p = game.player;
  const sprites = game.enemies
    .filter(e => e.alive)
    .map(e => ({ ...e, dist: Math.hypot(e.x - p.x, e.y - p.y) }))
    .sort((a, b) => b.dist - a.dist);

  for (const s of sprites) {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const angle = angleDiff(p.angle, Math.atan2(dy, dx));
    const dist = Math.hypot(dx, dy);

    if (Math.abs(angle) > CONFIG.fov * 0.72) continue;
    if (!hasLineOfSight(p.x, p.y, s.x, s.y)) continue;

    const screenX = (0.5 + angle / CONFIG.fov) * canvas.width;
    const size = clamp(canvas.height / dist, 10, 150);
    const y = canvas.height / 2 - size / 2;
    const image = Math.floor(s.anim) % 2 === 0 ? img.zombie1 : img.zombie2;

    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, screenX - size / 2, y, size, size);
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(screenX - size / 2, y, size, size);
    }
  }
}

function drawCrosshair() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
}

function updateHUD() {
  const hearts = $("hearts");
  hearts.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const heart = document.createElement("img");
    const hpForHeart = game.player.hp - i * 2;

    if (hpForHeart >= 2) heart.src = ASSETS.heart;
    else if (hpForHeart === 1) heart.src = ASSETS.halfHeart;
    else heart.src = ASSETS.deadHeart;

    hearts.appendChild(heart);
  }

  $("ammoText").textContent = game.mod.ammo ? "∞" : game.player.ammo;
  $("enemyText").textContent = game.enemies.filter(e => e.alive).length;
}

function showMessage(text, time) {
  const box = $("message");
  box.textContent = text;
  box.style.display = "block";
  messageTimer = time;
}

function openModMenu() {
  $("modMenu").classList.toggle("open");
  $("godToggle").checked = game.mod.god;
  $("ammoToggle").checked = game.mod.ammo;
  $("speedToggle").checked = game.mod.speed;
  $("fogToggle").checked = game.mod.fog;
}

function syncModMenu() {
  if (!game) return;
  game.mod.god = $("godToggle").checked;
  game.mod.ammo = $("ammoToggle").checked;
  game.mod.speed = $("speedToggle").checked;
  game.mod.fog = $("fogToggle").checked;
  updateHUD();
}

$("playBtn").onclick = startGame;
$("howBtn").onclick = () => showScreen("how");
document.querySelectorAll(".backBtn").forEach(b => b.onclick = () => showScreen("menu"));
$("exitBtn").onclick = () => showScreen("menu");
$("closeModBtn").onclick = () => $("modMenu").classList.remove("open");

["godToggle", "ammoToggle", "speedToggle", "fogToggle"].forEach(id => {
  $(id).onchange = syncModMenu;
});

window.addEventListener("keydown", e => {
  keys[e.code] = true;

  if (e.code === "KeyM" && game) openModMenu();
  if (e.code === "KeyR" && game && (game.dead || game.won)) startGame();
});

window.addEventListener("keyup", e => keys[e.code] = false);

canvas.addEventListener("click", () => {
  keys.MouseDown = true;
  setTimeout(() => keys.MouseDown = false, 80);

  if (canvas.requestPointerLock && !mouseLocked) {
    canvas.requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  mouseLocked = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", e => {
  if (mouseLocked && game && !game.dead && !game.won) {
    game.player.angle += e.movementX * CONFIG.mouseSensitivity;
  }
});

function bindTouch(id, key) {
  const b = $(id);
  b.onpointerdown = e => { e.preventDefault(); touch[key] = true; };
  b.onpointerup = e => { e.preventDefault(); touch[key] = false; };
  b.onpointerleave = () => touch[key] = false;
  b.onpointercancel = () => touch[key] = false;
}

bindTouch("leftBtn", "left");
bindTouch("rightBtn", "right");
bindTouch("forwardBtn", "forward");
bindTouch("shootBtn", "shoot");

$("handImg").src = ASSETS.hand;
$("gunImg").src = ASSETS.gun;

loadImages().then(() => {
  showScreen("menu");
});
