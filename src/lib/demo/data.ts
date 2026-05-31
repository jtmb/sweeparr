/**
 * Demo Mode — Fake data definitions.
 * Provides realistic-looking media items, cleanup rules, and Plex sessions
 * for the demo environment without any real external connections.
 */

import type { EnrichedMediaItem, PlexLibrary, PlexSession, UserWatchEntry } from '@/types'

// ─── Library definitions ──────────────────────────────────────────────────────

export const DEMO_LIBRARIES: PlexLibrary[] = [
  { key: 'demo-1', title: 'Movies', type: 'movie', agent: 'demo' },
  { key: 'demo-2', title: '4K Movies', type: 'movie', agent: 'demo' },
  { key: 'demo-3', title: 'TV Shows', type: 'show', agent: 'demo' },
]

// ─── Real media entries (title, year, TMDB poster path) ─────────────────────
//
// Poster images are served directly from TMDB CDN — no API key required.
// If a path ever becomes stale it falls back to the Film/TV placeholder icon.

const TMDB = 'https://media.themoviedb.org/t/p/w342'

const MOVIE_TITLES: [string, number, string][] = [
  // Original 20 — corrected CDN poster paths
  ['Inception',                                    2010, '/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg'],
  ['Interstellar',                                 2014, '/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg'],
  ['The Dark Knight',                              2008, '/qJ2tW6WMUDux911r6m7haRef0WH.jpg'],
  ['The Matrix',                                   1999, '/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg'],
  ['Parasite',                                     2019, '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg'],
  ['Joker',                                        2019, '/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg'],
  ['Avengers: Endgame',                            2019, '/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg'],
  ['Mad Max: Fury Road',                           2015, '/hA2ple9q4qnwxp3hKVNhroipsir.jpg'],
  ['Arrival',                                      2016, '/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg'],
  ['Get Out',                                      2017, '/mE24wUCfjK8AoBBjaMjho7Rczr7.jpg'],
  ['1917',                                         2019, '/iZf0KyrE25z1sage4SYFLCCrMi9.jpg'],
  ['Tenet',                                        2020, '/aCIFMriQh8rvhxpN1IWGgvH0Tlg.jpg'],
  ['Spider-Man: No Way Home',                      2021, '/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg'],
  ['Everything Everywhere All at Once',            2022, '/u68AjlvlutfEIcpmbYpKcdi09ut.jpg'],
  ['Top Gun: Maverick',                            2022, '/n0YuM4f5lvGAP6MAW2kBIzugXnc.jpg'],
  ['The Batman',                                   2022, '/74xTEgt7R36Fpooo50r9T25onhq.jpg'],
  ['Oppenheimer',                                  2023, '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg'],
  ['Dune',                                         2021, '/gDzOcq0pfeCeqMBwKIJlSmQpjkZ.jpg'],
  ['Blade Runner 2049',                            2017, '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg'],
  ['The Revenant',                                 2015, '/ji3ecJphATlVgWNY0B0RVXZizdf.jpg'],
  // New additions — verified poster paths
  ['The Shawshank Redemption',                     1994, '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg'],
  ['The Godfather',                                1972, '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg'],
  ['Pulp Fiction',                                 1994, '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg'],
  ['Fight Club',                                   1999, '/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg'],
  ['GoodFellas',                                   1990, '/9OkCLM73MIU2CrKZbqiT8Ln1wY2.jpg'],
  ["Schindler's List",                             1993, '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg'],
  ['Se7en',                                        1995, '/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg'],
  ['The Departed',                                 2006, '/nT97ifVT2J1yMQmeq20Qblg61T.jpg'],
  ['Django Unchained',                             2012, '/mhf63wOnaLCnzxeHgngTH98WaVh.jpg'],
  ['Whiplash',                                     2014, '/7fn624j5lj3xTme2SgiLCeuedmO.jpg'],
  ['La La Land',                                   2016, '/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg'],
  ['Knives Out',                                   2019, '/pThyQovXQrw2m0s9x82twj48Jq4.jpg'],
  ['The Grand Budapest Hotel',                     2014, '/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg'],
  ['Gladiator',                                    2000, '/wN2xWp1eIwCKOD0BHTcErTBv1Uq.jpg'],
  // Further expansion — verified poster paths
  ['Gravity',                                      2013, '/kZ2nZw8D681aphje8NJi8EfbL1U.jpg'],
  ['The Martian',                                  2015, '/3ndAx3weG6KDkJIRMCi5vXX6Dyb.jpg'],
  ['Her',                                          2013, '/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg'],
  ['Moonlight',                                    2016, '/qLnfEmPrDjJfPyyddLJPkXmshkp.jpg'],
  ['A Quiet Place',                                2018, '/nAU74GmpUk7t5iklEp3bufwDq4n.jpg'],
  ['Hereditary',                                   2018, '/hjlZSXM86wJrfCv5VKfR5DI2VeU.jpg'],
  ['The Prestige',                                 2006, '/Ag2B2KHKQPukjH7WutmgnnSNurZ.jpg'],
  ['Black Swan',                                   2010, '/wyMHJMQp8WpmBg9CxefvbQnFhrm.jpg'],
  ['Sicario',                                      2015, '/lz8vNyXeidqqOdJW9ZjnDAMb5Vr.jpg'],
  ['Once Upon a Time in Hollywood',                2019, '/8j58iEBw9pOXFD2L0nt0ZXeHviB.jpg'],
  ['Spotlight',                                    2015, '/8DPGG400FgaFWaqcv11n8mRd2NG.jpg'],
  ['The Social Network',                           2010, '/n0ybibhJtQ5icDqTp8eRytcIHJx.jpg'],
  ['No Country for Old Men',                       2007, '/6d5XOczc226jECq0LIX0siKtgHR.jpg'],
  ['Inglourious Basterds',                         2009, '/7sfbEnaARXDDhKm0CZ7D7uc2sbo.jpg'],
  ['The Wolf of Wall Street',                      2013, '/kW9LmvYHAaS9iA0tHmZVq8hQYoq.jpg'],
  ['Gone Girl',                                    2014, '/ts996lKsxvjkO2yiYG0ht4qAicO.jpg'],
  ['Prisoners',                                    2013, '/jsS3a3ep2KyBVmmiwaz3LvK49b1.jpg'],
  ['12 Years a Slave',                             2013, '/xdANQijuNrJaw1HA61rDccME4Tm.jpg'],
  ['Nightcrawler',                                 2014, '/j9HrX8f7GbZQm1BrBiR40uFQZSb.jpg'],
  ['The Big Short',                                2015, '/scVEaJEwP8zUix8vgmMoJJ9Nq0w.jpg'],
  ['Dunkirk',                                      2017, '/ebSnODDg9lbsMIaWg2uAbjn7TO5.jpg'],
  ['Us',                                           2019, '/ux2dU1jQ2ACIMShzB3yP93Udpzc.jpg'],
  ['The Hateful Eight',                            2015, '/jIywvdPjia2t3eKYbjVTcwBQlG8.jpg'],
  ['Manchester by the Sea',                        2016, '/o9VXYOuaJxCEKOxbA86xqtwmqYn.jpg'],
  ['Three Billboards Outside Ebbing, Missouri',    2017, '/bRYLt8fV82tdVoDppSFTZIcJiLN.jpg'],
  ['The Shape of Water',                           2017, '/k4FwHlMhuRR5BISY2Gm2QZHlH5Q.jpg'],
  ['Green Book',                                   2018, '/7BsvSuDQuoqhWmU2fL7W2GOcZHU.jpg'],
  ['Ford v Ferrari',                               2019, '/dR1Ju50iudrOh3YgfwkAU1g2HZe.jpg'],
  ['Nomadland',                                    2020, '/dKT8rGDR55cM1vGn7QZLA9Tg9YC.jpg'],
  ['Sound of Metal',                               2019, '/3178oOJKKPDeQ2legWQvMPpllv.jpg'],
  ['The Father',                                   2020, '/pr3bEQ517uMb5loLvjFQi8uLAsp.jpg'],
  ['The Power of the Dog',                         2021, '/kEy48iCzGnp0ao1cZbNeWR6yIhC.jpg'],
  ['West Side Story',                              2021, '/yfz3IUoYYSY32tkb97HlUBGFsnh.jpg'],
  ['CODA',                                         2021, '/BzVjmm8l23rPsijLiNLUzuQtyd.jpg'],
  ['Belfast',                                      2021, '/3mInLZyPOVLsZRsBwNHi3UJXXnm.jpg'],
  ['Tar',                                          2022, '/dRVAlaU0vbG6hMf2K45NSiIyoUe.jpg'],
  ['The Fabelmans',                                2022, '/h7llKkqkkJtJrTOaDLuVeUYDQ7I.jpg'],
  ['Triangle of Sadness',                          2022, '/k9eLozCgCed5FGTSdHu0bBElAV8.jpg'],
  ['All Quiet on the Western Front',               2022, '/2IRjbi9cADuDMKmHdLK7LaqQDKA.jpg'],
  ['Past Lives',                                   2023, '/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg'],
  ['Poor Things',                                  2023, '/kCGlIMHnOm8JPXq3rXM6c5wMxcT.jpg'],
  ['Anatomy of a Fall',                            2023, '/1ho0d4LNZw3Y0voeKmSvPSgJOJ2.jpg'],
  ['The Holdovers',                                2023, '/VHSzNBTwxV8vh7wylo7O9CLdac.jpg'],
  ['American Fiction',                             2023, '/57MFWGHarg9jid7yfDTka4RmcMU.jpg'],
  ['May December',                                 2023, '/zhV7B610l7hjlri4ywikJ18ONuq.jpg'],
  ['Saltburn',                                     2023, '/zGTfMwG112BC66mpaveVxoWPOaB.jpg'],
]

