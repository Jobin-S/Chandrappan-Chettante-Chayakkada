import * as THREE from 'three';
import { PALETTE } from './palette';

/** All textures are painted at runtime on canvases – no external assets. */

const HEAD = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const MAL = '"Noto Sans Malayalam", "Malayalam MN", "Malayalam Sangam MN", "Nirmala UI", "Kartika", sans-serif';

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, size: number, family: string, maxW: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
}

let soft: THREE.CanvasTexture | null = null;
/** White radial falloff used by steam, mist and glows. */
export function softTexture(): THREE.CanvasTexture {
  if (!soft) {
    soft = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
  return soft;
}

export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(4, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7C9E97');
    g.addColorStop(0.45, '#A3C3B6');
    g.addColorStop(0.7, PALETTE.mist);
    g.addColorStop(1, '#B9D3C6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function drawTeaGlass(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // steam
  ctx.strokeStyle = 'rgba(131,74,44,0.55)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const dx of [-14, 2, 18]) {
    ctx.beginPath();
    ctx.moveTo(dx, -46);
    ctx.bezierCurveTo(dx - 10, -60, dx + 10, -70, dx, -86);
    ctx.stroke();
  }
  // glass body
  ctx.beginPath();
  ctx.moveTo(-30, -38);
  ctx.lineTo(30, -38);
  ctx.lineTo(23, 44);
  ctx.lineTo(-23, 44);
  ctx.closePath();
  ctx.fillStyle = '#C07A3A';
  ctx.fill();
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(-29, -38, 58, 14);
  ctx.lineWidth = 5;
  ctx.strokeStyle = PALETTE.charcoal;
  ctx.stroke();
  ctx.restore();
}

/** Shop nameboard. The last word of the name becomes the big headline. */
export function signboardTexture(shopName: string): THREE.CanvasTexture {
  return canvasTexture(1280, 244, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.cream;
    ctx.fillRect(0, 0, w, h);
    // faint painted-wood grain
    ctx.strokeStyle = 'rgba(131,74,44,0.07)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      const y = 14 + i * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 80) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 4);
      ctx.stroke();
    }
    ctx.lineWidth = 14;
    ctx.strokeStyle = PALETTE.leaf;
    ctx.beginPath();
    ctx.roundRect(10, 10, w - 20, h - 20, 20);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.roundRect(28, 28, w - 56, h - 56, 12);
    ctx.stroke();

    drawTeaGlass(ctx, 112, 136, 1);
    drawTeaGlass(ctx, w - 112, 136, 1);

    const words = shopName.trim().toUpperCase().split(/\s+/);
    const big = words.length > 1 ? words.pop()! : words[0] ?? '';
    const small = words.join(' ');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (small) {
      fitFont(ctx, small, 'bold', 46, HEAD, 860);
      ctx.fillStyle = PALETTE.wood;
      ctx.fillText(small, w / 2, 70);
    }
    fitFont(ctx, big, 'bold', 104, HEAD, 900);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(big, w / 2 + 4, (small ? 160 : 124) + 4);
    ctx.fillStyle = PALETTE.leaf;
    ctx.fillText(big, w / 2, small ? 160 : 124);
  });
}

export const MENU: [string, number][] = [
  ['Chaya', 15],
  ['Kattan Chaya', 12],
  ['Coffee', 20],
  ['Pazhampori', 20],
  ['Parippuvada', 15],
  ['Puttu', 40],
  ['Dosa', 50],
];

