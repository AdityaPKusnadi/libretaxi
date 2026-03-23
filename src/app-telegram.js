/* eslint-disable no-console, no-use-before-define */
import './init';
import TelegramBot from 'tgfancy';
import { loadUser } from './factories/user-factory';
import CaQueue from './queue/ca-queue';
import callAction from './call-action';
import textToValue from './support/text-to-value';
import initLocale from './support/init-locale';
import InlineButtonCallback from './response-handlers/common/inline-button-callback';
import Settings from '../settings';
import handleAdminCommand from './admin/admin-command-handler';
import { loadFareConfigFromOracle, loadRadiusFromOracle } from './fare/fare-config';
import firebaseDB from './firebase-db';
import GeoFire from 'geofire';
import Order from './order';

const settings = new Settings();
const api = new TelegramBot(settings.TELEGRAM_TOKEN, {
  polling: true,
  tgfancy: { orderedSending: true },
});
const queue = new CaQueue();

function isAdmin(chatId) {
  return settings.ADMIN_IDS.indexOf(parseInt(chatId, 10)) !== -1;
}

loadFareConfigFromOracle().then((config) => {
  if (config.botName) settings.BOT_NAME = config.botName;
  if (config.welcomeMsg) settings.WELCOME_MSG = config.welcomeMsg;
  loadRadiusFromOracle(settings.MAX_RADIUS).then((radius) => {
    settings.MAX_RADIUS = radius;
    console.log(`OK ${settings.BOT_NAME} bot is waiting for messages... (radius: ${radius} km)`);
    recoverPendingOrders();
  });
});

const userCommands = [
  { command: 'start', description: 'Start bot / main menu' },
  { command: 'cancel', description: 'Cancel current action' },
  { command: 'cancelride', description: 'Cancel active ride' },
];

const adminCommands = [
  { command: 'help', description: 'Show all available commands' },
  { command: 'status', description: 'Show bot status' },
  { command: 'rates', description: 'View all rates per category' },
  { command: 'setbase', description: 'Set base fare (e.g. /setbase car 300)' },
  { command: 'setrate', description: 'Set per-km rate (e.g. /setrate car 100)' },
  { command: 'basekm', description: 'Set base km (e.g. /basekm 3)' },
  { command: 'setradius', description: 'Set driver radius (e.g. /setradius 10)' },
  { command: 'blockcat', description: 'Disable category (e.g. /blockcat bike)' },
  { command: 'unblockcat', description: 'Enable category (e.g. /unblockcat bike)' },
  { command: 'block', description: 'Block user (e.g. /block @user)' },
  { command: 'unblock', description: 'Unblock user (e.g. /unblock @user)' },
  { command: 'drivers', description: 'List registered drivers' },
  { command: 'riders', description: 'List registered riders' },
  { command: 'users', description: 'All registered users' },
  { command: 'trips', description: 'Trip data & statistics' },
  { command: 'revenue', description: 'Revenue summary' },
  { command: 'groupid', description: 'Get group ID for logs' },
  { command: 'whoami', description: 'Show your sender ID' },
  { command: 'session', description: 'Session settings' },
  { command: 'restart', description: 'Restart the bot' },
];

const TG_API = `https://api.telegram.org/bot${settings.TELEGRAM_TOKEN}`;

