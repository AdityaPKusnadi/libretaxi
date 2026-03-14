/*
    LibreTaxi, free and open source ride sharing platform.
    Copyright (C) 2016-2017  Roman Pushkin

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import ResponseHandler from '../response-handler';
import GeoFire from 'geofire';
import firebaseDB from '../../firebase-db';
import Order from '../../order';
import { loadUser } from '../../factories/user-factory';
import log from '../../log';
import CaQueue from '../../queue/ca-queue';
import Settings from '../../../settings';

const COLLECT_WINDOW_MS = 3000;
const RETRY_INTERVAL_MS = 15000;
const MAX_RETRIES = 20;

export default class NotifyDriversResponseHandler extends ResponseHandler {

  constructor(options) {
    super(Object.assign({ type: 'notify-drivers-response-handler' }, options));
    this.settings = options.settings || new Settings();
    this.notifiedForOrder = {};
    this.currentAssignedDriver = null;
  }

  ensureInitialized() {
    if (this.geoFire) return;
    this.geoFire = new GeoFire(firebaseDB.config().ref('users'));
  }

  call(onResult) {
    this.ensureInitialized();
    const r = this.response;

    loadUser(r.passengerKey).then((passenger) => {
      const orderKey = passenger.state.currentOrderKey;
      new Order({ orderKey }).load().then((order) => {
        this.order = order;
        this.orderKey = orderKey;
        this.collectAndNotify();
        this.startRetryLoop();
        onResult();
      });
    });
  }

  collectAndNotify() {
    const candidates = [];
    const q = this.geoFire.query({
      center: this.order.state.passengerLocation,
      radius: this.settings.MAX_RADIUS * 1,
    });

    q.on('key_entered', (userKey, location, distance) => {
      log.debug(`candidate found: ${userKey}, distance: ${distance}`);
      candidates.push({ userKey, location, distance });
    });

    setTimeout(() => {
      q.cancel();
      candidates.sort((a, b) => a.distance - b.distance);
      log.debug(`collected ${candidates.length} driver candidates for order ${this.orderKey}`);
      this.tryNotifyFromList(candidates, 0);
    }, COLLECT_WINDOW_MS);
  }

  clearPreviousDriver() {
    if (this.currentAssignedDriver) {
      log.debug(`clearing pendingOrder from previous driver: ${this.currentAssignedDriver}`);
      try {
        firebaseDB.config().ref(`users/${this.currentAssignedDriver}/pendingOrder`).remove();
      } catch (e) {
        log.debug(`error clearing pendingOrder: ${e}`);
      }
      this.currentAssignedDriver = null;
    }
  }

  tryNotifyFromList(candidates, index) {
    if (index >= candidates.length) {
      log.debug(`no eligible driver found in this round for order ${this.orderKey}`);
      return;
    }

    new Order({ orderKey: this.orderKey }).load().then((order) => {
      if (order.state.status !== 'new') {
        log.debug(`order ${this.orderKey} already accepted, stopping`);
        return;
      }
      this.order = order;

      const c = candidates[index];

      if (this.notifiedForOrder[c.userKey]) {
        this.tryNotifyFromList(candidates, index + 1);
        return;
      }

      loadUser(c.userKey).then((user) => {
        if (user.state.userType !== 'driver') {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (user.state.muted) {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (user.state.blocked) {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (user.state.vehicleType !== order.state.requestedVehicleType) {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (user.state.menuLocation !== 'driver-index') {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (user.state.tripStatus === 'accepted' || user.state.tripStatus === 'in_progress') {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (user.state.pendingOrder) {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }
        if (c.distance > user.state.radius * 1) {
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }

        log.debug(`notifying closest eligible driver: ${c.userKey} (distance ${c.distance}) for order ${this.orderKey}`);

        this.clearPreviousDriver();

        try {
          firebaseDB.config().ref(`users/${c.userKey}/pendingOrder`).set(order.orderKey);
        } catch (e) {
          log.debug(`error setting pendingOrder: ${e}`);
        }

        order.setState({ assignedDriver: c.userKey });
        order.save();

        this.currentAssignedDriver = c.userKey;
        this.notifiedForOrder[c.userKey] = true;

        const queue = new CaQueue();
        const arg = {
          orderKey: order.orderKey,
          distance: c.distance,
          from: order.state.passengerLocation,
          to: order.state.passengerDestination,
          price: order.state.price,
          passengerKey: order.state.passengerKey,
          passengerName: order.state.passengerName || null,
          passengerUsername: order.state.passengerUsername || null,
          passengerPhone: order.state.passengerPhone || null,
          calculatedFare: order.state.calculatedFare || null,
          destinationLocation: order.state.destinationLocation || null,
          rideNum: order.state.rideNum || null,
        };
        queue.create({ userKey: c.userKey, arg, route: 'driver-order-new' });

        order.markNotified(c.userKey);
        order.save();
      }).catch(() => {
        this.tryNotifyFromList(candidates, index + 1);
      });
    }).catch(() => {});
  }

  startRetryLoop() {
    let retryCount = 0;

    this.retryTimer = setInterval(() => {
      retryCount++;

      if (retryCount >= MAX_RETRIES) {
        log.debug(`driver search retry limit reached for order ${this.orderKey}`);
        this.clearPreviousDriver();
        clearInterval(this.retryTimer);
        return;
      }

      new Order({ orderKey: this.orderKey }).load().then((order) => {
        if (order.state.status !== 'new') {
          log.debug(`order ${this.orderKey} is no longer new, stopping retry`);
          clearInterval(this.retryTimer);
          return;
        }

        if ((new Date()).getTime() > (order.state.createdAt || 0) + 15 * 60 * 1000) {
          log.debug(`order ${this.orderKey} is stale, stopping retry`);
          this.clearPreviousDriver();
          clearInterval(this.retryTimer);
          return;
        }

        this.order = order;
        log.debug(`retrying driver search for order ${this.orderKey} (retry ${retryCount}/${MAX_RETRIES})`);
        this.collectAndNotify();
      }).catch((err) => {
        log.debug(`retry error for order ${this.orderKey}: ${err}`);
      });
    }, RETRY_INTERVAL_MS);
  }
}
