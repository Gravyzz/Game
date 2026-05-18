import Phaser from 'phaser';

/**
 * 8-битная плашка для кнопок: ступенчатый октагон в чёрной обводке,
 * со светлой «крышкой» сверху и тёмной гранью снизу для объёма.
 *
 * Все размеры кратны `step` — углы остаются хрустящими-пиксельными
 * на любом масштабе ScaleManager-а. Чем больше step и border, тем
 * «жирнее» и крупнее пиксель.
 */

export interface PixelButtonStyle {
  /** Размер одной «ступеньки» чамфера / толщина светлой и тёмной граней. */
  step?:    number;
  /** Толщина чёрной обводки (px). Должна быть кратна step. */
  border?:  number;
  /** Глубина среза внешнего угла (px). Должна быть кратна step. */
  corner?:  number;
  /** Цвет обводки (по умолчанию COLORS.black). */
  outline?: number;
}

/**
 * Рисует 8-битную кнопку в переданный Graphics. Координаты — от (0,0)
 * этого Graphics: позиционируй его сам (обычно `setPosition(-W/2, -H/2)`
 * для контейнера с origin в центре).
 */
export function drawPixelButton(
  g:       Phaser.GameObjects.Graphics,
  width:   number,
  height:  number,
  bgColor: number,
  style:   PixelButtonStyle = {},
): void {
  const STEP    = style.step    ?? 6;
  const BORDER  = style.border  ?? 6;
  const CORNER  = style.corner  ?? 18;
  const OUTLINE = style.outline ?? 0x0a0a0a;
  const INNER   = Math.max(0, CORNER - BORDER);
  const RIM     = STEP;

  const lighter = shade(bgColor,  0.34);
  const darker  = shade(bgColor, -0.28);

  // 1) Чёрный аутлайн — внешний ступенчатый октагон.
  drawStepRect(g, 0, 0, width, height, CORNER, STEP, OUTLINE);

  // 2) Тело основным цветом — внутри обводки.
  drawStepRect(
    g,
    BORDER, BORDER,
    width - 2 * BORDER, height - 2 * BORDER,
    INNER, STEP,
    bgColor,
  );

  // 3) Верхняя светлая грань — 2 ступеньки, повторяют чамфер тела.
  g.fillStyle(lighter, 1);
  g.fillRect(BORDER + INNER, BORDER,        width - 2 * (BORDER + INNER), RIM);
  g.fillRect(BORDER + STEP,  BORDER + RIM,  width - 2 * (BORDER + STEP),  RIM);

  // 4) Нижняя тёмная грань — зеркально.
  g.fillStyle(darker, 1);
  g.fillRect(BORDER + STEP,  height - BORDER - 2 * RIM, width - 2 * (BORDER + STEP),  RIM);
  g.fillRect(BORDER + INNER, height - BORDER - RIM,     width - 2 * (BORDER + INNER), RIM);
}

/**
 * Ступенчатый прямоугольник со срезанными углами. `corner` — глубина среза,
 * `step` — высота одной ступеньки. При corner=18, step=6 → 3 ступеньки.
 */
function drawStepRect(
  g:      Phaser.GameObjects.Graphics,
  x:      number, y: number,
  w:      number, h: number,
  corner: number, step: number,
  color:  number,
): void {
  if (w <= 0 || h <= 0) return;
  g.fillStyle(color, 1);
  const steps = Math.max(0, Math.floor(corner / step));
  for (let i = 0; i < steps; i++) {
    const inset = corner - i * step;
    g.fillRect(x + inset, y + i * step, w - inset * 2, step);
  }
  const midY = y + steps * step;
  const midH = h - 2 * steps * step;
  if (midH > 0) g.fillRect(x, midY, w, midH);
  for (let i = 0; i < steps; i++) {
    const inset = (i + 1) * step;
    g.fillRect(x + inset, midY + Math.max(0, midH) + i * step, w - inset * 2, step);
  }
}

/** Осветляет (amount > 0) или затемняет (amount < 0) цвет, amount ∈ [-1, 1]. */
function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8)  & 0xff;
  const b =  color        & 0xff;
  const adjust = (c: number): number => amount >= 0
    ? Math.min(255, Math.round(c + (255 - c) * amount))
    : Math.max(0,   Math.round(c * (1 + amount)));
  return (adjust(r) << 16) | (adjust(g) << 8) | adjust(b);
}
