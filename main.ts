// news-image-20261125: a hand-drawn 1024x1024 poster summing up the world
// news of Wednesday 25 November 2026. Node standard library only.
// The PNG encoder, the 5x7 bitmap font and every icon are written here
// from scratch. Output is fully deterministic: no clock, no randomness.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- PNG ----
// CRC-32 (IEEE) table, built once from the polynomial.
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- canvas ----
const px = Buffer.alloc(W * H * 3);
function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function setPixel(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, hex: number): void {
  const c = rgb(hex);
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) setPixel(i, j, c);
}
function fillCircle(cx: number, cy: number, r: number, hex: number): void {
  const c = rgb(hex);
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(x, y, c);
    }
}
function ring(cx: number, cy: number, r: number, t: number, hex: number): void {
  const c = rgb(hex);
  for (let y = cy - r - t; y <= cy + r + t; y++)
    for (let x = cx - r - t; x <= cx + r + t; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (Math.abs(d - r) <= t / 2) setPixel(x, y, c);
    }
}
function triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, hex: number): void {
  const c = rgb(hex);
  const minX = Math.min(x1, x2, x3);
  const maxX = Math.max(x1, x2, x3);
  const minY = Math.min(y1, y2, y3);
  const maxY = Math.max(y1, y2, y3);
  const d = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const a = ((x2 - x) * (y3 - y) - (y2 - y) * (x3 - x)) / d;
      const b = ((x3 - x) * (y1 - y) - (y3 - y) * (x1 - x)) / d;
      const cc = 1 - a - b;
      if (a >= 0 && b >= 0 && cc >= 0) setPixel(x, y, c);
    }
}

// -------------------------------------------------------- bitmap font ----
type Glyph = string[];
const FONT: Record<string, Glyph> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#..##", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
  ":": [".....", ".##..", ".....", ".....", ".....", ".##..", "....."],
  ";": [".....", ".##..", ".....", ".....", ".....", ".##..", ".#..."],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "%": ["##..#", "##.#.", "....#", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
};
function drawGlyph(ch: string, x: number, y: number, s: number, hex: number): void {
  const g = FONT[ch] ?? FONT[" "];
  const c = rgb(hex);
  for (let r = 0; r < 7; r++)
    for (let col = 0; col < 5; col++)
      if (g[r][col] === "#")
        for (let dy = 0; dy < s; dy++)
          for (let dx = 0; dx < s; dx++) setPixel(x + col * s + dx, y + r * s + dy, c);
}
function textWidth(t: string, s: number): number {
  return t.length === 0 ? 0 : t.length * (5 * s + s) - s;
}
function drawText(t: string, x: number, y: number, s: number, hex: number): void {
  const up = t.toUpperCase();
  for (let i = 0; i < up.length; i++) drawGlyph(up[i], x + i * (5 * s + s), y, s, hex);
}
function drawTextCentered(t: string, cx: number, y: number, s: number, hex: number): void {
  drawText(t, cx - Math.floor(textWidth(t, s) / 2), y, s, hex);
}
// Word-wrap to lines that fit maxW pixels at scale s.
function wrap(t: string, s: number, maxW: number): string[] {
  const words = t.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, s) <= maxW || cur === "") cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// -------------------------------------------------------------- icons ----
function iconPlane(x: number, y: number, accent: number): void {
  fillRect(x, y, 56, 56, accent);
  triangle(x + 10, y + 40, x + 28, y + 12, x + 46, y + 40, 0xfbf8f1);
  fillRect(x + 25, y + 38, 6, 8, 0xfbf8f1);
  fillRect(x + 12, y + 30, 32, 3, 0xfbf8f1);
}
function iconPillars(x: number, y: number, accent: number): void {
  fillRect(x, y, 56, 56, accent);
  fillRect(x + 8, y + 12, 40, 6, 0xfbf8f1);
  for (let i = 0; i < 4; i++) fillRect(x + 10 + i * 10, y + 20, 5, 20, 0xfbf8f1);
  fillRect(x + 8, y + 42, 40, 5, 0xfbf8f1);
}
function iconChip(x: number, y: number, accent: number): void {
  fillRect(x, y, 56, 56, accent);
  for (let i = 0; i < 3; i++) {
    fillRect(x + 6, y + 14 + i * 12, 6, 4, 0xfbf8f1);
    fillRect(x + 44, y + 14 + i * 12, 6, 4, 0xfbf8f1);
  }
  fillRect(x + 16, y + 14, 24, 28, 0xfbf8f1);
  fillRect(x + 22, y + 20, 12, 16, accent);
  fillRect(x + 25, y + 24, 6, 8, 0xfbf8f1);
}
function iconShop(x: number, y: number, accent: number): void {
  fillRect(x, y, 56, 56, accent);
  fillRect(x + 8, y + 14, 40, 8, 0xfbf8f1);
  for (let i = 0; i < 4; i++) fillRect(x + 8 + i * 10, y + 22, 10, 6, i % 2 ? 0xfbf8f1 : accent);
  fillRect(x + 12, y + 30, 32, 18, 0xfbf8f1);
  fillRect(x + 23, y + 36, 10, 12, accent);
}
function iconWarn(x: number, y: number, accent: number): void {
  fillRect(x, y, 56, 56, accent);
  triangle(x + 28, y + 10, x + 48, y + 44, x + 8, y + 44, 0xfbf8f1);
  fillRect(x + 26, y + 22, 4, 12, accent);
  fillRect(x + 26, y + 37, 4, 4, accent);
}
function iconPeople(x: number, y: number, accent: number): void {
  fillRect(x, y, 56, 56, accent);
  fillCircle(x + 20, y + 20, 7, 0xfbf8f1);
  fillCircle(x + 38, y + 20, 7, 0xfbf8f1);
  fillRect(x + 12, y + 30, 16, 14, 0xfbf8f1);
  fillRect(x + 30, y + 30, 16, 14, 0xfbf8f1);
}

