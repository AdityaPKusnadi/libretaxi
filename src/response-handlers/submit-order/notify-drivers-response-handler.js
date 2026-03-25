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
import HistoryHash from '../../support/history-hash';

const COLLECT_WINDOW_MS = 4000;
const RETRY_INTERVAL_MS = 15000;
const MAX_RETRIES = 20;

export default class NotifyDriversResponseHandler extends ResponseHandler {

  constructor(options) {
    super(Object.assign({ type: 'notify-drivers-response-handler' }, options));
    this.settings = options.settings || new Settings();
    this.api = options.api;
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

    console.log(`[NOTIFY] Starting driver notification for passengerKey=${r.passengerKey}`);

    loadUser(r.passengerKey).then((passenger) => {
      const orderKey = passenger.state.currentOrderKey;
      if (!orderKey) {
        console.error(`[NOTIFY] ERROR: passenger ${r.passengerKey} has no currentOrderKey!`);
        onResult();
        return;
      }
      console.log(`[NOTIFY] Loading order ${orderKey} for passenger ${r.passengerKey}`);
      new Order({ orderKey }).load().then((order) => {
        this.order = order;
        this.orderKey = orderKey;
        const loc = order.state.passengerLocation;
        console.log(`[NOTIFY] Order ${orderKey} loaded. status=${order.state.status}, location=${JSON.stringify(loc)}, vehicleType=${order.state.requestedVehicleType}, radius=${this.settings.MAX_RADIUS}`);
        if (!loc || !Array.isArray(loc) || loc.length < 2) {
          console.error(`[NOTIFY] ERROR: Invalid passengerLocation for order ${orderKey}: ${JSON.stringify(loc)}`);
          onResult();
          return;
        }
        this.collectAndNotify();
        this.startRetryLoop();
        onResult();
      }).catch((err) => {
        console.error(`[NOTIFY] ERROR loading order for passenger ${r.passengerKey}:`, err);
        onResult();
      });
    }).catch((err) => {
      console.error(`[NOTIFY] ERROR loading passenger ${r.passengerKey}:`, err);
      onResult();
    });
  }

  collectAndNotify() {
    const candidates = [];
    const loc = this.order.state.passengerLocation;
    const radius = this.settings.MAX_RADIUS * 1;
    console.log(`[NOTIFY] GeoFire query: center=${JSON.stringify(loc)}, radius=${radius}km for order ${this.orderKey}`);

    let queryError = false;
    const q = this.geoFire.query({
      center: loc,
      radius: radius,
    });

    q.on('key_entered', (userKey, location, distance) => {
      console.log(`[NOTIFY] GeoFire candidate: ${userKey}, distance: ${distance.toFixed(2)}km`);
      candidates.push({ userKey, location, distance });
    });

    q.on('error', (err) => {
      console.error(`[NOTIFY] GeoFire query error for order ${this.orderKey}:`, err);
      queryError = true;
    });

    setTimeout(() => {
      q.cancel();
      candidates.sort((a, b) => a.distance - b.distance);
      console.log(`[NOTIFY] Collected ${candidates.length} GeoFire candidates for order ${this.orderKey}`);
      if (candidates.length === 0 && !queryError) {
        console.log(`[NOTIFY] No nearby users found within ${radius}km of ${JSON.stringify(loc)}. Will retry.`);
      }
      this.tryNotifyFromList(candidates, 0);
    }, COLLECT_WINDOW_MS);
  }

  clearPreviousDriver() {
    if (this.currentAssignedDriver) {
      console.log(`[NOTIFY] Clearing pendingOrder from previous driver: ${this.currentAssignedDriver}`);
      try {
        firebaseDB.config().ref(`users/${this.currentAssignedDriver}/pendingOrder`).remove();
      } catch (e) {
        console.error(`[NOTIFY] Error clearing pendingOrder: ${e}`);
      }
      this.currentAssignedDriver = null;
    }
  }

