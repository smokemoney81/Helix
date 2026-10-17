import asyncio
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as studio


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_data, self.old_db = studio.DATA, studio.DB
        studio.DATA = Path(self.temp.name)
        studio.DB = studio.DATA / 'test.sqlite3'
        self.client = TestClient(studio.app)
        self.client.__enter__()
        self.client.get('/api/models')

    def tearDown(self):
        self.client.__exit__(None, None, None)
        studio.DATA, studio.DB = self.old_data, self.old_db
        self.temp.cleanup()

    def insert_job(self, status='completed'):
        session = self.client.cookies.get('magnetic_session')
        job_id = 'a' * 32
        path = studio.DATA / (job_id + '.wav')
        path.write_bytes(b'RIFF-test-output')
        with studio.connect() as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)', (job_id, session, 'qwen', 'Test voice', status, time.time(), None, path.name, '{}'))
        return job_id

    def test_session_isolation_media_and_delete(self):
        job_id = self.insert_job()
        self.assertEqual(len(self.client.get('/api/jobs').json()), 1)
        with TestClient(studio.app) as stranger:
            self.assertEqual(stranger.get('/api/jobs').json(), [])
            for suffix in ('', '/media'):
                self.assertEqual(stranger.get('/api/jobs/'+job_id+suffix).status_code, 404)
            self.assertEqual(stranger.delete('/api/jobs/'+job_id).status_code, 404)
        self.assertEqual(self.client.get('/api/jobs/'+job_id+'/media').content, b'RIFF-test-output')
        response = self.client.get('/api/jobs/'+job_id+'/media?download=true')
        self.assertIn('attachment', response.headers['content-disposition'])
        self.assertEqual(self.client.delete('/api/jobs/'+job_id).status_code, 204)
        self.assertEqual(self.client.get('/api/jobs').json(), [])
        self.assertFalse((studio.DATA / (job_id+'.wav')).exists())

    def test_validation_and_csrf(self):
        for payload in [dict(model='bad',prompt='Hello'),dict(model='ltx',prompt='   '),dict(model='ltx',prompt='Hello',aspect='broken'),dict(model='kitten',prompt='Hallo',language='German'),dict(model='qwen',prompt='Hallo',speaker='unknown')]:
            self.assertEqual(self.client.post('/api/jobs',json=payload).status_code,422)
        self.assertEqual(self.client.post('/api/jobs',json=dict(model='qwen',prompt='Hallo'),headers={'Origin':'https://untrusted.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/jobs').json(),[])

    def test_adapter_arguments_and_media_boundary(self):
        args=studio.arguments(studio.Generation(model='ltx',prompt='A mountain',aspect='9:16',duration=4))
        self.assertGreater(args[4], args[5])
        self.assertEqual(args[4] % 32, 0)
        self.assertEqual(args[5] % 32, 0)
        self.assertEqual(args[6], 'text-to-video')
        self.assertEqual(studio.arguments(studio.Generation(model='qwen',prompt='Hallo'))[1], 'German')
        self.assertEqual(studio.arguments(studio.Generation(model='kitten',prompt='Hello',language='English',speaker='Jasper'))[2], 'Jasper')
        host='https://qwen-qwen3-tts.hf.space'
        valid=host+'/gradio_api/file=/tmp/audio.wav'
        self.assertEqual(studio.find_media([{'audio':{'url':valid}}],host),valid)
        for value in ['http://127.0.0.1/private','https://qwen-qwen3-tts.hf.space.evil.example/audio.wav','http://qwen-qwen3-tts.hf.space/audio.wav']:
            self.assertIsNone(studio.find_media({'url':value},host))

    def test_create_job_and_persist_result(self):
        async def fake_generate(job_id, generation):
            output=studio.DATA / (job_id+'.wav')
            output.write_bytes(b'RIFF-test')
            studio.update(job_id,status='completed',file=output.name)
        with patch.object(studio,'generate',fake_generate):
            response=self.client.post('/api/jobs',json={'model':'qwen','prompt':'Hallo Welt'})
            self.assertEqual(response.status_code,202)
            job_id=response.json()['id']
            for _ in range(20):
                job=self.client.get('/api/jobs/'+job_id).json()
                if job['status']=='completed':break
                time.sleep(.01)
            self.assertEqual(job['status'],'completed')
            self.assertNotIn('session',job)
            self.assertNotIn('file',job)
            self.assertEqual(self.client.get(job['media_url']).content,b'RIFF-test')

    def test_streaming_provider_and_download(self):
        job_id=self.insert_job('queued')
        host=studio.MODEL_MAP['qwen']['host']
        result=[{'url':host+'/gradio_api/file=/tmp/audio.wav'}]
        def remote(request):
            if request.method=='POST':
                self.assertEqual(json.loads(request.content)['data'][1],'German')
                return studio.httpx.Response(200,json={'event_id':'123abc'})
            if '/call/' in str(request.url):
                return studio.httpx.Response(200,text='event: heartbeat\ndata: null\n\nevent: complete\ndata: '+json.dumps(result)+'\n\n')
            return studio.httpx.Response(200,content=b'RIFF-real-adapter-test')
        original=studio.httpx.AsyncClient
        def client(**kwargs):return original(transport=studio.httpx.MockTransport(remote),**kwargs)
        with patch.object(studio.httpx,'AsyncClient',client):
            asyncio.run(studio.generate(job_id,studio.Generation(model='qwen',prompt='Hallo Welt')))
        row=studio.owned_job(job_id,self.client.cookies.get('magnetic_session'))
        self.assertEqual(row['status'],'completed')
        self.assertEqual((studio.DATA/row['file']).read_bytes(),b'RIFF-real-adapter-test')

    def test_queue_limit_and_restart_recovery(self):
        self.insert_job('running')
        with studio.connect() as db:
            db.execute('INSERT INTO jobs SELECT ?,session,model,prompt,status,created,error,file,options FROM jobs LIMIT 1',('b'*32,))
        self.assertEqual(self.client.post('/api/jobs',json={'model':'qwen','prompt':'Hallo Welt'}).status_code,429)
        studio.init_db()
        self.assertTrue(all(j['status']=='failed' for j in self.client.get('/api/jobs').json()))

    def test_quota_error_explained(self):
        self.assertIn('GPU-Kontingent',studio.friendly_error(RuntimeError('429 quota exceeded')))
        self.assertIn('Anmeldung',studio.friendly_error(RuntimeError('401 Unauthorized')))


if __name__=='__main__':
    unittest.main()
