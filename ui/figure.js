// The anatomical figure: one pictogram, front or back, with the working muscle in
// the accent colour. Replaces the pastel body PNGs (kept in img/ untouched).
// figure(primary, secondary) -> <svg class="figure">. Sizes via .s40/.s56/.s72/.s120.
const NS = 'http://www.w3.org/2000/svg';

// muscle key -> [view, class]
const MUSCLE_MAP = {
  chest: ['front', 'm-chest'], upper_chest: ['front', 'm-chest'],
  shoulders: ['front', 'm-delts'], side_delts: ['front', 'm-delts'],
  biceps: ['front', 'm-biceps'], forearms: ['front', 'm-forearms'],
  abs: ['front', 'm-abs'], quads: ['front', 'm-quads'],
  back: ['back', 'm-lats'], upper_back: ['back', 'm-traps'], rear_delts: ['back', 'm-delts'],
  triceps: ['back', 'm-triceps'], glutes: ['back', 'm-glutes'],
  hamstrings: ['back', 'm-hams'], calves: ['back', 'm-calves'],
};

// Silhouette shared by both views (viewBox 0 0 120 240, mirrored around x=60).
const BODY = [
  ['circle', { cx: 60, cy: 20, r: 12 }],
  ['rect', { x: 55, y: 30, width: 10, height: 10, rx: 3 }],
  ['path', { d: 'M34 40H86Q92 40 91 46L84 122Q83 129 76 129H44Q37 129 36 122L29 46Q28 40 34 40Z' }],
  ['path', { d: 'M20 47Q27 41 34 46L33 92Q27 98 20 92Z' }], ['path', { d: 'M100 47Q93 41 86 46L87 92Q93 98 100 92Z' }],
  ['rect', { x: 19, y: 91, width: 13, height: 50, rx: 6 }], ['rect', { x: 88, y: 91, width: 13, height: 50, rx: 6 }],
  ['circle', { cx: 25.5, cy: 146, r: 5.5 }], ['circle', { cx: 94.5, cy: 146, r: 5.5 }],
  ['rect', { x: 38, y: 126, width: 21, height: 62, rx: 9 }], ['rect', { x: 61, y: 126, width: 21, height: 62, rx: 9 }],
  ['rect', { x: 41, y: 186, width: 16, height: 44, rx: 7 }], ['rect', { x: 63, y: 186, width: 16, height: 44, rx: 7 }],
  ['rect', { x: 38, y: 228, width: 21, height: 8, rx: 4 }], ['rect', { x: 61, y: 228, width: 21, height: 8, rx: 4 }],
];

const FRONT = {
  'm-delts': [['ellipse', { cx: 31, cy: 48, rx: 10, ry: 8.5 }], ['ellipse', { cx: 89, cy: 48, rx: 10, ry: 8.5 }]],
  'm-chest': [
    ['path', { d: 'M38 48Q58 45 59 50V70Q58 78 47 77Q36 73 36 60Z' }],
    ['path', { d: 'M82 48Q62 45 61 50V70Q62 78 73 77Q84 73 84 60Z' }],
  ],
  'm-abs': [['rect', { x: 50, y: 80, width: 20, height: 44, rx: 6 }]],
  'm-biceps': [['rect', { x: 22, y: 53, width: 10, height: 34, rx: 5 }], ['rect', { x: 88, y: 53, width: 10, height: 34, rx: 5 }]],
  'm-forearms': [['rect', { x: 20.5, y: 97, width: 10, height: 38, rx: 5 }], ['rect', { x: 89.5, y: 97, width: 10, height: 38, rx: 5 }]],
  'm-quads': [['rect', { x: 41, y: 134, width: 15, height: 48, rx: 7 }], ['rect', { x: 64, y: 134, width: 15, height: 48, rx: 7 }]],
};

const BACK = {
  'm-traps': [['path', { d: 'M44 42H76L70 70Q60 77 50 70Z' }]],
  'm-lats': [
    ['path', { d: 'M36 60Q46 66 52 74L50 110Q42 112 38 105Z' }],
    ['path', { d: 'M84 60Q74 66 68 74L70 110Q78 112 82 105Z' }],
  ],
  'm-delts': [['ellipse', { cx: 31, cy: 48, rx: 10, ry: 8.5 }], ['ellipse', { cx: 89, cy: 48, rx: 10, ry: 8.5 }]],
  'm-triceps': [['rect', { x: 22, y: 53, width: 10, height: 34, rx: 5 }], ['rect', { x: 88, y: 53, width: 10, height: 34, rx: 5 }]],
  'm-glutes': [['rect', { x: 40, y: 110, width: 19, height: 24, rx: 9 }], ['rect', { x: 61, y: 110, width: 19, height: 24, rx: 9 }]],
  'm-hams': [['rect', { x: 41, y: 138, width: 15, height: 46, rx: 7 }], ['rect', { x: 64, y: 138, width: 15, height: 46, rx: 7 }]],
  'm-calves': [['rect', { x: 43, y: 190, width: 12, height: 34, rx: 6 }], ['rect', { x: 65, y: 190, width: 12, height: 34, rx: 6 }]],
};

const el = (tag, attrs) => {
  const node = document.createElementNS(NS, tag);
  for (const k in attrs) node.setAttribute(k, String(attrs[k]));
  return node;
};

export function figureView(muscle) {
  return MUSCLE_MAP[muscle]?.[0] || 'front';
}

/** primary: string[] of muscle keys (first decides the view); secondary: string[]. */
export function figure(primary = [], secondary = [], size = 's56') {
  const list = Array.isArray(primary) ? primary : [primary];
  const view = figureView(list[0]);
  const shapes = view === 'back' ? BACK : FRONT;
  const svg = el('svg', { viewBox: '0 0 120 240', 'aria-hidden': 'true', class: `figure ${size} view-${view}` });
  const body = el('g', { class: 'fig-body' });
  for (const [tag, attrs] of BODY) body.appendChild(el(tag, attrs));
  svg.appendChild(body);
  const paint = (keys, cls) => {
    for (const key of keys) {
      const entry = MUSCLE_MAP[key];
      if (!entry || entry[0] !== view) continue;
      const g = el('g', { class: `fig-muscle ${entry[1]} ${cls}` });
      for (const [tag, attrs] of shapes[entry[1]] || []) g.appendChild(el(tag, attrs));
      svg.appendChild(g);
    }
  };
  paint(Array.isArray(secondary) ? secondary : [secondary], 'is-secondary');
  paint(list, 'is-primary');
  return svg;
}
