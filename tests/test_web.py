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
    env.update(DB_NAME=database, HIGH_DEMAND_THRESHOLD='5', AWAITING_CHOICE_TTL_MINUTES='30', JWT_SECRET='test-key-for-cpp-server-with-at-least-32-characters', HOST='127.0.0.1')
    # Always use the simulated sender, even when the workspace has live credentials.
    env.update(WHATSAPP_ENABLED='1', WHATSAPP_SIMULATE='1', TWILIO_WHATSAPP_CONTENT_SID='',
               TWILIO_WHATSAPP_RIDE_CONTENT_SID='',
               TWILIO_ACCOUNT_SID='AC' + '0' * 32,
               TWILIO_AUTH_TOKEN='test-token', TWILIO_WHATSAPP_FROM='whatsapp:+15555550123')
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
            def occupancy(trip_id):
                return int(db(f'SELECT seats_filled FROM TRIP WHERE trip_id={trip_id}').stdout.strip())

            def status(booking_id, token):
                return call('GET', f'/api/bookings/{booking_id}', token=token)['data']['status']

            def options(booking_id, token, expected=200):
                return call('GET', f'/api/bookings/{booking_id}/options', token=token, expected=expected)

            def resolve(booking_id, token, action='choose_slot', expected=200, **changes):
                return call('POST', f'/api/bookings/{booking_id}/resolve', {'action': action, **changes},
                            token=token, expected=expected)

            def wait_for_simulated_whatsapp(booking_id, kind):
                for _ in range(48):
                    result = db(f"SELECT COUNT(*) FROM NOTIFICATION_LOG WHERE booking_id={booking_id}"
                                f" AND channel='whatsapp' AND type='{kind}' AND status='simulated'")
                    if result.stdout.strip() == '1':
                        return
                    time.sleep(0.25)
                raise AssertionError(f'Missing simulated WhatsApp {kind} for {booking_id}')

            request = {'destination_station_id': 2, 'date': date, 'preferred_time': '12:30', 'priority': 'normal'}
            result = call('POST', '/api/bookings/request', {**request, 'whatsapp_updates': True}, token=student)['data']
            booking = result['booking']
            bid = booking['booking_id']
            assert result['outcome'] == 'low_demand' and booking['status'] == 'awaiting_choice'
            assert booking['slot_label'] == '1:00 PM' and result['demandCount'] == 1 and result['low_demand']
            assert result['departure'] is None and booking['departure'] is None
            assert booking['bus'] is None and booking['driver'] is None and booking['expires_at']
            assert occupancy(tid) == 0
            assert [row['slot_id'] for row in result['options']['slots']] == [1, 2, 3]
            notices = call('GET', '/api/notifications', token=student)['data']
            low = next(n for n in notices if n['booking_id'] == bid and n['type'] == 'low_demand')
            assert low['booking_status'] == 'awaiting_choice' and low['channel'] == 'in_app'
            wait_for_simulated_whatsapp(bid, 'low_demand')
            assert not any(n['booking_id'] == bid and n['type'] == 'booking_confirmed' for n in notices)
            call('PUT', f"/api/notifications/{low['notification_id']}/read", {}, token=other, expected=404)
            read_path = f"/api/notifications/{low['notification_id']}/read"
            assert call('PUT', read_path, {}, token=student)['data']['is_read'] is True
            assert call('PUT', read_path, {}, token=student)['data']['is_read'] is True
            assert all(n['notification_id'] != low['notification_id']
                       for n in call('GET', '/api/notifications', token=student)['data'])
            call('GET', f'/api/bookings/{bid}', token=other, expected=403)
            call('PUT', f'/api/bookings/{bid}/cancel', {}, token=other, expected=403)
            options(bid, other, expected=403)
            options(bid, admin, expected=403)
            resolve(bid, other, slot_id=1, expected=403)
            assert options(bid, student)['data']['options'] == result['options']
            assert occupancy(tid) == 0
            selected = resolve(bid, student, slot_id=1)['data']
            departure = selected['departure']
            assert occupancy(tid) == 1 and selected['booking']['expires_at'] is None
            assert departure['slot_label'] == '1:00 PM' and departure['departure_datetime'] == date + 'T13:00:00+05:30'
            assert departure['bus']['reg_number'] and departure['driver']['contact_info'] and departure['minutes_remaining'] > 0
            assert departure['route']['end'] == 'Clock Tower'
            fetched = call('GET', f'/api/bookings/{bid}', token=student)['data']['departure']
            assert {k: v for k, v in fetched.items() if k != 'minutes_remaining'} == {
                k: v for k, v in departure.items() if k != 'minutes_remaining'}
            assert any(n['booking_id'] == bid and n['type'] == 'booking_confirmed' and '1 rider(s) booked' in n['message']
                       for n in call('GET', '/api/notifications', token=student)['data'])
            wait_for_simulated_whatsapp(bid, 'booking_confirmed')
            whatsapp_booking = call('GET', f'/api/bookings/{bid}', token=student)['data']
            assert whatsapp_booking['whatsapp_updates'] is True and whatsapp_booking['whatsapp_status'] == 'simulated'
            assert 'whatsapp_recipient' not in whatsapp_booking
            options(bid, student, expected=409)
            resolve(bid, student, action='cancel', expected=409)
            for value in ['12:30', '2030-02-30T12:00', '2030-10-10T24:00']:
                call('POST', '/api/bookings/request', {'destination_station_id': 2, 'requested_time': value},
                     token=other, expected=400)
            rollover = call('POST', '/api/bookings/request',
                            {**request, 'preferred_time': '19:00', 'whatsapp_updates': True}, token=other)['data']
            wait_for_simulated_whatsapp(rollover['booking']['booking_id'], 'low_demand')
            assert rollover['next_day'] and 'next day' in rollover['message']
            assert rollover['booking']['trip_date'] == '2030-10-11' and rollover['booking']['slot_label'] == '1:00 PM'
            passed('slot mapping, departure details, notifications, ownership, invalid times and next-day rollover')

            evening_requests = []
            for index, email in enumerate(['sunita.verma@geu.ac.in', 'amit.negi@geu.ac.in', 'rahul.student@geu.ac.in', 'priya.student@geu.ac.in', 'aman.student@geu.ac.in']):
                token = login(email)
                value = call('POST', '/api/bookings/request', {**request, 'preferred_time': '17:10'}, token=token)['data']
                assert value['booking']['slot_label'] == '6:00 PM' and value['demandCount'] == index + 1
                assert value['outcome'] == ('low_demand' if index < 4 else 'confirmed')
                assert value['booking']['status'] == ('awaiting_choice' if index < 4 else 'confirmed')
                assert (value['departure'] is None) == (index < 4)
                assert occupancy(evening['trip_id']) == (0 if index < 4 else 1)
                evening_requests.append((token, value['booking']['booking_id']))
            summary = call('GET', '/api/admin/slots/summary?date=' + date, token=admin)['data']
            row = next(r for r in summary if r['slot_id'] == 1 and r['station_id'] == 2)
            assert row['request_count'] == 1 and row['seats_available'] == 39
            evening_summary = next(r for r in summary if r['slot_id'] == 3 and r['station_id'] == 2)
            assert evening_summary['request_count'] == 5
            assert evening_summary['awaiting_choice_count'] == 4 and evening_summary['confirmed_count'] == 1
            hourly = call('GET', '/api/admin/demand/hourly?date=' + date + '&station_id=2', token=admin)['data']
            assert next(r for r in hourly if r['hour_start'] == '12:00')['request_count'] == 1
            assert next(r for r in hourly if r['hour_start'] == '17:00')['request_count'] == 5
            rows = call('GET', '/api/admin/bookings?date=' + date + '&station_id=2&slot_id=1&status=confirmed', token=admin)['data']
            assert len(rows) == 1 and rows[0]['booking_id'] == bid
            rows = call('GET', '/api/admin/bookings?date=' + date + '&station_id=2&slot_id=3&status=awaiting_choice', token=admin)['data']
            assert len(rows) == 4
            db('UPDATE VEHICLE SET capacity=1 WHERE vehicle_id=2')
            call('POST', '/api/bookings/request', {**request, 'preferred_time': '17:10'}, token=signup['token'], expected=409)
            db('UPDATE VEHICLE SET capacity=32 WHERE vehicle_id=2')
            passed('four awaiting requests, fifth confirmed, admin demand and status filters')

            db('UPDATE VEHICLE SET capacity=1 WHERE vehicle_id=1')
            call('POST', '/api/bookings', {'trip_id': tid}, token=other, expected=409)
            waiting = call('POST', '/api/bookings/request', request, token=other)['data']['booking']['booking_id']
            failure = db(f"UPDATE BOOKING SET status='confirmed' WHERE booking_id={waiting}", check=False)
            assert failure.returncode and '45000' in failure.stderr and 'fully booked' in failure.stderr, failure.stderr
            resolve(waiting, other, slot_id=1, expected=409)
            assert status(waiting, other) == 'awaiting_choice' and occupancy(tid) == 1
            assert resolve(waiting, other, action='cancel')['data']['booking']['status'] == 'cancelled'
            assert occupancy(tid) == 1
            call('PUT', f'/api/bookings/{bid}/cancel', {}, token=student)
            wait_for_simulated_whatsapp(bid, 'booking_cancelled')
            assert occupancy(tid) == 0
            aman = login('aman.student@geu.ac.in')

            def race(token):
                try:
                    return call('POST', '/api/bookings', {'trip_id': tid}, token=token, expected=201)['data']['booking_id']
                except AssertionError as error:
                    assert error.args[0][2] == 409, error
                    return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                winners = list(executor.map(race, [other, aman]))
            assert sum(v is not None for v in winners) == 1 and occupancy(tid) == 1
            call('DELETE', f"/api/bookings/{next(v for v in winners if v is not None)}", token=admin)
            assert occupancy(tid) == 0

            def race_resolve(contender):
                token, booking_id = contender
                try:
                    resolve(booking_id, token, slot_id=1)
                    return 'confirmed'
                except AssertionError as error:
                    assert error.args[0][2] == 409 and 'fully booked' in error.args[0][3]['message'], error
                    return 'awaiting_choice'

            contenders = evening_requests[2:4]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                outcomes = list(executor.map(race_resolve, contenders))
            assert sorted(outcomes) == ['awaiting_choice', 'confirmed'] and occupancy(tid) == 1
            assert occupancy(evening['trip_id']) == 1
            for (token, booking_id), outcome in zip(contenders, outcomes):
                assert status(booking_id, token) == outcome
                if outcome == 'confirmed':
                    call('PUT', f'/api/bookings/{booking_id}/status', {'status': 'rejected'}, token=admin)
            assert occupancy(tid) == 0
            db('UPDATE VEHICLE SET capacity=40 WHERE vehicle_id=1')
            passed('capacity trigger, both last-seat races, and all seat count transitions')

            far_trip = call('POST', '/api/trips', trip(slot_id=3, route_id=3, vehicle_id=3, driver_id=3),
                            token=admin, expected=201)['data']['trip_id']
            mothrowala = {**request, 'preferred_time': '17:00', 'destination_station_id': 4}
            first_without_bus = call('POST', '/api/bookings/request', mothrowala, token=student)['data']
            assert first_without_bus['outcome'] == 'low_demand' and first_without_bus['demandCount'] == 1
            assert not first_without_bus['direct_trip_scheduled']
            unassigned = first_without_bus['booking']
            assert unassigned['trip_id'] is None and unassigned['status'] == 'awaiting_choice'
            assert unassigned['slot_label'] == '6:00 PM' and unassigned['destination'] == 'Mothrowala'
            assert unassigned['departure'] is None and unassigned['expires_at']
            assert any(o['destination_station_id'] == 2 for o in first_without_bus['options']['nearby'])
            assert any(o['destination_station_id'] == 8 for o in first_without_bus['options']['fixed'])
            call('POST', '/api/bookings/request', mothrowala, token=student, expected=409)
            for index, email in enumerate(['sunita.verma@geu.ac.in', 'amit.negi@geu.ac.in', 'priya.student@geu.ac.in', 'aman.student@geu.ac.in'], start=2):
                value = call('POST', '/api/bookings/request',
                             {**mothrowala, 'whatsapp_updates': index == 5}, token=login(email))['data']
                assert value['demandCount'] == index and value['booking']['trip_id'] is None
                assert value['booking']['status'] == 'awaiting_choice'
                assert value['outcome'] == ('low_demand' if index < 5 else 'awaiting_choice')
            wait_for_simulated_whatsapp(value['booking']['booking_id'], 'ride_options')
            assert db(f"SELECT COUNT(*) FROM NOTIFICATION_LOG WHERE channel='whatsapp'"
                      f" AND booking_id={unassigned['booking_id']}").stdout.strip() == '0'
            summary = call('GET', '/api/admin/slots/summary?date=' + date, token=admin)['data']
            mothrowala_demand = next(row for row in summary if row['station_id'] == 4 and row['slot_id'] == 3)
            assert mothrowala_demand['awaiting_choice_count'] == 5 and mothrowala_demand['seats_available'] == 0
            rows = call('GET', '/api/admin/bookings?date=' + date + '&station_id=4&slot_id=3', token=admin)['data']
            assert len(rows) == 5
            assert options(unassigned['booking_id'], student)['data']['demandCount'] == 5
            booked = resolve(unassigned['booking_id'], student, action='choose_departure',
                             destination_station_id=8, slot_id=3)['data']['booking']
            assert booked['trip_id'] == far_trip and booked['departure']['route']['end'] == 'Vikasnagar' and occupancy(far_trip) == 1
            another = call('POST', '/api/bookings/request', mothrowala, token=signup['token'])['data']['booking']
            db(f"UPDATE BOOKING SET expires_at='2000-01-01 00:00:00' WHERE booking_id={another['booking_id']}")
            assert status(another['booking_id'], signup['token']) == 'cancelled'
            passed('unserved Mothrowala counts demand, expires without a trip, and confirms a fixed college departure')

            custom_date = '2030-10-17'
            preferred = {'destination_station_id': 6, 'date': custom_date, 'preferred_time': '14:15'}
            alternative = call('POST', '/api/bookings/request', {**preferred, 'whatsapp_updates': True}, token=student)['data']['booking']
            assert alternative['slot_label'] == '4:00 PM'
            call('POST', f"/api/bookings/{alternative['booking_id']}/resolve",
                 {'action': 'wait_original'}, token=other, expected=403)
            kept = resolve(alternative['booking_id'], student, action='wait_original')['data']
            waiting = kept['booking']
            assert kept['outcome'] == 'waiting_original' and waiting['trip_id'] is None and waiting['slot_id'] is None
            assert waiting['preferred_departure'] == custom_date + 'T14:15:00+05:30'
            assert resolve(waiting['booking_id'], student, action='wait_original')['data']['booking']['original_review_at'] == waiting['original_review_at']
            call('POST', '/api/bookings/request', {**preferred, 'wait_for_original': True}, token=student, expected=409)

            direct = call('POST', '/api/bookings/request', {**preferred, 'wait_for_original': True, 'whatsapp_updates': True}, token=other)['data']['booking']
            for booking_id, token in [(waiting['booking_id'], student), (direct['booking_id'], other)]:
                wait_for_simulated_whatsapp(booking_id, 'original_ride_requested')
                notices = call('GET', '/api/notifications', token=token)['data']
                assert sum(n['booking_id'] == booking_id and n['type'] == 'original_ride_requested'
                           for n in notices) == 1
            hourly = call('GET', '/api/admin/demand/hourly?date=' + custom_date, token=admin)['data']
            assert any(row['station_id'] == 6 and row['hour_start'] == '14:00'
                       and row['request_count'] == 2 and row['original_request_count'] == 2 for row in hourly)

            # An unrelated fixed departure cannot satisfy the original time.
            call('POST', '/api/trips', trip(trip_date=custom_date, route_id=2, slot_id=2), token=admin, expected=201)
            def make_due(booking_id):
                db(f"UPDATE BOOKING SET original_review_at='2000-01-01',expires_at='2000-01-01' WHERE booking_id={booking_id}")

            def wait_for_notice(booking_id, kind):
                # Check the database directly so this also exercises the background worker without a rider polling the API.
                for _ in range(35):
                    result = db(f"SELECT COUNT(*) FROM NOTIFICATION_LOG WHERE booking_id={booking_id} AND type='{kind}' AND channel='in_app'")
                    if result.stdout.strip() == '1':
                        return
                    time.sleep(0.25)
                raise AssertionError(f'Missing {kind} notification for {booking_id}')

            make_due(direct['booking_id'])
            wait_for_notice(direct['booking_id'], 'original_ride_unavailable')
            assert status(direct['booking_id'], other) == 'cancelled'

            custom_trip = trip(trip_date=custom_date, route_id=2, slot_id=None,
                               departure_time=custom_date + 'T14:25')
            offered_trip = call('POST', '/api/trips', custom_trip, token=admin, expected=201)['data']
            custom_tid = offered_trip['trip_id']
            assert offered_trip['slot_id'] is None and offered_trip['departure_time'] == custom_date + 'T14:25:00+05:30'
            call('POST', '/api/trips', {**custom_trip, 'driver_id': 2}, token=admin, expected=409)
            call('POST', '/api/trips', {**custom_trip, 'vehicle_id': 2}, token=admin, expected=409)
            make_due(waiting['booking_id'])
            wait_for_notice(waiting['booking_id'], 'original_ride_available')
            wait_for_simulated_whatsapp(direct['booking_id'], 'original_ride_unavailable')
            wait_for_simulated_whatsapp(waiting['booking_id'], 'original_ride_available')
            assert all(n['channel'] == 'in_app' for n in call('GET', '/api/notifications', token=student)['data'])
            passed('opt-in WhatsApp acknowledgements, confirmations, ride options and both availability outcomes')

            offer = options(waiting['booking_id'], student)['data']
            assert offer['outcome'] == 'original_offer' and offer['offer']['trip_id'] == custom_tid
            assert occupancy(custom_tid) == 0
            confirmed = resolve(waiting['booking_id'], student, action='confirm_original')['data']
            assert confirmed['outcome'] == 'confirmed' and confirmed['departure']['route']['end'] == 'Doiwala'
            assert occupancy(custom_tid) == 1
            assert all(n['type'] != 'original_ride_available' for n in call('GET', '/api/notifications', token=student)['data'])
            passed('original-time requests count before approval, produce background notifications, and confirm a custom seat')

            future = '2030-10-12' 
            # Three nearby routes provide enough departures to exercise the cap after exclusions.
            close_route = call('POST', '/api/routes', {'route_name': 'Campus to ONGC', 'start_station_id': 1,
                               'end_station_id': 5}, token=admin, expected=201)['data']['route_id']
            third_route = call('POST', '/api/routes', {'route_name': 'Campus to Mothrowala', 'start_station_id': 1,
                               'end_station_id': 4}, token=admin, expected=201)['data']['route_id']
            for slot in [1, 2, 3]:
                for vehicle, route in [(1, 1), (2, close_route), (3, 4), (4, third_route)]:
                    call('POST', '/api/trips', trip(trip_date=future, slot_id=slot, vehicle_id=vehicle,
                         driver_id=vehicle, route_id=route), token=admin, expected=201)
            full_nearby = int(db(f"SELECT trip_id FROM TRIP WHERE trip_date='{future}' AND route_id={close_route} AND slot_id=1").stdout.strip())
            departed_nearby = int(db(f"SELECT trip_id FROM TRIP WHERE trip_date='{future}' AND route_id={close_route} AND slot_id=2").stdout.strip())
            db('UPDATE VEHICLE SET capacity=1 WHERE vehicle_id=2')
            call('POST', '/api/bookings', {'trip_id': full_nearby}, token=admin, expected=201)
            call('PUT', f'/api/trips/{departed_nearby}', {'status': 'departed'}, token=admin)
            pending_choice = call('POST', '/api/bookings/request', {**request, 'date': future}, token=student)['data']
            near = pending_choice['options']['nearby']
            assert len(near) == 5
            assert [(r['distance_km'], r['slot_id']) for r in near] == sorted((r['distance_km'], r['slot_id']) for r in near)
            assert all(r['seats_available'] > 0 and (r['destination_station_id'], r['slot_id']) not in [(5, 1), (5, 2)] for r in near)
            choice_id = pending_choice['booking']['booking_id']
            near_option = near[0]
            moved = resolve(choice_id, student, action='choose_nearby',
                            destination_station_id=near_option['destination_station_id'], slot_id=near_option['slot_id'])['data']['booking']
            assert moved['status'] == 'confirmed' and moved['destination_station_id'] == near_option['destination_station_id']
            assert moved['slot_id'] == near_option['slot_id'] and occupancy(moved['trip_id']) == 1
            assert occupancy(pending_choice['booking']['trip_id']) == 0
            db('UPDATE VEHICLE SET capacity=32 WHERE vehicle_id=2')
            passed('fresh, sorted nearby options exclude full and departed trips and cap results at five')

            expired = rollover['booking']['booking_id']
            db(f"UPDATE BOOKING SET expires_at='2000-01-01 00:00:00' WHERE booking_id={expired}")
            wait_for_simulated_whatsapp(expired, 'booking_expired')
            assert any(b['booking_id'] == expired and b['status'] == 'cancelled' and b['expires_at'] is None
                       for b in call('GET', '/api/bookings', token=other)['data'])
            assert status(expired, other) == 'cancelled'
            resolve(expired, other, action='cancel', expected=409)
            inbox = call('GET', '/api/notifications', token=other)['data']
            assert sum(n['booking_id'] == expired and n['type'] == 'booking_expired' for n in inbox) == 1
            assert any(n['booking_id'] == expired and n['type'] == 'low_demand' and n['booking_expired'] for n in inbox)
            retry = call('POST', '/api/bookings/request', {**request, 'preferred_time': '19:00'}, token=other)['data']['booking']
            assert retry['booking_id'] != expired and retry['status'] == 'awaiting_choice'
            db(f"UPDATE TRIP SET status='departed' WHERE trip_id={retry['trip_id']}")
            resolve(retry['booking_id'], other, action='cancel', expected=409)
            assert status(retry['booking_id'], other) == 'cancelled' and occupancy(retry['trip_id']) == 0
            past = call('POST', '/api/trips', trip(trip_date='2000-01-01'), token=admin, expected=201)['data']['trip_id']
            call('POST', '/api/bookings/request', {**request, 'date': '2000-01-01'}, token=student, expected=422)
            db(f"INSERT INTO BOOKING(user_id,trip_id,destination_station_id,slot_id,status,expires_at)"
               f" VALUES (4,{past},2,1,'awaiting_choice','2030-12-01 00:00:00')")
            past_id = int(db(f'SELECT booking_id FROM BOOKING WHERE user_id=4 AND trip_id={past}').stdout.strip())
            assert status(past_id, student) == 'cancelled' and occupancy(past) == 0
            passed('lazy TTL and departure expiry, single notice, and retry on the same trip')

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