const MOVIE_4K_TITLES: [string, number, string][] = [
  // Original 8 — corrected poster paths
  ['Avatar: The Way of Water',                          2022, '/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg'],
  ['John Wick: Chapter 4',                              2023, '/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg'],
  ['Killers of the Flower Moon',                        2023, '/dB6Krk806zeqd0YNp2ngQ9zXteH.jpg'],
  ['Barbie',                                            2023, '/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg'],
  ['Guardians of the Galaxy Vol. 3',                   2023, '/r2J02Z2OpNTctfOSN1Ydgii51I3.jpg'],
  ['Mission: Impossible – Dead Reckoning Part One',    2023, '/NNxYkU70HPurnNCSiCjYAmacwm.jpg'],
  ['Indiana Jones and the Dial of Destiny',             2023, '/Af4bXE63pVsb2FtbW8uYIyPBadD.jpg'],
  ['Ant-Man and the Wasp: Quantumania',                 2023, '/ngl2FKBlU4fhbdsrtdom9LVLBXw.jpg'],
  // New additions — verified poster paths
  ['Dune: Part Two',                                    2024, '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg'],
  ['Avengers: Infinity War',                            2018, '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg'],
  ['Black Panther: Wakanda Forever',                    2022, '/sv1xJUazXeYqALzczSZ3O6nkH75.jpg'],
  ['Thor: Love and Thunder',                            2022, '/pIkRyD18kl4FhoCNQuWxWu5cBLM.jpg'],
  // Further expansion — verified poster paths
  ['Doctor Strange in the Multiverse of Madness',       2022, '/ddJcSKbcp4rKZTmuyWaMhuwcfMz.jpg'],
  ['Black Panther',                                     2018, '/uxzzxijgPIY7slzFvMotPv8wjKA.jpg'],
  ['The Avengers',                                      2012, '/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg'],
  ['Captain America: Civil War',                        2016, '/rAGiXaUfPzY7CDEyNKUofk3Kw2e.jpg'],
  ['Iron Man',                                          2008, '/78lPtwv72eTNqFW9COBYI0dWDJa.jpg'],
  ['Star Wars: The Rise of Skywalker',                  2019, '/jvMoqEMsaRfTLxmhniF3JrBLwDQ.jpg'],
  ['Jurassic World Dominion',                           2022, '/kAVRgw7GgK1CfYEJq8ME6EvRIgU.jpg'],
  ['Fast X',                                            2023, '/fiVW06jE7z9YnO4trhaMEdclSiC.jpg'],
]

