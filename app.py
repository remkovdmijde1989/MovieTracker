import os
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import threading
import webbrowser

PORT = 8080
DB_FILE = "resources/db.json"
SETTINGS_FILE = "resources/settings.json"

def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    return {}

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return {}

def save_settings(data):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f, indent=4)

def get_settings():
    if not os.path.exists(SETTINGS_FILE):
        default_settings = {
            "volume_path": "",
            "user1_name": "",
            "user2_name": "",
            "omdb_api_key": ""
        }
        save_settings(default_settings)
        return default_settings
        
    settings = load_settings()
    return {
        "volume_path": settings.get("volume_path", ""),
        "user1_name": settings.get("user1_name", ""),
        "user2_name": settings.get("user2_name", ""),
        "omdb_api_key": settings.get("omdb_api_key", "")
    }

def parse_title(filename, parent_dir=""):
    name = os.path.splitext(filename)[0]
    name = re.sub(r'\b(2160p|4k|1080p|720p|480p|bluray|brrip|webrip|web-dl|hdtv|hevc|x265|x264|10bit|YIFY|RARBG|TGx|GalaxyRG|YTS\.AM|AAC|VLiS|DD5\.1|1600MB|JRR|Ghost|Silence|RCVR|i_c|GWC)\b', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[\.\[\]\(\)\-_]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def get_series_info(rel_dir, filename):
    # Detect if it's a TV series based on S01E01 or Season 1
    m = re.search(r'^(.*?)[ \.\-_]*S\d+E\d+', filename, re.I)
    if not m:
        m = re.search(r'^(.*?)[ \.\-_]*(S\d+|Season \d+)', rel_dir, re.I)
    
    if m:
        raw_title = m.group(1).replace('.', ' ').strip()
        # Clean up year and common suffixes
        clean_title = re.sub(r'\(\d{4}\)', '', raw_title)
        clean_title = re.sub(r'(?i)\buk$', '', clean_title)
        clean_title = clean_title.strip()
        
        # Determine season/episode if possible just for info
        season, ep = None, None
        se_match = re.search(r'S(\d+)E(\d+)', filename, re.I)
        if se_match:
            season, ep = int(se_match.group(1)), int(se_match.group(2))
            
        return clean_title.title(), season, ep
    return None, None, None

def scan_movies():
    db = load_db()
    settings = get_settings()
    volume_path = settings.get("volume_path", "")
    video_exts = {'.mkv', '.mp4', '.avi', '.m4v'}
    
    movies_list = []
    series_dict = {}
    
    if os.path.exists(volume_path) and volume_path.strip():
        for root, dirs, files in os.walk(volume_path):
            if '/.' in root or '/Featurettes' in root or '/Subs' in root:
                continue
            for f in files:
                if f.lower().endswith(tuple(video_exts)):
                    full_path = os.path.join(root, f)
                    try:
                        size_mb = os.path.getsize(full_path) / (1024*1024)
                        if size_mb > 150:
                            rel_dir = os.path.relpath(root, volume_path)
                            series_title, s, e = get_series_info(rel_dir, f)
                            
                            subtitle_path = os.path.splitext(full_path)[0] + '.srt'
                            has_subtitle = os.path.exists(subtitle_path)
                            
                            if series_title:
                                series_id = f"series:{series_title}"
                                if series_id not in series_dict:
                                    series_dict[series_id] = {
                                        "id": series_id,
                                        "type": "series",
                                        "title": series_title,
                                        "watched": False,
                                        "watched_remko": False,
                                        "watched_mikaela": False,
                                        "mapped_name": "",
                                        "rm_rating": "",
                                        "imdb": "N/A",
                                        "rt_critics": "N/A",
                                        "poster": "",
                                        "season": "",
                                        "episode": "",
                                        "episodes_count": 0,
                                        "episodes": []
                                    }
                                series_dict[series_id]["episodes_count"] += 1
                                series_dict[series_id]["episodes"].append({
                                    "filename": f,
                                    "filepath": full_path,
                                    "season": s,
                                    "episode": e,
                                    "subtitle_path": subtitle_path if has_subtitle else ""
                                })
                            else:
                                movies_list.append({
                                    "id": f,
                                    "filename": f,
                                    "filepath": full_path,
                                    "type": "movie",
                                    "title": parse_title(f, rel_dir),
                                    "watched": False,
                                    "watched_remko": False,
                                    "watched_mikaela": False,
                                    "mapped_name": "",
                                    "rm_rating": "",
                                    "imdb": "N/A",
                                    "rt_critics": "N/A",
                                    "poster": "",
                                    "subtitle_path": subtitle_path if has_subtitle else ""
                                })
                    except OSError:
                        pass
                        
    final_list = []
    
    # Process movies with DB
    for m in movies_list:
        fid = m["id"]
        if fid in db: m.update(db[fid])
        final_list.append(m)
        
    # Process series with DB and Preloaded
    for sid, s in series_dict.items():
        if sid in db: s.update(db[sid])
        final_list.append(s)
        
    final_list.sort(key=lambda x: x["title"].lower())
    return final_list

class RequestHandler(BaseHTTPRequestHandler):
    def _send_response(self, content, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content.encode('utf-8'))

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/movies':
            movies = scan_movies()
            self._send_response(json.dumps(movies))
        elif parsed_path.path == '/api/video':
            import urllib.parse
            query = urllib.parse.parse_qs(parsed_path.query)
            if 'path' in query:
                filepath = query['path'][0]
                if os.path.exists(filepath):
                    file_size = os.path.getsize(filepath)
                    import mimetypes
                    mime_type, _ = mimetypes.guess_type(filepath)
                    if not mime_type:
                        mime_type = 'video/mp4'
                    
                    range_header = self.headers.get('Range', None)
                    if range_header:
                        import re
                        m = re.search(r'bytes=(\d+)-(\d*)', range_header)
                        if m:
                            start = int(m.group(1))
                            end = m.group(2)
                            if end:
                                end = int(end)
                            else:
                                end = file_size - 1
                            
                            length = end - start + 1
                            self.send_response(206)
                            self.send_header('Content-Type', mime_type)
                            self.send_header('Content-Length', str(length))
                            self.send_header('Accept-Ranges', 'bytes')
                            self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                            self.end_headers()
                            
                            try:
                                with open(filepath, 'rb') as f:
                                    f.seek(start)
                                    remaining = length
                                    chunk_size = 8192
                                    while remaining > 0:
                                        chunk = f.read(min(chunk_size, remaining))
                                        if not chunk: break
                                        self.wfile.write(chunk)
                                        remaining -= len(chunk)
                            except (ConnectionResetError, BrokenPipeError):
                                pass
                            return
                    
                    self.send_response(200)
                    self.send_header('Content-Type', mime_type)
                    self.send_header('Content-Length', str(file_size))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()
                    try:
                        with open(filepath, 'rb') as f:
                            import shutil
                            shutil.copyfileobj(f, self.wfile)
                    except (ConnectionResetError, BrokenPipeError):
                        pass
                    return
            self.send_response(404)
            self.end_headers()
        elif parsed_path.path == '/api/subtitle':
            import urllib.parse
            query = urllib.parse.parse_qs(parsed_path.query)
            if 'path' in query:
                filepath = query['path'][0]
                if os.path.exists(filepath):
                    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                        srt_content = f.read()
                    vtt_content = "WEBVTT\n\n" + srt_content.replace(',', '.')
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/vtt')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(vtt_content.encode('utf-8'))
                    return
            self.send_response(404)
            self.end_headers()
        elif parsed_path.path == '/api/settings':
            settings = get_settings()
            self._send_response(json.dumps(settings))
        elif parsed_path.path == '/':
            try:
                with open('resources/index.html', 'r') as f:
                    self._send_response(f.read(), content_type='text/html')
            except FileNotFoundError:
                self._send_response("index.html not found", status=404, content_type="text/plain")
        elif parsed_path.path == '/styles.css':
            try:
                with open('resources/styles.css', 'r') as f:
                    self._send_response(f.read(), content_type='text/css')
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
        elif parsed_path.path == '/script.js':
            try:
                with open('resources/script.js', 'r') as f:
                    self._send_response(f.read(), content_type='application/javascript')
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/settings/update':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            settings = load_settings()
            for k in ['volume_path', 'user1_name', 'user2_name', 'omdb_api_key']:
                if k in data:
                    settings[k] = data[k]
            save_settings(settings)
            self._send_response(json.dumps({"status": "success"}))
        elif parsed_path.path == '/api/movies/update':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            item_id = data.get('id')
            if item_id:
                db = load_db()
                if item_id not in db:
                    db[item_id] = {}
                
                for k in ['watched', 'watched_remko', 'watched_mikaela', 'mapped_name', 'rm_rating', 'imdb', 'rt_critics', 'poster', 'title', 'season', 'episode', 'imdb_id']:
                    if k in data:
                        db[item_id][k] = data[k]
                
                save_db(db)
                self._send_response(json.dumps({"status": "success"}))
            else:
                self._send_response(json.dumps({"error": "No ID provided"}), status=400)
        elif parsed_path.path == '/api/movies/fetch_ratings':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            item_id = data.get('id')
            title = data.get('title', '')
            imdb_id = data.get('imdb_id', '')
            
            settings = get_settings()
            api_key = settings.get('omdb_api_key', '')
            
            if not api_key:
                self._send_response(json.dumps({"error": "No API key"}), status=400)
                return
                
            import urllib.request
            import urllib.parse
            
            if imdb_id:
                query = urllib.parse.urlencode({'i': imdb_id, 'apikey': api_key})
            else:
                year = ''
                year_match = re.search(r'\b(19|20)\d{2}\b', title)
                if year_match:
                    year = year_match.group(0)
                    title = title.replace(year, '').strip()
                query = urllib.parse.urlencode({'t': title, 'y': year, 'apikey': api_key})
                
            url = f"http://www.omdbapi.com/?{query}"
            
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req) as response:
                    omdb_data = json.loads(response.read().decode())
                    if omdb_data.get('Response') == 'True':
                        updates = {}
                        imdb = omdb_data.get('imdbRating', 'N/A')
                        if imdb != 'N/A': updates['imdb'] = imdb
                        
                        found_id = omdb_data.get('imdbID')
                        if found_id: updates['imdb_id'] = found_id
                        
                        for rating in omdb_data.get('Ratings', []):
                            if rating['Source'] == 'Rotten Tomatoes':
                                updates['rt_critics'] = rating['Value'].replace('%', '')
                        
                        poster = omdb_data.get('Poster')
                        if poster:
                            updates['poster'] = poster
                            
                        plot = omdb_data.get('Plot', 'N/A')
                        if plot != 'N/A':
                            updates['plot'] = plot
                            
                        genre = omdb_data.get('Genre', 'N/A')
                        if genre != 'N/A':
                            updates['genre'] = genre
                        
                        if updates:
                            db = load_db()
                            if item_id not in db: db[item_id] = {}
                            db[item_id].update(updates)
                            save_db(db)
                            self._send_response(json.dumps({"status": "success", "updates": updates}))
                            return
                        else:
                            self._send_response(json.dumps({"status": "no_updates"}))
                            return
                    else:
                        self._send_response(json.dumps({"error": "Movie not found"}))
                        return
            except Exception as e:
                print("OMDb Error:", e)
                
            self._send_response(json.dumps({"error": "Failed to fetch"}), status=500)
        elif parsed_path.path == '/api/movies/search_omdb':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            title = data.get('title', '')
            settings = get_settings()
            api_key = settings.get('omdb_api_key', '')
            if not api_key:
                self._send_response(json.dumps({"error": "No API key"}), status=400)
                return
                
            import urllib.request
            import urllib.parse
            query = urllib.parse.urlencode({'s': title, 'apikey': api_key})
            url = f"http://www.omdbapi.com/?{query}"
            
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req) as response:
                    omdb_data = json.loads(response.read().decode())
                    if omdb_data.get('Response') == 'True':
                        self._send_response(json.dumps({"status": "success", "results": omdb_data.get('Search', [])}))
                        return
                    else:
                        self._send_response(json.dumps({"error": omdb_data.get('Error', 'No results found')}))
                        return
            except Exception as e:
                print("OMDb Search Error:", e)
                self._send_response(json.dumps({"error": str(e)}), status=500)
                
            self._send_response(json.dumps({"error": "Failed to search"}), status=500)
        else:
            self.send_response(404)
            self.end_headers()
            
    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"🎬 Movie Tracker Server running at http://localhost:{PORT}")
    
    # Open the browser automatically
    webbrowser.open(f'http://localhost:{PORT}')
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