  tryNotifyFromList(candidates, index) {
    if (index >= candidates.length) {
      console.log(`[NOTIFY] No eligible driver found in this round for order ${this.orderKey} (checked ${candidates.length} candidates)`);
      return;
    }

    new Order({ orderKey: this.orderKey }).load().then((order) => {
      if (order.state.status !== 'new') {
        console.log(`[NOTIFY] Order ${this.orderKey} status=${order.state.status}, stopping notification`);
        return;
      }
      this.order = order;

      const c = candidates[index];

      if (this.notifiedForOrder[c.userKey]) {
        this.tryNotifyFromList(candidates, index + 1);
        return;
      }

      loadUser(c.userKey).then((user) => {
        const skipReason = this.getSkipReason(user, order, c);
        if (skipReason) {
          console.log(`[NOTIFY] Skipping ${c.userKey}: ${skipReason}`);
          this.tryNotifyFromList(candidates, index + 1);
          return;
        }

        console.log(`[NOTIFY] >>> Notifying driver ${c.userKey} (distance ${c.distance.toFixed(2)}km) for order ${this.orderKey}`);

        this.clearPreviousDriver();

        // Build notification content
        const fare = order.state.calculatedFare || {};
        const fareDisplay = fare.totalFare
          ? `~${fare.currencySymbol || 'LKR '}${fare.totalFare}`
          : `~${order.state.price || '0'}`;
        const tripDistance = fare.distanceKm ? `${fare.distanceKm} km` : 'N/A';

        const lines = [];
        lines.push('\u{1F514} New Trip Request');
        lines.push('');
        lines.push(`Rider ${c.distance.toFixed(2)} km away`);
        lines.push(`Estimated distance: ${tripDistance}`);
        lines.push(`Estimated fare: ${fareDisplay}`);
        if (order.state.rideNum) lines.push(`Ride #${order.state.rideNum}`);

        // Create accept callback data
        const acceptGuid = `accept_${order.orderKey}_${Date.now()}`;
        const acceptResponse = {
          type: 'call-action',
          userKey: c.userKey,
          route: 'driver-accept-ride',
          arg: {
            passengerKey: order.state.passengerKey || null,
            passengerName: order.state.passengerName || null,
            passengerPhone: order.state.passengerPhone || null,
            passengerUsername: order.state.passengerUsername || null,
            orderKey: order.orderKey,
            passengerLocation: order.state.passengerLocation || null,
            destinationLocation: order.state.destinationLocation || null,
            calculatedFare: fare,
            passengerDestination: order.state.passengerDestination || null,
            rideNum: order.state.rideNum || null,
          },
        };

        const inlineValuesUpdate = {};
        inlineValuesUpdate[acceptGuid] = acceptResponse;
        const mergedInlineValues = new HistoryHash(user.state.inlineValues).merge(inlineValuesUpdate);

        // Save inlineValues and pendingOrder directly on driver
        user.setState({
          inlineValues: mergedInlineValues,
          pendingOrder: order.orderKey,
        });

        user.save(() => {
          console.log(`[NOTIFY] Saved inlineValues + pendingOrder on driver ${c.userKey}`);

          order.setState({ assignedDriver: c.userKey });
          order.save(() => {
            console.log(`[NOTIFY] Order ${this.orderKey} assignedDriver=${c.userKey} saved`);
          });

          this.currentAssignedDriver = c.userKey;
          this.notifiedForOrder[c.userKey] = true;

          // Send direct Telegram notification (primary method)
          if (this.api && typeof this.api.sendMessage === 'function') {
            const chatId = user.platformId;
            console.log(`[NOTIFY] Sending direct Telegram message to chatId=${chatId} for driver ${c.userKey}`);
            this.api.sendMessage(chatId, lines.join('\n'), {
              reply_markup: {
                inline_keyboard: [[
                  { text: '\u{1F7E1} Accept', callback_data: acceptGuid },
                ]],
              },
              disable_notification: false,
            }).then(() => {
              console.log(`[NOTIFY] \u2705 Direct notification SENT to driver ${c.userKey} (chatId=${chatId})`);
            }).catch((err) => {
              console.error(`[NOTIFY] \u274C Direct notification FAILED for ${c.userKey}:`, err.message || err);
              // Fallback: try queue-based notification
              this.enqueueFallbackNotification(c, order);
            });
          } else {
            console.log(`[NOTIFY] No API available, using queue fallback for ${c.userKey}`);
            this.enqueueFallbackNotification(c, order);
          }
        });

      }).catch((err) => {
        console.error(`[NOTIFY] Error loading user ${c.userKey}:`, err);
        this.tryNotifyFromList(candidates, index + 1);
      });
    }).catch((err) => {
      console.error(`[NOTIFY] Error reloading order ${this.orderKey}:`, err);
    });
  }

