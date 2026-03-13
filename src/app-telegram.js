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
  });
});

const userCommands = [
  { command: 'start', description: 'Start bot / main menu' },
  { command: 'cancel', description: 'Cancel current action' },
  { command: 'cancelride', description: 'Cancel active ride' },
];

const adminCommands = [
  { command: 'help', description: 'Show all available commands' },
  { command: 'commands', description: 'List all slash commands' },
  { command: 'status', description: 'Show bot status' },
  { command: 'approve', description: 'Approve or reject request' },
  { command: 'baserate', description: 'Set base fare (e.g. /baserate 300)' },
  { command: 'basekm', description: 'Set base km (e.g. /basekm 3)' },
  { command: 'setrate', description: 'Set per-km rate (e.g. /setrate 100)' },
  { command: 'setradius', description: 'Set driver radius (e.g. /setradius 10)' },
  { command: 'rate', description: 'View current rates' },
  { command: 'block', description: 'Block user (e.g. /block @user)' },
  { command: 'unblock', description: 'Unblock user (e.g. /unblock @user)' },
  { command: 'drivers', description: 'List registered drivers' },
  { command: 'riders', description: 'List registered riders' },
  { command: 'users', description: 'All registered users' },
  { command: 'trips', description: 'Trip data & statistics' },
  { command: 'groupid', description: 'Get group ID for logs' },
  { command: 'whoami', description: 'Show your sender ID' },
  { command: 'session', description: 'Session settings' },
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

      try {
        const { logTripToOracle } = require('./support/oracle-logger');
        const riderName = (user.state.identity && (user.state.identity.first || user.state.identity.username)) || 'Rider';
        logTripToOracle({
          passengerName: riderName,
          driverName: 'N/A',
          driverPhone: 'N/A',
          tripDistance: 0,
          tripFare: 0,
          rateDescription: 'N/A',
          status: 'cancelled',
        });
      } catch (e) {
        console.log(`Error logging cancelled trip: ${e}`);
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
  withUser(data.userKey, (user) => {
    callAction({
      user,
      arg: data.arg,
      route: data.route,
      queue,
      api,
    });
  })
  .then(() => done());
});

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
