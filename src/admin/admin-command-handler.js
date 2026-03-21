import Settings from '../../settings';
import loadFareConfig, { saveFareConfig, saveRadius, getRadius, getVehicleRate } from '../fare/fare-config';
import firebaseDB from '../firebase-db';
import { getOracleConnection } from '../support/oracle-db';
import { sendGroupLog, formatDate } from '../support/group-log';

const settings = new Settings();

const pendingAdminCommand = {};

const VALID_VEHICLES = ['car', 'tuk', 'bike', 'van'];
const VEHICLE_EMOJI = { car: '\u{1F697}', tuk: '\u{1F6FA}', bike: '\u{1F3CD}\uFE0F', van: '\u{1F690}' };

function isAdmin(telegramUserId) {
  return settings.ADMIN_IDS.indexOf(telegramUserId) !== -1;
}

export default function handleAdminCommand(api, msg) {
  const text = (msg.text || '').trim();
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!text.startsWith('/') && pendingAdminCommand[chatId]) {
    if (!isAdmin(userId)) {
      delete pendingAdminCommand[chatId];
      return false;
    }
    const pending = pendingAdminCommand[chatId];
    delete pendingAdminCommand[chatId];
    return executePendingCommand(api, chatId, userId, pending, text);
  }

  if (!text.startsWith('/')) return false;

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  if (command === '/groupid') {
    api.sendMessage(chatId, `Group ID: ${chatId}`);
    return true;
  }

  if (!isAdmin(userId)) {
    return false;
  }

  const paramCommands = {
    '/basekm': { prompt: '\u{1F4CF} Enter the base distance in km (e.g. 3):', handler: 'basekm' },
    '/setrate': { prompt: '\u{1F4B5} Enter: <vehicle> <rate>\nExample: /setrate car 100', handler: 'setrate' },
    '/setbase': { prompt: '\u{1F4B0} Enter: <vehicle> <price>\nExample: /setbase car 300', handler: 'setbase' },
    '/setradius': { prompt: '\u{1F4CF} Enter the driver search radius in km (e.g. 10):', handler: 'setradius' },
    '/block': { prompt: '\u{1F6AB} Enter the username to block (e.g. @johndoe):', handler: 'block' },
    '/unblock': { prompt: '\u2705 Enter the username to unblock (e.g. @johndoe):', handler: 'unblock' },
    '/blockcat': { prompt: '\u{1F6AB} Enter category to block (car/tuk/bike/van):', handler: 'blockcat' },
    '/unblockcat': { prompt: '\u2705 Enter category to unblock (car/tuk/bike/van):', handler: 'unblockcat' },
    '/resetdriver': { prompt: '\u{1F504} Enter driver username to reset (e.g. @johndoe):', handler: 'resetdriver' },
    '/checkdriver': { prompt: '\u{1F50E} Enter driver username to check (e.g. @johndoe):', handler: 'checkdriver' },
  };

  if (paramCommands[command] && !arg) {
    pendingAdminCommand[chatId] = paramCommands[command].handler;
    api.sendMessage(chatId, paramCommands[command].prompt);
    return true;
  }

  switch (command) {
    case '/help':
    case '/commands':
      return cmdHelp(api, chatId);
    case '/status':
      return cmdStatus(api, chatId);
    case '/whoami':
      api.sendMessage(chatId, `Your Telegram ID: ${userId}`);
      return true;
    case '/session':
      return cmdShowSettings(api, chatId);
    case '/approve':
      api.sendMessage(chatId, '\u2705 No pending requests.');
      return true;
    case '/basekm':
      return cmdBaseKm(api, chatId, arg);
    case '/setrate':
      return cmdSetRate(api, chatId, arg);
    case '/setbase':
      return cmdSetBase(api, chatId, arg);
    case '/rates':
      return cmdShowRates(api, chatId);
    case '/setradius':
      return cmdSetRadius(api, chatId, arg);
    case '/getradius':
      return cmdGetRadius(api, chatId);
    case '/block':
      return cmdBlock(api, chatId, arg, true);
    case '/unblock':
      return cmdBlock(api, chatId, arg, false);
    case '/blockcat':
      return cmdBlockCat(api, chatId, arg, true);
    case '/unblockcat':
      return cmdBlockCat(api, chatId, arg, false);
    case '/drivers':
      return cmdListUsers(api, chatId, 'driver');
    case '/riders':
      return cmdListUsers(api, chatId, 'passenger');
    case '/users':
      return cmdListUsers(api, chatId, null);
    case '/trips':
      return cmdTrips(api, chatId, arg);
    case '/revenue':
      return cmdRevenue(api, chatId);
    case '/resetdriver':
      return cmdResetDriver(api, chatId, arg);
    case '/checkdriver':
      return cmdCheckDriver(api, chatId, arg);
    case '/restart':
      return cmdRestart(api, chatId);
    default:
      return false;
  }
}