const TV_TITLES: [string, string][] = [
  // Original 12 — corrected poster paths
  ['Breaking Bad',            '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg'],
  ['Game of Thrones',         '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg'],
  ['Stranger Things',         '/49WJfeN0moxb9IPfGn8AIqMGskD.jpg'],
  ['The Last of Us',          '/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg'],
  ['Succession',              '/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg'],
  ['The Bear',                '/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg'],
  ['Severance',               '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg'],
  ['House of the Dragon',     '/etj8E2o0Bud0HkONVQPjyCkIvpv.jpg'],
  ['The Mandalorian',         '/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg'],
  ['Ted Lasso',               '/5fhZdwP1DVJ0FyVH6vrFdHwpXIn.jpg'],
  ['Black Mirror',            '/7PRddO7z7mcPi21nZTCMGShAyy1.jpg'],
  ['The White Lotus',         '/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg'],
  // New additions — verified poster paths
  ['Better Call Saul',        '/zjg4jpK1Wp2kiRvtt5ND0kznako.jpg'],
  ['The Sopranos',            '/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg'],
  ['Ozark',                   '/pCGyPVrI9Fzw6rE1Pvi4BIXF6ET.jpg'],
  ['Squid Game',              '/1QdXdRYfktUSONkl1oD5gc6Be0s.jpg'],
  ['True Detective',          '/zYqVTiHK5ZajYcNzAW7qWte5NWS.jpg'],
  ['The Boys',                '/in1R2dDc421JxsoRWaIIAqVI2KE.jpg'],
  ['Peaky Blinders',          '/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg'],
  ['Chernobyl',               '/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg'],
  // Further expansion — verified poster paths
  ['Dark',                    '/1DLjjvSWMYo17B7wuz6YikB96hH.jpg'],
  ['Money Heist',             '/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg'],
  ['The Crown',               '/1M876KPjulVwppEpldhdc8V4o68.jpg'],
  ['Fargo',                   '/a3VW6khsyUVKrG0GBCWFG3NzWPX.jpg'],
  ['Mindhunter',              '/eg2eepJtJeRtCZEUJvIYyb2PnYD.jpg'],
  ['Yellowstone',             '/vOYfRZ0NpUK5hG2CB2dJFnYJlGe.jpg'],
  ['Andor',                   '/khZqmwHQicTYoS7Flreb9EddFZC.jpg'],
  ['The Wire',                '/4lbclFySvugI51fwsyxBTOm4DqK.jpg'],
  ['Lost',                    '/og6S0aTZU6YUJAbqxeKjCa3kY1E.jpg'],
  ['Arrested Development',    '/p4r4RD7RsNcJVoz0H6z3dBoTBtW.jpg'],
  ['Seinfeld',                '/aCw8ONfyz3AhngVQa1E2Ss4KSUQ.jpg'],
  ['The Office',              '/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg'],
  ['Parks and Recreation',    '/5IOj62y2Eb2ngyYmEn1IJ7bFhzH.jpg'],
  ['Fleabag',                 '/27vEYsRKa3eAniwmoccOoluEXQ1.jpg'],
  ['Atlanta',                 '/8HZyGMnPLVVb00rmrh6A2SbK9NX.jpg'],
  ['Barry',                   '/j1XpwD11f0BAEI7pX6UdMhUVX2F.jpg'],
  ['What We Do in the Shadows', '/wa3ZQE9kLnqwN3vQ0NNjg1NPsCa.jpg'],
  ['Westworld',               '/8MfgyFHf7XEboZJPZXCIDqqiz6e.jpg'],
  ['Mr. Robot',               '/oKIBhzZzDX07SoE2bOLhq8UoSPy.jpg'],
  ['Halt and Catch Fire',     '/kOi4RQMZGT1UJtVWGMfNUKuCFhI.jpg'],
  ['Killing Eve',             '/ohOsq62BPRN7SenXqKF7MAmYNDp.jpg'],
  ['Euphoria',                '/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg'],
  ['Only Murders in the Building', '/ld2aFDdFp4qJkl6jvFECGqkLJfz.jpg'],
  ['Foundation',              '/tg9I5pOY4M9CKj8U0cxVBTsm5eh.jpg'],
  ['Shogun',                  '/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg'],
  ['The Diplomat',            '/cOKXV0FalCYixNmZYCfHXgyQ0VX.jpg'],
  ['Slow Horses',             '/5RuZZIouptatjV96BdPmKmRsnGg.jpg'],
  ['The Last Kingdom',        '/8eJf0hxgIhE6QSxbtuNCekTddy1.jpg'],
  ['Landman',                 '/hYthRgS1nvQkGILn9YmqsF8kSk6.jpg'],
  ['A Man on the Inside',     '/c09XdTLpLku2tqHt158NZBgC4hi.jpg'],
]

