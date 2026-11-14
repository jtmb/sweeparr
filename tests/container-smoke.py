#!/usr/bin/env python3
"""Build first; tests only a disposable, loopback-published container and volume."""
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def docker(*args, check=True):
    return subprocess.run(['sudo', '-n', 'docker', *args], check=check,
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


name = 'sweeparr-test-' + uuid.uuid4().hex[:10]
volume = name + '-data'
image = 'sweeparr:security-local'
checks = 0


def check(condition, label):
    global checks
    assert condition, label
    checks += 1
    print('PASS:', label, flush=True)


def request(route, method='GET', body=None, cookie=''):
    headers = {'Cookie': cookie}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + route, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.read().decode(), response.headers


def ready():
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            if request('/api/health')[0] == 200:
                return
        except (OSError, TimeoutError):
            pass
        if docker('inspect', '-f', '{{.State.Running}}', name).stdout.strip() != 'true':
            raise AssertionError('Container exited during startup')
        time.sleep(0.5)
    raise AssertionError('Container did not become ready')


docker('volume', 'create', volume)
try:
    print(docker('image', 'inspect', image, '--format',
                 'Image={{.Id}} Architecture={{.Architecture}} User={{.Config.User}} Size={{.Size}}').stdout, flush=True)
    if os.environ.get('SWEEPARR_TEST_HOST_NETWORK') == '1':
        network = ['--network', 'host', '-e', 'HOSTNAME=127.0.0.1', '-e', 'PORT=3408']
        mapping = '127.0.0.1:3408'
    else:
        network = ['-p', '127.0.0.1::3000']
        mapping = None
    docker('run', '-d', '--name', name, '--memory', '768m', '--pids-limit', '256',
           *network, '-v', volume + ':/app/data', image)
    if mapping is None:
        mapping = docker('port', name, '3000/tcp').stdout.strip()
    check(mapping.startswith('127.0.0.1:'), 'container endpoint is restricted to loopback')
    base = 'http://' + mapping
    ready()
    check(docker('exec', name, 'id', '-u').stdout.strip() == '1001', 'runtime is unprivileged UID 1001')
    sql = "SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    query = "const D=require('better-sqlite3'); console.log(new D('/app/data/db.sqlite').prepare(" + json.dumps(sql) + ").get().count)"
    check(docker('exec', name, 'node', '-e', query).stdout.strip() == '10', 'all 10 migrations applied to an empty volume')
    check(request('/api/health')[0] == 200, 'public health endpoint responds')
    status, html, _ = request('/login')
    check(status == 200, 'login page renders')
    assets = re.findall(r'src="([^" ]+/_next/[^" ]+|/_next/[^" ]+)"', html)
    check(bool(assets) and request(assets[0].replace('&amp;', '&'))[0] == 200, 'bundled browser assets are served')
    check(request('/api/settings/auth', 'PUT', {'username': 'admin', 'password': 'synthetic-test-password', 'enabled': True})[0] == 200,
          'initial administrator setup works')
    check(request('/api/settings')[0] == 401, 'unauthenticated settings read is denied')
    check(request('/api/settings', cookie='cd_demo_mode=1; cd_session=invalid')[0] == 401,
          'forged demo/session cookies do not bypass authentication')
    status, _, headers = request('/api/auth/login', 'POST', {'username': 'admin', 'password': 'synthetic-test-password'})
    cookie = next(c.split(';')[0] for c in headers.get_all('Set-Cookie', []) if c.startswith('cd_session='))
    check(status == 200 and 'Secure' in headers.get('Set-Cookie', ''), 'login issues a secure session cookie')
    check(request('/api/settings', cookie=cookie)[0] == 200, 'authenticated settings read succeeds')
    check(request('/api/settings/system', 'PUT', {'demoMode': True}, cookie)[0] == 200,
          'demo database can be created and seeded by the unprivileged runtime')
    status, _, headers = request('/api/reports')
    demo_cookie = next(c.split(';')[0] for c in headers.get_all('Set-Cookie', []) if c.startswith('cd_demo_session='))
    check(status == 200, 'anonymous demo visitor receives isolated session')
    status, body, _ = request('/api/reports', 'POST', {}, demo_cookie)
    check(status == 201 and bool(json.loads(body).get('reportId')), 'demo report persists in writable session storage')
    item = {'plexRatingKey': 'synthetic-key', 'title': 'Synthetic movie', 'mediaType': 'movie'}
    check(request('/api/exclusions', 'POST', {'items': [item]}, demo_cookie)[0] == 201, 'demo exclusion mutation succeeds')
    status, body, _ = request('/api/exclusions', cookie=demo_cookie)
    check(status == 200 and 'Synthetic movie' in body, 'demo exclusion survives a subsequent read')
    for route, method in [('/api/images/plex?url=/poster', 'GET'), ('/api/plex/item/1', 'GET'), ('/api/posters/backfill', 'POST')]:
        check(request(route, method, cookie=demo_cookie)[0] == 403, 'demo cannot access real integration: ' + route)
    check(request('/api/settings/system', 'PUT', {'demoMode': False}, cookie)[0] == 200, 'administrator can exit demo mode')
    docker('restart', name)
    ready()
    check(request('/api/settings')[0] == 401 and request('/api/settings', cookie=cookie)[0] == 200,
          'auth configuration and session signing key survive container restart')
    check(request('/api/auth/logout', 'POST', {}, cookie)[0] == 200 and request('/api/settings', cookie=cookie)[0] == 401,
          'logout revokes a copied session cookie')
    failed = docker('run', '--rm', '--memory', '512m', '-e', 'DATABASE_URL=file:/proc/unwritable/db.sqlite', image, check=False)
    check(failed.returncode != 0 and 'Starting Sweeparr...' not in failed.stdout,
          'migration failure stops startup instead of silently serving an unmigrated database')
    print(f'CONTAINER SMOKE: {checks} checks passed', flush=True)
finally:
    print('--- Container startup/restart logs ---', flush=True)
    print(docker('logs', name, check=False).stdout, flush=True)
    docker('rm', '-f', name, check=False)
    docker('volume', 'rm', volume, check=False)
