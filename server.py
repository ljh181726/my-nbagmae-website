# ─────────────────────────────────────────────
#  server.py  –  Flask backend for NBA Draft Showdown
#  Fetches live NBA rosters + All-Star data + entry year
# ─────────────────────────────────────────────
import json
import os
import sys
import time
import urllib.request
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
import traceback
from datetime import datetime, timedelta
from flask import Flask, jsonify, send_from_directory, request

app = Flask(__name__, static_folder='.', static_url_path='')

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'players_cache.json')
CACHE_TTL_HOURS = 24

# ── Team colors (stable data, no API needed) ────────────
TEAM_COLORS = {
    1610612737: {"primaryColor": "#E03A3E", "secondaryColor": "#C1D32F", "logo": "🦅"},
    1610612738: {"primaryColor": "#007A33", "secondaryColor": "#BA9653", "logo": "🍀"},
    1610612751: {"primaryColor": "#000000", "secondaryColor": "#FFFFFF", "logo": "⬛"},
    1610612766: {"primaryColor": "#1D1160", "secondaryColor": "#00788C", "logo": "🐝"},
    1610612741: {"primaryColor": "#CE1141", "secondaryColor": "#000000", "logo": "🐂"},
    1610612739: {"primaryColor": "#860038", "secondaryColor": "#FDBB30", "logo": "🗡️"},
    1610612742: {"primaryColor": "#00538C", "secondaryColor": "#002B5E", "logo": "🐴"},
    1610612743: {"primaryColor": "#0E2240", "secondaryColor": "#FEC524", "logo": "⛏️"},
    1610612765: {"primaryColor": "#C8102E", "secondaryColor": "#1D42BA", "logo": "🔧"},
    1610612744: {"primaryColor": "#1D428A", "secondaryColor": "#FFC72C", "logo": "🔵"},
    1610612745: {"primaryColor": "#CE1141", "secondaryColor": "#000000", "logo": "🚀"},
    1610612754: {"primaryColor": "#002D62", "secondaryColor": "#FDBB30", "logo": "🏎️"},
    1610612746: {"primaryColor": "#C8102E", "secondaryColor": "#1D428A", "logo": "⛵"},
    1610612747: {"primaryColor": "#552583", "secondaryColor": "#FDB927", "logo": "🟣"},
    1610612763: {"primaryColor": "#5D76A9", "secondaryColor": "#12173F", "logo": "🐻"},
    1610612748: {"primaryColor": "#98002E", "secondaryColor": "#F9A01B", "logo": "🔥"},
    1610612749: {"primaryColor": "#00471B", "secondaryColor": "#EEE1C6", "logo": "🦌"},
    1610612750: {"primaryColor": "#0C2340", "secondaryColor": "#236192", "logo": "🐺"},
    1610612740: {"primaryColor": "#0C2340", "secondaryColor": "#C8102E", "logo": "⚜️"},
    1610612752: {"primaryColor": "#006BB6", "secondaryColor": "#F58426", "logo": "🗽"},
    1610612760: {"primaryColor": "#007AC1", "secondaryColor": "#EF6020", "logo": "⚡"},
    1610612753: {"primaryColor": "#0077C0", "secondaryColor": "#C4CED4", "logo": "✨"},
    1610612755: {"primaryColor": "#006BB6", "secondaryColor": "#ED174C", "logo": "🔔"},
    1610612756: {"primaryColor": "#1D1160", "secondaryColor": "#E56020", "logo": "☀️"},
    1610612757: {"primaryColor": "#E03A3E", "secondaryColor": "#000000", "logo": "🌹"},
    1610612758: {"primaryColor": "#5A2D81", "secondaryColor": "#63727A", "logo": "👑"},
    1610612759: {"primaryColor": "#C4CED4", "secondaryColor": "#000000", "logo": "⭐"},
    1610612761: {"primaryColor": "#CE1141", "secondaryColor": "#000000", "logo": "🦖"},
    1610612762: {"primaryColor": "#002B5C", "secondaryColor": "#00471B", "logo": "🎷"},
    1610612764: {"primaryColor": "#002B5C", "secondaryColor": "#E31837", "logo": "🧙"},
}


# ══════════════════════════════════════════════
#  Headers & Cache Configuration
# ══════════════════════════════════════════════
CUSTOM_HEADERS = {
    'Host': 'stats.nba.com',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nba.com/',
}

def get_cache(ignore_ttl=False):
    if not os.path.exists(CACHE_FILE):
        return None
    try:
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            cache = json.load(f)
        if ignore_ttl:
            return cache.get('data')
        cached_time = datetime.fromisoformat(cache.get('timestamp', '2000-01-01'))
        if datetime.now() - cached_time < timedelta(hours=CACHE_TTL_HOURS):
            return cache['data']
    except Exception:
        pass
    return None