const USERS = ['alice', 'bob', 'charlie', 'diana']

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function makeUserWatches(rng: () => number, watchCount: number): UserWatchEntry[] {
  if (watchCount === 0) return []
  const numUsers = Math.min(Math.ceil(rng() * USERS.length), watchCount)
  const watches: UserWatchEntry[] = []
  let remaining = watchCount
  for (let i = 0; i < numUsers && remaining > 0; i++) {
    const count = i === numUsers - 1 ? remaining : Math.max(1, Math.floor(rng() * remaining))
    remaining -= count
    const daysAgo = Math.floor(rng() * 400)
    watches.push({
      userName: USERS[Math.floor(rng() * USERS.length)],
      watchCount: count,
      lastWatchedAt: new Date(Date.now() - daysAgo * 86400000),
    })
  }
  return watches
}

function makeDemoItem(
  opts: {
    ratingKey: string
    title: string
    year?: number
    mediaType: 'movie' | 'show'
    libraryId: string
    libraryTitle: string
    fileSizeBytes: number
    addedDaysAgo: number
    watchCount: number
    lastWatchedDaysAgo?: number
    posterUrl?: string
    rng: () => number
  }
): EnrichedMediaItem {
  const { ratingKey, title, year, mediaType, libraryId, libraryTitle, fileSizeBytes, addedDaysAgo, watchCount, lastWatchedDaysAgo, posterUrl, rng } = opts
  const lastWatchedAt = watchCount > 0 && lastWatchedDaysAgo != null
    ? new Date(Date.now() - lastWatchedDaysAgo * 86400000)
    : undefined

  const watchStatus =
    watchCount === 0 ? 'unwatched'
    : watchCount > 0 && lastWatchedAt ? 'watched'
    : 'unwatched'

  return {
    plexRatingKey: ratingKey,
    title,
    year,
    mediaType,
    addedAt: new Date(Date.now() - addedDaysAgo * 86400000),
    lastWatchedAt,
    watchCount,
    fileSizeBytes,
    posterUrl: posterUrl ?? undefined,
    watchStatus: watchStatus as EnrichedMediaItem['watchStatus'],
    isCurrentlyPlaying: false,
    isInProgress: false,
    libraryId,
    libraryTitle,
    userWatches: makeUserWatches(rng, watchCount),
  }
}