function executePendingCommand(api, chatId, userId, handler, arg) {
  switch (handler) {
    case 'basekm': return cmdBaseKm(api, chatId, arg);
    case 'setrate': return cmdSetRate(api, chatId, arg);
    case 'setbase': return cmdSetBase(api, chatId, arg);
    case 'setradius': return cmdSetRadius(api, chatId, arg);
    case 'block': return cmdBlock(api, chatId, arg, true);
    case 'unblock': return cmdBlock(api, chatId, arg, false);
    case 'blockcat': return cmdBlockCat(api, chatId, arg, true);
    case 'unblockcat': return cmdBlockCat(api, chatId, arg, false);
    case 'resetdriver': return cmdResetDriver(api, chatId, arg);
    case 'checkdriver': return cmdCheckDriver(api, chatId, arg);
    default: return false;
  }
}

function cmdBaseKm(api, chatId, arg) {
  const val = parseFloat(arg);
  if (isNaN(val) || val <= 0 || val > 50) {
    api.sendMessage(chatId, '\u274C Usage: /basekm [km] (max 50)\nExample: /basekm 5');
    return true;
  }
  saveFareConfig({ baseKm: val });
  api.sendMessage(chatId, `\u2705 Base distance updated to ${val} km (all categories)`);
  return true;
}

function cmdSetRate(api, chatId, arg) {
  const parts = arg.trim().split(/\s+/);
  if (parts.length < 2) {
    api.sendMessage(chatId, '\u274C Usage: /setrate <vehicle> <rate>\nExample: /setrate car 100\nVehicles: car, tuk, bike, van');
    return true;
  }
  const vehicle = parts[0].toLowerCase();
  const val = parseFloat(parts[1]);
  if (!VALID_VEHICLES.includes(vehicle)) {
    api.sendMessage(chatId, `\u274C Invalid vehicle: "${parts[0]}"\nValid: car, tuk, bike, van`);
    return true;
  }
  if (isNaN(val) || val <= 0) {
    api.sendMessage(chatId, '\u274C Rate must be a positive number');
    return true;
  }
  const config = loadFareConfig();
  const rates = config.rates || {};
  rates[vehicle] = Object.assign({}, rates[vehicle] || {}, { perKmRate: val });
  saveFareConfig({ rates });
  const emoji = VEHICLE_EMOJI[vehicle] || '';
  api.sendMessage(chatId, `\u2705 ${emoji} ${vehicle.charAt(0).toUpperCase() + vehicle.slice(1)} per-km rate updated to LKR ${val}/km`);
  return true;
}

function cmdSetBase(api, chatId, arg) {
  const parts = arg.trim().split(/\s+/);
  if (parts.length < 2) {
    api.sendMessage(chatId, '\u274C Usage: /setbase <vehicle> <price>\nExample: /setbase car 300\nVehicles: car, tuk, bike, van');
    return true;
  }
  const vehicle = parts[0].toLowerCase();
  const val = parseFloat(parts[1]);
  if (!VALID_VEHICLES.includes(vehicle)) {
    api.sendMessage(chatId, `\u274C Invalid vehicle: "${parts[0]}"\nValid: car, tuk, bike, van`);
    return true;
  }
  if (isNaN(val) || val <= 0) {
    api.sendMessage(chatId, '\u274C Base fare must be a positive number');
    return true;
  }
  const config = loadFareConfig();
  const rates = config.rates || {};
  rates[vehicle] = Object.assign({}, rates[vehicle] || {}, { baseFare: val });
  saveFareConfig({ rates });
  const emoji = VEHICLE_EMOJI[vehicle] || '';
  api.sendMessage(chatId, `\u2705 ${emoji} ${vehicle.charAt(0).toUpperCase() + vehicle.slice(1)} base fare updated to LKR ${val}`);
  return true;
}