export function menuBoardTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 700, (ctx, w, h) => {
    ctx.fillStyle = '#2F3D33';
    ctx.fillRect(0, 0, w, h);
    const smudge = ctx.createRadialGradient(w * 0.4, h * 0.35, 20, w / 2, h / 2, w);
    smudge.addColorStop(0, 'rgba(255,255,255,0.08)');
    smudge.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = smudge;
    ctx.fillRect(0, 0, w, h);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 50px ${HEAD}`;
    ctx.fillText('INNATHE MENU', w / 2, 66);
    ctx.font = `600 30px ${MAL}`;
    ctx.fillStyle = 'rgba(255,241,213,0.8)';
    ctx.fillText('ചായ • പലഹാരം', w / 2, 118);

    ctx.font = `34px ${HEAD}`;
    MENU.forEach(([name, price], i) => {
      const y = 186 + i * 70;
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.cream;
      ctx.fillText(name, 46, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(`₹${price}`, w - 46, y);
      ctx.strokeStyle = 'rgba(255,241,213,0.18)';
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.moveTo(46, y + 28);
      ctx.lineTo(w - 46, y + 28);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  });
}

export function milestoneTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.softWhite;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.charcoal;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 50px ${HEAD}`;
    ctx.fillText('MUNNAR', w / 2, 70);
    ctx.font = `bold 120px ${HEAD}`;
    ctx.fillText('3', w / 2 - 20, 190);
    ctx.font = `bold 40px ${HEAD}`;
    ctx.fillText('km', w / 2 + 50, 215);
  });
}

export function calendarTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 340, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.softWhite;
    ctx.fillRect(0, 0, w, h);
    // little painting of hills
    ctx.fillStyle = '#A7C9B8';
    ctx.fillRect(12, 12, w - 24, 150);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(180, 60, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3F7D45';
    ctx.beginPath();
    ctx.moveTo(12, 162);
    ctx.quadraticCurveTo(80, 70, 150, 130);
    ctx.quadraticCurveTo(200, 95, 244, 120);
    ctx.lineTo(244, 162);
    ctx.fill();
    ctx.fillStyle = PALETTE.terracotta;
    ctx.fillRect(12, 168, w - 24, 34);
    ctx.fillStyle = PALETTE.softWhite;
    ctx.font = `bold 22px ${HEAD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOVEMBER', w / 2, 186);
    ctx.fillStyle = PALETTE.charcoal;
    ctx.font = `16px ${HEAD}`;
    for (let i = 0; i < 30; i++) {
      const c = i % 7;
      const r = Math.floor(i / 7);
      ctx.fillStyle = c === 0 ? PALETTE.terracotta : PALETTE.charcoal;
      ctx.fillText(String(i + 1), 34 + c * 32, 222 + r * 26);
    }
  });
}

export function busStopTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.leaf;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.softWhite;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 44px ${HEAD}`;
    ctx.fillText('BUS', w / 2, 96);
    ctx.fillText('STOP', w / 2, 146);
    ctx.font = `600 22px ${MAL}`;
    ctx.fillText('ബസ് സ്റ്റോപ്പ്', w / 2, 196);
  });
}

/** Bus destination board: amber letters on black. */
export function destinationTexture(text: string, mal: string): THREE.CanvasTexture {
  return canvasTexture(512, 96, (ctx, w, h) => {
    ctx.fillStyle = '#1B1B16';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFB13B';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 48px ${HEAD}`;
    ctx.textAlign = 'left';
    ctx.fillText(text, 20, h / 2 + 2);
    ctx.font = `600 34px ${MAL}`;
    ctx.textAlign = 'right';
    ctx.fillText(mal, w - 20, h / 2 + 2);
  });
}

/** A fictional local newspaper page. */
export function newspaperTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 180, (ctx, w, h) => {
    ctx.fillStyle = '#EFE9DA';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.charcoal;
    ctx.textAlign = 'center';
    ctx.font = `bold 22px Georgia, serif`;
    ctx.fillText('MUNNAR VARTHA', w / 2, 24);
    ctx.font = `600 13px ${MAL}`;
    ctx.fillText('മൂന്നാർ വാർത്ത', w / 2, 42);
    ctx.fillRect(10, 50, w - 20, 2);
    ctx.font = `bold 15px Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Mazha thudarum!', 12, 70);
    ctx.fillStyle = '#9A9486';
    ctx.fillRect(12, 80, 100, 64);
    ctx.fillStyle = 'rgba(39,39,31,0.55)';
    for (let i = 0; i < 9; i++) ctx.fillRect(122, 80 + i * 8, w - 134 - (i % 3) * 10, 3);
    for (let i = 0; i < 3; i++) ctx.fillRect(12, 152 + i * 8, w - 24 - i * 20, 3);
  });
}