export function buildDemoMovies(): EnrichedMediaItem[] {
  const items: EnrichedMediaItem[] = []
  for (let i = 0; i < MOVIE_TITLES.length; i++) {
    const [title, year, posterPath] = MOVIE_TITLES[i]
    const rng = seededRandom(i * 7 + 3)
    const watchCount = Math.floor(rng() * 3)
    items.push(makeDemoItem({
      ratingKey: `m-${i + 1}`,
      title: String(title),
      year: Number(year),
      mediaType: 'movie',
      libraryId: 'demo-1',
      libraryTitle: 'Movies',
      fileSizeBytes: Math.floor(rng() * 8 * 1024 + 2 * 1024) * 1024 * 1024, // 2–10 GB
      addedDaysAgo: Math.floor(rng() * 800 + 90),
      watchCount,
      lastWatchedDaysAgo: watchCount > 0 ? Math.floor(rng() * 1460 + 1) : undefined,
      posterUrl: posterPath ? TMDB + posterPath : undefined,
      rng,
    }))
  }
  return items
}

export function buildDemo4KMovies(): EnrichedMediaItem[] {
  const items: EnrichedMediaItem[] = []
  for (let i = 0; i < MOVIE_4K_TITLES.length; i++) {
    const [title, year, posterPath] = MOVIE_4K_TITLES[i]
    const rng = seededRandom(i * 13 + 11)
    const watchCount = Math.floor(rng() * 3)
    items.push(makeDemoItem({
      ratingKey: `k-${i + 1}`,
      title,
      year,
      mediaType: 'movie',
      libraryId: 'demo-2',
      libraryTitle: '4K Movies',
      fileSizeBytes: Math.floor(rng() * 50 * 1024 + 20 * 1024) * 1024 * 1024, // 20–70 GB
      addedDaysAgo: Math.floor(rng() * 400 + 30),
      watchCount,
      posterUrl: posterPath ? TMDB + posterPath : undefined,
      lastWatchedDaysAgo: watchCount > 0 ? Math.floor(rng() * 1460 + 1) : undefined,
      rng,
    }))
  }
  return items
}

