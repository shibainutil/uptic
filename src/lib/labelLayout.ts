export interface LabelRequest {
  key: string;
  /** Where the label's vertical center would ideally sit. */
  y: number;
}

/**
 * Places same-height labels along one axis so that none of them overlap, each staying as
 * close as possible to its desired position, all within [minY, maxY].
 *
 * Labels are taken in order of desired position. Whenever a label would collide with the
 * group above it, the two merge into one stacked group, and that group is re-centred on the
 * average of its members' desired positions (the least-squares optimum), then clamped to the
 * bounds. Merging repeats until nothing collides. Unlike a fixed offset, this keeps labels
 * that aren't crowded exactly where they belong and spreads crowded ones evenly around them.
 *
 * Input order breaks ties: when two labels want the same spot, the earlier one goes on top.
 * Returns each label's resolved center y.
 */
export function layoutLabels(
  requests: LabelRequest[],
  height: number,
  gap: number,
  minY: number,
  maxY: number,
): Map<string, number> {
  const step = height + gap;
  const sorted = requests
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => a.y - b.y || a.i - b.i);

  interface Group { items: typeof sorted; top: number }

  function place(g: Group) {
    const n = g.items.length;
    const totalHeight = n * height + (n - 1) * gap;
    // Top that minimises total squared distance between each label and its desired center.
    let top = g.items.reduce((acc, it, idx) => acc + (it.y - height / 2 - idx * step), 0) / n;
    top = Math.min(top, maxY - totalHeight);
    top = Math.max(top, minY);
    g.top = top;
  }

  function bottom(g: Group) {
    return g.top + g.items.length * height + (g.items.length - 1) * gap;
  }

  const stack: Group[] = [];
  for (const item of sorted) {
    let g: Group = { items: [item], top: 0 };
    place(g);
    while (stack.length && bottom(stack[stack.length - 1]) + gap > g.top + 1e-6) {
      const prev = stack.pop()!;
      g = { items: [...prev.items, ...g.items], top: 0 };
      place(g);
    }
    stack.push(g);
  }

  const result = new Map<string, number>();
  for (const g of stack) {
    g.items.forEach((it, idx) => result.set(it.key, g.top + idx * step + height / 2));
  }
  return result;
}
