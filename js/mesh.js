/* Meshing: Gelände (Höhenkarte) und Bauwerke (Voxel), gierig zusammengefasst.
   Texturkoordinaten in Blockeinheiten; der Shader wiederholt die Kachel per fract(). */
const MESH = (() => {
  function buf() { return { p: [], t: [], u: [], s: [], i: [], n: 0 }; }
  // c: 4 Ecken [x,y,z], uv: 4 Paare (Blockeinheiten), tile, shade
  function quad(b, c, uv, tile, sh) {
    const o = b.n;
    for (let k = 0; k < 4; k++) { b.p.push(c[k][0], c[k][1], c[k][2]); b.u.push(uv[k][0], uv[k][1]); b.t.push(tile); b.s.push(sh); }
    b.i.push(o, o + 1, o + 2, o, o + 2, o + 3); b.n += 4;
  }
  // Gieriges Zusammenfassen einer 2D-Maske (w×h, Werte >0 = Kachel+1)
  function greedy(mask, w, h, emit) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
      const v = mask[y * w + x]; if (!v) { x++; continue; }
      let ww = 1; while (x + ww < w && mask[y * w + x + ww] === v) ww++;
      let hh = 1; outer: while (y + hh < h) { for (let k = 0; k < ww; k++) if (mask[(y + hh) * w + x + k] !== v) break outer; hh++; }
      for (let yy = 0; yy < hh; yy++) for (let k = 0; k < ww; k++) mask[(y + yy) * w + x + k] = 0;
      emit(x, y, ww, hh, v); x += ww;
    }
  }
  const SH = { top: 1, bottom: 0.5, x: 0.8, z: 0.66 };
  // Quader innerhalb eines Blocks (Koordinaten absolut), tiles [oben, seite, unten]
  function box(b, x0, y0, z0, x1, y1, z1, tl, lit) {
    const L = v => lit ? 1.35 : v;
    quad(b, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]], tl[0], L(SH.top));
    quad(b, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], tl[2], L(SH.bottom));
    quad(b, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[z0, -y0], [z0, -y1], [z1, -y1], [z1, -y0]], tl[1], L(SH.x));
    quad(b, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [[-z1, -y0], [-z1, -y1], [-z0, -y1], [-z0, -y0]], tl[1], L(SH.x));
    quad(b, [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [[-x1, -y0], [-x1, -y1], [-x0, -y1], [-x0, -y0]], tl[1], L(SH.z));
    quad(b, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [[x0, -y0], [x0, -y1], [x1, -y1], [x1, -y0]], tl[1], L(SH.z));
  }
  // Zwei diagonale Flächen (Pflanzen); Material ist beidseitig
  function cross(b, x, y, z, tile, h = 1, s = 1) {
    const a = (1 - s) / 2, c = 1 - a;
    quad(b, [[x + a, y, z + a], [x + a, y + h, z + a], [x + c, y + h, z + c], [x + c, y, z + c]], [[0, 1], [0, 1 - h], [1, 1 - h], [1, 1]], tile, 0.9);
    quad(b, [[x + a, y, z + c], [x + a, y + h, z + c], [x + c, y + h, z + a], [x + c, y, z + a]], [[0, 1], [0, 1 - h], [1, 1 - h], [1, 1]], tile, 0.9);
  }

  // ---------- Gelände ----------
  function terrain(W, D, H, S, WT, SURF, STONE, rx, rz, R, waterY) {
    const b = buf(), wb = buf();
    const x1 = Math.min(W, rx + R), z1 = Math.min(D, rz + R), w = x1 - rx, d = z1 - rz;
    const EDGE = 0;
    const h = (x, z) => (x < 0 || z < 0 || x >= W || z >= D) ? EDGE : H[z * W + x];
    // Oberseiten: gleiche Höhe + gleiche Kachel zusammenfassen (Höhe steckt im Schlüssel)
    const key = new Int32Array(w * d);
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) { const i = (rz + z) * W + rx + x; key[z * w + x] = (H[i] + 1000) * 256 + SURF[S[i]][0] + 1; }
    greedy(key, w, d, (x, z, ww, dd, v) => {
      const y = Math.floor(v / 256) - 1000 + 1, tile = (v % 256) - 1, X = rx + x, Z = rz + z;
      quad(b, [[X, y, Z + dd], [X + ww, y, Z + dd], [X + ww, y, Z], [X, y, Z]], [[x, z + dd], [x + ww, z + dd], [x + ww, z], [x, z]], tile, SH.top);
    });
    // Wasser
    const wm = new Int32Array(w * d);
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (WT[(rz + z) * W + rx + x]) wm[z * w + x] = 1;
    greedy(wm, w, d, (x, z, ww, dd) => { const X = rx + x, Z = rz + z, y = waterY;
      quad(wb, [[X, y, Z + dd], [X + ww, y, Z + dd], [X + ww, y, Z], [X, y, Z]], [[x, z + dd], [x + ww, z + dd], [x + ww, z], [x, z]], SURF.water, SH.top); });
    // Seitenwände: pro Grenzlinie eine senkrechte Maske (entlang × Höhe), dann gierig
    let lo = 1e9, hi = -1e9;
    for (let z = rz - 1; z <= z1; z++) for (let x = rx - 1; x <= x1; x++) { const v = h(x, z); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    lo = Math.max(lo, 0); const hh = hi - lo + 1;
    const side = (sx, sz, along, len, dirX, dirZ) => { // Kacheln der Spalte an Position (sx,sz) zur Nachbarspalte
      const mask = new Int32Array(len * hh); let any = false;
      for (let a = 0; a < len; a++) {
        const x = sx + (along === 'z' ? 0 : a), z = sz + (along === 'z' ? a : 0);
        if (x < 0 || z < 0 || x >= W || z >= D) continue;
        const top = H[z * W + x], nb = h(x + dirX, z + dirZ); if (nb >= top) continue;
        const s = S[z * W + x];
        for (let y = Math.max(nb + 1, lo); y <= top; y++) { const t = y === top ? SURF[s][1] : top - y <= 3 ? SURF[s][2] : STONE; mask[(hi - y) * len + a] = t + 1; any = true; }
      }
      return any ? mask : null;
    };
    // Flächen in ±X-Richtung (Ebene x = konst.)
    for (let x = rx; x < x1; x++) for (const dir of [1, -1]) {
      const m = side(x, rz, 'z', d, dir, 0); if (!m) continue; const X = dir > 0 ? x + 1 : x;
      greedy(m, d, hh, (a, r, aa, rr, v) => { const yt = hi - r + 1, yb = yt - rr, Z0 = rz + a, Z1 = Z0 + aa;
        const c = dir > 0 ? [[X, yb, Z0], [X, yt, Z0], [X, yt, Z1], [X, yb, Z1]] : [[X, yb, Z1], [X, yt, Z1], [X, yt, Z0], [X, yb, Z0]];
        const u0 = dir > 0 ? a : -(a + aa), u1 = u0 + aa;
        quad(b, c, [[u0, r + rr], [u0, r], [u1, r], [u1, r + rr]], v - 1, SH.x); });
    }
    for (let z = rz; z < z1; z++) for (const dir of [1, -1]) {
      const m = side(rx, z, 'x', w, 0, dir); if (!m) continue; const Z = dir > 0 ? z + 1 : z;
      greedy(m, w, hh, (a, r, aa, rr, v) => { const yt = hi - r + 1, yb = yt - rr, X0 = rx + a, X1 = X0 + aa;
        const c = dir > 0 ? [[X1, yb, Z], [X1, yt, Z], [X0, yt, Z], [X0, yb, Z]] : [[X0, yb, Z], [X0, yt, Z], [X1, yt, Z], [X1, yb, Z]];
        const u0 = dir > 0 ? -(a + aa) : a, u1 = u0 + aa;
        quad(b, c, [[u0, r + rr], [u0, r], [u1, r], [u1, r + rr]], v - 1, SH.z); });
    }
    return { b, wb };
  }

  // ---------- Bauwerke ----------
  // chunks: Liste {cx,cy,cz,b,z}; get(x,y,z) liefert Blocktyp weltweit; FACE(t) -> [oben,seite,unten]; kind(t): 0 deckend, 1 Ausschnitt, 2 durchsichtig
  // layerOf(zone) -> Ebene; light(t) -> true bei Leuchtblöcken
  function voxels(chunks, get, FACE, kind, layerOf, light, shape, drawShape) {
    const out = new Map(); // Schlüssel ebene*3+art -> buf
    const B = k => out.get(k) || (out.set(k, buf()), out.get(k));
    const DIRS = [
      { d: [1, 0, 0], sh: SH.x, f: 1 }, { d: [-1, 0, 0], sh: SH.x, f: 1 }, { d: [0, 1, 0], sh: SH.top, f: 0 },
      { d: [0, -1, 0], sh: SH.bottom, f: 2 }, { d: [0, 0, 1], sh: SH.z, f: 1 }, { d: [0, 0, -1], sh: SH.z, f: 1 },
    ];
    const mask = new Int32Array(256);
    for (const c of chunks) {
      const bx = c.cx * 16, by = c.cy * 16, bz = c.cz * 16;
      if (shape) for (let i = 0; i < 4096; i++) { const t = c.b[i]; if (!t || !shape(t)) continue;
        const lay = layerOf(c.z[i]); drawShape(t, bx + (i & 15), by + (i >> 8), bz + ((i >> 4) & 15), B(lay * 3), B(lay * 3 + 1), get); }
      const at = (x, y, z) => (x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16) ? c.b[(y << 8) | (z << 4) | x] : get(bx + x, by + y, bz + z);
      DIRS.forEach(({ d, sh, f }) => {
        const axis = d[0] ? 0 : d[1] ? 1 : 2; // Scheiben senkrecht zur Achse
        for (let s = 0; s < 16; s++) {
          mask.fill(0); let any = false;
          for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
            // Achse 0: u=z, v=y · Achse 1: u=x, v=z · Achse 2: u=x, v=y
            const xx = axis === 0 ? s : u, yy = axis === 1 ? s : v, zz = axis === 2 ? s : (axis === 0 ? u : v);
            const i = (yy << 8) | (zz << 4) | xx, t = c.b[i]; if (!t || (shape && shape(t))) continue;
            const nb = at(xx + d[0], yy + d[1], zz + d[2]);
            if (nb && !(shape && shape(nb)) && (nb === t || kind(nb) === 0)) continue; // verdeckt
            const lay = layerOf(c.z[i]);
            mask[v * 16 + u] = ((FACE(t)[f] * 4 + lay) * 4 + kind(t)) * 2 + (light(t) ? 1 : 0) + 1; any = true;
          }
          if (!any) continue;
          greedy(mask, 16, 16, (u, v, uu, vv, val) => {
            val -= 1; const lit = val & 1, kt = (val >> 1) & 3, lay = (val >> 3) & 3, tile = val >> 5;
            const shade = lit ? 1.35 : sh;
            const pos = d[axis] > 0; // Fläche auf der +Seite
            const P = (uu_, vv_) => { // u,v -> Weltkoordinaten
              const o = s + (pos ? 1 : 0);
              if (axis === 0) return [bx + o, by + vv_, bz + uu_];
              if (axis === 1) return [bx + uu_, by + o, bz + vv_];
              return [bx + uu_, by + vv_, bz + o];
            };
            let c4 = [P(u, v), P(u + uu, v), P(u + uu, v + vv), P(u, v + vv)];
            let uv = axis === 1 ? [[u, v], [u + uu, v], [u + uu, v + vv], [u, v + vv]]
                                : [[u, 16 - v], [u + uu, 16 - v], [u + uu, 16 - v - vv], [u, 16 - v - vv]];
            // Wicklung je nach Richtung umdrehen, damit die Vorderseite nach außen zeigt
            const flip = (axis === 0 && d[0] > 0) || (axis === 1 && d[1] > 0) || (axis === 2 && d[2] < 0);
            if (flip) { c4 = [c4[0], c4[3], c4[2], c4[1]]; uv = [uv[0], uv[3], uv[2], uv[1]]; }
            quad(B(lay * 3 + kt), c4, uv, tile, shade);
          });
        }
      });
    }
    return out;
  }
  return { buf, quad, greedy, terrain, voxels, box, cross };
})();
if (typeof module !== 'undefined') module.exports = MESH;
