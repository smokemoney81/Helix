"""Magnetic: a local, session-isolated creative studio for public HF Spaces."""
import asyncio
import json
import logging
import os
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('MAGNETIC_DATA_DIR', ROOT / 'data'))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'studio.sqlite3'
MODELS = [
    dict(id='ltx', name='LTX-Video', owner='Lightricks', kind='video', space='Lightricks/ltx-video-distilled', host='https://lightricks-ltx-video-distilled.hf.space', endpoint='text_to_video', tag='Schnell & kreativ', description='Aus deiner Idee wird Bewegung. Kurze, atmosphärische Clips mit dem destillierten LTX-Modell.', license='Open Weights · Modelllizenz beachten', image='landscape.jpg'),
    dict(id='qwen', name='Qwen3-TTS', owner='Qwen', kind='voice', space='Qwen/Qwen3-TTS', host='https://qwen-qwen3-tts.hf.space', endpoint='generate_custom_voice', tag='Spricht Deutsch', description='Natürliche Stimmen, zehn Sprachen und ein Tonfall, der zu deiner Geschichte passt.', license='Apache 2.0 · Modell', image='voice'),
    dict(id='cog', name='CogVideoX-2B', owner='Z.ai', kind='video', space='zai-org/CogVideoX-2B-Space', host='https://zai-org-cogvideox-2b-space.hf.space', endpoint='generate', tag='Text zu Video', description='Verwandle detaillierte Beschreibungen in filmische Szenen und neue Perspektiven.', license='Apache 2.0 · Modell', image='ocean.jpg'),
    dict(id='kitten', name='KittenTTS', owner='KittenML', kind='voice', space='KittenML/KittenTTS-Demo', host='https://kittenml-kittentts-demo.hf.space', endpoint='synthesize', tag='CPU statt GPU', description='Leichte englische Voiceovers mit acht Stimmen. Läuft auf einem öffentlichen CPU-Space.', license='Apache 2.0 · Modell', image='wave'),
]
MODEL_MAP = {m['id']: m for m in MODELS}
TASKS = set()


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, session TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL, error TEXT, file TEXT, options TEXT NOT NULL)')
        db.execute("UPDATE jobs SET status='failed', error='Der Server wurde neu gestartet. Bitte erneut versuchen.' WHERE status IN ('queued','running')")


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield
    for task in list(TASKS):
        task.cancel()
    await asyncio.gather(*TASKS, return_exceptions=True)


app = FastAPI(title='Helix Studio', lifespan=lifespan)


@app.middleware('http')
async def session_middleware(request: Request, call_next):
    if request.method in ('POST', 'DELETE'):
        origin = request.headers.get('origin')
        if origin and urlparse(origin).netloc != request.headers.get('host'):
            return JSONResponse({'detail': 'Diese Anfrage stammt von einer anderen Website.'}, status_code=403)
        if request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'detail': 'Websiteübergreifende Anfrage blockiert.'}, status_code=403)
    session = request.cookies.get('magnetic_session', '')
    new = len(session) != 64 or any(c not in '0123456789abcdef' for c in session)
    request.state.session = secrets.token_hex(32) if new else session
    response = await call_next(request)
    if new:
        response.set_cookie('magnetic_session', request.state.session, httponly=True, samesite='strict', secure=request.url.scheme == 'https', max_age=31536000)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


class Generation(BaseModel):
    model: str
    prompt: str = Field(min_length=3, max_length=2000)
    aspect: str = '16:9'
    duration: int = Field(default=4, ge=2, le=6)
    seed: int = Field(default=42, ge=0, le=2147483647)
    language: str = 'German'
    speaker: str = 'Ryan'
    tone: str = Field(default='Speak warmly and naturally.', max_length=300)
    speed: float = Field(default=1.0, ge=0.5, le=2)


