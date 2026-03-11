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
import NotifyDriver from '../support/notify-driver';
import Settings from '../../../settings';

const RETRY_INTERVAL_MS = 15000;
const MAX_RETRIES = 20;

export default class NotifyDriversResponseHandler extends ResponseHandler {

  constructor(options) {
    super(Object.assign({ type: 'notify-drivers-response-handler' }, options));
    this.keyEntered = this.keyEntered.bind(this);
    this.notifyDriver = options.notifyDriver || new NotifyDriver();
    this.settings = options.settings || new Settings();
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
        this.queryDrivers();
        this.startRetryLoop();
        onResult();
      });
    });
  }

  queryDrivers() {
    const q = this.geoFire.query({
      center: this.order.state.passengerLocation,
      radius: this.settings.MAX_RADIUS * 1,
    });

    q.on('key_entered', this.keyEntered);
  }

  startRetryLoop() {
    let retryCount = 0;

    this.retryTimer = setInterval(() => {
      retryCount++;

      if (retryCount >= MAX_RETRIES) {
        log.debug(`driver search retry limit reached for order ${this.orderKey}`);
        clearInterval(this.retryTimer);
        return;
      }

      new Order({ orderKey: this.orderKey }).load().then((order) => {
        if (order.state.status !== 'new') {
          log.debug(`order ${this.orderKey} is no longer new (status: ${order.state.status}), stopping retry`);
          clearInterval(this.retryTimer);
          return;
        }

        if ((new Date()).getTime() > (order.state.createdAt || 0) + 15 * 60 * 1000) {
          log.debug(`order ${this.orderKey} is stale, stopping retry`);
          clearInterval(this.retryTimer);
          return;
        }

        this.order = order;
        log.debug(`retrying driver search for order ${this.orderKey} (retry ${retryCount}/${MAX_RETRIES})`);
        this.queryDrivers();
      }).catch((err) => {
        log.debug(`retry error for order ${this.orderKey}: ${err}`);
      });
    }, RETRY_INTERVAL_MS);
  }

  keyEntered(userKey, location, distance) {
    log.debug(`user found: key: ${userKey}, location: ${location}, distance: ${distance}`);
    this.notifyDriver.call(userKey, distance, this.order);
  }
}