function cmdShowRates(api, chatId) {
  const config = loadFareConfig();
  const baseKm = config.baseKm || 3;
  const blocked = config.blockedCategories || [];
  const lines = ['Current Rates', ''];

  VALID_VEHICLES.forEach(v => {
    const rate = getVehicleRate(v);
    const emoji = VEHICLE_EMOJI[v] || '';
    const name = v.charAt(0).toUpperCase() + v.slice(1);
    const isBlocked = blocked.includes(v) ? ' \u{1F6AB} BLOCKED' : '';
    lines.push(`${emoji} ${name}${isBlocked}`);
    lines.push(`  Base: ${rate.baseFare}   Per KM: ${rate.perKmRate}`);
  });

  lines.push('');
  lines.push(`Base KM (global): ${baseKm} km`);
  api.sendMessage(chatId, lines.join('\n'));
  return true;
}

function cmdBlockCat(api, chatId, arg, block) {
  const cat = (arg || '').trim().toLowerCase();
  if (!VALID_VEHICLES.includes(cat)) {
    api.sendMessage(chatId, `\u274C Invalid category: "${arg}"\nValid: car, tuk, bike, van`);
    return true;
  }
  const config = loadFareConfig();
  let blocked = config.blockedCategories || [];

  if (block) {
    if (!blocked.includes(cat)) blocked.push(cat);
    saveFareConfig({ blockedCategories: blocked });
    const emoji = VEHICLE_EMOJI[cat] || '';
    api.sendMessage(chatId,
      `${emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1)} category is now disabled.\n\n` +
      `Riders cannot request ${cat.charAt(0).toUpperCase() + cat.slice(1)} rides.\n` +
      `Drivers will not receive ${cat.charAt(0).toUpperCase() + cat.slice(1)} requests.`
    );
  } else {
    blocked = blocked.filter(c => c !== cat);
    saveFareConfig({ blockedCategories: blocked });
    const emoji = VEHICLE_EMOJI[cat] || '';
    api.sendMessage(chatId,
      `${emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1)} category is now enabled.\n\n` +
      `Riders can request ${cat.charAt(0).toUpperCase() + cat.slice(1)} rides.\n` +
      `Drivers will receive ${cat.charAt(0).toUpperCase() + cat.slice(1)} requests.`
    );
  }
  return true;
}

function cmdSetRadius(api, chatId, arg) {
  const val = parseInt(arg, 10);
  if (isNaN(val) || val <= 0 || val > 50) {
    api.sendMessage(chatId, '\u274C Usage: /setradius [km]\nExample: /setradius 10');
    return true;
  }
  settings.MAX_RADIUS = val;
  saveRadius(val);
  api.sendMessage(chatId, `\u2705 Driver search radius updated to ${val} km`);
  return true;
}

function cmdBlock(api, chatId, arg, block) {
  const username = (arg || '').replace('@', '').trim();
  if (!username) {
    api.sendMessage(chatId, `\u274C Usage: /${block ? 'block' : 'unblock'} @username\nExample: /${block ? 'block' : 'unblock'} @johndoe`);
    return true;
  }

  const db = firebaseDB.config();
  const usersRef = db.ref('users');
  usersRef.orderByChild('identity/username').equalTo(username).once('value', (snap) => {
    const data = snap.val();
    if (!data) {
      api.sendMessage(chatId, `\u274C User @${username} not found.`);
      return;
    }
    const userKey = Object.keys(data)[0];
    const telegramId = parseInt(userKey.replace('telegram_', ''), 10);
    if (block && settings.ADMIN_IDS.indexOf(telegramId) !== -1) {
      api.sendMessage(chatId, '\u274C You cannot block an admin.');
      return;
    }
    db.ref(`users/${userKey}/blocked`).set(block);
    if (!block) {
      db.ref(`users/${userKey}/menuLocation`).set('driver-index');
      db.ref(`users/${userKey}/pendingOrder`).set(null);
      db.ref(`users/${userKey}/tripStatus`).set(null);
    }
    api.sendMessage(chatId, `\u2705 User @${username} has been ${block ? 'blocked' : 'unblocked'}.`);
  });
  return true;
}

