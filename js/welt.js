/* Bergstadt & Stargate Command – Darstellung (Etappe 1: Texturen, flüssig am Handy, Orte, Ebenen) */
(async function () {
  const $ = s => document.querySelector(s);
  const status = t => { $('#lade').textContent = t; };
  const ZONEN = { 1: 'Burg', 2: 'Stadt', 3: 'Krater', 4: 'Außenposten', 5: 'Schacht & Tunnel', 6: 'Stargate Command', 7: 'Folkporten' };
  const LAYER_OF = [0, 0, 0, 0, 0, 1, 2, 2]; // Zone -> 0 Oberfläche, 1 Tunnel/Schacht, 2 SGC
  const R = 64, WASSER_Y = 62.88;
  const touch = matchMedia('(pointer: coarse)').matches;

  // ---------- Daten laden ----------
  status('Lade Welt …');
  let buf;
  try {
    const res = await fetch('welt.dat');
    buf = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  } catch (e) { status('Die Welt ließ sich nicht laden. Bitte Seite neu laden.'); return; }
  const dv = new DataView(buf.buffer); let o = 0;
  const hl = dv.getUint32(o, true); o += 4;
  const META = JSON.parse(new TextDecoder().decode(buf.subarray(o, o + hl))); o += hl;
  const W = META.W, D = META.D;
  const H = new Int16Array(buf.buffer.slice(o, o + W * D * 2)); o += W * D * 2;
  const S = buf.slice(o, o + W * D); o += W * D;
  const WT = buf.slice(o, o + W * D); o += W * D;
  const nc = dv.getUint32(o, true); o += 4;
  const CH = new Map(), REG = new Map();
  for (let k = 0; k < nc; k++) {
    const cx = dv.getInt16(o, true), cy = dv.getInt16(o + 2, true), cz = dv.getInt16(o + 4, true); o += 6;
    const c = { cx, cy, cz, b: buf.subarray(o, o + 4096), z: buf.subarray(o + 4096, o + 8192) }; o += 8192;
    CH.set(cx + ',' + cy + ',' + cz, c);
    const rk = Math.floor(cx * 16 / R) + ',' + Math.floor(cz * 16 / R); (REG.get(rk) || REG.set(rk, []).get(rk)).push(c);
  }
  const get = (x, y, z) => { const c = CH.get((x >> 4) + ',' + (y >> 4) + ',' + (z >> 4)); return c ? c.b[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0; };
  const PAL = META.pal.map(([k, n, t, e]) => ({ k, n, t: !!t, e: !!e }));
  PAL.push({ k: 'rlp_off', n: 'Redstone-Lampe (aus)', t: false, e: false });
  const T = {}; PAL.forEach((p, i) => T[p.k] = i);
  const regKey = (x, z) => Math.floor(x / R) + ',' + Math.floor(z / R);
  function setB(x, y, z, t) { const c = CH.get((x >> 4) + ',' + (y >> 4) + ',' + (z >> 4)); if (!c) return false; c.b[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = t; return true; }
  // Untertage-Bereiche (Räume, Tunnel, Schacht): dort ist das Gelände nicht massiv
  const HOHL = META.poi.filter(p => [5, 6, 7].includes(p.zo) && p.y1 > p.y0);
  const NICHT_FEST = new Set(['wat', 'lav', 'ptl', 'red', 'cdl']);

  // ---------- Texturen & Material ----------
  const AT = TEX.atlas();
  const tex = new THREE.CanvasTexture(AT.canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
  // Durchschnittsfarbe je Kachel (für die Ferne, verhindert Flimmern)
  const avgCv = document.createElement('canvas'); avgCv.width = AT.cols; avgCv.height = AT.rows;
  { const ctx = AT.canvas.getContext('2d'), ac = avgCv.getContext('2d'), out = ac.createImageData(AT.cols, AT.rows);
    for (let ty = 0; ty < AT.rows; ty++) for (let tx = 0; tx < AT.cols; tx++) {
      const d = ctx.getImageData(tx * 16, ty * 16, 16, 16).data; let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 30) { r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++; }
      const j = (ty * AT.cols + tx) * 4; out.data[j] = n ? r / n : 0; out.data[j + 1] = n ? g / n : 0; out.data[j + 2] = n ? b / n : 0; out.data[j + 3] = n ? a / n : 0;
    } ac.putImageData(out, 0, 0); }
  const avgTex = new THREE.CanvasTexture(avgCv); avgTex.magFilter = avgTex.minFilter = THREE.NearestFilter; avgTex.generateMipmaps = false; avgTex.flipY = false;
  const FOG = new THREE.Color(0xb9d4e6);
  const uni = () => ({
    atlas: { value: tex }, avg: { value: avgTex }, grid: { value: new THREE.Vector2(AT.cols, AT.rows) },
    fogColor: { value: FOG }, fogNear: { value: 700 }, fogFar: { value: 1900 }, fadeNear: { value: 70 }, fadeFar: { value: 190 },
    cutHi: { value: 9999 }, cutLo: { value: -9999 }, alphaTest: { value: 0 }, opacity: { value: 1 },
  });
  const VS = `attribute float tile; attribute vec2 luv; attribute float shade;
    varying vec2 vLuv; varying float vTile; varying float vShade; varying float vDist; varying float vY;
    void main(){ vLuv=luv; vTile=tile; vShade=shade; vY=position.y; vec4 mv=modelViewMatrix*vec4(position,1.0); vDist=-mv.z; gl_Position=projectionMatrix*mv; }`;
  const FS = `precision highp float;
    uniform sampler2D atlas; uniform sampler2D avg; uniform vec2 grid; uniform vec3 fogColor; uniform float fogNear, fogFar, fadeNear, fadeFar, cutHi, cutLo, alphaTest, opacity;
    varying vec2 vLuv; varying float vTile; varying float vShade; varying float vDist; varying float vY;
    void main(){
      if(vY>cutHi||vY<cutLo) discard;
      float t=floor(vTile+0.5); vec2 cell=vec2(mod(t,grid.x), floor(t/grid.x+0.0001));
      vec2 f=clamp(fract(vLuv),0.002,0.998);
      vec4 tx=texture2D(atlas,(cell+f)/grid);
      vec4 av=texture2D(avg,(cell+0.5)/grid);
      float far=smoothstep(fadeNear,fadeFar,vDist);
      vec4 c=mix(tx,av,far);
      if(c.a<alphaTest) discard;
      vec3 col=c.rgb*vShade;
      col=mix(col,fogColor,smoothstep(fogNear,fogFar,vDist));
      gl_FragColor=vec4(col,c.a*opacity);
    }`;
  const mat = (kind) => {
    const m = new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: VS, fragmentShader: FS, side: THREE.FrontSide });
    if (kind === 1) { m.uniforms.alphaTest.value = 0.5; m.side = THREE.DoubleSide; }
    if (kind === 2) { m.transparent = true; m.depthWrite = false; m.uniforms.alphaTest.value = 0.02; }
    return m;
  };
  const MAT = [mat(0), mat(1), mat(2)];
  const allMats = () => MAT;

  // Kacheln je Block
  const FACE = PAL.map(p => TEX.faces(p.k));
  const KIND = PAL.map(p => TEX.cutout.has(p.k) ? 1 : (p.t ? 2 : 0));
  const LIGHT = PAL.map(p => p.e);
  const SURF = TEX.surf.slice(); SURF.water = TEX.id('water');
  const STONE = TEX.id('stone');

  function toMesh(b, m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('luv', new THREE.Float32BufferAttribute(b.u, 2));
    g.setAttribute('tile', new THREE.Float32BufferAttribute(b.t, 1));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(b.s, 1));
    g.setIndex(b.n > 65000 ? new THREE.Uint32BufferAttribute(b.i, 1) : new THREE.Uint16BufferAttribute(b.i, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; return mesh;
  }

  // ---------- Szene ----------
  const cv = $('#cv');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
  const scene = new THREE.Scene(); scene.background = FOG;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2400);
  const groups = { terrainFar: new THREE.Group(), terrainNear: new THREE.Group(), water: new THREE.Group(), surf: new THREE.Group(), tun: new THREE.Group(), sgc: new THREE.Group() };
  for (const k in groups) scene.add(groups[k]);

  // ---------- Gelände: grob (ganze Karte) + fein (nahe Regionen) ----------
  const F = touch ? 4 : 2; // Vergröberung für die Ferne (Handy gröber)
  const CW = Math.ceil(W / F), CD = Math.ceil(D / F);
  const cH = new Int16Array(CW * CD), cS = new Uint8Array(CW * CD), cWT = new Uint8Array(CW * CD);
  for (let z = 0; z < CD; z++) for (let x = 0; x < CW; x++) {
    let mx = -999, cnt = {}, best = 0, bn = 0, w = 0;
    for (let dz = 0; dz < F; dz++) for (let dx = 0; dx < F; dx++) {
      const X = Math.min(W - 1, x * F + dx), Z = Math.min(D - 1, z * F + dz), i = Z * W + X;
      mx = Math.max(mx, H[i]); const s = S[i]; cnt[s] = (cnt[s] || 0) + 1; if (cnt[s] > bn) { bn = cnt[s]; best = s; } w += WT[i];
    }
    cH[z * CW + x] = mx; cS[z * CW + x] = best; cWT[z * CW + x] = w > F * F / 2 ? 1 : 0;
  }
  const regFar = new Map(), regNear = new Map();
  function scaleBuf(b) { for (let i = 0; i < b.p.length; i += 3) { b.p[i] *= F; b.p[i + 2] *= F; } for (let i = 0; i < b.u.length; i += 2) { b.u[i] *= F; if (b.s[i / 2] === 1) b.u[i + 1] *= F; } return b; }
  status('Baue Gelände …');
  const RC = R / F;
  for (let rz = 0; rz < CD; rz += RC) for (let rx = 0; rx < CW; rx += RC) {
    const m = MESH.terrain(CW, CD, cH, cS, cWT, SURF, STONE, rx, rz, RC, WASSER_Y);
    const grp = new THREE.Group();
    if (m.b.n) grp.add(toMesh(scaleBuf(m.b), MAT[0]));
    if (m.wb.n) { const w = toMesh(scaleBuf(m.wb), MAT[2]); w.renderOrder = 3; grp.add(w); }
    grp.userData.c = [(rx + RC / 2) * F, (rz + RC / 2) * F];
    regFar.set((rx / RC) + ',' + (rz / RC), grp); groups.terrainFar.add(grp);
  }
  function buildNear(k) {
    const [ix, iz] = k.split(',').map(Number);
    const m = MESH.terrain(W, D, H, S, WT, SURF, STONE, ix * R, iz * R, R, WASSER_Y);
    const grp = new THREE.Group();
    if (m.b.n) grp.add(toMesh(m.b, MAT[0]));
    if (m.wb.n) { const w = toMesh(m.wb, MAT[2]); w.renderOrder = 3; grp.add(w); }
    regNear.set(k, grp); groups.terrainNear.add(grp); regFar.get(k).visible = false;
  }
  function dropNear(k) {
    const g = regNear.get(k); if (!g) return; g.children.forEach(m => m.geometry.dispose());
    groups.terrainNear.remove(g); regNear.delete(k); const f = regFar.get(k); if (f) f.visible = true;
  }

  // ---------- Bauwerke ----------
  status('Baue Gebäude …');
  const LAYN = ['surf', 'tun', 'sgc'];
  const regMeshes = new Map();
  function buildVox(rk) {
    for (const m of regMeshes.get(rk) || []) { m.parent && m.parent.remove(m); m.geometry.dispose(); }
    const list = REG.get(rk) || [], ms = [];
    const out = MESH.voxels(list, get, t => FACE[t], t => KIND[t], z => LAYER_OF[z] || 0, t => LIGHT[t]);
    for (const [key, b] of out) { if (!b.n) continue; const lay = Math.floor(key / 3), kt = key % 3;
      const m = toMesh(b, MAT[kt]); if (kt === 2) m.renderOrder = 2; groups[LAYN[lay]].add(m); ms.push(m); }
    regMeshes.set(rk, ms);
  }
  let ri = 0; const regKeys = [...REG.keys()];
  for (const rk of regKeys) {
    buildVox(rk);
    if (++ri % 12 === 0) { status('Baue Gebäude … ' + Math.round(ri / regKeys.length * 100) + ' %'); await new Promise(r => setTimeout(r)); }
  }

  // ---------- Kamera ----------
  const cam = { tx: W / 2, ty: 140, tz: D / 2, yaw: -0.6, pitch: 0.75, dist: 620 };
  const anim = { from: null, to: null, t: 1 };
  function updCam() {
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty + Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }
  function flyTo(t) { anim.from = { ...cam }; anim.to = { ...cam, ...t }; anim.t = 0; }
  function resize() { const el = $('#bühne'); const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize(); updCam();

  // Eingabe: 1 Finger/linke Maus drehen, 2 Finger/rechte Maus schieben, Zoom per Rad/Pinch
  const ptr = new Map(); let pinch = 0;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); anim.t = 1; if (ptr.size === 2) pinch = dist2(); });
  const dist2 = () => { const [a, b] = [...ptr.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  cv.addEventListener('pointermove', e => {
    if (walk.on) return; const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 1) {
      if (p.b === 2 || e.shiftKey) panScreen(dx, dy);
      else { cam.yaw -= dx * 0.006; cam.pitch = Math.min(1.45, Math.max(0.08, cam.pitch + dy * 0.005)); }
    } else if (ptr.size === 2) { const d = dist2(); if (pinch) zoom(pinch / d); pinch = d; panScreen(dx / 2, dy / 2); }
    updCam();
  });
  const up = e => { ptr.delete(e.pointerId); pinch = ptr.size === 2 ? dist2() : 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); if (walk.on) return; zoom(Math.exp(e.deltaY * 0.0012)); updCam(); }, { passive: false });
  function zoom(f) { cam.dist = Math.min(1300, Math.max(12, cam.dist * f)); }
  function panScreen(dx, dy) {
    const s = cam.dist / 700, c = Math.cos(cam.yaw), si = Math.sin(cam.yaw);
    cam.tx -= (c * dx + si * dy) * s; cam.tz -= (-si * dx + c * dy) * s;
    const ix = Math.max(0, Math.min(W - 1, Math.round(cam.tx))), iz = Math.max(0, Math.min(D - 1, Math.round(cam.tz)));
    if (!levelOn) cam.ty += (H[iz * W + ix] - cam.ty) * 0.15;
  }

  // ---------- Detailstufen nachladen ----------
  let lodTick = 0;
  function lod() {
    const px = camera.position.x, pz = camera.position.z, near = Math.max(130, Math.min(260, 120 + cam.dist * 0.15));
    const want = new Set();
    if (walk.on) { for (const [k, g] of regFar) { const [cx, cz] = g.userData.c; if (Math.hypot(cx - walk.x, cz - walk.z) - R * 0.7 < 150) want.add(k); } }
    else if (!levelOn && cam.dist < 520) for (const [k, g] of regFar) { const [cx, cz] = g.userData.c; const d = Math.hypot(cx - px, cz - pz) - R * 0.7; const dt = Math.hypot(cx - cam.tx, cz - cam.tz) - R * 0.7; if (Math.min(d, dt) < near) want.add(k); }
    for (const k of [...regNear.keys()]) if (!want.has(k)) dropNear(k);
    for (const k of want) if (!regNear.has(k)) { buildNear(k); break; } // höchstens eine pro Bild
  }

  // ---------- Ebenen des Stargate Command ----------
  let levelOn = false; const DUNKEL_E = new THREE.Color(0x24282c);
  const POI = META.poi;
  const lv = {}; for (const p of POI) if (p.zo === 6 && p.l) { lv[p.l] = Math.min(lv[p.l] ?? 9999, p.y0); }
  const LEVELS = Object.keys(lv).map(Number).sort((a, b) => a - b).map(n => ({ n, y: lv[n] }));
  function setLevel(n) {
    levelOn = n != null;
    groups.terrainFar.visible = groups.terrainNear.visible = groups.water.visible = groups.surf.visible = !levelOn;
    scene.background = levelOn ? DUNKEL_E : FOG; for (const m of allMats()) m.uniforms.fogColor.value = levelOn ? DUNKEL_E : FOG;
    const L = LEVELS.find(l => l.n === n);
    for (const m of allMats()) { m.uniforms.cutHi.value = levelOn ? L.y + 5.5 : 9999; m.uniforms.cutLo.value = levelOn ? L.y - 1 : -9999; }
    document.querySelectorAll('#ebenen button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.n === '' && !levelOn) || +b.dataset.n === n)));
    if (levelOn) { const ps = POI.filter(p => p.zo === 6 && p.l === n); const x0 = Math.min(...ps.map(p => p.x0)), x1 = Math.max(...ps.map(p => p.x1)), z0 = Math.min(...ps.map(p => p.z0)), z1 = Math.max(...ps.map(p => p.z1));
      flyTo({ tx: (x0 + x1) / 2, tz: (z0 + z1) / 2, ty: L.y, dist: Math.max(60, Math.max(x1 - x0, z1 - z0) * 1.3), pitch: 1.2 }); }
    else flyTo({ ty: Math.max(cam.ty, 120), dist: Math.max(cam.dist, 200), pitch: Math.min(cam.pitch, 0.9) });
  }

  // ---------- Markierung ----------
  let mark = null;
  function highlight(p) {
    if (mark) { scene.remove(mark); mark.geometry.dispose(); }
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(p.x1 - p.x0 + 1, Math.max(1, p.y1 - p.y0 + 1), p.z1 - p.z0 + 1));
    mark = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false }));
    mark.position.set((p.x0 + p.x1 + 1) / 2, (p.y0 + p.y1 + 1) / 2, (p.z0 + p.z1 + 1) / 2); mark.renderOrder = 9; scene.add(mark);
  }

  // ---------- Oberfläche ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eb = $('#ebenen');
  eb.innerHTML = '<button type="button" data-n="" aria-pressed="true">Oberfläche</button>' + LEVELS.map(l => `<button type="button" data-n="${l.n}" aria-pressed="false">Ebene ${l.n}</button>`).join('');
  eb.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setLevel(b.dataset.n === '' ? null : +b.dataset.n); });
  const liste = $('#orte'), suche = $('#suche');
  function zeigeOrte() {
    const q = suche.value.trim().toLowerCase(); let html = '';
    for (const z of [1, 2, 3, 4, 5, 7, 6]) {
      const ps = POI.map((p, i) => ({ p, i })).filter(({ p }) => p.zo === z && (!q || p.n.toLowerCase().includes(q) || p.i.toLowerCase().includes(q)));
      if (!ps.length) continue;
      html += `<h3>${ZONEN[z]}</h3><ul>` + ps.map(({ p, i }) => `<li><button type="button" data-i="${i}">${esc(p.n)}${p.l ? ` <span class="lv">Ebene ${p.l}</span>` : ''}</button></li>`).join('') + '</ul>';
    }
    liste.innerHTML = html || '<p class="leise">Nichts gefunden.</p>';
  }
  suche.addEventListener('input', zeigeOrte); zeigeOrte();
  liste.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return; const p = POI[+b.dataset.i];
    aktiv = p; $('#info').innerHTML = `<h2>${esc(p.n)}</h2><p>${esc(p.i || '')}</p><p class="knoepfe"><button type="button" id="bauBtn">Bauanleitung</button></p>`;
    highlight(p);
    if (p.zo === 6 && p.l) setLevel(p.l); else if (levelOn) setLevel(null);
    const hgt = p.y1 > p.y0 ? p.y1 - p.y0 : 8, size = Math.max(p.x1 - p.x0, p.z1 - p.z0, hgt * 0.8, 10);
    flyTo({ tx: (p.x0 + p.x1) / 2, tz: (p.z0 + p.z1) / 2, ty: p.zo === 6 ? p.y0 : p.y0 + Math.min(hgt, 60) / 2, dist: Math.min(700, size * 2.2 + 25), pitch: p.zo === 6 ? 1.2 : 0.6 });
    if (touch) document.body.classList.remove('panel-offen');
  });
  $('#panelBtn').addEventListener('click', () => document.body.classList.toggle('panel-offen'));

  // =====================================================================
  // Etappe 2–4: Kollision, Mechanik, Begehen, Bauanleitung
  // =====================================================================
  const FEST = PAL.map(p => !NICHT_FEST.has(p.k));
  const inHohl = (x, y, z) => { for (const p of HOHL) if (x >= p.x0 - 1 && x <= p.x1 + 1 && z >= p.z0 - 1 && z <= p.z1 + 1 && y >= p.y0 - 1 && y <= p.y1 + 2) return true; return false; };
  function solid(x, y, z) {
    const t = get(x, y, z); if (t) return FEST[t];
    if (x < 0 || z < 0 || x >= W || z >= D) return false;
    if (y > H[z * W + x]) return false;
    return !inHohl(x, y, z);
  }
  // Strahl durch das Blockraster (für Klicken und „Benutzen“)
  function ray(o, d, max) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
    for (let i = 0, t = 0; t < max && i < 4000; i++) {
      const b = get(x, y, z);
      if (b && b !== T.wat) return { x, y, z, t: b };
      if (!b && x >= 0 && z >= 0 && x < W && z < D && y <= H[z * W + x] && !inHohl(x, y, z)) return { x, y, z, t: 0 };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
    }
    return null;
  }

  // ---------- Mechanik (Redstone) ----------
  const geaendert = new Set();
  const merken = (x, z) => geaendert.add(regKey(x, z));
  function neuBauen() { for (const k of geaendert) buildVox(k); geaendert.clear(); }
  function gruppe(x, y, z, typen, max = 200, r = 1) { // zusammenhängende Blöcke bestimmter Typen
    const seen = new Set(), out = [], st = [[x, y, z]];
    while (st.length && out.length < max) { const [a, b, c] = st.pop(), k = a + ',' + b + ',' + c; if (seen.has(k)) continue; seen.add(k);
      if (!typen.includes(get(a, b, c))) continue; out.push([a, b, c]);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) if (dx || dy || dz) st.push([a + dx, b + dy, c + dz]); }
    return out;
  }
  const speicher = new Map(); // Position -> ursprünglicher Block (für geöffnete Türen, gezündetes Portal)
  const K = (x, y, z) => x + ',' + y + ',' + z;
  function umschalten(pos, an) { for (const [x, y, z] of pos) { const k = K(x, y, z);
      if (an) { if (speicher.has(k)) { setB(x, y, z, speicher.get(k)); speicher.delete(k); } }
      else { const t = get(x, y, z); if (t) { speicher.set(k, t); setB(x, y, z, 0); } }
      merken(x, z); } }
  const kolbenTuer = POI.find(p => /Kolbentür/.test(p.n));
  const tuerBloecke = kolbenTuer ? (() => { const out = []; const zm = Math.round((kolbenTuer.z0 + kolbenTuer.z1) / 2);
    for (let x = kolbenTuer.x0 + 1; x <= kolbenTuer.x1 - 1; x++) for (let y = kolbenTuer.y0; y <= kolbenTuer.y1; y++) out.push([x, y, zm]); return out; })() : [];
  let tuerOffen = false;
  // Portal: anfangs aus, der Werfer zündet es
  const portal = []; for (const c of CH.values()) for (let i = 0; i < 4096; i++) if (c.b[i] === T.ptl) portal.push([c.cx * 16 + (i & 15), c.cy * 16 + (i >> 8), c.cz * 16 + ((i >> 4) & 15)]);
  umschalten(portal, false); let portalAn = false;

  function benutzen(hit) {
    if (!hit) return null;
    const { x, y, z } = hit; const t = get(x, y, z); const name = t ? PAL[t].n : 'Gelände';
    if (kolbenTuer && x >= kolbenTuer.x0 - 2 && x <= kolbenTuer.x1 + 2 && y >= kolbenTuer.y0 - 2 && y <= kolbenTuer.y1 + 2 && z >= kolbenTuer.z0 - 2 && z <= kolbenTuer.z1 + 2) {
      tuerOffen = !tuerOffen; umschalten(tuerBloecke, !tuerOffen); neuBauen(); return tuerOffen ? 'Kolbentür fährt auf' : 'Kolbentür schließt';
    }
    if (t === T.dis || (portal.some(([a, b, c]) => Math.abs(a - x) + Math.abs(b - y) + Math.abs(c - z) < 4) && t === T.obs)) {
      portalAn = !portalAn; umschalten(portal, portalAn); neuBauen(); return portalAn ? 'Werfer zündet – das Tor ist offen' : 'Das Tor erlischt';
    }
    if (t === T.ido || speicher.get(K(x, y, z)) === T.ido) {
      const g = t === T.ido ? gruppe(x, y, z, [T.ido], 120) : [...speicher.entries()].filter(([k, v]) => v === T.ido).map(([k]) => k.split(',').map(Number)).filter(([a, b, c]) => Math.abs(a - x) + Math.abs(b - y) + Math.abs(c - z) < 12);
      const auf = t === T.ido; umschalten(g, !auf); neuBauen(); return auf ? 'Eisentür geöffnet' : 'Eisentür geschlossen';
    }
    if (t === T.rlp || t === T.rlp_off) {
      const g = gruppe(x, y, z, [T.rlp, T.rlp_off], 300, 2), neu = t === T.rlp ? T.rlp_off : T.rlp;
      for (const [a, b, c] of g) { setB(a, b, c, neu); merken(a, c); } neuBauen(); return neu === T.rlp ? 'Lampen an' : 'Lampen aus';
    }
    if (t === T.spi) return 'Klebriger Kolben – gesteuert über die Schaltung daneben';
    if (t === T.red) return 'Redstone-Leitung';
    return name;
  }
  const meldung = (txt) => { const el = $('#meldung'); el.textContent = txt; el.hidden = !txt; clearTimeout(meldung.t); meldung.t = setTimeout(() => el.hidden = true, 2600); };

  // Klicken in der Übersicht: Block anzeigen bzw. Mechanik schalten
  let downAt = null;
  cv.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY, performance.now()]; }, true);
  cv.addEventListener('pointerup', e => {
    if (walk.on || !downAt) return; const [x0, y0, t0] = downAt; downAt = null;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6 || performance.now() - t0 > 400) return;
    const r = cv.getBoundingClientRect(), v = new THREE.Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    const hit = ray(camera.position, v, 1500); if (hit) meldung(benutzen(hit));
  });

  // ---------- Begehen ----------
  const walk = { on: false, x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, ground: false, fly: false, keys: {}, joy: [0, 0] };
  const EYE = 1.62, HALF = 0.3, HGT = 1.8;
  function kollidiert(x, y, z) {
    for (let bx = Math.floor(x - HALF); bx <= Math.floor(x + HALF); bx++) for (let bz = Math.floor(z - HALF); bz <= Math.floor(z + HALF); bz++)
      for (let by = Math.floor(y); by <= Math.floor(y + HGT - 0.01); by++) if (solid(bx, by, bz)) return true;
    return false;
  }
  function startWalk() {
    walk.on = true; document.body.classList.add('laufen'); $('#laufBtn').textContent = 'Beenden'; if (mark) mark.visible = false;
    let x = cam.tx, z = cam.tz, y;
    if (levelOn) { y = cam.ty; } else { const ix = Math.max(0, Math.min(W - 1, Math.floor(x))), iz = Math.max(0, Math.min(D - 1, Math.floor(z))); y = H[iz * W + ix] + 1; }
    while (kollidiert(x, y, z) && y < 330) y++;
    for (const m of allMats()) { m.uniforms.cutHi.value = 9999; m.uniforms.cutLo.value = -9999; }
    groups.terrainFar.visible = groups.terrainNear.visible = groups.water.visible = groups.surf.visible = true;
    Object.assign(walk, { x, y, z, vy: 0, yaw: cam.yaw, pitch: -0.1 });
    camera.near = 0.05; camera.far = 300; camera.updateProjectionMatrix();
    for (const m of allMats()) { m.uniforms.fogNear.value = 110; m.uniforms.fogFar.value = 280; m.uniforms.fadeNear.value = 40; m.uniforms.fadeFar.value = 110; }
    if (!touch) cv.requestPointerLock?.();
    meldung(touch ? 'Links laufen, rechts umsehen' : 'WASD laufen · Maus umsehen · Leertaste springen · E benutzen · F fliegen · Esc beenden');
  }
  function stopWalk() {
    walk.on = false; document.body.classList.remove('laufen'); $('#laufBtn').textContent = 'Begehen'; if (document.pointerLockElement) document.exitPointerLock();
    camera.near = 0.3; camera.far = 2400; camera.updateProjectionMatrix(); if (mark) mark.visible = true;
    for (const m of allMats()) { m.uniforms.fogNear.value = 700; m.uniforms.fogFar.value = 1900; m.uniforms.fadeNear.value = 70; m.uniforms.fadeFar.value = 190; m.uniforms.fogColor.value = FOG; } scene.background = FOG;
    cam.tx = walk.x; cam.tz = walk.z; cam.ty = walk.y; cam.dist = 60; cam.pitch = 0.6; if (levelOn) setLevel(null); updCam();
  }
  $('#laufBtn').addEventListener('click', () => walk.on ? stopWalk() : startWalk());
  addEventListener('keydown', e => { if (!walk.on) return; walk.keys[e.code] = true;
    if (e.code === 'KeyE') meldung(benutzen(blickZiel())); if (e.code === 'KeyF') { walk.fly = !walk.fly; walk.vy = 0; meldung(walk.fly ? 'Fliegen an' : 'Fliegen aus'); }
    if (e.code === 'Escape') stopWalk(); });
  addEventListener('keyup', e => { walk.keys[e.code] = false; });
  document.addEventListener('mousemove', e => { if (!walk.on || document.pointerLockElement !== cv) return;
    walk.yaw -= e.movementX * 0.0025; walk.pitch = Math.max(-1.5, Math.min(1.5, walk.pitch - e.movementY * 0.0025)); });
  cv.addEventListener('click', () => { if (walk.on && !touch && document.pointerLockElement !== cv) cv.requestPointerLock?.(); });
  function blickZiel() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return ray(camera.position, d, 6); }
  // Touch: linker Stick laufen, rechte Hälfte umsehen
  const stick = $('#stick'), knopf = $('#stick i'); let stickId = null, lookId = null, lookP = null;
  stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); bewegeStick(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) bewegeStick(e); });
  const stickAus = () => { stickId = null; walk.joy = [0, 0]; knopf.style.transform = ''; };
  stick.addEventListener('pointerup', stickAus); stick.addEventListener('pointercancel', stickAus);
  function bewegeStick(e) { const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    walk.joy = [dx, dy]; knopf.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; }
  cv.addEventListener('pointerdown', e => { if (walk.on && touch && lookId === null) { lookId = e.pointerId; lookP = [e.clientX, e.clientY]; } });
  cv.addEventListener('pointermove', e => { if (e.pointerId !== lookId) return; walk.yaw -= (e.clientX - lookP[0]) * 0.006; walk.pitch = Math.max(-1.5, Math.min(1.5, walk.pitch - (e.clientY - lookP[1]) * 0.006)); lookP = [e.clientX, e.clientY]; });
  const lookAus = e => { if (e.pointerId === lookId) lookId = null; }; cv.addEventListener('pointerup', lookAus); cv.addEventListener('pointercancel', lookAus);
  $('#tSpring').addEventListener('pointerdown', () => { if (walk.fly) walk.vy = 6; else if (walk.ground) walk.vy = 8.4; });
  $('#tSpring').addEventListener('pointerup', () => { if (walk.fly) walk.vy = 0; });
  $('#tNutz').addEventListener('click', () => meldung(benutzen(blickZiel())));
  $('#tFlieg').addEventListener('click', () => { walk.fly = !walk.fly; walk.vy = 0; $('#tFlieg').setAttribute('aria-pressed', String(walk.fly)); });
  $('#tEnde').addEventListener('click', stopWalk);

  function schritt(dt) {
    const k = walk.keys, f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - walk.joy[1], s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + walk.joy[0];
    const speed = (walk.fly ? 14 : 4.3) * (k.ShiftLeft || k.ShiftRight ? 1.75 : 1);
    const sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
    let mx = (-sy * f + cy * s), mz = (-cy * f - sy * s); const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    mx *= speed * dt; mz *= speed * dt;
    if (walk.fly) { if (!touch) walk.vy = (k.Space ? 8 : 0) - (k.ControlLeft || k.KeyC ? 8 : 0); }
    else { if (k.Space && walk.ground) walk.vy = 8.4; walk.vy = Math.max(-40, walk.vy - 28 * dt); }
    // Achsenweise bewegen, eine Stufe automatisch hochsteigen
    const tryMove = (nx, ny, nz) => { if (!kollidiert(nx, ny, nz)) { walk.x = nx; walk.y = ny; walk.z = nz; return true; } return false; };
    for (const [dx, dz] of [[mx, 0], [0, mz]]) { if (!dx && !dz) continue;
      if (!tryMove(walk.x + dx, walk.y, walk.z + dz) && walk.ground && !walk.fly) { if (!kollidiert(walk.x + dx, walk.y + 1.05, walk.z + dz) && !kollidiert(walk.x, walk.y + 1.05, walk.z)) { walk.y += 1.05; tryMove(walk.x + dx, walk.y, walk.z + dz); } } }
    const ny = walk.y + walk.vy * dt; walk.ground = false;
    if (!tryMove(walk.x, ny, walk.z)) { if (walk.vy < 0) { walk.ground = true; walk.y = Math.floor(walk.y + 0.001); while (kollidiert(walk.x, walk.y, walk.z)) walk.y += 1; } walk.vy = 0; }
    if (walk.y < -80) { walk.y = 200; walk.vy = 0; }
    camera.position.set(walk.x, walk.y + EYE, walk.z);
    camera.rotation.set(0, 0, 0); camera.rotateY(walk.yaw); camera.rotateX(walk.pitch);
    // Unter Tage dunkler Hintergrund
    const ix = Math.max(0, Math.min(W - 1, Math.floor(walk.x))), iz = Math.max(0, Math.min(D - 1, Math.floor(walk.z)));
    const unten = walk.y + 2 < H[iz * W + ix]; const bg = unten ? DUNKEL : FOG;
    if (scene.background !== bg) { scene.background = bg; for (const m of allMats()) m.uniforms.fogColor.value = bg; }
    cam.tx = walk.x; cam.tz = walk.z; // für das Nachladen der Details
  }
  const DUNKEL = new THREE.Color(0x24282c);

  // ---------- Bauanleitung ----------
  const BA = { p: null, y: 0 };
  const baDlg = $('#bau'), baCv = $('#bauCv'), baCtx = baCv.getContext('2d');
  function bauOeffnen(p) {
    BA.p = p; let lo = p.y1, hi = p.y0;
    for (let y = p.y0 - 2; y <= p.y1 + 2; y++) { let n = 0; for (let x = p.x0; x <= p.x1 && !n; x++) for (let z = p.z0; z <= p.z1; z++) if (get(x, y, z)) { n = 1; break; } if (n) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    if (lo > hi) { meldung('Für diesen Ort gibt es keine Blöcke zum Nachbauen.'); return; }
    BA.lo = lo; BA.hi = hi; BA.y = lo;
    // Gesamtliste
    const tot = {}; for (let y = lo; y <= hi; y++) for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) { const t = get(x, y, z) || speicher.get(K(x, y, z)) || 0; if (t) tot[t] = (tot[t] || 0) + 1; }
    BA.tot = tot;
    $('#bauTitel').textContent = 'Bauanleitung: ' + p.n; $('#bauY').max = hi - lo; $('#bauY').min = 0;
    baDlg.showModal ? baDlg.showModal() : baDlg.setAttribute('open', ''); bauZeigen();
  }
  const kachelBild = t => { const id = FACE[t][0]; return [(id % AT.cols) * 16, Math.floor(id / AT.cols) * 16]; };
  function blockListe(el, z, gesamt) { const e = Object.entries(z).sort((a, b) => b[1] - a[1]);
    el.innerHTML = e.map(([t, n]) => { const [sx, sy] = kachelBild(+t); return `<li><span class="kachel" style="background-position:-${sx * 1.25}px -${sy * 1.25}px"></span>${esc(PAL[t].n)} <b>${n}</b>${gesamt && n >= 64 ? ` <span class="leise">(${Math.floor(n / 64)} Stapel${n % 64 ? ' + ' + (n % 64) : ''})</span>` : ''}</li>`; }).join('') || '<li class="leise">Keine Blöcke auf dieser Ebene</li>'; }
  function bauZeigen() {
    const p = BA.p, y = BA.y, w = p.x1 - p.x0 + 1, d = p.z1 - p.z0 + 1;
    const max = Math.min(baCv.parentElement.clientWidth - 4, 720), cell = Math.max(2, Math.min(28, Math.floor(max / Math.max(w, d))));
    baCv.width = w * cell; baCv.height = d * cell; baCtx.imageSmoothingEnabled = false;
    baCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--grund'); baCtx.fillRect(0, 0, baCv.width, baCv.height);
    const lay = {};
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const t = get(p.x0 + x, y, p.z0 + z) || speicher.get(K(p.x0 + x, y, p.z0 + z)) || 0;
      if (t) { lay[t] = (lay[t] || 0) + 1; const [sx, sy] = kachelBild(t); baCtx.drawImage(AT.canvas, sx, sy, 16, 16, x * cell, z * cell, cell, cell); }
      else { const u = get(p.x0 + x, y - 1, p.z0 + z); if (u) { const [sx, sy] = kachelBild(u); baCtx.globalAlpha = 0.18; baCtx.drawImage(AT.canvas, sx, sy, 16, 16, x * cell, z * cell, cell, cell); baCtx.globalAlpha = 1; } }
    }
    if (cell >= 8) { baCtx.strokeStyle = 'rgba(0,0,0,.18)'; baCtx.lineWidth = 1; for (let i = 0; i <= w; i++) { baCtx.beginPath(); baCtx.moveTo(i * cell + .5, 0); baCtx.lineTo(i * cell + .5, d * cell); baCtx.stroke(); } for (let i = 0; i <= d; i++) { baCtx.beginPath(); baCtx.moveTo(0, i * cell + .5); baCtx.lineTo(w * cell, i * cell + .5); baCtx.stroke(); } }
    $('#bauEbene').textContent = `Ebene ${y - BA.lo + 1} von ${BA.hi - BA.lo + 1} · Y ${y}`; $('#bauY').value = y - BA.lo;
    blockListe($("#bauLay"), lay, false); blockListe($("#bauTot"), BA.tot, true);
    for (const m of allMats()) { m.uniforms.cutHi.value = y + 1; }
  }
  $('#bauY').addEventListener('input', e => { BA.y = BA.lo + +e.target.value; bauZeigen(); });
  $('#bauVor').addEventListener('click', () => { if (BA.y < BA.hi) { BA.y++; bauZeigen(); } });
  $('#bauZur').addEventListener('click', () => { if (BA.y > BA.lo) { BA.y--; bauZeigen(); } });
  baDlg.addEventListener('close', () => { const L = LEVELS.find(l => levelOn && l.y <= cam.ty + 1 && l.y >= cam.ty - 1); for (const m of allMats()) m.uniforms.cutHi.value = levelOn && L ? L.y + 5.5 : 9999; });
  $('#bauZu').addEventListener('click', () => baDlg.close());
  document.documentElement.style.setProperty('--atlas', `url(${AT.canvas.toDataURL()})`);
  document.documentElement.style.setProperty('--atlasW', AT.canvas.width * 1.25 + 'px');
  $('#info').addEventListener('click', e => { if (e.target.closest('#bauBtn')) bauOeffnen(aktiv); });
  let aktiv = null;

  // ---------- Schleife ----------
  status('');
  $('#lade').hidden = true;
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (walk.on) schritt(dt);
    else if (anim.t < 1) { anim.t = Math.min(1, anim.t + dt * 1.6); const e = 1 - Math.pow(1 - anim.t, 3);
      for (const k of ['tx', 'ty', 'tz', 'dist', 'pitch']) cam[k] = anim.from[k] + (anim.to[k] - anim.from[k]) * e; updCam(); }
    if (++lodTick % 8 === 0) lod();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
})();
