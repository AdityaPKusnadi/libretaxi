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
  { command: 'baserate', description: 'Change base rate' },
  { command: 'basekm', description: 'Change base distance (km)' },
  { command: 'setrate', description: 'Change per-km rate' },
  { command: 'setradius', description: 'Change driver search radius' },
  { command: 'rate', description: 'View current rates' },
  { command: 'block', description: 'Block a user' },
  { command: 'unblock', description: 'Unblock a user' },
  { command: 'drivers', description: 'List registered drivers' },
  { command: 'riders', description: 'List registered riders' },
  { command: 'users', description: 'All registered users' },
  { command: 'trips', description: 'Trip data & statistics' },
  { command: 'groupid', description: 'Get group ID for logs' },
  { command: 'whoami', description: 'Show your sender ID' },
  { command: 'session', description: 'Session settings' },
];

api.setMyCommands(userCommands, { scope: { type: 'default' } })
  .then(() => console.log('User commands registered.'))
  .catch((e) => console.log('Failed to set user commands:', e.message));

settings.ADMIN_IDS.forEach((adminId) => {
  api.setMyCommands(adminCommands, { scope: { type: 'chat', chat_id: adminId } })
    .then(() => console.log(`Admin commands registered for ${adminId}.`))
    .catch((e) => console.log(`Failed to set admin commands for ${adminId}:`, e.message));
});

api.on('message', (msg) => {
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

    let menuLocation = user.state.menuLocation || 'default';

    if (something === '/start') menuLocation = 'system-reset-user';
    if (something === '/cancel') menuLocation = 'system-reset-user';
    if (something === '/cancelride') {
      if (user.state.currentOrderKey) {
        queue.create({ userKey, arg: 'cancel-ride', route: 'select-user-type' });
      } else {
        api.sendMessage(msg.chat.id, 'You don\'t have an active ride to cancel.');
      }
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