// ------------------------------------------------------------- poster ----
const NAVY = 0x0e1c30;
const PAPER = 0xfbf8f1;
const INK = 0x14213a;
const MUTED = 0x5a6b80;
const GOLD = 0xe8a33d;

fillRect(0, 0, W, H, NAVY);
// gold rule under the header
fillRect(0, 182, W, 4, GOLD);
// thin frame
fillRect(0, 0, W, 6, GOLD);
fillRect(0, H - 6, W, 6, GOLD);

drawTextCentered("THE WORLD IN ONE DAY  -  WEDNESDAY", 512, 34, 2, 0x9fb4cc);
drawTextCentered("25 NOVEMBER 2026", 512, 62, 6, PAPER);
drawTextCentered("SIX STORIES THAT DEFINED THE DAY", 512, 136, 2, GOLD);

type Story = {
  tag: string;
  accent: number;
  icon: (x: number, y: number, a: number) => void;
  head: string;
  body: string;
  src: string;
};
const STORIES: Story[] = [
  {
    tag: "EUROPE / SECURITY",
    accent: 0x2f6fb2,
    icon: iconPlane,
    head: "NATO SENDS AWACS TO POLAND",
    body: "Early-warning jets head to Poland after Russian missiles and drones crossed allied airspace.",
    src: "SOURCE: NATO / JAGRAN JOSH",
  },
  {
    tag: "CHINA / POLITICS",
    accent: 0xb03a2e,
    icon: iconPillars,
    head: "SHANGHAI CHIEF UNDER PROBE",
    body: "Chen Jining, a Politburo member tipped for higher office, is investigated for suspected serious violations of discipline and law.",
    src: "SOURCE: REUTERS / XINHUA",
  },
  {
    tag: "U.S. / TECH",
    accent: 0x0e7a6b,
    icon: iconChip,
    head: "HUAWEI GUILTY IN U.S. COURT",
    body: "Brooklyn jury convicts Huawei on 10 of 12 counts: fraud, sanctions breaches, trade-secret theft.",
    src: "SOURCE: REUTERS / U.S. DOJ",
  },
  {
    tag: "LATIN AMERICA",
    accent: 0xc47a1a,
    icon: iconShop,
    head: "25 HELD HOSTAGE IN CARTAGENA",
    body: "Gunmen seize a supermarket after a failed robbery; five elderly women are freed as police surround it.",
    src: "SOURCE: AFP",
  },
  {
    tag: "MIDDLE EAST",
    accent: 0x8a5a00,
    icon: iconWarn,
    head: "ISRAEL: IRAN BUILDING CHEMICAL ARMS",
    body: "Israel's defence minister says Iran is developing chemical weapons, as tensions with Tehran and its allies keep the region on edge.",
    src: "SOURCE: CBS",
  },
  {
    tag: "GLOBAL / SOCIETY",
    accent: 0x6a4fa3,
    icon: iconPeople,
    head: "FIVE WOMEN KILLED EACH HOUR",
    body: "Partners or relatives killed five women an hour in 2025, the UN reports - a toll that barely moved.",
    src: "SOURCE: UNITED NATIONS",
  },
];

const CARD_W = 468;
const CARD_H = 246;
const GAP = 16;
const X0 = 36;
const Y0 = 200;
STORIES.forEach((s, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = X0 + col * (CARD_W + GAP);
  const y = Y0 + row * (CARD_H + GAP);
  fillRect(x, y, CARD_W, CARD_H, PAPER);
  fillRect(x, y, CARD_W, 6, s.accent);
  s.icon(x + 16, y + 20, s.accent);
  drawText(s.tag, x + 84, y + 24, 2, s.accent);
  drawText("0" + (i + 1), x + CARD_W - 52, y + 20, 3, 0xd8d2c4);
  const headLines = wrap(s.head, 3, CARD_W - 32);
  headLines.forEach((ln, li) => drawText(ln, x + 16, y + 92 + li * 26, 3, INK));
  const bodyTop = y + 92 + headLines.length * 26 + 8;
  const bodyLines = wrap(s.body, 2, CARD_W - 32).slice(0, 3); // never cover the source line
  bodyLines.forEach((ln, li) => drawText(ln, x + 16, bodyTop + li * 17, 2, MUTED));
  drawText(s.src, x + 16, y + CARD_H - 26, 1, 0x8a94a6);
});

drawTextCentered("REPORTED 25 NOVEMBER 2026  -  SOURCES: REUTERS, AFP, CBS, XINHUA, UNITED NATIONS", 512, 984, 1, 0x9fb4cc);

// -------------------------------------------------------------- write ----
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), encodePng(px));
