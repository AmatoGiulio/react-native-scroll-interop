export type Photo = {
  id: string;
  uri: string;
  title: string;
  author: string;
  tint: string;
};

const TINTS = [
  '#2E3440',
  '#3B4252',
  '#434C5E',
  '#4C566A',
  '#5E81AC',
  '#81A1C1',
  '#88C0D0',
  '#8FBCBB',
];

const TITLES = [
  'Harbour lights',
  'Terrace',
  'Long exposure',
  'Salt flats',
  'Low tide',
  'Rooftops',
  'Winter pass',
  'Blue hour',
  'Dune ridge',
  'Old town',
];

const AUTHORS = ['A. Rossi', 'M. Conti', 'L. Ferrari', 'S. Greco', 'D. Marino'];

/**
 * A deliberately large dataset: the interop only gets interesting once a list is long enough to
 * fling for a while, and once recycling is actually happening.
 */
export const PHOTOS: Photo[] = Array.from({ length: 240 }, (_, index) => ({
  id: `photo-${index}`,
  // Seeded so every run renders the same grid, which makes screenshot comparison meaningful.
  uri: `https://picsum.photos/seed/mt${index}/400/400`,
  title: TITLES[index % TITLES.length],
  author: AUTHORS[index % AUTHORS.length],
  tint: TINTS[index % TINTS.length],
}));