export function buildDemoShows(): EnrichedMediaItem[] {
  const items: EnrichedMediaItem[] = []
  for (let i = 0; i < TV_TITLES.length; i++) {
    const [title, posterPath] = TV_TITLES[i]
    const rng = seededRandom(i * 17 + 5)
    const watchCount = Math.floor(rng() * 4)
    items.push(makeDemoItem({
      ratingKey: `t-${i + 1}`,
      title,
      mediaType: 'show',
      libraryId: 'demo-3',
      libraryTitle: 'TV Shows',
      fileSizeBytes: Math.floor(rng() * 60 * 1024 + 10 * 1024) * 1024 * 1024, // 10–70 GB
      addedDaysAgo: Math.floor(rng() * 1000 + 60),
      watchCount,
      posterUrl: posterPath ? TMDB + posterPath : undefined,
      lastWatchedDaysAgo: watchCount > 0 ? Math.floor(rng() * 1460 + 1) : undefined,
      rng,
    }))
  }
  return items
}

// ─── Fake Plex sessions ───────────────────────────────────────────────────────

export const DEMO_SESSIONS: PlexSession[] = [
  {
    ratingKey: 'm-1',
    key: '/library/metadata/m-1',
    title: 'Inception',
    type: 'movie',
    year: 2010,
    User: { id: '1', title: 'alice' },
    Player: { state: 'playing', title: "Alice's TV", product: 'Plex for Apple TV', platform: 'tvOS', local: true },
    Session: { id: 'demo-session-1', bandwidth: 20000, location: 'lan' },
    TranscodeSession: { videoDecision: 'directplay', audioDecision: 'directplay' },
    viewOffset: 3540000,
    duration: 7200000,
  },
  {
    ratingKey: 't-1',
    key: '/library/metadata/t-1',
    title: 'Ozymandias',
    type: 'episode',
    grandparentTitle: 'Breaking Bad',
    parentIndex: 5,
    index: 14,
    User: { id: '2', title: 'bob' },
    Player: { state: 'playing', title: "Bob's Phone", product: 'Plex for iOS', platform: 'iOS', local: false },
    Session: { id: 'demo-session-2', bandwidth: 5000, location: 'wan' },
    TranscodeSession: { videoDecision: 'transcode', audioDecision: 'directplay' },
    viewOffset: 820000,
    duration: 2700000,
  },
]

// ─── Cleanup rule presets ─────────────────────────────────────────────────────

export const DEMO_RULES = [
  {
    name: 'Stale Watched (2+ years)',
    libraryId: null,
    enabled: true,
    minAgeDays: 180,
    maxDaysSinceWatched: 730,
    protectNeverWatched: true,
    protectInProgress: true,
    protectCurrentlyPlaying: true,
  },
  {
    name: 'Unwatched Movies (1+ year)',
    libraryId: null,
    enabled: true,
    minAgeDays: 365,
    maxDaysSinceWatched: null,
    protectNeverWatched: false,
    protectInProgress: true,
    protectCurrentlyPlaying: true,
  },
  {
    name: '4K Stale (180 days)',
    libraryId: 'demo-2',
    enabled: true,
    minAgeDays: 90,
    maxDaysSinceWatched: 180,
    protectNeverWatched: false,
    protectInProgress: true,
    protectCurrentlyPlaying: true,
  },
]
