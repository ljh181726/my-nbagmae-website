// ─────────────────────────────────────────────
//  data.js  –  NBA Teams, $15 Grids & Legends Pool
// ─────────────────────────────────────────────

export const NBA_TEAMS = [
  { name: "Los Angeles Lakers",       abbreviation: "LAL", primaryColor: "#552583", secondaryColor: "#FDB927", logo: "🟣" },
  { name: "Golden State Warriors",    abbreviation: "GSW", primaryColor: "#1D428A", secondaryColor: "#FFC72C", logo: "🔵" },
  { name: "Boston Celtics",           abbreviation: "BOS", primaryColor: "#007A33", secondaryColor: "#BA9653", logo: "🟢" },
  { name: "Chicago Bulls",            abbreviation: "CHI", primaryColor: "#CE1141", secondaryColor: "#000000", logo: "🔴" },
  { name: "Miami Heat",               abbreviation: "MIA", primaryColor: "#98002E", secondaryColor: "#F9A01B", logo: "🔥" },
  { name: "Brooklyn Nets",            abbreviation: "BKN", primaryColor: "#000000", secondaryColor: "#FFFFFF", logo: "⬛" },
  { name: "Milwaukee Bucks",          abbreviation: "MIL", primaryColor: "#00471B", secondaryColor: "#EEE1C6", logo: "🦌" },
  { name: "Philadelphia 76ers",       abbreviation: "PHI", primaryColor: "#006BB6", secondaryColor: "#ED174C", logo: "🔔" },
  { name: "Phoenix Suns",             abbreviation: "PHX", primaryColor: "#1D1160", secondaryColor: "#E56020", logo: "☀️" },
  { name: "Dallas Mavericks",         abbreviation: "DAL", primaryColor: "#00538C", secondaryColor: "#002B5E", logo: "🐴" },
  { name: "Denver Nuggets",           abbreviation: "DEN", primaryColor: "#0E2240", secondaryColor: "#FEC524", logo: "⛏️" },
  { name: "Cleveland Cavaliers",      abbreviation: "CLE", primaryColor: "#860038", secondaryColor: "#FDBB30", logo: "🗡️" },
  { name: "Toronto Raptors",          abbreviation: "TOR", primaryColor: "#CE1141", secondaryColor: "#000000", logo: "🦖" },
  { name: "San Antonio Spurs",        abbreviation: "SAS", primaryColor: "#C4CED4", secondaryColor: "#000000", logo: "⭐" },
  { name: "Oklahoma City Thunder",    abbreviation: "OKC", primaryColor: "#007AC1", secondaryColor: "#EF6020", logo: "⚡" },
  { name: "Houston Rockets",          abbreviation: "HOU", primaryColor: "#CE1141", secondaryColor: "#000000", logo: "🚀" },
  { name: "Atlanta Hawks",            abbreviation: "ATL", primaryColor: "#E03A3E", secondaryColor: "#C1D32F", logo: "🦅" },
  { name: "New York Knicks",          abbreviation: "NYK", primaryColor: "#006BB6", secondaryColor: "#F58426", logo: "🗽" },
  { name: "Memphis Grizzlies",        abbreviation: "MEM", primaryColor: "#5D76A9", secondaryColor: "#12173F", logo: "🐻" },
  { name: "New Orleans Pelicans",     abbreviation: "NOP", primaryColor: "#0C2340", secondaryColor: "#C8102E", logo: "⚜️" },
  { name: "Minnesota Timberwolves",   abbreviation: "MIN", primaryColor: "#0C2340", secondaryColor: "#236192", logo: "🐺" },
  { name: "Sacramento Kings",         abbreviation: "SAC", primaryColor: "#5A2D81", secondaryColor: "#63727A", logo: "👑" },
  { name: "Portland Trail Blazers",   abbreviation: "POR", primaryColor: "#E03A3E", secondaryColor: "#000000", logo: "🔥" },
  { name: "Indiana Pacers",           abbreviation: "IND", primaryColor: "#002D62", secondaryColor: "#FDBB30", logo: "🏎️" },
  { name: "Utah Jazz",                abbreviation: "UTA", primaryColor: "#002B5C", secondaryColor: "#00471B", logo: "🎷" },
  { name: "Charlotte Hornets",        abbreviation: "CHA", primaryColor: "#1D1160", secondaryColor: "#00788C", logo: "🐝" },
  { name: "Washington Wizards",       abbreviation: "WAS", primaryColor: "#002B5C", secondaryColor: "#E31837", logo: "🧙" },
  { name: "Detroit Pistons",          abbreviation: "DET", primaryColor: "#C8102E", secondaryColor: "#1D42BA", logo: "🔧" },
  { name: "Orlando Magic",            abbreviation: "ORL", primaryColor: "#0077C0", secondaryColor: "#C4CED4", logo: "✨" },
  { name: "Los Angeles Clippers",     abbreviation: "LAC", primaryColor: "#C8102E", secondaryColor: "#1D428A", logo: "⛵" },
];

