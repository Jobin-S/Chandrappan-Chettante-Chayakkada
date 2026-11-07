import type { StationId } from './types';

/**
 * Menu + preparation definitions. Every item uses the same step system:
 * a recipe is an ordered list of station actions, some of them timed.
 */

export type RecipeId = 'chaya' | 'kattan' | 'coffee' | 'pazhampori' | 'parippuvada' | 'puttu' | 'dosa';
export type CookMode = 'simple' | 'advanced';

export interface Action {
  id: string;
  label: string;
  /** Colour of the ingredient chip / button accent. */
  color: string;
}

export interface Step {
  action: string;
  /** Seconds for timed steps (boil, fry, steam…). */
  duration?: number;
  /** Shown when the player clicks something else instead. */
  why: string;
}

export interface Recipe {
  id: RecipeId;
  name: string;
  malayalam: string;
  price: number;
  station: StationId;
  /** Verb for the simple-mode cook step. */
  cookVerb: string;
  steps: Step[];
}

export const STATION_ACTIONS: Record<StationId, Action[]> = {
  chaya: [
    { id: 'water', label: 'Add water', color: '#719EAC' },
    { id: 'tea', label: 'Add tea dust', color: '#4A2E1E' },
    { id: 'coffee', label: 'Add coffee powder', color: '#5C3A24' },
    { id: 'sugar', label: 'Add sugar', color: '#EDE3CC' },
    { id: 'milk', label: 'Add milk', color: '#FFF9EC' },
    { id: 'boil', label: 'Boil', color: '#DB6846' },
    { id: 'heat', label: 'Heat briefly', color: '#D99B46' },
    { id: 'pour', label: 'Pull & pour', color: '#B97336' },
  ],
  fryer: [
    { id: 'banana', label: 'Take banana', color: '#E0BC3E' },
    { id: 'dal', label: 'Take dal mix', color: '#D9A441' },
    { id: 'batter', label: 'Dip in batter', color: '#F0D49A' },
    { id: 'shape', label: 'Shape vada', color: '#C98230' },
    { id: 'oil', label: 'Fry in oil', color: '#C98B2E' },
    { id: 'flip', label: 'Flip', color: '#834A2C' },
  ],
  tawa: [
    { id: 'pour', label: 'Pour batter', color: '#F0D49A' },
    { id: 'spread', label: 'Spread batter', color: '#E3B465' },
    { id: 'ghee', label: 'Drizzle ghee', color: '#D99B46' },
    { id: 'cook', label: 'Cook', color: '#DB6846' },
    { id: 'flip', label: 'Flip', color: '#834A2C' },
  ],
  puttu: [
    { id: 'water', label: 'Fill pot water', color: '#719EAC' },
    { id: 'podi', label: 'Add puttu podi', color: '#EFE6D2' },
    { id: 'coconut', label: 'Add coconut', color: '#FFF9EC' },
    { id: 'steam', label: 'Steam', color: '#B9C2C1' },
  ],
};

