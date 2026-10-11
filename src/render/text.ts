import * as THREE from 'three';

/** Sprite con testo disegnato su canvas, sempre rivolto alla camera. */
export function textSprite(text: string, color: string, height = 0.45, bold = true): THREE.Sprite {
  const fontPx = 96;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${bold ? '700' : '500'} ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 32;
  canvas.width = w;
  canvas.height = fontPx + 32;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(8, 12, 22, 0.85)';
  ctx.strokeText(text, w / 2, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set((height * w) / canvas.height, height, 1);
  return sprite;
}
