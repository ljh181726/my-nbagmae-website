// ─────────────────────────────────────────────
//  legends_pool.js  –  Peak Legend Rosters for all 30 NBA Franchises
// ─────────────────────────────────────────────

const LEGENDS_BY_FRANCHISE = {
  "LAL": [
    { name: "Magic Johnson", year: 1987, team: "LAL", position: ["PG"], pts: 23.9, trb: 6.3, ast: 12.2, salary: 2500000, is_allstar: true, is_rookie: false },
    { name: "Kobe Bryant", year: 2008, team: "LAL", position: ["SG"], pts: 28.3, trb: 6.3, ast: 5.4, salary: 19490000, is_allstar: true, is_rookie: false },
    { name: "Shaquille O'Neal", year: 2000, team: "LAL", position: ["C"], pts: 29.7, trb: 13.6, ast: 3.8, salary: 17140000, is_allstar: true, is_rookie: false },
    { name: "Kareem Abdul-Jabbar", year: 1980, team: "LAL", position: ["C"], pts: 24.8, trb: 10.8, ast: 4.5, salary: 1000000, is_allstar: true, is_rookie: false },
    { name: "Jerry West", year: 1970, team: "LAL", position: ["PG", "SG"], pts: 31.2, trb: 4.6, ast: 7.5, salary: 300000, is_allstar: true, is_rookie: false },
    { name: "Elgin Baylor", year: 1961, team: "LAL", position: ["SF"], pts: 34.8, trb: 19.8, ast: 5.1, salary: 150000, is_allstar: true, is_rookie: false },
    { name: "LeBron James", year: 2020, team: "LAL", position: ["PG", "SF"], pts: 25.3, trb: 7.8, ast: 10.2, salary: 37430000, is_allstar: true, is_rookie: false }
  ],
  "BOS": [
    { name: "Larry Bird", year: 1985, team: "BOS", position: ["SF", "PF"], pts: 28.7, trb: 10.5, ast: 6.6, salary: 1800000, is_allstar: true, is_rookie: false },
    { name: "Bill Russell", year: 1965, team: "BOS", position: ["C"], pts: 14.1, trb: 24.1, ast: 5.3, salary: 100000, is_allstar: true, is_rookie: false },
    { name: "John Havlicek", year: 1971, team: "BOS", position: ["SF", "SG"], pts: 28.9, trb: 9.0, ast: 7.5, salary: 200000, is_allstar: true, is_rookie: false },
    { name: "Paul Pierce", year: 2002, team: "BOS", position: ["SF"], pts: 26.1, trb: 6.9, ast: 3.2, salary: 10490000, is_allstar: true, is_rookie: false },
    { name: "Kevin Garnett", year: 2008, team: "BOS", position: ["PF", "C"], pts: 18.8, trb: 9.2, ast: 3.4, salary: 23750000, is_allstar: true, is_rookie: false },
    { name: "Bob Cousy", year: 1957, team: "BOS", position: ["PG"], pts: 20.6, trb: 4.8, ast: 7.5, salary: 30000, is_allstar: true, is_rookie: false }
  ],
  "CHI": [
    { name: "Michael Jordan", year: 1996, team: "CHI", position: ["SG"], pts: 30.4, trb: 6.6, ast: 4.3, salary: 30140000, is_allstar: true, is_rookie: false },
    { name: "Scottie Pippen", year: 1994, team: "CHI", position: ["SF"], pts: 22.0, trb: 8.7, ast: 5.6, salary: 22250000, is_allstar: true, is_rookie: false },
    { name: "Derrick Rose", year: 2011, team: "CHI", position: ["PG"], pts: 25.0, trb: 4.1, ast: 7.7, salary: 5540000, is_allstar: true, is_rookie: false },
    { name: "Artis Gilmore", year: 1979, team: "CHI", position: ["C"], pts: 19.8, trb: 12.7, ast: 3.3, salary: 500000, is_allstar: true, is_rookie: false },
    { name: "Dennis Rodman", year: 1996, team: "CHI", position: ["PF"], pts: 5.5, trb: 14.9, ast: 2.5, salary: 9000000, is_allstar: false, is_rookie: false }
  ],
  "GSW": [
    { name: "Stephen Curry", year: 2016, team: "GSW", position: ["PG"], pts: 30.1, trb: 5.4, ast: 6.7, salary: 11370000, is_allstar: true, is_rookie: false },
    { name: "Wilt Chamberlain", year: 1962, team: "SFW", position: ["C"], pts: 50.4, trb: 25.7, ast: 2.4, salary: 150000, is_allstar: true, is_rookie: false },
    { name: "Rick Barry", year: 1975, team: "GSW", position: ["SF"], pts: 30.6, trb: 5.7, ast: 6.2, positions: ["SF"], salary: 250000, is_allstar: true, is_rookie: false },
    { name: "Kevin Durant", year: 2017, team: "GSW", position: ["SF", "PF"], pts: 25.1, trb: 8.3, ast: 4.8, salary: 26540000, is_allstar: true, is_rookie: false },
    { name: "Klay Thompson", year: 2015, team: "GSW", position: ["SG"], pts: 21.7, trb: 3.2, ast: 2.9, salary: 15500000, is_allstar: true, is_rookie: false },
    { name: "Chris Mullin", year: 1992, team: "GSW", position: ["SF", "SG"], pts: 25.6, trb: 5.6, ast: 3.5, salary: 2750000, is_allstar: true, is_rookie: false }
  ],
  "MIA": [
    { name: "Dwyane Wade", year: 2009, team: "MIA", position: ["SG"], pts: 30.2, trb: 5.0, ast: 7.5, salary: 15780000, is_allstar: true, is_rookie: false },
    { name: "LeBron James", year: 2013, team: "MIA", position: ["SF", "PF"], pts: 26.8, trb: 8.0, ast: 7.3, salary: 17540000, is_allstar: true, is_rookie: false },
    { name: "Alonzo Mourning", year: 2000, team: "MIA", position: ["C"], pts: 21.7, trb: 9.5, ast: 1.6, salary: 15000000, is_allstar: true, is_rookie: false },
    { name: "Shaquille O'Neal", year: 2005, team: "MIA", position: ["C"], pts: 22.9, trb: 10.4, ast: 2.7, salary: 27700000, is_allstar: true, is_rookie: false },
    { name: "Chris Bosh", year: 2012, team: "MIA", position: ["PF", "C"], pts: 18.0, trb: 7.9, ast: 1.8, salary: 16000000, is_allstar: true, is_rookie: false }
  ],
  "HOU": [
    { name: "Hakeem Olajuwon", year: 1994, team: "HOU", position: ["C"], pts: 27.3, trb: 11.9, ast: 3.6, salary: 14000000, is_allstar: true, is_rookie: false },
    { name: "Moses Malone", year: 1982, team: "HOU", position: ["C"], pts: 31.1, trb: 14.7, ast: 1.8, salary: 1200000, is_allstar: true, is_rookie: false },
    { name: "James Harden", year: 2018, team: "HOU", position: ["SG", "PG"], pts: 30.4, trb: 5.4, ast: 8.8, salary: 28300000, is_allstar: true, is_rookie: false },
    { name: "Tracy McGrady", year: 2005, team: "HOU", position: ["SG", "SF"], pts: 25.7, trb: 6.2, ast: 5.7, salary: 14490000, is_allstar: true, is_rookie: false },
    { name: "Yao Ming", year: 2007, team: "HOU", position: ["C"], pts: 25.0, trb: 9.4, ast: 2.0, salary: 12500000, is_allstar: true, is_rookie: false },
    { name: "Elvin Hayes", year: 1970, team: "SDR", position: ["PF", "C"], pts: 27.5, trb: 16.9, ast: 2.0, salary: 100000, is_allstar: true, is_rookie: false }
  ],
  "PHI": [
    { name: "Julius Erving", year: 1981, team: "PHI", position: ["SF"], pts: 24.6, trb: 8.0, ast: 4.4, salary: 1000000, is_allstar: true, is_rookie: false },
    { name: "Allen Iverson", year: 2001, team: "PHI", position: ["SG", "PG"], pts: 31.1, trb: 3.8, ast: 4.6, salary: 10130000, is_allstar: true, is_rookie: false },
    { name: "Wilt Chamberlain", year: 1967, team: "PHI", position: ["C"], pts: 24.1, trb: 24.2, ast: 7.8, salary: 250000, is_allstar: true, is_rookie: false },
    { name: "Joel Embiid", year: 2023, team: "PHI", position: ["C"], pts: 33.1, trb: 10.2, ast: 4.2, salary: 33610000, is_allstar: true, is_rookie: false },
    { name: "Charles Barkley", year: 1990, team: "PHI", position: ["PF"], pts: 25.2, trb: 11.5, ast: 3.9, salary: 2850000, is_allstar: true, is_rookie: false },
    { name: "Moses Malone", year: 1983, team: "PHI", position: ["C"], pts: 24.5, trb: 15.3, ast: 1.3, salary: 2200000, is_allstar: true, is_rookie: false }
  ],
  "SAS": [
    { name: "Tim Duncan", year: 2003, team: "SAS", position: ["PF", "C"], pts: 23.3, trb: 12.9, ast: 3.9, salary: 12070000, is_allstar: true, is_rookie: false },
    { name: "David Robinson", year: 1994, team: "SAS", position: ["C"], pts: 29.8, trb: 10.7, ast: 4.8, salary: 5720000, is_allstar: true, is_rookie: false },
    { name: "George Gervin", year: 1980, team: "SAS", position: ["SG", "SF"], pts: 33.1, trb: 5.2, ast: 2.6, salary: 400000, is_allstar: true, is_rookie: false },
    { name: "Kawhi Leonard", year: 2017, team: "SAS", position: ["SF"], pts: 25.5, trb: 5.8, ast: 3.5, salary: 17640000, is_allstar: true, is_rookie: false },
    { name: "Tony Parker", year: 2013, team: "SAS", position: ["PG"], pts: 20.3, trb: 3.0, ast: 7.6, salary: 12500000, is_allstar: true, is_rookie: false },
    { name: "Manu Ginobili", year: 2008, team: "SAS", position: ["SG"], pts: 19.5, trb: 4.8, ast: 4.5, salary: 9000000, is_allstar: false, is_rookie: false }
  ],
  "DAL": [
    { name: "Dirk Nowitzki", year: 2007, team: "DAL", position: ["PF"], pts: 24.6, trb: 8.9, ast: 3.4, salary: 15100000, is_allstar: true, is_rookie: false },
    { name: "Luka Doncic", year: 2024, team: "DAL", position: ["PG"], pts: 33.9, trb: 9.2, ast: 9.8, salary: 40060000, is_allstar: true, is_rookie: false },
    { name: "Steve Nash", year: 2002, team: "DAL", position: ["PG"], pts: 17.9, trb: 3.1, ast: 7.7, salary: 5750000, is_allstar: true, is_rookie: false },
    { name: "Michael Finley", year: 2000, team: "DAL", position: ["SF", "SG"], pts: 22.6, trb: 6.3, ast: 5.3, salary: 7500000, is_allstar: true, is_rookie: false },
    { name: "Jason Kidd", year: 1996, team: "DAL", position: ["PG"], pts: 16.6, trb: 6.8, ast: 9.7, salary: 2800000, is_allstar: true, is_rookie: false }
  ],
  "MIL": [
    { name: "Kareem Abdul-Jabbar", year: 1971, team: "MIL", position: ["C"], pts: 31.7, trb: 16.0, ast: 3.3, salary: 250000, is_allstar: true, is_rookie: false },
    { name: "Giannis Antetokounmpo", year: 2020, team: "MIL", position: ["PF"], pts: 29.5, trb: 13.6, ast: 5.6, salary: 25840000, is_allstar: true, is_rookie: false },
    { name: "Oscar Robertson", year: 1971, team: "MIL", position: ["PG"], pts: 19.4, trb: 5.7, ast: 8.2, salary: 150000, is_allstar: true, is_rookie: false },
    { name: "Ray Allen", year: 2001, team: "MIL", position: ["SG"], pts: 22.0, trb: 5.2, ast: 4.6, salary: 10130000, is_allstar: true, is_rookie: false },
    { name: "Sidney Moncrief", year: 1983, team: "MIL", position: ["SG", "PG"], pts: 22.5, trb: 5.8, ast: 3.9, salary: 600000, is_allstar: true, is_rookie: false }
  ],
  "PHX": [
    { name: "Steve Nash", year: 2006, team: "PHX", position: ["PG"], pts: 18.8, trb: 4.2, ast: 10.5, salary: 11250000, is_allstar: true, is_rookie: false },
    { name: "Charles Barkley", year: 1993, team: "PHX", position: ["PF"], pts: 25.6, trb: 12.2, ast: 5.1, salary: 2420000, is_allstar: true, is_rookie: false },
    { name: "Kevin Johnson", year: 1990, team: "PHX", position: ["PG"], pts: 22.5, trb: 3.6, ast: 11.4, salary: 1000000, is_allstar: false, is_rookie: false },
    { name: "Amar'e Stoudemire", year: 2005, team: "PHX", position: ["PF", "C"], pts: 26.0, trb: 8.9, ast: 1.6, salary: 4120000, is_allstar: true, is_rookie: false },
    { name: "Devin Booker", year: 2022, team: "PHX", position: ["SG"], pts: 26.8, trb: 5.0, ast: 4.8, salary: 31650000, is_allstar: true, is_rookie: false }
  ],
  "OKC": [
    { name: "Kevin Durant", year: 2014, team: "OKC", position: ["SF"], pts: 32.0, trb: 7.4, ast: 5.5, salary: 17800000, is_allstar: true, is_rookie: false },
    { name: "Russell Westbrook", year: 2017, team: "OKC", position: ["PG"], pts: 31.6, trb: 10.7, ast: 10.4, salary: 26540000, is_allstar: true, is_rookie: false },
    { name: "Gary Payton", year: 1996, team: "SEA", position: ["PG"], pts: 19.3, trb: 4.2, ast: 7.5, salary: 2800000, is_allstar: true, is_rookie: false },
    { name: "Shawn Kemp", year: 1996, team: "SEA", position: ["PF", "C"], pts: 19.6, trb: 11.4, ast: 2.2, salary: 3000000, is_allstar: true, is_rookie: false },
    { name: "Spencer Haywood", year: 1973, team: "SEA", position: ["PF", "C"], pts: 29.2, trb: 12.9, ast: 2.5, salary: 150000, is_allstar: true, is_rookie: false },
    { name: "Shai Gilgeous-Alexander", year: 2024, team: "OKC", position: ["PG", "SG"], pts: 30.1, trb: 5.5, ast: 6.2, salary: 33380000, is_allstar: true, is_rookie: false }
  ],
  "POR": [
    { name: "Bill Walton", year: 1978, team: "POR", position: ["C"], pts: 18.9, trb: 13.2, ast: 5.0, salary: 450000, is_allstar: true, is_rookie: false },
    { name: "Clyde Drexler", year: 1992, team: "POR", position: ["SG"], pts: 25.0, trb: 6.6, ast: 6.7, salary: 1500000, is_allstar: true, is_rookie: false },
    { name: "Damian Lillard", year: 2020, team: "POR", position: ["PG"], pts: 30.0, trb: 4.3, ast: 8.0, salary: 29800000, is_allstar: true, is_rookie: false },
    { name: "Brandon Roy", year: 2009, team: "POR", position: ["SG"], pts: 22.6, trb: 4.7, ast: 5.1, salary: 4100000, is_allstar: true, is_rookie: false },
    { name: "LaMarcus Aldridge", year: 2014, team: "POR", position: ["PF", "C"], pts: 23.2, trb: 11.1, ast: 2.6, salary: 14100000, is_allstar: true, is_rookie: false }
  ],
  "UTA": [
    { name: "Karl Malone", year: 1997, team: "UTA", position: ["PF"], pts: 27.4, trb: 9.9, ast: 4.5, salary: 12500000, is_allstar: true, is_rookie: false },
    { name: "John Stockton", year: 1990, team: "UTA", position: ["PG"], pts: 17.2, trb: 2.6, ast: 14.5, salary: 2000000, is_allstar: true, is_rookie: false },
    { name: "Adrian Dantley", year: 1984, team: "UTA", position: ["SF"], pts: 30.6, trb: 4.9, ast: 3.9, salary: 800000, is_allstar: true, is_rookie: false },
    { name: "Pete Maravich", year: 1977, team: "NOJ", position: ["SG"], pts: 31.1, trb: 5.1, ast: 5.4, salary: 250000, is_allstar: true, is_rookie: false },
    { name: "Deron Williams", year: 2010, team: "UTA", position: ["PG"], pts: 18.7, trb: 4.0, ast: 10.5, salary: 13500000, is_allstar: true, is_rookie: false }
  ],
  "DEN": [
    { name: "Nikola Jokic", year: 2023, team: "DEN", position: ["C"], pts: 24.5, trb: 11.8, ast: 9.8, salary: 33040000, is_allstar: true, is_rookie: false },
    { name: "Alex English", year: 1983, team: "DEN", position: ["SF"], pts: 28.4, trb: 7.3, ast: 4.8, salary: 650000, is_allstar: true, is_rookie: false },
    { name: "Carmelo Anthony", year: 2008, team: "DEN", position: ["SF"], pts: 25.7, trb: 7.4, ast: 3.4, salary: 13000000, is_allstar: true, is_rookie: false },
    { name: "Dikembe Mutombo", year: 1994, team: "DEN", position: ["C"], pts: 12.0, trb: 11.8, ast: 1.5, salary: 3000000, is_allstar: true, is_rookie: false },
    { name: "Dan Issel", year: 1980, team: "DEN", position: ["C", "PF"], pts: 23.8, trb: 8.8, ast: 2.4, salary: 350000, is_allstar: true, is_rookie: false }
  ],
  "ORL": [
    { name: "Shaquille O'Neal", year: 1995, team: "ORL", position: ["C"], pts: 29.3, trb: 11.4, ast: 2.7, salary: 4800000, is_allstar: true, is_rookie: false },
    { name: "Penny Hardaway", year: 1996, team: "ORL", position: ["PG", "SG"], pts: 21.7, trb: 4.3, ast: 7.1, salary: 5250000, is_allstar: true, is_rookie: false },
    { name: "Dwight Howard", year: 2011, team: "ORL", position: ["C"], pts: 22.9, trb: 14.1, ast: 1.4, salary: 16500000, is_allstar: true, is_rookie: false },
    { name: "Tracy McGrady", year: 2003, team: "ORL", position: ["SG", "SF"], pts: 32.1, trb: 6.5, ast: 5.5, salary: 12200000, is_allstar: true, is_rookie: false },
    { name: "Nick Anderson", year: 1993, team: "ORL", position: ["SG"], pts: 19.9, trb: 6.0, ast: 3.4, salary: 2100000, is_allstar: false, is_rookie: false }
  ],
  "IND": [
    { name: "Reggie Miller", year: 1990, team: "IND", position: ["SG"], pts: 24.6, trb: 3.6, ast: 3.8, salary: 1100000, is_allstar: true, is_rookie: false },
    { name: "Jermaine O'Neal", year: 2004, team: "IND", position: ["PF", "C"], pts: 20.1, trb: 10.0, ast: 2.1, salary: 12500000, is_allstar: true, is_rookie: false },
    { name: "Paul George", year: 2016, team: "IND", position: ["SF"], pts: 23.1, trb: 7.0, ast: 4.1, salary: 17120000, is_allstar: true, is_rookie: false },
    { name: "Danny Granger", year: 2009, team: "IND", position: ["SF"], pts: 25.8, trb: 5.1, ast: 2.7, salary: 9980000, is_allstar: true, is_rookie: false },
    { name: "Tyrese Haliburton", year: 2024, team: "IND", position: ["PG"], pts: 20.1, trb: 3.9, ast: 10.9, salary: 5800000, is_allstar: true, is_rookie: false }
  ],
  "NYK": [
    { name: "Patrick Ewing", year: 1990, team: "NYK", position: ["C"], pts: 28.6, trb: 10.9, ast: 2.2, salary: 3250000, is_allstar: true, is_rookie: false },
    { name: "Walt Frazier", year: 1977, team: "NYK", position: ["PG"], pts: 17.4, trb: 3.9, ast: 5.3, salary: 300000, is_allstar: true, is_rookie: false },
    { name: "Bernard King", year: 1984, team: "NYK", position: ["SF"], pts: 26.3, trb: 5.1, ast: 2.1, salary: 700000, is_allstar: true, is_rookie: false },
    { name: "Carmelo Anthony", year: 2013, team: "NYK", position: ["SF", "PF"], pts: 28.7, trb: 6.9, ast: 2.6, salary: 19440000, is_allstar: true, is_rookie: false },
    { name: "Jalen Brunson", year: 2024, team: "NYK", position: ["PG"], pts: 28.7, trb: 3.6, ast: 6.7, salary: 26340000, is_allstar: true, is_rookie: false }
  ],
  "DET": [
    { name: "Isiah Thomas", year: 1985, team: "DET", position: ["PG"], pts: 21.2, trb: 4.5, ast: 13.9, salary: 800000, is_allstar: true, is_rookie: false },
    { name: "Joe Dumars", year: 1990, team: "DET", position: ["SG"], pts: 17.8, trb: 2.8, ast: 4.9, salary: 1200000, is_allstar: true, is_rookie: false },
    { name: "Grant Hill", year: 1997, team: "DET", position: ["SF"], pts: 21.4, trb: 9.0, ast: 7.3, salary: 4500000, is_allstar: true, is_rookie: false },
    { name: "Chauncey Billups", year: 2006, team: "DET", position: ["PG"], pts: 18.5, trb: 3.1, ast: 8.6, salary: 5900000, is_allstar: true, is_rookie: false },
    { name: "Ben Wallace", year: 2002, team: "DET", position: ["C"], pts: 7.6, trb: 13.0, ast: 1.5, salary: 4800000, is_allstar: true, is_rookie: false }
  ],
  "BKN": [
    { name: "Jason Kidd", year: 2002, team: "NJN", position: ["PG"], pts: 14.7, trb: 7.3, ast: 9.9, salary: 8440000, is_allstar: true, is_rookie: false },
    { name: "Julius Erving", year: 1976, team: "NYN", position: ["SF"], pts: 29.3, trb: 11.0, ast: 5.0, salary: 350000, is_allstar: true, is_rookie: false },
    { name: "Vince Carter", year: 2006, team: "NJN", position: ["SG", "SF"], pts: 24.2, trb: 5.8, ast: 4.3, salary: 13800000, is_allstar: true, is_rookie: false },
    { name: "Derrick Coleman", year: 1993, team: "NJN", position: ["PF", "C"], pts: 20.7, trb: 11.2, ast: 3.6, salary: 3100000, is_allstar: false, is_rookie: false },
    { name: "Kevin Durant", year: 2021, team: "BKN", position: ["SF", "PF"], pts: 26.9, trb: 7.1, ast: 5.6, salary: 39050000, is_allstar: true, is_rookie: false }
  ],
  "CLE": [
    { name: "LeBron James", year: 2009, team: "CLE", position: ["SF", "PF"], pts: 28.4, trb: 7.6, ast: 7.2, salary: 14410000, is_allstar: true, is_rookie: false },
    { name: "Kyrie Irving", year: 2016, team: "CLE", position: ["PG"], pts: 19.6, trb: 3.0, ast: 4.7, salary: 16400000, is_allstar: false, is_rookie: false },
    { name: "Mark Price", year: 1993, team: "CLE", position: ["PG"], pts: 18.2, trb: 2.7, ast: 8.0, salary: 2400000, is_allstar: true, is_rookie: false },
    { name: "Brad Daugherty", year: 1992, team: "CLE", position: ["C"], pts: 21.5, trb: 10.4, ast: 3.6, salary: 2900000, is_allstar: true, is_rookie: false },
    { name: "Donovan Mitchell", year: 2023, team: "CLE", position: ["SG"], pts: 28.3, trb: 4.3, ast: 4.4, salary: 30910000, is_allstar: true, is_rookie: false }
  ],
  "LAC": [
    { name: "Chris Paul", year: 2015, team: "LAC", position: ["PG"], pts: 19.1, trb: 4.6, ast: 10.2, salary: 20060000, is_allstar: true, is_rookie: false },
    { name: "Blake Griffin", year: 2014, team: "LAC", position: ["PF"], pts: 24.1, trb: 9.5, ast: 3.9, salary: 16400000, is_allstar: true, is_rookie: false },
    { name: "Bob McAdoo", year: 1976, team: "BUF", position: ["C", "PF"], pts: 31.1, trb: 12.4, ast: 4.0, salary: 250000, is_allstar: true, is_rookie: false },
    { name: "Kawhi Leonard", year: 2020, team: "LAC", position: ["SF"], pts: 27.1, trb: 7.1, ast: 4.9, salary: 32740000, is_allstar: true, is_rookie: false },
    { name: "Elton Brand", year: 2006, team: "LAC", position: ["PF", "C"], pts: 24.7, trb: 10.0, ast: 2.6, salary: 12000000, is_allstar: true, is_rookie: false }
  ],
  "MEM": [
    { name: "Marc Gasol", year: 2015, team: "MEM", position: ["C"], pts: 17.4, trb: 7.8, ast: 3.8, salary: 15800000, is_allstar: true, is_rookie: false },
    { name: "Zach Randolph", year: 2011, team: "MEM", position: ["PF"], pts: 20.1, trb: 12.2, ast: 2.2, salary: 17300000, is_allstar: false, is_rookie: false },
    { name: "Mike Conley", year: 2017, team: "MEM", position: ["PG"], pts: 20.5, trb: 3.5, ast: 6.3, salary: 26540000, is_allstar: false, is_rookie: false },
    { name: "Shareef Abdur-Rahim", year: 1999, team: "VAN", position: ["PF", "SF"], pts: 23.0, trb: 7.5, ast: 3.4, salary: 5000000, is_allstar: false, is_rookie: false },
    { name: "Ja Morant", year: 2022, team: "MEM", position: ["PG"], pts: 27.4, trb: 5.7, ast: 6.7, salary: 9600000, is_allstar: true, is_rookie: false }
  ],
  "NOP": [
    { name: "Anthony Davis", year: 2018, team: "NOP", position: ["PF", "C"], pts: 28.1, trb: 11.1, ast: 2.3, salary: 23770000, is_allstar: true, is_rookie: false },
    { name: "Chris Paul", year: 2008, team: "NOH", position: ["PG"], pts: 21.1, trb: 4.0, ast: 11.6, salary: 3600000, is_allstar: true, is_rookie: false },
    { name: "Baron Davis", year: 2004, team: "NOH", position: ["PG"], pts: 22.9, trb: 4.3, ast: 7.5, salary: 11200000, is_allstar: true, is_rookie: false },
    { name: "Zion Williamson", year: 2021, team: "NOP", position: ["PF"], pts: 27.0, trb: 7.2, ast: 3.7, salary: 10240000, is_allstar: true, is_rookie: false },
    { name: "Jrue Holiday", year: 2018, team: "NOP", position: ["SG", "PG"], pts: 19.0, trb: 4.5, ast: 6.0, salary: 25680000, is_allstar: false, is_rookie: false }
  ],
  "MIN": [
    { name: "Kevin Garnett", year: 2004, team: "MIN", position: ["PF"], pts: 24.2, trb: 13.9, ast: 5.0, salary: 28000000, is_allstar: true, is_rookie: false },
    { name: "Kevin Love", year: 2014, team: "MIN", position: ["PF"], pts: 26.1, trb: 12.5, ast: 4.4, salary: 14690000, is_allstar: true, is_rookie: false },
    { name: "Karl-Anthony Towns", year: 2018, team: "MIN", position: ["C"], pts: 21.3, trb: 12.3, ast: 2.4, salary: 6200000, is_allstar: true, is_rookie: false },
    { name: "Anthony Edwards", year: 2024, team: "MIN", position: ["SG"], pts: 25.9, trb: 5.4, ast: 5.1, salary: 13530000, is_allstar: true, is_rookie: false },
    { name: "Sam Cassell", year: 2004, team: "MIN", position: ["PG"], pts: 19.8, trb: 3.3, ast: 7.3, salary: 5050000, is_allstar: true, is_rookie: false }
  ],
  "SAC": [
    { name: "Chris Webber", year: 2001, team: "SAC", position: ["PF", "C"], pts: 27.1, trb: 11.1, ast: 4.2, salary: 12100000, is_allstar: true, is_rookie: false },
    { name: "Mitch Richmond", year: 1997, team: "SAC", position: ["SG"], pts: 25.9, trb: 3.9, ast: 4.2, salary: 3820000, is_allstar: true, is_rookie: false },
    { name: "Tiny Archibald", year: 1973, team: "KCO", position: ["PG"], pts: 34.0, trb: 2.8, ast: 11.4, salary: 120000, is_allstar: true, is_rookie: false },
    { name: "Peja Stojakovic", year: 2004, team: "SAC", position: ["SF"], pts: 24.2, trb: 6.3, ast: 2.1, salary: 6800000, is_allstar: true, is_rookie: false },
    { name: "De'Aaron Fox", year: 2023, team: "SAC", position: ["PG"], pts: 25.0, trb: 4.2, ast: 6.1, salary: 30350000, is_allstar: true, is_rookie: false }
  ],
  "ATL": [
    { name: "Bob Pettit", year: 1959, team: "SLH", position: ["PF", "C"], pts: 29.2, trb: 16.4, ast: 3.1, salary: 30000, is_allstar: true, is_rookie: false },
    { name: "Dominique Wilkins", year: 1986, team: "ATL", position: ["SF"], pts: 30.3, trb: 7.9, ast: 2.6, salary: 585000, is_allstar: true, is_rookie: false },
    { name: "Trae Young", year: 2022, team: "ATL", position: ["PG"], pts: 28.4, trb: 3.7, ast: 9.7, salary: 8320000, is_allstar: true, is_rookie: false },
    { name: "Dikembe Mutombo", year: 2000, team: "ATL", position: ["C"], pts: 11.5, trb: 14.1, ast: 1.3, salary: 11200000, is_allstar: true, is_rookie: false },
    { name: "Al Horford", year: 2015, team: "ATL", position: ["C", "PF"], pts: 15.2, trb: 7.2, ast: 3.2, salary: 12000000, is_allstar: true, is_rookie: false }
  ],
  "CHA": [
    { name: "Larry Johnson", year: 1993, team: "CHH", position: ["PF"], pts: 22.1, trb: 10.5, ast: 4.3, salary: 2600000, is_allstar: true, is_rookie: false },
    { name: "Alonzo Mourning", year: 1994, team: "CHH", position: ["C"], pts: 21.5, trb: 10.2, ast: 1.4, salary: 3300000, is_allstar: true, is_rookie: false },
    { name: "Kemba Walker", year: 2019, team: "CHA", position: ["PG"], pts: 25.6, trb: 4.4, ast: 5.9, salary: 12000000, is_allstar: true, is_rookie: false },
    { name: "Glen Rice", year: 1997, team: "CHH", position: ["SF"], pts: 26.8, trb: 4.0, ast: 2.0, salary: 4500000, is_allstar: true, is_rookie: false },
    { name: "LaMelo Ball", year: 2023, team: "CHA", position: ["PG"], pts: 23.3, trb: 6.4, ast: 8.4, salary: 8600000, is_allstar: false, is_rookie: false }
  ],
  "WAS": [
    { name: "Elvin Hayes", year: 1979, team: "WSB", position: ["PF", "C"], pts: 21.8, trb: 12.1, ast: 1.7, salary: 350000, is_allstar: true, is_rookie: false },
    { name: "Wes Unseld", year: 1969, team: "BAL", position: ["C", "PF"], pts: 13.8, trb: 18.2, ast: 2.6, salary: 50000, is_allstar: true, is_rookie: true },
    { name: "Gilbert Arenas", year: 2006, team: "WAS", position: ["PG"], pts: 29.3, trb: 3.5, ast: 6.1, salary: 11000000, is_allstar: true, is_rookie: false },
    { name: "John Wall", year: 2017, team: "WAS", position: ["PG"], pts: 23.1, trb: 4.2, ast: 10.7, salary: 16960000, is_allstar: true, is_rookie: false },
    { name: "Bradley Beal", year: 2021, team: "WAS", position: ["SG"], pts: 31.3, trb: 4.7, ast: 4.4, salary: 28750000, is_allstar: true, is_rookie: false }
  ]
};

function getLegendsForTeam(teamAbbr) {
  return LEGENDS_BY_FRANCHISE[teamAbbr] || [];
}

module.exports = {
  getLegendsForTeam
};