  enqueueFallbackNotification(c, order) {
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
    console.log(`[NOTIFY] Enqueueing fallback driver-order-new for ${c.userKey}`);
    queue.create({ userKey: c.userKey, arg, route: 'driver-order-new' });
  }

  getSkipReason(user, order, candidate) {
    if (user.state.userType !== 'driver') {
      return `not a driver (userType=${user.state.userType})`;
    }
    if (user.state.muted) {
      return 'driver is muted';
    }
    if (user.state.blocked) {
      return 'driver is blocked';
    }
    // Only filter by vehicleType if BOTH driver and order have it set
    if (user.state.vehicleType && order.state.requestedVehicleType &&
        user.state.vehicleType !== order.state.requestedVehicleType) {
      return `vehicleType mismatch (driver=${user.state.vehicleType}, requested=${order.state.requestedVehicleType})`;
    }
    if (user.state.menuLocation !== 'driver-index') {
      return `not at driver-index (menuLocation=${user.state.menuLocation})`;
    }
    if (user.state.tripStatus === 'accepted' || user.state.tripStatus === 'in_progress') {
      return `trip in progress (tripStatus=${user.state.tripStatus})`;
    }
    if (user.state.pendingOrder) {
      // Auto-clean stale pendingOrder: if it matches a previous order that was already notified
      // by this handler, allow re-notification
      if (this.notifiedForOrder[candidate.userKey]) {
        return `already notified for this order cycle`;
      }
      return `has pending order (pendingOrder=${user.state.pendingOrder})`;
    }
    const driverRadius = user.state.radius;
    if (driverRadius && candidate.distance > driverRadius * 1) {
      return `out of driver radius (distance=${candidate.distance.toFixed(2)}, radius=${driverRadius})`;
    }
    return null;
  }

  startRetryLoop() {
    let retryCount = 0;

    this.retryTimer = setInterval(() => {
      retryCount++;

      if (retryCount >= MAX_RETRIES) {
        console.log(`[NOTIFY] Retry limit reached (${MAX_RETRIES}) for order ${this.orderKey}`);
        this.clearPreviousDriver();
        clearInterval(this.retryTimer);
        return;
      }

      new Order({ orderKey: this.orderKey }).load().then((order) => {
        if (order.state.status !== 'new') {
          console.log(`[NOTIFY] Order ${this.orderKey} status=${order.state.status}, stopping retry`);
          clearInterval(this.retryTimer);
          return;
        }

        const createdAt = order.state.createdAt;
        if (createdAt && typeof createdAt === 'number' &&
            (new Date()).getTime() > createdAt + 15 * 60 * 1000) {
          console.log(`[NOTIFY] Order ${this.orderKey} is stale (age=${Math.round(((new Date()).getTime() - createdAt) / 1000)}s), stopping retry`);
          this.clearPreviousDriver();
          clearInterval(this.retryTimer);
          return;
        }

        this.order = order;
        console.log(`[NOTIFY] Retry ${retryCount}/${MAX_RETRIES} for order ${this.orderKey}`);
        this.collectAndNotify();
      }).catch((err) => {
        console.error(`[NOTIFY] Retry error for order ${this.orderKey}:`, err);
      });
    }, RETRY_INTERVAL_MS);
  }
}
