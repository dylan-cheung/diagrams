export type Point = { x: number; y: number };

export type Box = { x: number; y: number; width: number; height: number };

export type ParallelSlot = { index: number; count: number };

const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

export const boxBorderPoint = (box: Box, toward: Point): Point => {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scale = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
};

export const parallelOffset = ({ index, count }: ParallelSlot, spacing = 36) => (index - (count - 1) / 2) * spacing;

export const edgePath = (sourceBox: Box, targetBox: Box, slot: ParallelSlot, flip: boolean) => {
  const sc = center(sourceBox);
  const tc = center(targetBox);
  const length = Math.hypot(tc.x - sc.x, tc.y - sc.y);
  const nx = length === 0 ? 0 : -(tc.y - sc.y) / length;
  const ny = length === 0 ? 0 : (tc.x - sc.x) / length;
  const offset = parallelOffset(slot) * (flip ? -1 : 1);
  const control = { x: (sc.x + tc.x) / 2 + nx * offset * 2, y: (sc.y + tc.y) / 2 + ny * offset * 2 };
  const start = boxBorderPoint(sourceBox, offset === 0 ? tc : control);
  const end = boxBorderPoint(targetBox, offset === 0 ? sc : control);
  const label = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };
  const path = offset === 0 ? `M${start.x} ${start.y} L${end.x} ${end.y}` : `M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`;
  return { path, label };
};

export const loopPath = (box: Box, slot: ParallelSlot) => {
  const size = 28 + slot.index * 18;
  const startX = box.x + box.width - 26;
  const endX = box.x + box.width;
  const startY = box.y;
  const endY = box.y + 22;
  const path = `M${startX} ${startY} C${startX + size * 0.2} ${startY - size * 1.6}, ${endX + size * 1.6} ${endY - size * 0.2}, ${endX} ${endY}`;
  return { path, label: { x: endX + size * 0.55, y: startY - size * 0.55 } };
};

export const assignParallelSlots = (edges: { id: string; source: string; target: string }[]) => {
  const groups = new Map<string, string[]>();
  for (const edge of edges) {
    const key = edge.source === edge.target ? `loop:${edge.source}` : [edge.source, edge.target].sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), edge.id]);
  }
  const slots = new Map<string, ParallelSlot>();
  for (const ids of groups.values()) ids.forEach((id, index) => slots.set(id, { index, count: ids.length }));
  return slots;
};
