import type { Scene } from "@/src/types";

export const LOGO_SHUFFLE_LINES: string[] = [
  "That's a wrap on another explosive week of action!",
  "The numbers don't lie — this week's stats speak for themselves.",
  "From clutch plays to jaw-dropping moments, what a week it's been!",
  "Another week in the books, and the competition only gets fiercer.",
  "Champions are made in moments like these — see you next week!",
  "The leaderboard has been shaken — who will rise to the top?",
  "Seven days, zero chill — this week had it all.",
  "Records were broken, legends were made. See you on the battlefield.",
  "The dust has settled, but the rivalry is far from over.",
  "Week after week, the bar keeps getting raised higher.",
  "Incredible performances, unforgettable moments — that's the weekly breakdown!",
  "The grind never stops, and neither do our players.",
  "Another chapter written in the history of this season.",
  "Top-tier talent on full display — what a week to be a fan.",
  "Hard-fought battles, elite plays, and a leaderboard in flames.",
  "Stats, highlights, and bragging rights — it's all here in the weekly rundown.",
  "The competition is relentless and the results are in!",
  "Every week is a new chance to prove greatness — some delivered big.",
  "That's the whistle on Week. Stay tuned, stay sharp, stay hungry.",
  "From the opening shot to the final kill — this week was electric.",
  "The scoreboard doesn't tell the whole story — but it comes close.",
  "Another week of carnage wrapped up in the books.",
  "No days off, no excuses — just results. Here's your weekly breakdown.",
  "The competition showed up. Did your favourites deliver?",
  "Clutch moments, big kills, and a leaderboard that keeps shifting.",
  "Week done. Legends logged. See you in the next one.",
  "Some weeks are good. This one was something else entirely.",
  "The grind is relentless — and so are the players at the top.",
  "Bold plays, bold stats, bold week. That's a wrap.",
  "When the dust cleared, only the best remained on top.",
  "Every week writes a new story. Here's this chapter.",
  "Another seven days of non-stop action put to rest.",
  "The weekly verdict is in — and it was not pretty for some.",
  "Respect to everyone who showed up and showed out this week.",
  "A week full of highlights and hard lessons. Check the stats.",
  "No mercy was shown on the battlefield this week.",
  "Fast-paced, high-stakes, and impossible to look away.",
  "This week separated the contenders from the pretenders.",
  "The numbers have been crunched — the results are jaw-dropping.",
  "Week after week, this community never fails to deliver.",
  "Big names stepped up. Underdogs surprised. Classic week.",
  "The plays of the week lived up to every bit of the hype.",
  "Whether you topped the board or not, the grind continues.",
  "Seven days of competition distilled into one weekly highlight.",
  "The battlefield was busy this week — and the stats prove it.",
];

export type AutomateParser = (text: string, currentScenes: Scene[]) => Scene[];

type Pair = { username: string; number: string };

const extractPair = (text: string, sectionPattern: string): Pair | null => {
  const sec = text.match(
    new RegExp(sectionPattern + "[\\s\\S]*?(?=Users with|Highest|Most active|$)", "i"),
  );
  if (!sec) return null;
  const m = sec[0].match(/1\.\s*(.+?)\s*\((\d+)/);
  if (!m) return null;
  return { username: m[1].trim(), number: m[2] };
};

const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const formatDate = (d: Date) => `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}`;

const buildStatsText = (pairs: (Pair | null)[]): string | null => {
  if (!pairs.some((p) => p)) return null;
  const users = pairs.map((p) => p?.username ?? "").join("|");
  const nums = pairs.map((p) => p?.number ?? "").join("|");
  return `${users}\n${nums}`;
};

export const parseWeeklyReport: AutomateParser = (text, currentScenes) => {
  // Date range
  let titleText: string | null = null;
  const dateMatch = text.match(/\((\w+ \d{1,2},\s*\d{4})\s*[-–]\s*(\w+ \d{1,2},\s*\d{4})\)/);
  if (dateMatch) {
    const d1 = new Date(dateMatch[1]);
    const d2 = new Date(dateMatch[2]);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      titleText = `${formatDate(d1)} \u2013 ${formatDate(d2)}`;
    }
  }

  const ks = extractPair(text, "Users with the highest current killstreaks");
  const king = extractPair(text, "Most active genre kings");

  const stats1 = [
    extractPair(text, "Users with the most total battles"),
    extractPair(text, "Users with the most battle wins"),
    extractPair(text, "Users with the most plays on their battle beats"),
  ];
  const stats2 = [
    extractPair(text, "Users with the most votes cast"),
    extractPair(text, "Users with the most battle comments"),
    extractPair(text, "Highest XP earners"),
  ];

  const stats1Text = buildStatsText(stats1);
  const stats2Text = buildStatsText(stats2);

  // Scene index → new text (only overwrite when parser produced a value).
  // Order matches the Weekly Report preset:
  //   0: Weekly Title, 1: Weekly Stats 1, 2: Killstreak,
  //   3: Weekly Stats 2, 4: King, 5: Outro
  const updates: Record<number, string | null> = {
    0: titleText,
    1: stats1Text,
    2: ks ? `${ks.number}|${ks.username}` : null,
    3: stats2Text,
    4: king ? `${king.number}|${king.username}` : null,
  };

  return currentScenes.map((scene, i) => {
    const next = updates[i];
    return next != null ? { ...scene, text: next } : scene;
  });
};

export const AUTOMATE_PARSERS: Record<string, { label: string; parser: AutomateParser }> = {
  "Weekly Report": { label: "Automate Weekly Report", parser: parseWeeklyReport },
};