function setMyCommands(commands, scope) {
  const body = { commands };
  if (scope) body.scope = scope;
  return fetch(`${TG_API}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function deleteMyCommands(scope) {
  const body = {};
  if (scope) body.scope = scope;
  return fetch(`${TG_API}/deleteMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

setMyCommands(userCommands, { type: 'default' })
  .then(() => console.log('User commands registered.'))
  .catch((e) => console.log('Failed to set user commands:', e.message));

settings.ADMIN_IDS.forEach((adminId) => {
  setMyCommands(adminCommands, { type: 'chat', chat_id: adminId })
    .then(() => console.log(`Admin commands registered for ${adminId}.`))
    .catch((e) => console.log(`Failed to set admin commands for ${adminId}:`, e.message));
});

api.on('message', (msg) => {
  if (msg.chat.type !== 'private') {
    if (handleAdminCommand(api, msg)) return;
    return;
  }

  api.sendChatAction(msg.chat.id, 'typing').catch(() => {});

  if (handleAdminCommand(api, msg)) return;

  const userKey = `telegram_${msg.chat.id}`;
  const something = msg.text || (msg.contact || {}).phone_number || getLocation(msg);
  console.log(`Got '${something}' from ${userKey}`);

  withUser(userKey, (user) => {
    if (user.state.blocked) {
      api.sendMessage(msg.chat.id, '\u26D4 Your account has been blocked. Please contact the administrator.');
      return;
    }

    if (!isAdmin(msg.chat.id)) {
      deleteMyCommands({ type: 'chat', chat_id: msg.chat.id }).catch(() => {});
    }

    let menuLocation = user.state.menuLocation || 'default';

    if (something === '/start') menuLocation = 'system-reset-user';
    if (something === '/cancel') menuLocation = 'system-reset-user';
    if (something === '/cancelride') {
      const orderKey = user.state.currentOrderKey;
      const driverKey = user.state.driverKey;
      const rideNum = user.state.rideNum || null;

      if (!orderKey && !driverKey && user.state.tripStatus !== 'accepted' && user.state.tripStatus !== 'in_progress') {
        api.sendMessage(msg.chat.id, 'You don\'t have an active ride to cancel.');
        return;
      }

      if (orderKey) {
        const Order = require('./order').default;
        new Order({ orderKey }).load().then((order) => {
          order.setState({ status: 'cancelled' });
          order.save();
        }).catch(() => {});
      }

      if (driverKey) {
        const firebaseDB = require('./firebase-db').default;
        firebaseDB.config().ref(`users/${driverKey}`).update({
          pendingOrder: null,
          currentOrder: null,
          tripStatus: null,
          menuLocation: 'driver-index',
        });
        queue.create({
          userKey: driverKey,
          arg: {
            expectedState: {},
            message: '\u274C Rider has cancelled the ride. You are now available for new rides.',
            path: 'driver-index',
          },
          route: 'show-message',
        });
      }

      if (rideNum) {
        try {
          const { updateTripStatus } = require('./support/oracle-logger');
          updateTripStatus(rideNum, { status: 'cancelled' }).catch(() => {});
        } catch (e) {
          console.log(`Error updating cancelled trip: ${e}`);
        }

        const { sendGroupLog, formatDate } = require('./support/group-log');
        const riderName = (user.state.identity && user.state.identity.username)
          ? `@${user.state.identity.username}`
          : (user.state.identity && user.state.identity.first) || 'Rider';
        const fare = user.state.calculatedFare || {};
        const vehicleType = user.state.requestedVehicleType || 'car';
        const groupLines = [
          `\u274C Connect \u2014 Ride #${rideNum} Cancelled`,
          '',
          `\u{1F464} Rider: ${riderName}`,
          `\u{1F4CF} Est. Distance: ${fare.distanceKm || 0} km`,
          `\u{1F4B0} Est. Fare: ${fare.currencySymbol || 'LKR '}${fare.totalFare || 0}`,
          `\u{1F697} Vehicle: ${vehicleType}`,
          '',
          formatDate(),
        ];
        sendGroupLog(groupLines.join('\n'));
      }

      const firebaseDB = require('./firebase-db').default;
      firebaseDB.config().ref(`users/${userKey}`).update({
        currentOrderKey: null,
        tripStatus: null,
        driverKey: null,
        driverPhone: null,
        pendingOrder: null,
        menuLocation: 'select-user-type',
      });

      api.sendMessage(msg.chat.id, '\u274C Your current ride has been cancelled.');
      queue.create({ userKey, arg: null, route: 'select-user-type' });
      return;
    }

    queue.create({
      userKey,
      arg: msg.text ? textToValue(user, msg.text) : something,
      route: menuLocation,
    });

    const from = msg.from || {};
    queue.create({
      userKey,
      arg: {
        first: from.first_name || '',
        last: from.last_name || '',
        username: from.username || '',
      },
      route: 'update-identity',
    });
  });
});

api.on('callback_query', (msg) => {
  const userKey = `telegram_${msg.from.id}`;
  const data = msg.data;
  console.log(`Got inline button value ${data} from ${userKey}`);

  withUser(userKey, (user) => {
    if (user.state.blocked) {
      api.sendMessage(msg.from.id, '\u26D4 Your account has been blocked. Please contact the administrator.');
      return;
    }
    const t = initLocale(user);
    api.editMessageText(t.__('global.replied_to_order'), {
      chat_id: msg.message.chat.id,
      message_id: msg.message.message_id,
    });
    new InlineButtonCallback({ user, value: data, api }).call();
  });
});

queue.process((job, done) => {
  const data = job.data;
  console.log(`[QUEUE] Processing job: route=${data.route}, userKey=${data.userKey}`);
  return withUser(data.userKey, (user) => {
    console.log(`[QUEUE] Calling action: route=${data.route}, userKey=${data.userKey}, platformId=${user.platformId}`);
    callAction({
      user,
      arg: data.arg,
      route: data.route,
      queue,
      api,
    });
  })
  .then(() => {
    console.log(`[QUEUE] Job done: route=${data.route}, userKey=${data.userKey}`);
    done();
  })
  .catch((err) => {
    console.error(`[QUEUE] Job error: route=${data.route}, userKey=${data.userKey}`, err);
    done();
  });
});

function recoverPendingOrders() {
  const STALE_THRESHOLD_MS = 15 * 60 * 1000;
  const db = firebaseDB.config();

  db.ref('orders').orderByChild('status').equalTo('new').once('value', (snap) => {
    const orders = snap.val();
    if (!orders) {
      console.log('[RECOVER] No pending orders to recover.');
      return;
    }

    const now = Date.now();
    const orderKeys = Object.keys(orders);
    let recovered = 0;

    orderKeys.forEach((orderKey) => {
      const order = orders[orderKey];

      if (order.createdAt && (now - order.createdAt) > STALE_THRESHOLD_MS) {
        console.log(`[RECOVER] Skipping stale order ${orderKey} (too old)`);
        return;
      }

      const passengerKey = order.passengerKey;
      if (!passengerKey) {
        console.log(`[RECOVER] Skipping order ${orderKey} — no passengerKey`);
        return;
      }

      const loc = order.passengerLocation;
      if (!loc || !Array.isArray(loc) || loc.length < 2) {
        console.log(`[RECOVER] Skipping order ${orderKey} — invalid passengerLocation: ${JSON.stringify(loc)}`);
        return;
      }

      console.log(`[RECOVER] Recovering order ${orderKey} — re-sending to nearby drivers...`);
      recovered++;

      const geoFire = new GeoFire(db.ref('users'));
      const candidates = [];
      const q = geoFire.query({
        center: loc,
        radius: settings.MAX_RADIUS * 1,
      });

      q.on('key_entered', (userKey, location, distance) => {
        candidates.push({ userKey, location, distance });
      });

      setTimeout(() => {
        q.cancel();
        candidates.sort((a, b) => a.distance - b.distance);
        console.log(`[RECOVER] Found ${candidates.length} driver candidates for recovered order ${orderKey}`);

        notifyFirstEligibleDriver(candidates, 0, order, orderKey);
      }, 4000);
    });

    if (recovered > 0) {
      console.log(`[RECOVER] Recovering ${recovered} pending order(s)...`);
    }
  });
}

function notifyFirstEligibleDriver(candidates, index, order, orderKey) {
  if (index >= candidates.length) {
    console.log(`[RECOVER] No eligible driver found for recovered order ${orderKey} (checked ${candidates.length} candidates)`);
    return;
  }

  const c = candidates[index];

  loadUser(c.userKey).then((user) => {
    // Check eligibility with logging
    let skipReason = null;
    if (user.state.userType !== 'driver') {
      skipReason = `not a driver (userType=${user.state.userType})`;
    } else if (user.state.muted) {
      skipReason = 'muted';
    } else if (user.state.blocked) {
      skipReason = 'blocked';
    } else if (user.state.vehicleType !== order.requestedVehicleType) {
      skipReason = `vehicleType mismatch (driver=${user.state.vehicleType}, requested=${order.requestedVehicleType})`;
    } else if (user.state.menuLocation !== 'driver-index') {
      skipReason = `not at driver-index (menuLocation=${user.state.menuLocation})`;
    } else if (user.state.tripStatus === 'accepted' || user.state.tripStatus === 'in_progress') {
      skipReason = `trip in progress (tripStatus=${user.state.tripStatus})`;
    } else if (user.state.pendingOrder) {
      skipReason = `has pending order (${user.state.pendingOrder})`;
    } else {
      const driverRadius = user.state.radius || settings.MAX_RADIUS;
      if (c.distance > driverRadius * 1) {
        skipReason = `out of radius (distance=${c.distance.toFixed(2)}, radius=${driverRadius})`;
      }
    }

    if (skipReason) {
      console.log(`[RECOVER] Skipping ${c.userKey}: ${skipReason}`);
      notifyFirstEligibleDriver(candidates, index + 1, order, orderKey);
      return;
    }

    console.log(`[RECOVER] >>> Re-sending order ${orderKey} to driver ${c.userKey} (distance: ${c.distance.toFixed(2)}km)`);

    const db = firebaseDB.config();
    db.ref(`users/${c.userKey}/pendingOrder`).set(orderKey);

    db.ref(`orders/${orderKey}/assignedDriver`).set(c.userKey);

    const recoveryQueue = new CaQueue();
    const arg = {
      orderKey,
      distance: c.distance,
      from: order.passengerLocation,
      to: order.passengerDestination,
      price: order.price,
      passengerKey: order.passengerKey,
      passengerName: order.passengerName || null,
      passengerUsername: order.passengerUsername || null,
      passengerPhone: order.passengerPhone || null,
      calculatedFare: order.calculatedFare || null,
      destinationLocation: order.destinationLocation || null,
      rideNum: order.rideNum || null,
    };
    recoveryQueue.create({ userKey: c.userKey, arg, route: 'driver-order-new' });
  }).catch((err) => {
    console.error(`[RECOVER] Error loading user ${c.userKey}:`, err);
    notifyFirstEligibleDriver(candidates, index + 1, order, orderKey);
  });
}

process.once('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  api.stopPolling();
  process.exit(0);
});

const getLocation = (msg) => {
  if (!msg.location) return undefined;
  return [msg.location.latitude, msg.location.longitude];
};

const withUser = (userKey, f) => {
  return loadUser(userKey)
    .then((user) => {
      try {
        f(user);
      } catch (e) { handleException(e, user); }
    })
    .catch((err) => console.log(err));
};

const handleException = (ex, user) => {
  console.log(ex);
  try {
    const t = initLocale(user);
    api.sendMessage(user.platformId, t.__('global.error_try_again'),
      { disable_notification: true });
  } catch (e) {
    console.log(`Exception "${e}" while handing exception "${ex}"`);
  }
};