function cmdListUsers(api, chatId, userType) {
  const db = firebaseDB.config();
  const usersRef = db.ref('users');
  usersRef.once('value', (snap) => {
    const data = snap.val() || {};
    const drivers = [];
    const riders = [];
    let blockedCount = 0;

    Object.keys(data).forEach((key) => {
      const u = data[key];
      if (u.blocked) blockedCount++;

      const name = u.driverName
        || (u.identity ? `${u.identity.first || ''} ${u.identity.last || ''}`.trim() : '')
        || key;
      const uname = u.identity && u.identity.username ? `@${u.identity.username}` : '';
      const phone = u.phone || '';

      if (u.userType === 'driver') {
        const vehicle = u.vehicleType || 'N/A';
        const plate = u.vehiclePlate || 'N/A';
        const blocked = u.blocked ? ' \u{1F6AB}' : '';
        const emoji = VEHICLE_EMOJI[vehicle] || '\u{1F697}';
        drivers.push(`\u2022 ${name} ${uname}${blocked}\n  \u{1F4DE} ${phone} | ${emoji} ${vehicle} | \u{1F522} ${plate}`);
      } else if (u.userType === 'passenger') {
        const blocked = u.blocked ? ' \u{1F6AB}' : '';
        riders.push(`\u2022 ${name} ${uname}${blocked} ${phone ? '| \u{1F4DE} ' + phone : ''}`);
      }
    });

    if (userType === 'driver') {
      if (drivers.length === 0) {
        api.sendMessage(chatId, 'No registered drivers found.');
        return;
      }
      api.sendMessage(chatId, `\u{1F697} Registered Drivers (${drivers.length}):\n\n${drivers.join('\n')}`);
    } else if (userType === 'passenger') {
      if (riders.length === 0) {
        api.sendMessage(chatId, 'No registered riders found.');
        return;
      }
      api.sendMessage(chatId, `\u{1F695} Registered Riders (${riders.length}):\n\n${riders.join('\n')}`);
    } else {
      const lines = [
        '\u{1F4CB} User Summary:',
        '',
        `\u{1F697} Drivers: ${drivers.length}`,
        `\u{1F695} Riders: ${riders.length}`,
        `\u{1F6AB} Blocked: ${blockedCount}`,
        `\u{1F4CA} Total: ${drivers.length + riders.length}`,
      ];
      api.sendMessage(chatId, lines.join('\n'));
    }
  });
  return true;
}