def save_cache(data):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'timestamp': datetime.now().isoformat(), 'data': data},
                      f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Failed to write cache file: {e}")


# ══════════════════════════════════════════════
# Mapping ESPN team abbreviations to standard NBA abbreviations
ESPN_TO_NBA_ABBR = {
    "ATL": "ATL", "BOS": "BOS", "NO": "NOP", "CHI": "CHI", "CLE": "CLE",
    "DAL": "DAL", "DEN": "DEN", "DET": "DET", "GS": "GSW", "HOU": "HOU",
    "IND": "IND", "LAC": "LAC", "LAL": "LAL", "MIA": "MIA", "MIL": "MIL",
    "MIN": "MIN", "BKN": "BKN", "NY": "NYK", "ORL": "ORL", "PHI": "PHI",
    "PHX": "PHX", "POR": "POR", "SAC": "SAC", "SA": "SAS", "OKC": "OKC",
    "UTAH": "UTA", "WSH": "WAS", "TOR": "TOR", "MEM": "MEM", "CHA": "CHA"
}

def clean_name(name):
    """Normalize names (remove accents/diacritics, lowercase, strip suffixes) for robust matching."""
    import unicodedata
    import re
    if not name:
        return ""
    name = str(name)
    nfkd_form = unicodedata.normalize('NFKD', name)
    only_ascii = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    only_ascii = only_ascii.replace(".", "")
    # Remove common suffixes like Jr, Sr, III
    only_ascii = re.sub(r'\s+(Jr|Sr|III|II|IV|V)$', '', only_ascii, flags=re.IGNORECASE)
    return only_ascii.strip().lower()

def convert_height(display_height):
    """Convert '6\' 7"' to '6-7' format."""
    import re
    if not display_height:
        return "6-6"
    match = re.match(r"(\d+)'\s*(\d+)\"", str(display_height))
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return "6-6"

def map_position(pos_abbr):
    """Map ESPN position abbreviation to PG/SG/SF/PF/C list."""
    pos = str(pos_abbr).upper()
    if pos == "PG":
        return ["PG"]
    elif pos == "SG":
        return ["SG"]
    elif pos == "SF":
        return ["SF"]
    elif pos == "PF":
        return ["PF"]
    elif pos == "C":
        return ["C"]
    elif pos == "G":
        return ["PG", "SG"]
    elif pos == "F":
        return ["SF", "PF"]
    elif "G" in pos and "F" in pos:
        return ["SG", "SF"]
    return ["SF"]