// Seeded random for generating stable distinct grids
function createSeededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffleWithRandom(array, randFn) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pools for 15 USD active modes
const ACTIVE_POOL = {
  5: [
    { name: "Nikola Jokic", pts: 26.4, trb: 12.4, ast: 9.0, positions: ["C"], team: "DEN", is_allstar: true, is_rookie: false },
    { name: "Giannis Antetokounmpo", pts: 30.4, trb: 11.5, ast: 6.5, positions: ["PF", "SF"], team: "MIL", is_allstar: true, is_rookie: false },
    { name: "Luka Doncic", pts: 33.9, trb: 9.2, ast: 9.8, positions: ["PG", "SG"], team: "DAL", is_allstar: true, is_rookie: false },
    { name: "Joel Embiid", pts: 34.7, trb: 11.0, ast: 5.6, positions: ["C"], team: "PHI", is_allstar: true, is_rookie: false },
    { name: "Shai Gilgeous-Alexander", pts: 30.1, trb: 5.5, ast: 6.2, positions: ["SG", "PG"], team: "OKC", is_allstar: true, is_rookie: false },
    { name: "Jayson Tatum", pts: 26.9, trb: 8.1, ast: 4.9, positions: ["SF", "PF"], team: "BOS", is_allstar: true, is_rookie: false },
    { name: "Stephen Curry", pts: 26.4, trb: 4.5, ast: 5.1, positions: ["PG"], team: "GSW", is_allstar: true, is_rookie: false },
    { name: "LeBron James", pts: 25.7, trb: 7.3, ast: 8.3, positions: ["SF", "PF"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Kevin Durant", pts: 27.1, trb: 6.6, ast: 5.0, positions: ["SF", "PF"], team: "PHX", is_allstar: true, is_rookie: false },
    { name: "Anthony Davis", pts: 24.7, trb: 12.6, ast: 3.5, positions: ["PF", "C"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Devin Booker", pts: 27.1, trb: 4.5, ast: 6.9, positions: ["SG", "PG"], team: "PHX", is_allstar: true, is_rookie: false },
    { name: "Jalen Brunson", pts: 28.7, trb: 3.6, ast: 6.7, positions: ["PG"], team: "NYK", is_allstar: true, is_rookie: false }
  ],
  4: [
    { name: "Donovan Mitchell", pts: 26.6, trb: 5.1, ast: 6.1, positions: ["SG"], team: "CLE", is_allstar: true, is_rookie: false },
    { name: "Jimmy Butler", pts: 20.8, trb: 5.3, ast: 5.0, positions: ["SF", "SG"], team: "MIA", is_allstar: true, is_rookie: false },
    { name: "Kawhi Leonard", pts: 23.7, trb: 6.1, ast: 3.6, positions: ["SF"], team: "LAC", is_allstar: true, is_rookie: false },
    { name: "Tyrese Haliburton", pts: 20.1, trb: 3.9, ast: 10.9, positions: ["PG"], team: "IND", is_allstar: true, is_rookie: false },
    { name: "De'Aaron Fox", pts: 26.6, trb: 4.6, ast: 5.6, positions: ["PG"], team: "SAC", is_allstar: false, is_rookie: false },
    { name: "Anthony Edwards", pts: 25.9, trb: 5.4, ast: 5.1, positions: ["SG", "SF"], team: "MIN", is_allstar: true, is_rookie: false },
    { name: "Bam Adebayo", pts: 19.3, trb: 10.4, ast: 3.9, positions: ["C", "PF"], team: "MIA", is_allstar: true, is_rookie: false },
    { name: "Kyrie Irving", pts: 25.6, trb: 5.0, ast: 5.2, positions: ["PG", "SG"], team: "DAL", is_allstar: false, is_rookie: false },
    { name: "Domantas Sabonis", pts: 19.4, trb: 13.7, ast: 8.2, positions: ["C", "PF"], team: "SAC", is_allstar: false, is_rookie: false },
    { name: "Jaylen Brown", pts: 23.0, trb: 5.5, ast: 3.6, positions: ["SG", "SF"], team: "BOS", is_allstar: true, is_rookie: false },
    { name: "Paul George", pts: 22.6, trb: 5.2, ast: 3.5, positions: ["SF", "SG"], team: "LAC", is_allstar: true, is_rookie: false },
    { name: "Ja Morant", pts: 25.1, trb: 5.6, ast: 8.1, positions: ["PG"], team: "MEM", is_allstar: false, is_rookie: false }
  ],
  3: [
    { name: "Lauri Markkanen", pts: 23.2, trb: 8.2, ast: 1.3, positions: ["PF", "SF"], team: "UTA", is_allstar: false, is_rookie: false },
    { name: "Pascal Siakam", pts: 21.7, trb: 7.1, ast: 4.3, positions: ["PF"], team: "IND", is_allstar: false, is_rookie: false },
    { name: "Jamal Murray", pts: 21.2, trb: 4.1, ast: 6.5, positions: ["PG", "SG"], team: "DEN", is_allstar: false, is_rookie: false },
    { name: "Paolo Banchero", pts: 22.6, trb: 6.9, ast: 5.4, positions: ["PF", "SF"], team: "ORL", is_allstar: true, is_rookie: false },
    { name: "Chet Holmgren", pts: 16.5, trb: 7.9, ast: 2.4, positions: ["C", "PF"], team: "OKC", is_allstar: false, is_rookie: true },
    { name: "Victor Wembanyama", pts: 21.4, trb: 10.6, ast: 3.9, positions: ["C", "PF"], team: "SAS", is_allstar: false, is_rookie: true },
    { name: "Tyrese Maxey", pts: 25.9, trb: 3.7, ast: 6.2, positions: ["PG", "SG"], team: "PHI", is_allstar: true, is_rookie: false },
    { name: "Rudy Gobert", pts: 14.0, trb: 12.9, ast: 1.3, positions: ["C"], team: "MIN", is_allstar: false, is_rookie: false },
    { name: "Kristaps Porzingis", pts: 20.1, trb: 7.2, ast: 2.0, positions: ["C", "PF"], team: "BOS", is_allstar: false, is_rookie: false },
    { name: "Brandon Ingram", pts: 20.8, trb: 5.1, ast: 5.7, positions: ["SF", "SG"], team: "NOP", is_allstar: false, is_rookie: false },
    { name: "Scottie Barnes", pts: 19.9, trb: 8.2, ast: 6.1, positions: ["SF", "PF"], team: "TOR", is_allstar: true, is_rookie: false },
    { name: "Zion Williamson", pts: 22.9, trb: 5.8, ast: 5.0, positions: ["PF"], team: "NOP", is_allstar: false, is_rookie: false }
  ],
  2: [
    { name: "Mikal Bridges", pts: 19.6, trb: 4.5, ast: 3.6, positions: ["SF", "SG"], team: "BKN", is_allstar: false, is_rookie: false },
    { name: "Jaren Jackson Jr.", pts: 22.5, trb: 5.5, ast: 2.3, positions: ["PF", "C"], team: "MEM", is_allstar: false, is_rookie: false },
    { name: "Alperen Sengun", pts: 21.1, trb: 9.3, ast: 5.0, positions: ["C"], team: "HOU", is_allstar: false, is_rookie: false },
    { name: "CJ McCollum", pts: 20.0, trb: 4.3, ast: 4.6, positions: ["SG", "PG"], team: "NOP", is_allstar: false, is_rookie: false },
    { name: "Derrick White", pts: 15.2, trb: 4.2, ast: 5.2, positions: ["SG", "PG"], team: "BOS", is_allstar: false, is_rookie: false },
    { name: "Jrue Holiday", pts: 12.8, trb: 5.4, ast: 4.8, positions: ["PG", "SG"], team: "BOS", is_allstar: false, is_rookie: false },
    { name: "Austin Reaves", pts: 15.9, trb: 4.3, ast: 5.5, positions: ["SG", "PG"], team: "LAL", is_allstar: false, is_rookie: false },
    { name: "Alex Caruso", pts: 10.1, trb: 3.8, ast: 3.5, positions: ["SG", "PG"], team: "CHI", is_allstar: false, is_rookie: false },
    { name: "Malik Monk", pts: 15.4, trb: 2.9, ast: 5.1, positions: ["SG"], team: "SAC", is_allstar: false, is_rookie: false },
    { name: "Immanuel Quickley", pts: 17.0, trb: 3.8, ast: 4.9, positions: ["PG", "SG"], team: "TOR", is_allstar: false, is_rookie: false },
    { name: "Naz Reid", pts: 13.5, trb: 5.2, ast: 1.3, positions: ["C", "PF"], team: "MIN", is_allstar: false, is_rookie: false },
    { name: "Myles Turner", pts: 18.0, trb: 6.9, ast: 1.3, positions: ["C"], team: "IND", is_allstar: false, is_rookie: false }
  ],
  1: [
    { name: "Jaime Jaquez Jr.", pts: 11.9, trb: 3.8, ast: 2.6, positions: ["SF"], team: "MIA", is_allstar: false, is_rookie: true },
    { name: "Herbert Jones", pts: 11.0, trb: 3.6, ast: 2.6, positions: ["SF", "PF"], team: "NOP", is_allstar: false, is_rookie: false },
    { name: "Bobby Portis", pts: 13.8, trb: 7.4, ast: 1.3, positions: ["PF", "C"], team: "MIL", is_allstar: false, is_rookie: false },
    { name: "Lu Dort", pts: 10.9, trb: 3.6, ast: 1.4, positions: ["SG", "SF"], team: "OKC", is_allstar: false, is_rookie: false },
    { name: "Grayson Allen", pts: 13.5, trb: 3.9, ast: 3.0, positions: ["SG"], team: "PHX", is_allstar: false, is_rookie: false },
    { name: "Keegan Murray", pts: 15.2, trb: 5.5, ast: 1.7, positions: ["PF", "SF"], team: "SAC", is_allstar: false, is_rookie: false },
    { name: "Jalen Williams", pts: 19.1, trb: 4.0, ast: 4.5, positions: ["SG", "SF"], team: "OKC", is_allstar: false, is_rookie: false },
    { name: "Coby White", pts: 19.1, trb: 4.5, ast: 5.1, positions: ["PG", "SG"], team: "CHI", is_allstar: false, is_rookie: false },
    { name: "Cam Thomas", pts: 22.5, trb: 3.2, ast: 2.9, positions: ["SG"], team: "BKN", is_allstar: false, is_rookie: false },
    { name: "Trey Murphy III", pts: 14.8, trb: 4.9, ast: 2.2, positions: ["SF", "SG"], team: "NOP", is_allstar: false, is_rookie: false },
    { name: "Josh Hart", pts: 9.4, trb: 8.3, ast: 4.1, positions: ["SF", "SG"], team: "NYK", is_allstar: false, is_rookie: false },
    { name: "Donte DiVincenzo", pts: 15.5, trb: 3.7, ast: 2.7, positions: ["SG"], team: "NYK", is_allstar: false, is_rookie: false }
  ]
};

// Pools for 15 USD legends modes
const LEGEND_POOL = {
  5: [
    { name: "Michael Jordan", pts: 30.1, trb: 6.2, ast: 5.3, positions: ["SG"], team: "CHI", is_allstar: true, is_rookie: false },
    { name: "LeBron James", pts: 27.1, trb: 7.5, ast: 7.4, positions: ["SF", "PF"], team: "CLE", is_allstar: true, is_rookie: false },
    { name: "Shaquille O'Neal", pts: 23.7, trb: 10.9, ast: 2.5, positions: ["C"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Kobe Bryant", pts: 25.0, trb: 5.2, ast: 4.7, positions: ["SG", "SF"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Magic Johnson", pts: 19.5, trb: 7.2, ast: 11.2, positions: ["PG"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Larry Bird", pts: 24.3, trb: 10.0, ast: 6.3, positions: ["SF", "PF"], team: "BOS", is_allstar: true, is_rookie: false },
    { name: "Kareem Abdul-Jabbar", pts: 24.6, trb: 11.2, ast: 3.6, positions: ["C"], team: "MIL", is_allstar: true, is_rookie: false },
    { name: "Hakeem Olajuwon", pts: 21.8, trb: 11.1, ast: 2.5, positions: ["C"], team: "HOU", is_allstar: true, is_rookie: false },
    { name: "Tim Duncan", pts: 19.0, trb: 10.8, ast: 3.0, positions: ["PF", "C"], team: "SAS", is_allstar: true, is_rookie: false },
    { name: "Wilt Chamberlain", pts: 30.1, trb: 22.9, ast: 4.4, positions: ["C"], team: "PHI", is_allstar: true, is_rookie: false },
    { name: "Bill Russell", pts: 15.1, trb: 22.5, ast: 4.3, positions: ["C"], team: "BOS", is_allstar: true, is_rookie: false },
    { name: "Stephen Curry", pts: 24.8, trb: 4.7, ast: 6.4, positions: ["PG"], team: "GSW", is_allstar: true, is_rookie: false }
  ],
  4: [
    { name: "Kevin Durant", pts: 27.3, trb: 7.0, ast: 4.4, positions: ["SF", "PF"], team: "OKC", is_allstar: true, is_rookie: false },
    { name: "Karl Malone", pts: 25.0, trb: 10.1, ast: 3.6, positions: ["PF"], team: "UTA", is_allstar: true, is_rookie: false },
    { name: "Julius Erving", pts: 24.2, trb: 8.5, ast: 4.2, positions: ["SF"], team: "PHI", is_allstar: true, is_rookie: false },
    { name: "Dwyane Wade", pts: 22.0, trb: 4.7, ast: 5.4, positions: ["SG"], team: "MIA", is_allstar: true, is_rookie: false },
    { name: "Kevin Garnett", pts: 17.8, trb: 10.0, ast: 3.7, positions: ["PF", "C"], team: "MIN", is_allstar: true, is_rookie: false },
    { name: "Charles Barkley", pts: 22.1, trb: 11.7, ast: 3.9, positions: ["PF"], team: "PHX", is_allstar: true, is_rookie: false },
    { name: "Oscar Robertson", pts: 25.7, trb: 7.5, ast: 9.5, positions: ["PG"], team: "CIN", is_allstar: true, is_rookie: false },
    { name: "Jerry West", pts: 27.0, trb: 5.8, ast: 6.7, positions: ["PG", "SG"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Elgin Baylor", pts: 27.4, trb: 13.5, ast: 4.3, positions: ["SF"], team: "LAL", is_allstar: true, is_rookie: false },
    { name: "Moses Malone", pts: 20.6, trb: 12.2, ast: 1.3, positions: ["C"], team: "HOU", is_allstar: true, is_rookie: false },
    { name: "David Robinson", pts: 21.1, trb: 10.6, ast: 2.5, positions: ["C"], team: "SAS", is_allstar: true, is_rookie: false },
    { name: "Dirk Nowitzki", pts: 20.7, trb: 7.5, ast: 2.4, positions: ["PF"], team: "DAL", is_allstar: true, is_rookie: false }
  ],
  3: [
    { name: "Steve Nash", pts: 14.3, trb: 3.0, ast: 8.5, positions: ["PG"], team: "PHX", is_allstar: true, is_rookie: false },
    { name: "Allen Iverson", pts: 26.7, trb: 3.7, ast: 6.2, positions: ["SG", "PG"], team: "PHI", is_allstar: true, is_rookie: false },
    { name: "Isiah Thomas", pts: 19.2, trb: 3.6, ast: 9.3, positions: ["PG"], team: "DET", is_allstar: true, is_rookie: false },
    { name: "John Stockton", pts: 13.1, trb: 2.7, ast: 10.5, positions: ["PG"], team: "UTA", is_allstar: true, is_rookie: false },
    { name: "Scottie Pippen", pts: 16.1, trb: 6.4, ast: 5.2, positions: ["SF"], team: "CHI", is_allstar: true, is_rookie: false },
    { name: "Reggie Miller", pts: 18.2, trb: 3.0, ast: 3.0, positions: ["SG"], team: "IND", is_allstar: true, is_rookie: false },
    { name: "Ray Allen", pts: 18.9, trb: 4.1, ast: 3.4, positions: ["SG"], team: "MIL", is_allstar: true, is_rookie: false },
    { name: "Patrick Ewing", pts: 21.0, trb: 9.8, ast: 1.9, positions: ["C"], team: "NYK", is_allstar: true, is_rookie: false },
    { name: "Jason Kidd", pts: 12.6, trb: 6.3, ast: 8.7, positions: ["PG"], team: "NJN", is_allstar: true, is_rookie: false },
    { name: "Clyde Drexler", pts: 20.4, trb: 6.1, ast: 5.6, positions: ["SG"], team: "POR", is_allstar: true, is_rookie: false },
    { name: "Tracy McGrady", pts: 19.6, trb: 5.6, ast: 4.4, positions: ["SG", "SF"], team: "ORL", is_allstar: true, is_rookie: false },
    { name: "Vince Carter", pts: 16.7, trb: 4.3, ast: 3.1, positions: ["SG", "SF"], team: "TOR", is_allstar: true, is_rookie: false }
  ],
  2: [
    { name: "Carmelo Anthony", pts: 22.5, trb: 6.2, ast: 2.7, positions: ["SF", "PF"], team: "DEN", is_allstar: true, is_rookie: false },
    { name: "Chris Paul", pts: 17.5, trb: 4.5, ast: 9.4, positions: ["PG"], team: "NOH", is_allstar: true, is_rookie: false },
    { name: "Dwight Howard", pts: 15.7, trb: 11.8, ast: 1.3, positions: ["C"], team: "ORL", is_allstar: true, is_rookie: false },
    { name: "Pau Gasol", pts: 17.0, trb: 9.2, ast: 3.2, positions: ["PF", "C"], team: "MEM", is_allstar: true, is_rookie: false },
    { name: "Manu Ginobili", pts: 13.3, trb: 3.5, ast: 3.8, positions: ["SG"], team: "SAS", is_allstar: true, is_rookie: false },
    { name: "Tony Parker", pts: 15.5, trb: 2.7, ast: 5.6, positions: ["PG"], team: "SAS", is_allstar: true, is_rookie: false },
    { name: "Dennis Rodman", pts: 7.3, trb: 13.1, ast: 1.8, positions: ["PF"], team: "DET", is_allstar: true, is_rookie: false },
    { name: "Ben Wallace", pts: 5.7, trb: 9.6, ast: 1.3, positions: ["C"], team: "DET", is_allstar: true, is_rookie: false },
    { name: "Dikembe Mutombo", pts: 9.8, trb: 10.3, ast: 1.0, positions: ["C"], team: "DEN", is_allstar: true, is_rookie: false },
    { name: "Chauncey Billups", pts: 15.2, trb: 2.9, ast: 5.4, positions: ["PG"], team: "DET", is_allstar: true, is_rookie: false },
    { name: "Chris Bosh", pts: 19.2, trb: 8.5, ast: 2.0, positions: ["PF", "C"], team: "TOR", is_allstar: true, is_rookie: false },
    { name: "Paul Pierce", pts: 19.7, trb: 5.6, ast: 3.5, positions: ["SF"], team: "BOS", is_allstar: true, is_rookie: false }
  ],
  1: [
    { name: "Steve Kerr", pts: 6.0, trb: 1.2, ast: 1.8, positions: ["PG", "SG"], team: "CHI", is_allstar: false, is_rookie: false },
    { name: "Robert Horry", pts: 7.0, trb: 4.8, ast: 2.1, positions: ["SF", "PF"], team: "HOU", is_allstar: false, is_rookie: false },
    { name: "Derek Fisher", pts: 8.3, trb: 2.1, ast: 3.0, positions: ["PG"], team: "LAL", is_allstar: false, is_rookie: false },
    { name: "Kyle Lowry", pts: 14.3, trb: 4.3, ast: 5.8, positions: ["PG"], team: "TOR", is_allstar: true, is_rookie: false },
    { name: "Rajon Rondo", pts: 9.6, trb: 4.5, ast: 7.9, positions: ["PG"], team: "BOS", is_allstar: true, is_rookie: false },
    { name: "Marcus Camby", pts: 9.5, trb: 9.8, ast: 1.8, positions: ["C", "PF"], team: "DEN", is_allstar: false, is_rookie: false },
    { name: "Detlef Schrempf", pts: 13.9, trb: 6.2, ast: 3.4, positions: ["SF", "PF"], team: "IND", is_allstar: true, is_rookie: false },
    { name: "Baron Davis", pts: 16.1, trb: 3.8, ast: 7.2, positions: ["PG"], team: "CHA", is_allstar: true, is_rookie: false },
    { name: "Richard Jefferson", pts: 11.9, trb: 4.0, ast: 2.0, positions: ["SF"], team: "NJN", is_allstar: false, is_rookie: false },
    { name: "Jason Terry", pts: 13.4, trb: 2.3, ast: 3.8, positions: ["SG", "PG"], team: "DAL", is_allstar: false, is_rookie: false },
    { name: "Andre Iguodala", pts: 11.3, trb: 4.9, ast: 4.2, positions: ["SF", "SG"], team: "PHI", is_allstar: true, is_rookie: false },
    { name: "Lamar Odom", pts: 13.3, trb: 8.4, ast: 3.7, positions: ["PF", "SF"], team: "LAL", is_allstar: false, is_rookie: false }
  ]
};

// Generate exactly 40 distinct 5x5 grids for both active and legend modes
function pregenerate40Grids(pool, seedValue) {
  const grids = [];
  const randFn = createSeededRandom(seedValue);
  
  for (let g = 0; g < 40; g++) {
    const grid = []; // 25 players: 5 per price level ($5 to $1)
    
    // Select 5 random players from each of the tiers
    for (let price = 5; price >= 1; price--) {
      const tierPlayers = pool[price];
      const shuffled = shuffleWithRandom(tierPlayers, randFn);
      // Select first 5 players
      const selected = shuffled.slice(0, 5).map(p => ({
        ...p,
        price
      }));
      grid.push(...selected);
    }
    grids.push(grid);
  }
  return grids;
}

export const ACTIVE_5X5_GRIDS = pregenerate40Grids(ACTIVE_POOL, 891823);
export const LEGENDS_5X5_GRIDS = pregenerate40Grids(LEGEND_POOL, 912837);
