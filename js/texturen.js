/* Eigene 16×16-Pixeltexturen im Stil des Spiels, zur Laufzeit gezeichnet (keine Bilddateien, keine fremden Texturen). */
const TEX = (() => {
  const N = 16, COLS = 16;
  const tiles = [];            // Name -> Index
  const idx = {};
  let zustand = 1;
  const rnd = () => { zustand = (zustand * 16807) % 2147483647; return (zustand - 1) / 2147483646; };
  const hex = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const shade = (c, f) => c.map(v => Math.max(0, Math.min(255, Math.round(v * f))));

  function tile(name, painter) {
    const px = new Uint8ClampedArray(N * N * 4).fill(255);
    zustand = 1 + [...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 99991, 7);
    const set = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = a; };
    const get = (x, y) => { const i = (y * N + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    painter(set, get);
    idx[name] = tiles.length; tiles.push(px);
  }
  // ---------- Malwerkzeuge ----------
  const noise = (base, amt, lo = 0.82, hi = 1.12) => (set) => { const b = hex(base); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = rnd(); set(x, y, shade(b, lo + (hi - lo) * Math.pow(r, amt))); } };
  const speckle = (base, dots, n) => (set, get) => { noise(base, 1)(set); for (let k = 0; k < n; k++) { const d = hex(dots[Math.floor(rnd() * dots.length)]); set(Math.floor(rnd() * N), Math.floor(rnd() * N), shade(d, 0.9 + rnd() * 0.2)); } };
  const bricks = (base, mortar, rows = 4, offset = true, cols = 2) => (set) => {
    const b = hex(base), m = hex(mortar), h = N / rows, w = N / cols;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = Math.floor(y / h), ox = offset && row % 2 ? w / 2 : 0, xx = (x + ox) % N;
      const edgeY = y % h === h - 1, edgeX = xx % w === w - 1;
      if (edgeY || edgeX) set(x, y, shade(m, 0.9 + rnd() * 0.15));
      else { const hl = (y % h === 0 || xx % w === 0) ? 1.12 : 1; set(x, y, shade(b, (0.88 + rnd() * 0.16) * hl)); }
    }
  };
  const cobble = (base, dark) => (set) => {
    const b = hex(base), d = hex(dark); const pts = []; for (let k = 0; k < 11; k++) pts.push([rnd() * N, rnd() * N, 0.85 + rnd() * 0.3]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 1e9, a2 = 1e9, f = 1; for (const [px_, py, s] of pts) for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { const dd = (x - px_ - ox) ** 2 + (y - py - oy) ** 2; if (dd < a) { a2 = a; a = dd; f = s; } else if (dd < a2) a2 = dd; }
      const edge = Math.sqrt(a2) - Math.sqrt(a) < 1.1; set(x, y, edge ? shade(d, 0.9 + rnd() * 0.2) : shade(b, f * (0.9 + rnd() * 0.15)));
    }
  };
  const planks = (base) => (set) => {
    const b = hex(base);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const row = Math.floor(y / 4), seam = y % 4 === 3, joint = (x + (row % 2) * 8) % 16 === 0;
      const grain = 0.92 + 0.1 * Math.sin((x + row * 5) * 0.9 + rnd() * 0.6);
      set(x, y, seam || joint ? shade(b, 0.62) : shade(b, grain * (0.95 + rnd() * 0.08)));
    }
  };
  const logSide = (bark, dark) => (set) => { const b = hex(bark), d = hex(dark); for (let x = 0; x < N; x++) { const s = rnd(); for (let y = 0; y < N; y++) { const stripe = (x % 4 === 0) || rnd() < 0.08; set(x, y, stripe ? shade(d, 0.85 + rnd() * 0.2) : shade(b, 0.85 + s * 0.15 + rnd() * 0.08)); } } };
  const logTop = (bark, inner) => (set) => { const b = hex(bark), i = hex(inner); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (r > 6.5) set(x, y, shade(b, 0.85 + rnd() * 0.15)); else set(x, y, shade(i, Math.floor(r) % 2 ? 0.86 : 1.02)); } };
  const glass = (frame) => (set) => { const f = hex(frame); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const e = x === 0 || y === 0 || x === N - 1 || y === N - 1; const shine = (x - y === 3 || x - y === 4) && x > 2 && x < 10; set(x, y, e ? f : shine ? [255, 255, 255] : [210, 235, 245], e ? 255 : shine ? 140 : 45); } };
  const grassSide = (top, dirt) => (set) => { noise(dirt, 1)(set); const t = hex(top); for (let x = 0; x < N; x++) { const h = 3 + Math.floor(rnd() * 3); for (let y = 0; y < h; y++) set(x, y, shade(t, 0.85 + rnd() * 0.25)); } };
  const glow = (base, light) => (set) => { const b = hex(base), l = hex(light); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = rnd(); set(x, y, r > 0.55 ? shade(l, 0.9 + rnd() * 0.15) : shade(b, 0.85 + rnd() * 0.2)); } };
  const framed = (inner, border, deco) => (set, get) => { inner(set, get); const b = hex(border); for (let i = 0; i < N; i++) { set(i, 0, b); set(i, N - 1, shade(b, 0.8)); set(0, i, b); set(N - 1, i, shade(b, 0.8)); } if (deco) deco(set); };
  const alphaCut = (base, holes) => (set) => { const b = hex(base); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = rnd(); if (r < holes) set(x, y, [0, 0, 0], 0); else set(x, y, shade(b, 0.75 + rnd() * 0.45)); } };

  // ---------- Kacheln ----------
  tile('grass_top', noise(0x6aa84f, 1.2, 0.78, 1.12));
  tile('grass_side', grassSide(0x6aa84f, 0x8a5f3c));
  tile('dirt', speckle(0x8a5f3c, [0x6d4a2e, 0xa67650], 26));
  tile('snow', noise(0xf4f7f9, 2, 0.94, 1.03));
  tile('snow_side', grassSide(0xf4f7f9, 0x8a5f3c));
  tile('stone', (s, g) => { noise(0x7f7f7f, 1, 0.86, 1.1)(s); for (let k = 0; k < 7; k++) { const x = Math.floor(rnd() * 13), y = Math.floor(rnd() * 15); for (let j = 0; j < 3; j++) s(x + j, y, [104, 104, 104]); } });
  tile('coarse', speckle(0x7a5a45, [0x5c4334, 0x9b7a62, 0x6e6e6e], 40));
  tile('sand', speckle(0xdbcf9e, [0xc9bb86, 0xe8deb4], 30));
  tile('path_top', noise(0x9c7a46, 1, 0.85, 1.1));
  tile('gravel', cobble(0x888280, 0x5e5a58));
  tile('stone_bricks', bricks(0x7b7b7b, 0x5a5a5a));
  tile('mossy_cobble', (s, g) => { cobble(0x7d7d7d, 0x555555)(s); for (let k = 0; k < 60; k++) s(Math.floor(rnd() * N), Math.floor(rnd() * N), shade(hex(0x5f7d3a), 0.85 + rnd() * 0.3)); });
  tile('cobble', cobble(0x808080, 0x545454));
  tile('deepslate_bricks', bricks(0x4a4a50, 0x2f2f33));
  tile('deepslate_tiles', bricks(0x3e3e43, 0x26262a, 4, false, 4));
  tile('chiseled', framed(noise(0x7e7e7e, 1, 0.9, 1.08), 0x5d5d5d, s => { for (let i = 4; i < 12; i++) { s(i, 4, [96, 96, 96]); s(i, 11, [96, 96, 96]); s(4, i, [96, 96, 96]); s(11, i, [96, 96, 96]); } }));
  tile('spruce_planks', planks(0x6b4a2b));
  tile('spruce_log', logSide(0x3d2a17, 0x2b1d10));
  tile('spruce_log_top', logTop(0x3d2a17, 0x7b5733));
  tile('dark_planks', planks(0x48311b));
  tile('dark_log', logSide(0x352619, 0x241911));
  tile('dark_log_top', logTop(0x352619, 0x5c4126));
  tile('glass', glass(0xc6e2ea));
  tile('smooth_stone', framed(noise(0xa3a3a3, 2, 0.95, 1.04), 0x8b8b8b));
  tile('andesite', speckle(0x8b8f90, [0x7a7e7f, 0x9da1a2], 20));
  tile('concrete_lg', noise(0x8f8f86, 3, 0.97, 1.02));
  tile('concrete_gy', noise(0x4c5055, 3, 0.97, 1.02));
  tile('concrete_bk', noise(0x16181d, 3, 0.95, 1.05));
  tile('concrete_wt', noise(0xd0d6d7, 3, 0.97, 1.02));
  tile('iron_block', framed(noise(0xdcdcdc, 2, 0.94, 1.05), 0xbfbfbf, s => { for (let i = 2; i < 14; i++) s(i, 8, [200, 200, 200]); }));
  tile('obsidian', speckle(0x14101e, [0x3b2a5c, 0x241a38], 30));
  tile('lantern', framed(glow(0x3b2f24, 0xffc25a), 0x2a2a30));
  tile('sea_lantern', framed(glow(0xa9d8cf, 0xf2fffb), 0x8fc2b8));
  tile('glowstone', glow(0xb58a3e, 0xffe08a));
  tile('redstone_lamp', framed(glow(0x8a4b22, 0xffb25c), 0x5e3a1f));
  tile('redstone_lamp_off', framed((s) => { const b = hex(0x5e3a1f); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s(x, y, shade(b, 0.7 + rnd() * 0.3)); }, 0x3d2614));
  tile('lava', glow(0xd14b0b, 0xffa21a));
  tile('water', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s(x, y, shade([47, 94, 214], 0.9 + 0.12 * Math.sin((x + y * 0.5) * 0.8) + rnd() * 0.05), 170); });
  tile('portal', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s(x, y, shade([130, 50, 210], 0.75 + 0.3 * Math.sin(x * 0.7 + Math.cos(y * 0.6) * 2) + rnd() * 0.1), 200); });
  const wool = c => (s) => { const b = hex(c); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s(x, y, shade(b, ((x + y) % 4 === 0 ? 0.88 : 1) * (0.92 + rnd() * 0.1))); };
  tile('wool_red', wool(0xa12722)); tile('wool_white', wool(0xe9ecec)); tile('wool_yellow', wool(0xf8c627)); tile('wool_blue', wool(0x35399d));
  tile('blackstone', speckle(0x2a2429, [0x3a3238, 0x1d181c], 30));
  tile('blackstone_bricks', bricks(0x332d34, 0x1f1a1f));
  tile('basalt_side', (s) => { for (let x = 0; x < N; x++) { const v = 0.85 + rnd() * 0.25; for (let y = 0; y < N; y++) s(x, y, shade([90, 89, 96], v * (0.95 + rnd() * 0.08))); } });
  tile('basalt_top', framed(noise(0x5a5960, 1), 0x48474d));
  tile('bookshelf', (s) => { planks(0x6b4a2b)(s); const cols = [0xa12722, 0x35399d, 0x3d7a2a, 0xc7a54a, 0x6b3f8a]; for (const y0 of [2, 9]) for (let x = 1; x < 15; x++) { const c = hex(cols[Math.floor(rnd() * cols.length)]); for (let y = y0; y < y0 + 5; y++) s(x, y, shade(c, x % 2 ? 0.85 : 1)); } });
  tile('gold_block', framed(noise(0xf5d23a, 2, 0.92, 1.06), 0xd9a91c));
  tile('leaves', alphaCut(0x3f6b34, 0.18));
  tile('iron_bars', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const bar = x % 5 === 1 || y === 1 || y === 14; s(x, y, bar ? [120, 122, 125] : [0, 0, 0], bar ? 255 : 0); } });
  tile('iron_door', framed(noise(0xc9c9c9, 2, 0.92, 1.05), 0x9a9a9a, s => { for (let x = 3; x < 13; x++) { s(x, 4, [150, 150, 150]); s(x, 5, [150, 150, 150]); } s(11, 9, [80, 80, 80]); }));
  tile('piston_top', (s) => { planks(0x9b7a4c)(s); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) s(x, y, shade([120, 180, 90], 0.9 + rnd() * 0.2)); });
  tile('piston_side', (s) => { cobble(0x7a7a7a, 0x555555)(s); for (let y = 0; y < 4; y++) for (let x = 0; x < N; x++) s(x, y, shade([155, 122, 76], 0.9 + rnd() * 0.15)); });
  tile('redstone', (s) => { speckle(0x6e1010, [0xc21b1b, 0x8f1212], 50)(s); });
  tile('dispenser', (s) => { cobble(0x7a7a7a, 0x555555)(s); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) s(x, y, (x === 5 || x === 10 || y === 5 || y === 10) ? [40, 40, 40] : [20, 20, 20]); });
  tile('soul_sand', speckle(0x51402f, [0x3e3024, 0x6b5642], 40));
  tile('quartz', noise(0xece6de, 3, 0.97, 1.02));
  tile('chest', framed(planks(0xa0702e), 0x5a3b16, s => { for (let x = 6; x < 10; x++) for (let y = 6; y < 10; y++) s(x, y, [200, 200, 200]); }));
  tile('hopper', framed(noise(0x4a4a4a, 1), 0x2d2d2d, s => { for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) s(x, y, [30, 30, 30]); }));
  tile('farmland', (s) => { noise(0x5a3b22, 1)(s); for (let y = 0; y < N; y += 4) for (let x = 0; x < N; x++) s(x, y, [74, 48, 28]); });
  tile('wheat', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const st = x % 3 === 1 && y > 3; const head = x % 3 === 1 && y <= 4; s(x, y, head ? [212, 178, 75] : st ? [150, 160, 60] : [0, 0, 0], head || st ? 255 : 0); } });
  tile('bamboo', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const st = x >= 6 && x <= 9; s(x, y, st ? (y % 6 === 0 ? [92, 130, 40] : [118, 168, 52]) : [0, 0, 0], st ? 255 : 0); } });
  tile('fence', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const post = x >= 6 && x <= 9, rail = (y >= 3 && y <= 5) || (y >= 9 && y <= 11); s(x, y, post || rail ? shade([107, 74, 43], 0.9 + rnd() * 0.15) : [0, 0, 0], post || rail ? 255 : 0); } });
  tile('hay_side', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const band = y === 3 || y === 12; s(x, y, band ? [120, 70, 30] : shade([196, 162, 40], 0.85 + rnd() * 0.25)); } });
  tile('hay_top', noise(0xc4a228, 1));
  tile('crafting', framed(planks(0x9b6b36), 0x5a3b16, s => { for (let x = 3; x < 13; x++) s(x, 8, [70, 50, 30]); s(4, 4, [150, 150, 150]); s(11, 4, [150, 150, 150]); }));
  tile('candle', (s) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const body = x >= 6 && x <= 9 && y >= 6; const flame = x >= 7 && x <= 8 && y >= 2 && y < 6; s(x, y, flame ? [255, 210, 90] : body ? [230, 220, 190] : [0, 0, 0], flame || body ? 255 : 0); } });

  // Block -> [oben, Seite, unten]
  const B = {
    stb: 'stone_bricks', cob: 'cobble', mcb: 'mossy_cobble', dsb: 'deepslate_bricks', dst: 'deepslate_tiles', csb: 'chiseled',
    spp: 'spruce_planks', spl: ['spruce_log_top', 'spruce_log', 'spruce_log_top'], dop: 'dark_planks', dol: ['dark_log_top', 'dark_log', 'dark_log_top'],
    gls: 'glass', sms: 'smooth_stone', pan: 'andesite', lgc: 'concrete_lg', gyc: 'concrete_gy', bkc: 'concrete_bk', wtc: 'concrete_wt', irb: 'iron_block', obs: 'obsidian',
    lan: 'lantern', sea: 'sea_lantern', glw: 'glowstone', rlp: 'redstone_lamp', rlp_off: 'redstone_lamp_off', lav: 'lava', wat: 'water', ptl: 'portal',
    rwl: 'wool_red', wwl: 'wool_white', ywl: 'wool_yellow', bwl: 'wool_blue', bks: 'blackstone', pbb: 'blackstone_bricks', bas: ['basalt_top', 'basalt_side', 'basalt_top'],
    bsh: ['spruce_planks', 'bookshelf', 'spruce_planks'], gld: 'gold_block', lea: 'leaves', ibr: 'iron_bars', ido: 'iron_door', spi: ['piston_top', 'piston_side', 'stone'],
    red: 'redstone', dis: ['stone', 'dispenser', 'stone'], sos: 'soul_sand', qtz: 'quartz', che: 'chest', hop: 'hopper', frm: ['farmland', 'wheat', 'dirt'], bam: 'bamboo',
    fen: 'fence', hay: ['hay_top', 'hay_side', 'hay_top'], crf: 'crafting', cdl: 'candle', drt: 'dirt', snw: 'snow',
  };
  // Geländeoberflächen (T-Index der Daten) -> [oben, Seite oberster Block, darunter]
  const SURF = [
    ['grass_top', 'grass_side', 'dirt'], ['snow', 'snow_side', 'dirt'], ['stone', 'stone', 'stone'], ['coarse', 'coarse', 'stone'], ['sand', 'sand', 'sand'],
    ['path_top', 'grass_side', 'dirt'], ['gravel', 'gravel', 'stone'], ['stone_bricks', 'stone_bricks', 'stone'], ['andesite', 'andesite', 'stone'],
    ['basalt_top', 'basalt_side', 'stone'], ['blackstone', 'blackstone', 'stone'], ['grass_top', 'grass_side', 'dirt'], ['dirt', 'dirt', 'dirt'],
  ];
  // Blöcke mit Ausschnitten (Alpha-Test statt Transparenz)
  const CUTOUT = new Set(['lea', 'ibr', 'frm', 'bam', 'fen', 'cdl']);

  function atlas() {
    const rows = Math.ceil(tiles.length / COLS);
    const cv = document.createElement('canvas'); cv.width = COLS * N; cv.height = rows * N;
    const ctx = cv.getContext('2d');
    tiles.forEach((px, i) => ctx.putImageData(new ImageData(px, N, N), (i % COLS) * N, Math.floor(i / COLS) * N));
    return { canvas: cv, cols: COLS, rows };
  }
  const id = n => idx[n] ?? idx.stone;
  const faces = k => { const v = B[k] || 'stone'; return Array.isArray(v) ? v.map(id) : [id(v), id(v), id(v)]; };
  return { atlas, faces, surf: SURF.map(a => a.map(id)), cutout: CUTOUT, id };
})();