def fetch_fresh_espn_data():
    """Fetch all rosters from ESPN API and merge BBGM All-Star & rookie years."""
    print("  📋 Downloading BBGM roster JSON for historical mapping...")
    bbgm_url = "https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json"
    bbgm_lookup = {}
    try:
        req = urllib.request.Request(bbgm_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            bbgm_data = json.loads(response.read().decode('utf-8'))
            for p in bbgm_data.get('players', []):
                name = p.get('name')
                if not name:
                    first_name = p.get('firstName', '')
                    last_name = p.get('lastName', '')
                    name = f"{first_name} {last_name}".strip()
                if not name:
                    continue
                cleaned = clean_name(name)
                draft_year = p.get('draft', {}).get('year', 2020)
                awards = p.get('awards', [])
                allstar_count = sum(1 for a in awards if 'All-Star' in a.get('type', ''))
                bbgm_lookup[cleaned] = {
                    "allStarCount": allstar_count,
                    "rookieYear": draft_year
                }
        print("    → BBGM data loaded successfully!")
    except Exception as e:
        print(f"    ⚠️ Error downloading BBGM data: {e}. All-Star counts will default to 0.")

    # 30 teams configuration with colors and logos
    teams_config = [
        {"name": "Los Angeles Lakers",       "abbreviation": "LAL", "teamId": 13, "logo": "🟣", "primaryColor": "#552583", "secondaryColor": "#FDB927"},
        {"name": "Golden State Warriors",    "abbreviation": "GSW", "teamId": 9,  "logo": "🔵", "primaryColor": "#1D428A", "secondaryColor": "#FFC72C"},
        {"name": "Boston Celtics",           "abbreviation": "BOS", "teamId": 2,  "logo": "🟢", "primaryColor": "#007A33", "secondaryColor": "#BA9653"},
        {"name": "Chicago Bulls",            "abbreviation": "CHI", "teamId": 4,  "logo": "🔴", "primaryColor": "#CE1141", "secondaryColor": "#000000"},
        {"name": "Miami Heat",               "abbreviation": "MIA", "teamId": 14, "logo": "🔥", "primaryColor": "#98002E", "secondaryColor": "#F9A01B"},
        {"name": "Brooklyn Nets",            "abbreviation": "BKN", "teamId": 17, "logo": "⬛", "primaryColor": "#000000", "secondaryColor": "#FFFFFF"},
        {"name": "Milwaukee Bucks",          "abbreviation": "MIL", "teamId": 15, "logo": "🦌", "primaryColor": "#00471B", "secondaryColor": "#EEE1C6"},
        {"name": "Philadelphia 76ers",       "abbreviation": "PHI", "teamId": 20, "logo": "🔔", "primaryColor": "#006BB6", "secondaryColor": "#ED174C"},
        {"name": "Phoenix Suns",             "abbreviation": "PHX", "teamId": 21, "logo": "☀️", "primaryColor": "#1D1160", "secondaryColor": "#E56020"},
        {"name": "Dallas Mavericks",         "abbreviation": "DAL", "teamId": 6,  "logo": "🐴", "primaryColor": "#00538C", "secondaryColor": "#002B5E"},
        {"name": "Denver Nuggets",           "abbreviation": "DEN", "teamId": 7,  "logo": "⛏️", "primaryColor": "#0E2240", "secondaryColor": "#FEC524"},
        {"name": "Cleveland Cavaliers",      "abbreviation": "CLE", "teamId": 5,  "logo": "🗡️", "primaryColor": "#860038", "secondaryColor": "#FDBB30"},
        {"name": "Toronto Raptors",          "abbreviation": "TOR", "teamId": 28, "logo": "🦖", "primaryColor": "#CE1141", "secondaryColor": "#000000"},
        {"name": "San Antonio Spurs",        "abbreviation": "SAS", "teamId": 24, "logo": "⭐", "primaryColor": "#C4CED4", "secondaryColor": "#000000"},
        {"name": "Oklahoma City Thunder",    "abbreviation": "OKC", "teamId": 25, "logo": "⚡", "primaryColor": "#007AC1", "secondaryColor": "#EF6020"},
        {"name": "Houston Rockets",          "abbreviation": "HOU", "teamId": 10, "logo": "🚀", "primaryColor": "#CE1141", "secondaryColor": "#000000"},
        {"name": "Atlanta Hawks",            "abbreviation": "ATL", "teamId": 1,  "logo": "🦅", "primaryColor": "#E03A3E", "secondaryColor": "#C1D32F"},
        {"name": "New York Knicks",          "abbreviation": "NYK", "teamId": 18, "logo": "🗽", "primaryColor": "#006BB6", "secondaryColor": "#F58426"},
        {"name": "Memphis Grizzlies",        "abbreviation": "MEM", "teamId": 29, "logo": "🐻", "primaryColor": "#5D76A9", "secondaryColor": "#12173F"},
        {"name": "New Orleans Pelicans",     "abbreviation": "NOP", "teamId": 3,  "logo": "⚜️", "primaryColor": "#0C2340", "secondaryColor": "#C8102E"},
        {"name": "Minnesota Timberwolves",   "abbreviation": "MIN", "teamId": 16, "logo": "🐺", "primaryColor": "#0C2340", "secondaryColor": "#236192"},
        {"name": "Sacramento Kings",         "abbreviation": "SAC", "teamId": 23, "logo": "👑", "primaryColor": "#5A2D81", "secondaryColor": "#63727A"},
        {"name": "Portland Trail Blazers",   "abbreviation": "POR", "teamId": 22, "logo": "🔥", "primaryColor": "#E03A3E", "secondaryColor": "#000000"},
        {"name": "Indiana Pacers",           "abbreviation": "IND", "teamId": 11, "logo": "🏎️", "primaryColor": "#002D62", "secondaryColor": "#FDBB30"},
        {"name": "Utah Jazz",                "abbreviation": "UTA", "teamId": 26, "logo": "🎷", "primaryColor": "#002B5C", "secondaryColor": "#00471B"},
        {"name": "Charlotte Hornets",        "abbreviation": "CHA", "teamId": 30, "logo": "🐝", "primaryColor": "#1D1160", "secondaryColor": "#00788C"},
        {"name": "Washington Wizards",       "abbreviation": "WAS", "teamId": 27, "logo": "🧙", "primaryColor": "#002B5C", "secondaryColor": "#E31837"},
        {"name": "Detroit Pistons",          "abbreviation": "DET", "teamId": 8,  "logo": "🔧", "primaryColor": "#C8102E", "secondaryColor": "#1D42BA"},
        {"name": "Orlando Magic",            "abbreviation": "ORL", "teamId": 19, "logo": "✨", "primaryColor": "#0077C0", "secondaryColor": "#C4CED4"},
        {"name": "Los Angeles Clippers",     "abbreviation": "LAC", "teamId": 12, "logo": "⛵", "primaryColor": "#C8102E", "secondaryColor": "#1D428A"}
    ]

    players_by_team = {}
    teams_list = []
    
    print("  🏀 Fetching rosters from ESPN API...")
    for team in teams_config:
        team_id = team["teamId"]
        abbr = team["abbreviation"]
        
        teams_list.append({
            "name": team["name"],
            "abbreviation": abbr,
            "nickname": team["name"].split()[-1],
            "teamId": team_id,
            "primaryColor": team["primaryColor"],
            "secondaryColor": team["secondaryColor"],
            "logo": team["logo"],
        })

        url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/roster"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
            
            athletes = data.get('athletes', [])
            players_list = []
            
            for a in athletes:
                name = a.get('fullName')
                if not name:
                    continue
                
                height = convert_height(a.get('displayHeight'))
                weight_str = str(a.get('displayWeight', '')).replace(" lbs", "").strip()
                age = a.get('age', 25)
                exp = a.get('experience', {}).get('years', 0)
                jersey = str(a.get('jersey', '0'))
                pos_abbr = a.get('position', {}).get('abbreviation', 'F')
                positions = map_position(pos_abbr)
                
                cleaned = clean_name(name)
                history = bbgm_lookup.get(cleaned, {})
                allstar_count = history.get("allStarCount", 0)
                rookie_year = int(history.get("rookieYear", a.get('debutYear', datetime.now().year - exp)))
                
                player_obj = {
                    "name": name,
                    "playerId": int(a.get('id', hash(name))),
                    "jerseyNumber": jersey,
                    "positions": positions,
                    "height": height,
                    "weight": weight_str,
                    "age": age,
                    "experience": exp,
                    "teamAbbr": abbr,
                    "allStarCount": allstar_count,
                    "rookieYear": rookie_year
                }
                players_list.append(player_obj)
                
            players_by_team[abbr] = players_list
            time.sleep(0.02)
        except Exception as e:
            print(f"  ❌ Error fetching team {abbr}: {e}")
            players_by_team[abbr] = []

    return {
        "teams": teams_list,
        "playersByTeam": players_by_team
    }

def get_nba_data():
    cached = get_cache(ignore_ttl=False)
    if cached:
        total = sum(len(v) for v in cached.get('playersByTeam', {}).values())
        print(f"✅ Using cached data ({total} players across {len(cached.get('teams', []))} teams)")
        return cached

    print("🔄 Fetching fresh NBA data...")
    try:
        data = fetch_fresh_espn_data()
        save_cache(data)
        total = sum(len(v) for v in data.get('playersByTeam', {}).values())
        print(f"✅ Done! {total} players cached.")
        return data
    except Exception as e:
        print(f"❌ Error fetching NBA data: {e}")
        traceback.print_exc()
        
        fallback_cached = get_cache(ignore_ttl=True)
        if fallback_cached:
            total = sum(len(v) for v in fallback_cached.get('playersByTeam', {}).values())
            print(f"⚠️ API call failed. Successfully fell back to expired/pre-populated cache ({total} players)")
            return fallback_cached

        print("❌ No cached data found. Return empty datasets.")
        return {"teams": [], "playersByTeam": {}}


# ── Load on startup ─────────────────────────
print("🏀 NBA Draft Showdown — Server starting...")
nba_data = get_nba_data()


# ── Routes ──────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data')
def api_data():
    return jsonify(nba_data)

@app.route('/api/refresh')
def api_refresh():
    global nba_data
    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)
    nba_data = get_nba_data()
    total = sum(len(v) for v in nba_data.get('playersByTeam', {}).values())
    return jsonify({"status": "ok", "totalPlayers": total})

@app.route('/api/config')
def api_config():
    config = {
        "hasGeminiKey": bool(os.environ.get("GEMINI_API_KEY"))
    }
    return jsonify(config)

@app.route('/api/evaluate', methods=['POST'])
def api_evaluate():
    req_data = request.get_json() or {}
    prompt = req_data.get("prompt", "")
    api_key = os.environ.get("GEMINI_API_KEY") or req_data.get("apiKey", "")
    
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
    if not api_key:
        return jsonify({"error": "Gemini API key is required"}), 400
        
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        body = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
        
        req_obj = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        with urllib.request.urlopen(req_obj, timeout=30) as res:
            response = json.loads(res.read().decode("utf-8"))
            
        text = response["candidates"][0]["content"]["parts"][0]["text"]
        return jsonify({"text": text})
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    print(f"🚀 Running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
