import type { RecipeId } from './recipes';

/** Tiny hand-drawn SVG illustrations of each menu item (no image assets). */

const INK = '#27271F';
const STEAM = `<path d="M18 9c-3 3 3 5 0 9M24 7c-3 3 3 5 0 9M30 9c-3 3 3 5 0 9" stroke="#834A2C" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".55"/>`;
const PLATE = `<ellipse cx="24" cy="34" rx="19" ry="7" fill="#B9C2C1" stroke="${INK}" stroke-width="2.2"/><ellipse cx="24" cy="33" rx="13" ry="4" fill="#CFD6D5"/>`;

const ART: Record<RecipeId, string> = {
  chaya: `${STEAM}<path d="M14 20h20l-3 22H17z" fill="#C07A3A"/><path d="M14 20h20l-.7 5H14.7z" fill="#FFF1D5"/><path d="M14 20h20l-3 22H17z" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  kattan: `${STEAM}<path d="M14 20h20l-3 22H17z" fill="#7A3A16"/><path d="M14 20h20l-3 22H17z" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="33" cy="21" r="5" fill="#E8D04A" stroke="${INK}" stroke-width="1.8"/>`,
  coffee: `${STEAM}<ellipse cx="24" cy="38" rx="16" ry="5.5" fill="#B9C2C1" stroke="${INK}" stroke-width="2.2"/><path d="M16 18h16l-2 20H18z" fill="#C9D0CF" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="24" cy="18" rx="8" ry="2.5" fill="#A0683A" stroke="${INK}" stroke-width="1.8"/>`,
  pazhampori: `${PLATE}<ellipse cx="18" cy="27" rx="11" ry="5" transform="rotate(-18 18 27)" fill="#D99B46" stroke="${INK}" stroke-width="2.2"/><ellipse cx="30" cy="25" rx="11" ry="5" transform="rotate(14 30 25)" fill="#C98230" stroke="${INK}" stroke-width="2.2"/>`,
  parippuvada: `${PLATE}<circle cx="24" cy="25" r="11" fill="#B0702E" stroke="${INK}" stroke-width="2.2"/><circle cx="20" cy="22" r="1.6" fill="#E3B465"/><circle cx="27" cy="21" r="1.4" fill="#E3B465"/><circle cx="25" cy="28" r="1.6" fill="#E3B465"/><circle cx="19" cy="28" r="1.2" fill="#7A4424"/>`,
  puttu: `<ellipse cx="24" cy="35" rx="21" ry="8" fill="#4F8F3F" stroke="${INK}" stroke-width="2.2"/><rect x="9" y="19" width="30" height="13" rx="6.5" fill="#FFF9EC" stroke="${INK}" stroke-width="2.2"/><path d="M17 19.5v12M24 19.5v12M31 19.5v12" stroke="#D9C8A0" stroke-width="3"/>`,
  dosa: `${PLATE}<path d="M7 31L41 20l-2 12z" fill="#D9A250" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="14" cy="22" r="4.5" fill="#EFE9D0" stroke="${INK}" stroke-width="1.8"/>`,
};

export function foodIcon(id: RecipeId, size = 40): string {
  return `<svg class="food-icon" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${ART[id]}</svg>`;
}