async function cmdTrips(api, chatId, arg) {
  try {
    const connection = await getOracleConnection();
    if (!connection) {
      api.sendMessage(chatId, `Failed to connect to Oracle DB.`);
      return true;
    }

    let filterLabel = 'All';
    let sql = `SELECT passenger_name, driver_name, trip_distance, trip_fare, created_at, NVL(status, 'completed') as status FROM trip_logs`;
    let binds = {};

    const period = (arg || '').toLowerCase().trim();
    if (period === 'today') {
      sql += ` WHERE created_at >= TRUNC(SYSDATE)`;
      filterLabel = 'Today';
    } else if (period === 'week') {
      sql += ` WHERE created_at >= TRUNC(SYSDATE) - 7`;
      filterLabel = 'This week';
    } else if (period === 'month') {
      sql += ` WHERE created_at >= TRUNC(SYSDATE) - 30`;
      filterLabel = 'This month';
    }

    sql += ` ORDER BY created_at ASC`;

    const result = await connection.execute(sql, binds);
    await connection.close();

    const trips = [];
    let totalRevenue = 0;

    if (result.rows) {
      result.rows.forEach((row) => {
        const fare = row[3] || 0;
        totalRevenue += fare;
        trips.push({
          rider: row[0] || 'Rider',
          distance: row[2] || 0,
          fare,
          date: new Date(row[4]).toLocaleDateString(),
          status: row[5] === 'cancelled' ? '\u274C' : row[5] === 'in_progress' ? '\u23F3' : '\u2705',
        });
      });
    }

    if (trips.length === 0) {
      api.sendMessage(chatId, `No trips found (${filterLabel}).`);
      return true;
    }

    const lines = [`\u{1F4CA} Trips \u2014 ${filterLabel} (${trips.length}):`];
    lines.push('');
    trips.slice(-20).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.status} ${t.rider} \u2014 ${t.distance} km \u2014 LKR ${t.fare} (${t.date})`);
    });
    lines.push('');
    lines.push(`\u{1F4B0} Total Revenue: LKR ${totalRevenue}`);

    if (trips.length > 20) {
      lines.push(`(showing last 20 of ${trips.length} trips)`);
    }

    api.sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    console.error('Error fetching trips from Oracle:', err);
    api.sendMessage(chatId, `Error fetching trips: ${err.message}`);
  }
  return true;
}

function cmdGetRadius(api, chatId) {
  const radius = getRadius();
  api.sendMessage(chatId, `\u{1F4CF} Current driver search radius: ${radius} km`);
  return true;
}

async function cmdRevenue(api, chatId) {
  try {
    const connection = await getOracleConnection();
    if (!connection) {
      api.sendMessage(chatId, `Failed to connect to Oracle DB.`);
      return true;
    }

    const result = await connection.execute(
      `SELECT COUNT(*) as total_trips, NVL(SUM(trip_fare), 0) as total_revenue, NVL(SUM(trip_distance), 0) as total_distance FROM trip_logs`
    );
    await connection.close();

    const row = result.rows[0] || [0, 0, 0];
    const lines = [
      '\u{1F4B0} Revenue Summary:',
      '',
      `\u{1F4CA} Total Trips: ${row[0]}`,
      `\u{1F4B5} Total Revenue: LKR ${row[1]}`,
      `\u{1F4CF} Total Distance: ${row[2]} km`,
    ];
    api.sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    console.error('Error fetching revenue:', err);
    api.sendMessage(chatId, `Error fetching revenue: ${err.message}`);
  }
  return true;
}

function cmdShowSettings(api, chatId) {
  const config = loadFareConfig();
  const radius = getRadius();
  const lines = [
    '\u2699\uFE0F Bot Settings:',
    '',
    `\u{1F4DB} Bot Name: ${config.botName || settings.BOT_NAME || 'Connect'}`,
    '',
    '\u{1F4B0} Fare Settings:',
  ];

  VALID_VEHICLES.forEach(v => {
    const rate = getVehicleRate(v);
    const emoji = VEHICLE_EMOJI[v] || '';
    const name = v.charAt(0).toUpperCase() + v.slice(1);
    lines.push(`  ${emoji} ${name}: Base ${rate.baseFare} | Per KM ${rate.perKmRate}`);
  });

  lines.push(`  Base KM: ${config.baseKm || 3} km`);
  lines.push('');
  lines.push(`\u{1F4CF} Driver Radius: ${radius} km`);
  lines.push(`\u{1F310} OSRM: ${settings.OSRM_SERVER_URL}`);
  lines.push(`\u{1F4E2} Log Group: ${settings.LOG_GROUP_ID || '(not set)'}`);
  api.sendMessage(chatId, lines.join('\n'));
  return true;
}

function cmdHelp(api, chatId) {
  const lines = [
    '\u{1F4CB} Connect \u2014 Admin Commands:',
    '',
    '/help \u2014 Show this help',
    '/status \u2014 Bot status',
    '/rates \u2014 View all rates per category',
    '/setbase <vehicle> <price> \u2014 Set base fare',
    '/setrate <vehicle> <rate> \u2014 Set per-km rate',
    '/basekm [km] \u2014 Set base distance (global)',
    '/setradius [km] \u2014 Set driver radius',
    '/blockcat <cat> \u2014 Disable vehicle category',
    '/unblockcat <cat> \u2014 Enable vehicle category',
    '/block @user \u2014 Block user',
    '/unblock @user \u2014 Unblock user',
    '/resetdriver @user \u2014 Reset stuck driver state',
    '/checkdriver @user \u2014 Check driver state',
    '/drivers \u2014 List drivers',
    '/riders \u2014 List riders',
    '/users \u2014 All users',
    '/trips \u2014 Trip history',
    '/revenue \u2014 Revenue summary',
    '/groupid \u2014 Get group ID',
    '/whoami \u2014 Your Telegram ID',
    '/session \u2014 Bot settings',
    '/restart \u2014 Restart the bot',
  ];
  api.sendMessage(chatId, lines.join('\n'));
  return true;
}

function cmdStatus(api, chatId) {
  const db = firebaseDB.config();
  db.ref('users').once('value', (snap) => {
    const data = snap.val() || {};
    let driverCount = 0;
    let riderCount = 0;
    let blockedCount = 0;
    Object.values(data).forEach((u) => {
      if (u.userType === 'driver') driverCount++;
      if (u.userType === 'passenger') riderCount++;
      if (u.blocked) blockedCount++;
    });
    const lines = [
      '\u{1F4CA} Connect \u2014 Bot Status',
      '',
      `\u{1F697} Drivers: ${driverCount}`,
      `\u{1F695} Riders: ${riderCount}`,
      `\u{1F6AB} Blocked: ${blockedCount}`,
      `\u{1F464} Total Users: ${Object.keys(data).length}`,
      '',
      `\u2705 Bot is running.`,
    ];
    api.sendMessage(chatId, lines.join('\n'));
  });
  return true;
}

function cmdResetDriver(api, chatId, arg) {
  const username = (arg || '').replace('@', '').trim();
  if (!username) {
    api.sendMessage(chatId, '\u274C Usage: /resetdriver @username');
    return true;
  }

  const db = firebaseDB.config();
  db.ref('users').orderByChild('identity/username').equalTo(username).once('value', (snap) => {
    const data = snap.val();
    if (!data) {
      api.sendMessage(chatId, `\u274C Driver @${username} not found.`);
      return;
    }
    const userKey = Object.keys(data)[0];
    const updates = {
      tripStatus: null,
      tripStartedAt: null,
      tripStartLocation: null,
      tripEndLocation: null,
      currentOrder: null,
      currentOrderKey: null,
      pendingOrder: null,
      driverArrived: null,
      menuLocation: 'driver-index',
    };
    Object.keys(updates).forEach((key) => {
      db.ref(`users/${userKey}/${key}`).set(updates[key]);
    });
    api.sendMessage(chatId,
      `\u2705 Driver @${username} state has been reset.\n\n` +
      `Trip status: cleared\n` +
      `Menu: driver-index\n` +
      `Current order: cleared\n\n` +
      `Driver should now be able to receive new requests.`
    );
  });
  return true;
}

function cmdCheckDriver(api, chatId, arg) {
  const username = (arg || '').replace('@', '').trim();
  if (!username) {
    api.sendMessage(chatId, '\u274C Usage: /checkdriver @username');
    return true;
  }

  const db = firebaseDB.config();
  db.ref('users').orderByChild('identity/username').equalTo(username).once('value', (snap) => {
    const data = snap.val();
    if (!data) {
      api.sendMessage(chatId, `\u274C Driver @${username} not found.`);
      return;
    }
    const userKey = Object.keys(data)[0];
    const u = data[userKey];
    const lines = [
      `\u{1F50E} Driver @${username} State:`,
      '',
      `\u{1F464} Name: ${u.driverName || 'N/A'}`,
      `\u{1F4DE} Phone: ${u.phone || 'N/A'}`,
      `\u{1F697} Vehicle: ${u.vehicleType || 'N/A'}`,
      `\u{1F4CD} Menu: ${u.menuLocation || 'N/A'}`,
      `\u{1F3C1} Trip Status: ${u.tripStatus || 'idle'}`,
      `\u{1F4E6} Current Order: ${u.currentOrderKey ? 'YES' : 'none'}`,
      `\u23F0 Pending Order: ${u.pendingOrder ? 'YES' : 'none'}`,
      `\u{1F4CC} Start Location: ${u.tripStartLocation ? `[${u.tripStartLocation}]` : 'none'}`,
      `\u{1F6AB} Blocked: ${u.blocked ? 'YES' : 'no'}`,
    ];
    api.sendMessage(chatId, lines.join('\n'));
  });
  return true;
}

function cmdRestart(api, chatId) {
  const restartMsg = [
    '\u{1F504} Bot is restarting...',
    '',
    'The bot will be back online in a few seconds.',
    'All pending orders will be recovered automatically.',
  ];
  api.sendMessage(chatId, restartMsg.join('\n'));

  const groupMsg = [
    '\u{1F504} Connect \u2014 Bot Restart',
    '',
    `Initiated by admin (${chatId})`,
    'Pending orders will be re-sent to drivers on startup.',
    '',
    formatDate(),
  ];
  sendGroupLog(groupMsg.join('\n'));

  setTimeout(() => {
    console.log('Admin-initiated restart...');
    try { api.stopPolling(); } catch (e) { /* ignore */ }
    process.exit(0);
  }, 2000);

  return true;
}