export const RECIPES: Record<RecipeId, Recipe> = {
  chaya: {
    id: 'chaya',
    name: 'Chaya',
    malayalam: 'ചായ',
    price: 15,
    station: 'chaya',
    cookVerb: 'Brew',
    steps: [
      { action: 'water', why: 'Every chaya starts with water in the kettle.' },
      { action: 'tea', why: 'Tea dust goes into the water before boiling.' },
      { action: 'sugar', why: 'Add sugar to the decoction.' },
      { action: 'boil', duration: 2.4, why: 'Boil the decoction so it gets strong.' },
      { action: 'milk', why: 'Milk goes in after the decoction boils.' },
      { action: 'heat', duration: 1.4, why: 'Heat briefly so the milk froths.' },
      { action: 'pour', why: 'Pull it high and pour into the glass!' },
    ],
  },
  kattan: {
    id: 'kattan',
    name: 'Kattan Chaya',
    malayalam: 'കട്ടൻ ചായ',
    price: 12,
    station: 'chaya',
    cookVerb: 'Brew',
    steps: [
      { action: 'water', why: 'Kattan starts with water in the kettle.' },
      { action: 'tea', why: 'Tea dust goes in next.' },
      { action: 'sugar', why: 'A spoon of sugar before boiling.' },
      { action: 'boil', duration: 2.2, why: 'Boil it strong and dark.' },
      { action: 'pour', why: 'No milk in kattan! Pour it straight.' },
    ],
  },
  coffee: {
    id: 'coffee',
    name: 'Coffee',
    malayalam: 'കാപ്പി',
    price: 20,
    station: 'chaya',
    cookVerb: 'Brew',
    steps: [
      { action: 'coffee', why: 'Coffee powder goes in first.' },
      { action: 'milk', why: 'Mix the coffee with milk.' },
      { action: 'sugar', why: 'Sweeten the coffee.' },
      { action: 'heat', duration: 2.0, why: 'Heat the coffee and milk together.' },
      { action: 'pour', why: 'Pour it into the tumbler.' },
    ],
  },
  pazhampori: {
    id: 'pazhampori',
    name: 'Pazhampori',
    malayalam: 'പഴംപൊരി',
    price: 20,
    station: 'fryer',
    cookVerb: 'Fry',
    steps: [
      { action: 'banana', why: 'Start with a sliced ripe banana.' },
      { action: 'batter', why: 'Dip the banana in maida batter.' },
      { action: 'oil', duration: 2.6, why: 'Slide it into the hot oil.' },
      { action: 'flip', duration: 1.8, why: 'Flip it so both sides turn golden.' },
    ],
  },
  parippuvada: {
    id: 'parippuvada',
    name: 'Parippuvada',
    malayalam: 'പരിപ്പുവട',
    price: 15,
    station: 'fryer',
    cookVerb: 'Fry',
    steps: [
      { action: 'dal', why: 'Start with the ground dal mixture.' },
      { action: 'shape', why: 'Pat it into a flat round vada.' },
      { action: 'oil', duration: 2.6, why: 'Fry it in hot oil.' },
      { action: 'flip', duration: 1.8, why: 'Flip for an even crunch.' },
    ],
  },
  puttu: {
    id: 'puttu',
    name: 'Puttu',
    malayalam: 'പുട്ട്',
    price: 40,
    station: 'puttu',
    cookVerb: 'Steam',
    steps: [
      { action: 'water', why: 'The pot needs water to make steam.' },
      { action: 'podi', why: 'Layer the moistened puttu podi.' },
      { action: 'coconut', why: 'Add grated coconut between layers.' },
      { action: 'steam', duration: 3.0, why: 'Steam it until it is soft.' },
    ],
  },
  dosa: {
    id: 'dosa',
    name: 'Dosa',
    malayalam: 'ദോശ',
    price: 50,
    station: 'tawa',
    cookVerb: 'Cook',
    steps: [
      { action: 'pour', why: 'Pour a ladle of batter on the hot tawa.' },
      { action: 'spread', why: 'Spread the batter in circles.' },
      { action: 'ghee', why: 'A drizzle of ghee makes it crisp.' },
      { action: 'cook', duration: 2.2, why: 'Let it cook until golden.' },
      { action: 'flip', duration: 1.4, why: 'Flip it once.' },
    ],
  },
};

export const RECIPE_LIST: Recipe[] = Object.values(RECIPES);

const SIMPLE_ACTIONS: Action[] = [
  { id: 'prepare', label: 'Prepare', color: '#428B55' },
  { id: 'cook', label: 'Cook', color: '#DB6846' },
];

export function recipesAt(station: StationId): Recipe[] {
  return RECIPE_LIST.filter((r) => r.station === station);
}

export function actionsFor(station: StationId, mode: CookMode): Action[] {
  return mode === 'simple' ? SIMPLE_ACTIONS : STATION_ACTIONS[station];
}

export function stepsFor(recipe: Recipe, mode: CookMode): Step[] {
  if (mode === 'advanced') return recipe.steps;
  const total = recipe.steps.reduce((s, x) => s + (x.duration ?? 0), 0);
  return [
    { action: 'prepare', why: 'Gather the ingredients first.' },
    { action: 'cook', duration: Math.max(2, total * 0.8), why: `${recipe.cookVerb} it now.` },
  ];
}

export function actionLabel(station: StationId, mode: CookMode, id: string, recipe?: Recipe): string {
  if (mode === 'simple' && id === 'cook' && recipe) return recipe.cookVerb;
  return actionsFor(station, mode).find((a) => a.id === id)?.label ?? id;
}
