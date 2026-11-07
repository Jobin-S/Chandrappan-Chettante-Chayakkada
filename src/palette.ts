/** Design-system palette (GDD §8). The first six are the primary brand colours. */
export const PALETTE = {
  leaf: '#245C3C', // Banana Leaf Green – controls, shop trim
  gold: '#D99B46', // Chaya Gold – CTAs, coins, highlights
  cream: '#FFF1D5', // Warm Cream – UI and dialogue backgrounds
  wood: '#834A2C', // Wood Brown – wood, borders
  terracotta: '#DB6846', // Terracotta – warnings, negative reactions
  charcoal: '#27271F', // Charcoal – text and outlines
  mist: '#A7C9B8',
  forest: '#173D2C',
  rain: '#719EAC',
  softWhite: '#FFF9EC',
  success: '#428B55',
} as const;

/** Supporting scene tones derived from the palette (materials only, never UI). */
export const TONES = {
  woodLight: '#A8683F',
  woodMid: '#94573A',
  woodDark: '#5A311E',
  backing: '#3B2416',
  laterite: '#A65A3A',
  lateriteLight: '#B86E48',
  lateriteDark: '#8E4A2F',
  redOxide: '#8A3A2A',
  stone: '#5E5048',
  hearth: '#B4664A',
  skin: '#C98A5E',
  skinDark: '#B07047',
  blush: '#D98A6E',
  shirt: '#5E93B6',
  steel: '#B9C2C1',
  steelDark: '#7E8A8A',
  iron: '#34342D',
  brass: '#C9993F',
  brassDark: '#9C7430',
  grass: '#5F8F4B',
  teaLeaf: '#3F7D45',
  asphalt: '#474A42',
  soil: '#AF6A47',
  banana: '#E0BC3E',
  fried: '#C98230',
  friedDark: '#A8652A',
  glass: '#D6ECEE',
  tea: '#B97336',
  fire: '#FF8A3D',
  bulb: '#FFE1A0',
  coconut: '#6B4423',
} as const;
