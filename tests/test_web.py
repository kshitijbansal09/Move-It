#!/usr/bin/env python3
"""Integration checks for the real C++ HTTP server and MySQL persistence."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / 'build/moveit-web'


def main():
    env = os.environ.copy()
    if (ROOT / '.env').exists():
        for line in (ROOT / '.env').read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                env.setdefault(key.strip(), value.strip().strip('\"\''))
    database = 'moveit_cpp_' + str(time.time_ns()) + '_test'
    env.update(DB_NAME=database, LOW_DEMAND_THRESHOLD='5', JWT_SECRET='test-key-for-cpp-server-with-at-least-32-characters', HOST='127.0.0.1')
    with socket.socket() as temporary:
        temporary.bind(('127.0.0.1', 0))
        port = temporary.getsockname()[1]
    env['PORT'] = str(port)
    base = f'http://127.0.0.1:{port}'
    process = None
    checks = 0

    def passed(label):
        nonlocal checks
        checks += 1
        print('PASS:', label, flush=True)

    def db(statement, check=True, selected=True):
        args = ['mysql', '--batch', '--skip-column-names', '--user=' + env.get('DB_USER', 'root')]
        if env.get('DB_SOCKET_PATH'):
            args.append('--socket=' + env['DB_SOCKET_PATH'])
        else:
            args.extend(['--host=' + env.get('DB_HOST', 'localhost'), '--port=' + env.get('DB_PORT', '3306')])
        sqlenv = env.copy()
        sqlenv['MYSQL_PWD'] = env.get('DB_PASSWORD', '')
        prefix = f'USE `{database}`; ' if selected else ''
        return subprocess.run(args + ['-e', prefix + statement], env=sqlenv, text=True, capture_output=True, check=check)

    def call(method, path, body=None, token=None, expected=200):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(base + path, method=method, headers=headers,
                                         data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                code, value = response.status, json.load(response)
        except urllib.error.HTTPError as response:
            code, value = response.code, json.load(response)
        assert code == expected, (method, path, code, value)
        assert value['success'] == (expected < 400), value
        return value

    def login(email, password='Password@123'):
        return call('POST', '/api/auth/login', {'email': email, 'password': password})['data']['token']

    with tempfile.TemporaryFile(mode='w+') as log:
        def start():
            server = subprocess.Popen([str(BINARY), '--serve'], cwd=ROOT, env=env, stdout=log, stderr=log)
            for _ in range(100):
                if server.poll() is not None:
                    log.seek(0)
                    raise AssertionError(log.read())
                try:
                    call('GET', '/api/health')
                    return server
                except (urllib.error.URLError, ConnectionError, TimeoutError):
                    time.sleep(0.1)
            server.terminate()
            server.wait(timeout=10)
            raise AssertionError('C++ server startup timed out')

        try:
            subprocess.run([str(BINARY), '--init-db'], cwd=ROOT, env=env, check=True)
            assert db('SELECT COUNT(*) FROM TRIP').stdout.strip() == '84'
            before = db('SELECT COUNT(*) FROM BOOKING').stdout
            refused = subprocess.run([str(BINARY), '--init-db'], cwd=ROOT, env=env, capture_output=True)
            assert refused.returncode != 0
            assert db('SELECT COUNT(*) FROM BOOKING').stdout == before
            subprocess.run([str(BINARY), '--seed-schedule'], cwd=ROOT, env=env, check=True)
            assert db('SELECT COUNT(*) FROM TRIP').stdout.strip() == '84'
            passed('schema, safe initialization refusal, seven-day seed, and idempotent reseeding')
            process = start()
            for path in ['/', '/admin', '/dashboard', '/booking/1']:
                with urllib.request.urlopen(base + path) as response:
                    page = response.read().decode()
                    assert response.status == 200 and '/assets/' in page
            asset = re.search(r'src="([^"]+\.js)"', page).group(1)
            with urllib.request.urlopen(base + asset) as response:
                assert response.status == 200 and len(response.read()) > 1000
            passed('React build, static assets and browser refresh on app routes')
            admin = login('admin@geu.ac.in')
            student = login('rahul.student@geu.ac.in')
            other = login('priya.student@geu.ac.in')
            driver = login('driver@geu.ac.in')
            call('POST', '/api/auth/login', {'email': 'admin@geu.ac.in', 'password': 'wrong'}, expected=401)
            call('GET', '/api/auth/me', token=admin[:-2] + 'xx', expected=401)
            assert call('GET', '/api/auth/me', token=admin)['data']['role'] == 'admin'
            call('GET', '/api/slots', expected=401)
            assert len(call('GET', '/api/slots', token=student)['data']) == 3
            for path in ['/slots/summary', '/demand/hourly', '/bookings', '/fleet', '/allocations', '/drivers/status']:
                call('GET', '/api/admin' + path, token=student, expected=403)
            call('POST', '/api/auth/signup', {'name': 'Invalid admin', 'email': 'admin2@example.com', 'password': 'Password@123', 'contact_info': '+919800000000', 'role': 'admin'}, expected=400)
            signup = call('POST', '/api/auth/signup', {'name': "O'Brien Test", 'email': 'cpp.test@example.com', 'password': 'Password@123', 'contact_info': '+919800000000'}, expected=201)['data']
            assert call('GET', '/api/auth/me', token=signup['token'])['data']['name'] == "O'Brien Test"
            call('GET', '/api/users/1', token=signup['token'], expected=403)
            for name in ['stations', 'vehicles', 'drivers', 'routes', 'trips']:
                assert call('GET', '/api/' + name)['data']
            passed('login/signup, JWT validation, safe SQL strings, user ownership and all admin role guards')
            date = '2030-10-10'

            def trip(**changes):
                return {'vehicle_id': 1, 'route_id': 1, 'driver_id': 1, 'trip_date': date, 'slot_id': 1, **changes}

            first = call('POST', '/api/trips', trip(), token=admin, expected=201)['data']
            tid = first['trip_id']
            assert first['departure_time'] == date + 'T13:00:00+05:30'
            for changes in [{'driver_id': 2}, {'vehicle_id': 2}, {'vehicle_id': 5, 'driver_id': 2}]:
                call('POST', '/api/trips', trip(**changes), token=admin, expected=409)
            rejected = db(f"INSERT INTO TRIP(vehicle_id,route_id,driver_id,trip_date,slot_id,departure_time) VALUES (5,1,2,'{date}',1,'{date} 13:00:00')", check=False)
            assert rejected.returncode and 'maintenance' in rejected.stderr
            evening = call('POST', '/api/trips', trip(vehicle_id=2, driver_id=2, slot_id=3), token=admin, expected=201)['data']
            afternoon = call('POST', '/api/trips', trip(slot_id=2), token=admin, expected=201)['data']
            call('POST', '/api/trips', trip(trip_date='2030-10-11'), token=admin, expected=201)
            call('PUT', f"/api/trips/{afternoon['trip_id']}", {'slot_id': 1}, token=admin, expected=409)
            call('PUT', f'/api/trips/{tid}', {'vehicle_id': 2}, token=driver, expected=403)
            call('PUT', f"/api/trips/{evening['trip_id']}", {'status': 'departed'}, token=driver, expected=403)
            passed('fixed departures, allocation indexes, database maintenance trigger and driver ownership')
            request = {'destination_station_id': 2, 'requested_time': date + 'T12:30:00', 'priority': 'normal'}
            result = call('POST', '/api/bookings/request', request, token=student)['data']
            booking = result['booking']
            bid = booking['booking_id']
            assert booking['slot_label'] == '1:00 PM' and result['demandCount'] == 1 and result['low_demand']
            assert booking['bus']['reg_number'] and booking['driver']['contact_info'] and booking['minutes_remaining'] > 0
            notices = call('GET', '/api/notifications', token=student)['data']
            low = next(n for n in notices if n['booking_id'] == bid and n['type'] == 'low_demand')
            assert any(n['booking_id'] == bid and n['type'] == 'booking_confirmed' for n in notices)
            call('PUT', f"/api/notifications/{low['notification_id']}/read", {}, token=other, expected=404)
            call('PUT', f"/api/notifications/{low['notification_id']}/read", {}, token=student)
            assert call('GET', f'/api/bookings/{bid}', token=student)['data']['status'] == 'confirmed'
            call('GET', f'/api/bookings/{bid}', token=other, expected=403)
            call('PUT', f'/api/bookings/{bid}/cancel', {}, token=other, expected=403)
            call('POST', '/api/bookings/request', {**request, 'destination_station_id': 9}, token=other, expected=422)
            for value in ['12:30', '2030-02-30T12:00', '2030-10-10T24:00']:
                call('POST', '/api/bookings/request', {**request, 'requested_time': value}, token=other, expected=400)
            rollover = call('POST', '/api/bookings/request', {**request, 'requested_time': date + 'T19:00'}, token=other)['data']
            assert rollover['next_day'] and 'next day' in rollover['message']
            passed('slot mapping, departure details, notifications, ownership, 422, invalid times and next-day rollover')
            for index, email in enumerate(['sunita.verma@geu.ac.in', 'amit.negi@geu.ac.in', 'rahul.student@geu.ac.in', 'priya.student@geu.ac.in', 'aman.student@geu.ac.in']):
                value = call('POST', '/api/bookings/request', {**request, 'requested_time': date + 'T17:10:00'}, token=login(email))['data']
                assert value['booking']['slot_label'] == '6:00 PM' and value['demandCount'] == index + 1 and value['low_demand'] == (index < 4)
            summary = call('GET', '/api/admin/slots/summary?date=' + date, token=admin)['data']
            row = next(r for r in summary if r['slot_id'] == 1 and r['station_id'] == 2)
            assert row['request_count'] == 1 and row['seats_available'] == 39
            hourly = call('GET', '/api/admin/demand/hourly?date=' + date + '&station_id=2', token=admin)['data']
            assert next(r for r in hourly if r['hour_start'] == '12:00')['request_count'] == 1
            rows = call('GET', '/api/admin/bookings?date=' + date + '&station_id=2&slot_id=1&status=confirmed', token=admin)['data']
            assert len(rows) == 1 and rows[0]['booking_id'] == bid
            passed('five-request threshold, hourly demand, available seats and booking filters')
            db('UPDATE VEHICLE SET capacity=1 WHERE vehicle_id=1')
            call('POST', '/api/bookings', {'trip_id': tid}, token=other, expected=409)
            call('POST', '/api/bookings/request', request, token=other, expected=409)
            call('PUT', f'/api/bookings/{bid}/cancel', {}, token=student)
            assert db(f'SELECT seats_filled FROM TRIP WHERE trip_id={tid}').stdout.strip() == '0'
            aman = login('aman.student@geu.ac.in')

            def race(token):
                try:
                    return call('POST', '/api/bookings', {'trip_id': tid}, token=token, expected=201)['data']['booking_id']
                except AssertionError as error:
                    assert error.args[0][2] == 409, error
                    return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                winners = list(executor.map(race, [other, aman]))
            assert sum(v is not None for v in winners) == 1
            assert db(f'SELECT seats_filled FROM TRIP WHERE trip_id={tid}').stdout.strip() == '1'
            call('DELETE', f"/api/bookings/{next(v for v in winners if v is not None)}", token=admin)
            assert db(f'SELECT seats_filled FROM TRIP WHERE trip_id={tid}').stdout.strip() == '0'
            db('UPDATE VEHICLE SET capacity=40 WHERE vehicle_id=1')
            passed('full-trip 409s, concurrent last-seat protection, cancellation and delete capacity release')
            maintenance_booking = call('POST', '/api/bookings', {'trip_id': evening['trip_id']}, token=signup['token'], expected=201)['data']
            call('PUT', '/api/vehicles/2', {'status': 'maintenance'}, token=admin)
            call('POST', '/api/bookings', {'trip_id': evening['trip_id']}, token=admin, expected=409)
            failure = db(f"INSERT INTO BOOKING(user_id,trip_id,status) VALUES (1,{evening['trip_id']},'confirmed')", check=False)
            assert failure.returncode and 'maintenance' in failure.stderr
            call('PUT', f"/api/bookings/{maintenance_booking['booking_id']}/cancel", {}, token=signup['token'])
            call('PUT', '/api/vehicles/2', {'status': 'active'}, token=admin)
            passed('maintenance blocks new seats while existing passengers can still cancel')
            pending_trip = afternoon['trip_id']
            db(f"INSERT INTO BOOKING(user_id,trip_id,status) VALUES (6,{pending_trip},'pending')")
            pending = int(db(f'SELECT booking_id FROM BOOKING WHERE user_id=6 AND trip_id={pending_trip}').stdout.strip())
            call('POST', f'/api/trips/{pending_trip}/schedule-batch', {'policy': 'priority'}, token=admin)
            assert db(f"SELECT COUNT(*) FROM NOTIFICATION_LOG WHERE booking_id={pending} AND type='booking_confirmed'").stdout.strip() == '1'
            call('PUT', f'/api/bookings/{pending}/status', {'status': 'pending'}, token=admin)
            assert db(f'SELECT seats_filled FROM TRIP WHERE trip_id={pending_trip}').stdout.strip() == '0'
            call('PUT', f'/api/bookings/{pending}/status', {'status': 'confirmed'}, token=admin)
            call('PUT', f'/api/trips/{tid}', {'status': 'departed'}, token=driver)
            buses = call('GET', '/api/admin/fleet?date=' + date, token=admin)['data']
            assert next(v for v in buses if v['vehicle_id'] == 1)['fleet_status'] == 'on trip'
            assert next(v for v in buses if v['vehicle_id'] == 5)['fleet_status'] == 'in maintenance'
            people = call('GET', '/api/admin/drivers/status?date=' + date, token=admin)['data']
            assert next(p for p in people if p['driver_id'] == 1)['derived_status'] == 'on trip'
            assert len(call('GET', '/api/admin/allocations?date=' + date, token=admin)['data']['slots']) == 3
            passed('original C++ batch algorithm, admin transitions, driver updates and derived statuses')
            for name, key, body, update in [
                ('stations', 'station_id', {'name': 'SQL Hub', 'latitude': 30.2, 'longitude': 78.1}, {'name': 'Updated Hub'}),
                ('vehicles', 'vehicle_id', {'reg_number': 'CPP-TEST', 'capacity': 12}, {'capacity': 14}),
                ('drivers', 'driver_id', {'name': 'SQL Driver', 'license_no': 'CPP-LICENSE', 'contact_info': '+919800000001'}, {'name': 'Updated Driver'}),
                ('routes', 'route_id', {'route_name': 'SQL Route', 'start_station_id': 1, 'end_station_id': 9}, {'route_name': 'Updated Route'}),
            ]:
                item = call('POST', '/api/' + name, body, token=admin, expected=201)['data']
                changed = call('PUT', f'/api/{name}/{item[key]}', update, token=admin)['data']
                assert all(changed[k] == v for k, v in update.items())
                call('DELETE', f'/api/{name}/{item[key]}', token=admin)
                call('GET', f'/api/{name}/{item[key]}', expected=404)
            passed('SQL create/edit/delete for all station, vehicle, driver and route screens')
            disposable = call('POST', '/api/auth/signup', {'name': 'Disposable Account', 'email': 'remove.me@example.com', 'password': 'Password@123', 'contact_info': '+919800000003'}, expected=201)['data']
            call('POST', '/api/bookings', {'trip_id': pending_trip}, token=disposable['token'], expected=201)
            assert db(f'SELECT seats_filled FROM TRIP WHERE trip_id={pending_trip}').stdout.strip() == '2'
            call('DELETE', f"/api/users/{disposable['user']['user_id']}", token=admin)
            assert db(f'SELECT seats_filled FROM TRIP WHERE trip_id={pending_trip}').stdout.strip() == '1'
            call('GET', '/api/auth/me', token=disposable['token'], expected=401)
            passed('deleting a user releases their occupied seats and invalidates their session')
            process.terminate()
            process.wait(timeout=10)
            process = start()
            assert login('cpp.test@example.com')
            assert call('GET', f'/api/bookings/{bid}', token=student)['data']['status'] == 'cancelled'
            passed('accounts, sessions and booking data survive server restarts')
            print(f'Passed {checks} C++/MySQL integration groups.', flush=True)
        except BaseException:
            log.flush()
            log.seek(0)
            print(log.read(), flush=True)
            raise
        finally:
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
            assert re.fullmatch(r'moveit_cpp_[0-9]+_test', database)
            db(f'DROP DATABASE IF EXISTS `{database}`', check=False, selected=False)


if __name__ == '__main__':
    main()