def arguments(g: Generation):
    if g.model not in MODEL_MAP:
        raise ValueError('Unbekanntes Modell.')
    if len(g.prompt.strip()) < 3:
        raise ValueError('Bitte gib mindestens drei Zeichen ein.')
    if g.aspect not in ('16:9', '9:16', '1:1'):
        raise ValueError('Ungültiges Seitenverhältnis.')
    if g.model == 'ltx':
        width, height = {'16:9': (768, 432), '9:16': (432, 768), '1:1': (512, 512)}[g.aspect]
        # LTX expects dimensions divisible by 32.
        width, height = (width // 32 * 32, height // 32 * 32)
        return [g.prompt.strip(), 'blurry, jittery, distorted, worst quality', None, None, height, width, 'text-to-video', g.duration, 9, g.seed, False, 1, True]
    if g.model == 'cog':
        return [g.prompt.strip(), 30, 6.0]
    if g.model == 'qwen':
        if g.language not in ('Auto','Chinese','English','Japanese','Korean','French','German','Spanish','Portuguese','Russian'):
            raise ValueError('Diese Sprache wird von Qwen nicht unterstützt.')
        if g.speaker not in ('Aiden','Dylan','Eric','Ono_anna','Ryan','Serena','Sohee','Uncle_fu','Vivian'):
            raise ValueError('Unbekannte Stimme.')
        return [g.prompt.strip(), g.language, g.speaker, g.tone, '0.6B']
    if g.language != 'English':
        raise ValueError('KittenTTS unterstützt Englisch. Für Deutsch nutze Qwen3-TTS.')
    if g.speaker not in ('Bella', 'Jasper', 'Luna', 'Bruno', 'Rosie', 'Hugo', 'Kiki', 'Leo'):
        raise ValueError('Unbekannte KittenTTS-Stimme.')
    return [g.prompt.strip(), 'Micro (40M - Balanced)', g.speaker, g.speed]



def update(job_id, **fields):
    with connect() as db:
        db.execute('UPDATE jobs SET '+', '.join(k+'=?' for k in fields)+' WHERE id=?', (*fields.values(), job_id))


def public_job(row):
    d = dict(row)
    d.pop('session')
    d['options'] = json.loads(d['options'])
    d['media_url'] = '/api/jobs/'+d['id']+'/media' if d.pop('file') else None
    return d


def headers():
    token = os.environ.get('HF_TOKEN')
    return {'Authorization': 'Bearer '+token} if token else {}


def find_media(value, host):
    if isinstance(value, dict):
        url = value.get('url')
        if isinstance(url, str) and urlparse(url).scheme == 'https' and urlparse(url).netloc == urlparse(host).netloc:
            return url
        for v in value.values():
            found = find_media(v, host)
            if found:
                return found
    elif isinstance(value, list):
        for v in value:
            found = find_media(v, host)
            if found:
                return found
    return None


def friendly_error(error):
    text = str(error).lower()
    if any(word in text for word in ['quota', 'exceeded', '429', 'zerogpu']):
        return 'Das kostenlose GPU-Kontingent dieses Spaces ist ausgelastet. Versuche es später erneut oder öffne den Space direkt.'
    if any(word in text for word in ['401', '403', 'sign in', 'authentication']):
        return 'Dieser Space verlangt eine Hugging-Face-Anmeldung. Öffne ihn direkt oder hinterlege HF_TOKEN auf dem Server.'
    if any(word in text for word in ['503', '502', '404', 'sleeping']):
        return 'Der Hugging-Face-Space ist gerade nicht verfügbar. Versuche ein anderes Modell oder öffne den Space direkt.'
    if isinstance(error, (TimeoutError, httpx.TimeoutException)):
        return 'Der Space hat innerhalb von 10 Minuten kein Ergebnis geliefert. Bitte später erneut versuchen.'
    return 'Der Space konnte kein Ergebnis liefern. Möglicherweise ist seine Warteschlange voll oder die API eingeschränkt. Öffne den Space direkt oder versuche es erneut.'


async def generate(job_id, g):
    model = MODEL_MAP[g.model]
    base = model['host']+'/gradio_api/call/'+model['endpoint']
    update(job_id, status='running')
    partial = DATA / (job_id+'.part')
    try:
        async with asyncio.timeout(600):
            async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=600), headers=headers()) as client:
                response = await client.post(base, json={'data': arguments(g)})
                response.raise_for_status()
                event_id = response.json().get('event_id')
                if not isinstance(event_id, str) or not event_id.isalnum():
                    raise ValueError('Invalid event id')
                result = None
                async with client.stream('GET', base+'/'+event_id) as stream:
                    stream.raise_for_status()
                    event = ''
                    async for line in stream.aiter_lines():
                        if line.startswith('event:'):
                            event = line[6:].strip()
                        elif line.startswith('data:'):
                            if event == 'error':
                                raise RuntimeError(line[5:])
                            if event == 'complete':
                                result = json.loads(line[5:])
                                break
                media = find_media(result, model['host'])
                if not media:
                    raise ValueError('No media in response')
                extension = Path(urlparse(media).path).suffix.lower()
                allowed = {'.mp4', '.webm'} if model['kind'] == 'video' else {'.wav', '.mp3', '.ogg', '.flac'}
                if extension not in allowed:
                    raise ValueError('Unsupported media format')
                async with client.stream('GET', media) as stream:
                    stream.raise_for_status()
                    if stream.status_code != 200:
                        raise ValueError('Unexpected media response')
                    total = 0
                    with partial.open('wb') as output:
                        async for chunk in stream.aiter_bytes():
                            total += len(chunk)
                            if total > 100 * 1024 * 1024:
                                raise ValueError('Media too large')
                            output.write(chunk)
                    if total == 0:
                        raise ValueError('Empty media')
                path = DATA / (job_id+extension)
                partial.replace(path)
                update(job_id, status='completed', file=path.name)
    except asyncio.CancelledError:
        update(job_id, status='failed', error='Der Server wurde neu gestartet. Bitte erneut versuchen.')
        raise
    except Exception as error:
        logging.getLogger('magnetic').warning('Generation failed: model=%s job=%s error_type=%s', g.model, job_id, type(error).__name__)
        update(job_id, status='failed', error=friendly_error(error))
    finally:
        partial.unlink(missing_ok=True)


