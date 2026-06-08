// Shared utilities for all media data sources (YouTube, TikTok, Spotify, scraper).
// Single source of truth — do not duplicate these in platform-specific files.

export const GRADIENTS = [
  'linear-gradient(145deg, #0f0722 0%, #1e0a3d 40%, #2d1054 70%, #0a0515 100%)',
  'linear-gradient(145deg, #1a0900 0%, #4a1500 40%, #7c2d12 70%, #1c0800 100%)',
  'linear-gradient(145deg, #062b33 0%, #0c4a55 40%, #0e7490 60%, #031a1f 100%)',
  'linear-gradient(145deg, #001a33 0%, #002d52 40%, #004880 60%, #000f1a 100%)',
  'linear-gradient(145deg, #1a0033 0%, #2d0052 40%, #4a1080 60%, #0d001a 100%)',
  'linear-gradient(145deg, #001a0f 0%, #002d1f 40%, #004a30 60%, #000f08 100%)',
  'linear-gradient(145deg, #2d0018 0%, #520030 40%, #7a0047 60%, #1a000f 100%)',
  'linear-gradient(145deg, #150900 0%, #2d1400 40%, #4a1f00 60%, #0d0600 100%)',
  'linear-gradient(145deg, #000d1a 0%, #001533 40%, #00224d 60%, #000610 100%)',
]

export function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0
  return Math.abs(h)
}

export function buildGrowthHistory(views: number, id: string, power = 1.8): number[] {
  const h = hash(id)
  const arr = Array.from({ length: 7 }, (_, i) => {
    const progress = (i + 1) / 7
    return Math.round(views * Math.pow(progress, power) * (1 + Math.sin(h + i) * 0.05))
  })
  arr[6] = views
  return arr
}

const MUSIC_POSITIVE = /\bsong\b|music|lyric|sing|sang|\bvoice\b|vocal|artist|\bband\b|album|\bep\b|single|\bcover\b|acoustic|guitar|piano|drum|\bbeat\b|prod\b|studio|record|original|chord|melody|harmony|chorus|verse|hook|track|release|singer|rapper|songwriter|musician|performer|wrote this|i made this|my original|i produced|i wrote|one take|no autotune|bedroom pop|home studio|raw vocal/i

const MUSIC_GENRES = /country|hip.?hop|hiphop|\brap\b|r&b|\brnb\b|\bsoul\b|\bpop\b|\bindie\b|\bfolk\b|\bjazz\b|blues|\brock\b|punk|metal|edm|electronic|reggae|latin|afrobeats|kpop|lofi|lo.?fi|bedroom.?pop|alternative/i

const MUSIC_HASHTAGS = /musictok|musicdiscovery|newartist|originalmusic|singersongwriter|newmusic|indieartist|unsigned|independentartist|coverfyp|acousticcover|singingchallenge|originallyric|voicecheck|artistcheck|bedroomproducer/i

const NON_MUSIC = /\bgaming\b|minecraft|fortnite|roblox|valorant|makeup|skincare|foundation|eyeliner|recipe|cooking|baking|fitness|workout|gym|crossfit|\bnba\b|\bnfl\b|\bnhl\b|react.?to|reaction.?video|storytime|prank|comedy.?skit|life.?hack|cleaning|asmr.?eat|mukbang/i

// Returns true if the joined post text (caption + hashtags + audio) looks like music content.
export function isMusicContent(text: string): boolean {
  if (NON_MUSIC.test(text)) return false
  return MUSIC_POSITIVE.test(text) || MUSIC_GENRES.test(text) || MUSIC_HASHTAGS.test(text)
}

// Looser check for keyword-found content — the search query already filtered for music,
// so we only need to reject obvious false positives (gaming, makeup, cooking, etc.)
export function isDefinitelyNotMusic(text: string): boolean {
  return NON_MUSIC.test(text)
}

// Infer music niche(s) from joined free text (hashtags, title, caption, genre tags).
export function inferNiche(text: string): string[] {
  const t = text.toLowerCase()
  const niches: string[] = []
  if (/country|nashville|twang|bluegrass|americana|country.?music/.test(t)) niches.push('country')
  if (/\brap\b|hip.?hop|hiphop|\btrap\b|freestyle|drill|\bmc\b|rapper|bars/.test(t)) niches.push('rap', 'hip-hop')
  if (/r&b|rnb|rhythm.?and.?blues|neo.?soul|soul.?music|\bsoul\b|urban|gospel|church/.test(t)) niches.push('r&b', 'soul')
  if (/\bindie\b|alternative|bedroom.?pop|indie.?pop|indie.?rock|lo.?fi|dream.?pop/.test(t)) niches.push('indie')
  if (/producer|beat.?mak|type.?beat|instrumental|808|sample|cookup/.test(t)) niches.push('producer')
  if (/\bpop\b|pop.?music|synth.?pop|dance.?pop/.test(t)) niches.push('pop')
  if (/edm|electronic|house|techno|dance.?music/.test(t)) niches.push('electronic')
  if (/\bfolk\b|acoustic|singer.?songwriter/.test(t)) niches.push('folk')
  if (/\brock\b|punk|metal|guitar|grunge|band/.test(t)) niches.push('rock')
  if (/latin|reggaeton|corrido|cumbia|salsa|bachata/.test(t)) niches.push('latin')
  return niches.length > 0 ? niches : ['pop']
}

// Infer content format from joined free text.
export function inferFormat(text: string): string {
  const t = text.toLowerCase()
  if (/lyric.?video|official.?lyric/.test(t)) return 'lyric-video'
  if (/live.?session|live.?at|live.?performance|concert|tour/.test(t)) return 'live-performance'
  if (/official.?audio|visualizer|audio.?only/.test(t)) return 'visualizer'
  if (/studio.?session|in.?the.?studio/.test(t)) return 'studio-session'
  if (/pov[:\s]|point.?of.?view/.test(t)) return 'pov-country-storytime'
  if (/car|driving|singing.?in.?the.?car/.test(t)) return 'car-singalong'
  if (/vulnerable|scary|nervous|first.?time|finally.?posting|too.?scared/.test(t)) return 'vulnerability-reveal'
  if (/freestyle|bars|one.?take|no.?edit|voice.?check|vocalcheck/.test(t)) return 'no-edit-freestyle'
  if (/challenge|duet/.test(t)) return 'no-edit-freestyle'
  if (/harmony|acapella|layered|stack/.test(t)) return 'harmony-stack-reveal'
  if (/demo|voice.?note|progress|rough.?draft/.test(t)) return 'demo-to-final'
  if (/before.*after|transformation/.test(t)) return 'before-after-vocal'
  if (/sample|flip|vinyl|crate/.test(t)) return 'sample-flip-reveal'
  if (/gospel|church|praise|worship/.test(t)) return 'gospel-vocal-cover'
  if (/\bcover\b|covers|coverfyp/.test(t)) return 'cover'
  if (/acoustic|unplugged|stripped|bedroom/.test(t)) return 'acoustic'
  if (/type.?beat|808|prod\./.test(t)) return 'producer-cookup'
  return 'music-video'
}
