import fifa from "@/assets/games/fifa.jpg";
import efootball from "@/assets/games/efootball.jpg";
import cod from "@/assets/games/cod.jpg";
import pubg from "@/assets/games/pubg.jpg";
import freeFire from "@/assets/games/free-fire.jpg";
import fortnite from "@/assets/games/fortnite.jpg";
import tour1 from "@/assets/banners/tournament-1.jpg";
import tour2 from "@/assets/banners/tournament-2.jpg";
import pred1 from "@/assets/banners/prediction-1.jpg";
import chal1 from "@/assets/banners/challenge-1.jpg";

export const GAME_COVER: Record<string, string> = {
  "fifa-24": fifa,
  "efootball": efootball,
  "cod": cod,
  "pubg-mobile": pubg,
  "free-fire": freeFire,
  "fortnite": fortnite,
};

const FALLBACKS = [fifa, cod, pubg, fortnite, efootball, freeFire];

export function gameCover(slug?: string | null, key?: string) {
  if (slug && GAME_COVER[slug]) return GAME_COVER[slug];
  const k = (key ?? slug ?? "").toString();
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length];
}

export const TOURNAMENT_BANNERS = [tour1, tour2];
export const PREDICTION_BANNERS = [pred1];
export const CHALLENGE_BANNERS = [chal1];

export function pickBanner(list: string[], key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