@app.get('/api/models')
async def models():
    return {'models': MODELS, 'authenticated': bool(os.environ.get('HF_TOKEN'))}


@app.get('/api/health')
async def health():
    return {'status': 'ok'}


@app.post('/api/jobs', status_code=202)
async def create_job(g: Generation, request: Request):
    try:
        arguments(g)
    except ValueError as error:
        raise HTTPException(422, str(error))
    job_id = secrets.token_hex(16)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        active = db.execute("SELECT count(*) FROM jobs WHERE status IN ('running','queued')").fetchone()[0]
        own = db.execute("SELECT count(*) FROM jobs WHERE session=? AND status IN ('running','queued')", (request.state.session,)).fetchone()[0]
        if own >= 2 or active >= 8:
            raise HTTPException(429, 'Die Warteschlange ist voll. Bitte warte, bis ein Auftrag fertig ist.')
        recent = db.execute('SELECT count(*) FROM jobs WHERE session=? AND created>?', (request.state.session, time.time()-3600)).fetchone()[0]
        if recent >= 30:
            raise HTTPException(429, 'Du hast 30 Aufträge in einer Stunde gestartet. Bitte später erneut versuchen.')
        db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)', (job_id, request.state.session, g.model, g.prompt.strip(), 'queued', time.time(), None, None, g.model_dump_json()))
    task = asyncio.create_task(generate(job_id, g))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return {'id': job_id, 'status': 'queued'}


@app.get('/api/jobs')
async def list_jobs(request: Request):
    with connect() as db:
        rows = db.execute('SELECT * FROM jobs WHERE session=? ORDER BY created DESC LIMIT 100', (request.state.session,)).fetchall()
    return [public_job(row) for row in rows]


def owned_job(job_id, session):
    with connect() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=? AND session=?', (job_id, session)).fetchone()
    if not row:
        raise HTTPException(404, 'Auftrag nicht gefunden.')
    return row


@app.get('/api/jobs/{job_id}')
async def get_job(job_id: str, request: Request):
    return public_job(owned_job(job_id, request.state.session))


@app.get('/api/jobs/{job_id}/media')
async def media(job_id: str, request: Request, download: bool = False):
    job = owned_job(job_id, request.state.session)
    if job['status'] != 'completed' or not job['file']:
        raise HTTPException(404, 'Noch kein Ergebnis vorhanden.')
    path = DATA / job['file']
    if not path.is_file():
        raise HTTPException(404, 'Datei nicht mehr verfügbar.')
    return FileResponse(path, filename='helix-'+path.name if download else None)


@app.delete('/api/jobs/{job_id}', status_code=204)
async def delete_job(job_id: str, request: Request):
    job = owned_job(job_id, request.state.session)
    if job['status'] in ('queued','running'):
        raise HTTPException(409, 'Laufende Aufträge können noch nicht gelöscht werden.')
    with connect() as db:
        db.execute('DELETE FROM jobs WHERE id=? AND session=?', (job_id, request.state.session))
    if job['file']:
        (DATA / job['file']).unlink(missing_ok=True)


app.mount('/', StaticFiles(directory=ROOT / 'static', html=True), name='static')
