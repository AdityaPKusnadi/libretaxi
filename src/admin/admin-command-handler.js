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

import Settings from '../../settings';
import loadFareConfig, { saveFareConfig, saveRadius, getRadius } from '../fare/fare-config';
import firebaseDB from '../firebase-db';
import { getOracleConnection } from '../support/oracle-db';

const settings = new Settings();

function isAdmin(telegramUserId) {
  return settings.ADMIN_IDS.indexOf(telegramUserId) !== -1;
}

export default function handleAdminCommand(api, msg) {
  const text = (msg.text || '').trim();
  if (!text.startsWith('/')) return false;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
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
    case '/baserate':
    case '/farefirst':
      return cmdBaseRate(api, chatId, arg);
    case '/basekm':
      return cmdBaseKm(api, chatId, arg);
    case '/setrate':
    case '/fareperkm':
      return cmdSetRate(api, chatId, arg);
    case '/rate':
      return cmdShowRate(api, chatId);
    case '/setradius':
      return cmdSetRadius(api, chatId, arg);
    case '/getradius':
      return cmdGetRadius(api, chatId);
    case '/block':
      return cmdBlock(api, chatId, arg, true);
    case '/unblock':
      return cmdBlock(api, chatId, arg, false);
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
    case '/setgroup':
      return cmdSetGroup(api, chatId, arg);
    case '/setbotname':
      return cmdSetBotName(api, chatId, arg);
    case '/setwelcome':
      return cmdSetWelcome(api, chatId, arg);
    case '/settings':
      return cmdShowSettings(api, chatId);
    default:
      return false;
  }
}

function cmdBaseRate(api, chatId, arg) {
  const val = parseFloat(arg);
  if (isNaN(val) || val <= 0) {
    api.sendMessage(chatId, '❌ Usage: /baserate [amount]\nExample: /baserate 350');
    return true;
  }
  saveFareConfig({ baseFare: val });
  api.sendMessage(chatId, `✅ Base fare updated to LKR ${val}`);
  return true;
}

function cmdBaseKm(api, chatId, arg) {
  const val = parseFloat(arg);
  if (isNaN(val) || val <= 0 || val > 50) {
    api.sendMessage(chatId, '❌ Usage: /basekm [km] (max 50)\nExample: /basekm 5');
    return true;
  }
  saveFareConfig({ baseKm: val });
  api.sendMessage(chatId, `✅ Base distance updated to ${val} km`);
  return true;
}

function cmdSetRate(api, chatId, arg) {
  const val = parseFloat(arg);
  if (isNaN(val) || val <= 0) {
    api.sendMessage(chatId, '❌ Usage: /setrate [amount]\nExample: /setrate 90');
    return true;
  }
  saveFareConfig({ perKmRate: val });
  api.sendMessage(chatId, `✅ Per-km rate updated to LKR ${val}/km`);
  return true;
}

function cmdShowRate(api, chatId) {
  const config = loadFareConfig();
  const lines = [
    '📊 Current Rate Configuration:',
    '',
    `💰 Base Fare: LKR ${config.baseFare}`,
    `📏 Base Distance: ${config.baseKm} km`,
    `🔢 Per-km Rate: LKR ${config.perKmRate}/km`,
    '',
    `Example: 10 km ride = LKR ${config.baseFare} + (${10 - config.baseKm} × ${config.perKmRate}) = LKR ${config.baseFare + (10 - config.baseKm) * config.perKmRate}`,
  ];
  api.sendMessage(chatId, lines.join('\n'));
  return true;
}

function cmdSetRadius(api, chatId, arg) {
  const val = parseInt(arg, 10);
  if (isNaN(val) || val <= 0 || val > 50) {
    api.sendMessage(chatId, '❌ Usage: /setradius [km]\nExample: /setradius 10');
    return true;
  }
  settings.MAX_RADIUS = val;
  saveRadius(val);
  api.sendMessage(chatId, `✅ Driver search radius updated to ${val} km`);
  return true;
}

function cmdBlock(api, chatId, arg, block) {
  const username = (arg || '').replace('@', '').trim();
  if (!username) {
    api.sendMessage(chatId, `❌ Usage: /${block ? 'block' : 'unblock'} @username\nExample: /${block ? 'block' : 'unblock'} @johndoe`);
    return true;
  }

  const db = firebaseDB.config();
  const usersRef = db.ref('users');
  usersRef.orderByChild('identity/username').equalTo(username).once('value', (snap) => {
    const data = snap.val();
    if (!data) {
      api.sendMessage(chatId, `❌ User @${username} not found.`);
      return;
    }
    const userKey = Object.keys(data)[0];
    const telegramId = parseInt(userKey.replace('telegram_', ''), 10);
    if (block && settings.ADMIN_IDS.indexOf(telegramId) !== -1) {
      api.sendMessage(chatId, '❌ You cannot block an admin.');
      return;
    }
    db.ref(`users/${userKey}/blocked`).set(block);
    if (!block) {
      db.ref(`users/${userKey}/menuLocation`).set('driver-index');
      db.ref(`users/${userKey}/pendingOrder`).set(null);
      db.ref(`users/${userKey}/tripStatus`).set(null);
    }
    api.sendMessage(chatId, `✅ User @${username} has been ${block ? 'blocked' : 'unblocked'}.`);
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
        const blocked = u.blocked ? ' 🚫' : '';
        drivers.push(`• ${name} ${uname}${blocked}\n  📞 ${phone} | 🚗 ${vehicle} | 🔢 ${plate}`);
      } else if (u.userType === 'passenger') {
        const blocked = u.blocked ? ' 🚫' : '';
        riders.push(`• ${name} ${uname}${blocked} ${phone ? '| 📞 ' + phone : ''}`);
      }
    });

    if (userType === 'driver') {
      if (drivers.length === 0) {
        api.sendMessage(chatId, 'No registered drivers found.');
        return;
      }
      api.sendMessage(chatId, `🚗 Registered Drivers (${drivers.length}):\n\n${drivers.join('\n')}`);
    } else if (userType === 'passenger') {
      if (riders.length === 0) {
        api.sendMessage(chatId, 'No registered riders found.');
        return;
      }
      api.sendMessage(chatId, `🚕 Registered Riders (${riders.length}):\n\n${riders.join('\n')}`);
    } else {
      const lines = [
        '📋 User Summary:',
        '',
        `🚗 Drivers: ${drivers.length}`,
        `🚕 Riders: ${riders.length}`,
        `🚫 Blocked: ${blockedCount}`,
        `📊 Total: ${drivers.length + riders.length}`,
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
          status: row[5] === 'cancelled' ? '❌' : row[5] === 'in_progress' ? '⏳' : '✅',
        });
      });
    }

    if (trips.length === 0) {
      api.sendMessage(chatId, `No trips found (${filterLabel}).`);
      return true;
    }

    const lines = [`📊 Trips — ${filterLabel} (${trips.length}):`];
    lines.push('');
    trips.slice(-20).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.status} ${t.rider} \u2014 ${t.distance} km \u2014 LKR ${t.fare} (${t.date})`);
    });
    lines.push('');
    lines.push(`💰 Total Revenue: LKR ${totalRevenue}`);

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
  api.sendMessage(chatId, `📏 Current driver search radius: ${radius} km`);
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
      '💰 Revenue Summary:',
      '',
      `📊 Total Trips: ${row[0]}`,
      `💵 Total Revenue: LKR ${row[1]}`,
      `📏 Total Distance: ${row[2]} km`,
    ];
    api.sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    console.error('Error fetching revenue:', err);
    api.sendMessage(chatId, `Error fetching revenue: ${err.message}`);
  }
  return true;
}

function cmdSetGroup(api, chatId, arg) {
  const groupId = arg.trim();
  if (!groupId) {
    api.sendMessage(chatId, `\u274C Usage: /setgroup [group_id]\nUse /groupid in a group to get the ID.`);
    return true;
  }
  saveFareConfig({ tripLogGroupId: groupId });
  api.sendMessage(chatId, `\u2705 Trip log group set to: ${groupId}`);
  return true;
}

function cmdSetBotName(api, chatId, arg) {
  const name = arg.trim();
  if (!name) {
    api.sendMessage(chatId, `\u274C Usage: /setbotname [name]\nExample: /setbotname Idea Cabs`);
    return true;
  }
  settings.BOT_NAME = name;
  saveFareConfig({ botName: name });
  api.sendMessage(chatId, `\u2705 Bot name updated to: ${name}`);
  return true;
}

function cmdSetWelcome(api, chatId, arg) {
  const msg = arg.trim();
  if (!msg) {
    api.sendMessage(chatId, `\u274C Usage: /setwelcome [message]\nExample: /setwelcome Welcome to Idea Cabs \u{1F695} Fast & simple taxi service in Colombo.`);
    return true;
  }
  settings.WELCOME_MSG = msg;
  saveFareConfig({ welcomeMsg: msg });
  api.sendMessage(chatId, `\u2705 Welcome message updated to:\n${msg}`);
  return true;
}

function cmdShowSettings(api, chatId) {
  const config = loadFareConfig();
  const radius = getRadius();
  const lines = [
    '\u2699\uFE0F Bot Settings:',
    '',
    `\u{1F4DB} Bot Name: ${settings.BOT_NAME || 'Connect'}`,
    `\u{1F4AC} Welcome Message: ${settings.WELCOME_MSG || '(default)'}`,
    '',
    '\u{1F4B0} Fare Settings:',
    `  Base Fare: LKR ${config.baseFare} (first ${config.baseKm} km)`,
    `  Per-km Rate: LKR ${config.perKmRate}/km`,
    '',
    `\u{1F4CF} Driver Radius: ${radius} km`,
    `\u{1F310} OSRM Endpoint: ${settings.OSRM_SERVER_URL}`,
    `\u{1F5FA}\uFE0F Geocoding: ${settings.GEOCODING_PROVIDER}`,
    `\u{1F4E2} Trip Log Group: ${settings.LOG_GROUP_ID || '(not set)'}`,
  ];
  api.sendMessage(chatId, lines.join('\n'));
  return true;
}

function cmdHelp(api, chatId) {
  const lines = [
    '\u{1F4CB} Connect \u2014 Admin Commands:',
    '',
    '/help \u2014 Show this help',
    '/commands \u2014 List all commands',
    '/status \u2014 Bot status',
    '/approve \u2014 Approve/reject requests',
    '/baserate [amt] \u2014 Set base fare',
    '/basekm [km] \u2014 Set base distance',
    '/setrate [amt] \u2014 Set per-km rate',
    '/rate \u2014 View current rates',
    '/setradius [km] \u2014 Set driver radius',
    '/block @user \u2014 Block user',
    '/unblock @user \u2014 Unblock user',
    '/drivers \u2014 List drivers',
    '/riders \u2014 List riders',
    '/users \u2014 All users',
    '/trips \u2014 Trip history',
    '/groupid \u2014 Get group ID',
    '/whoami \u2014 Your Telegram ID',
    '/session \u2014 Bot settings',
    '/setbotname [name] \u2014 Set bot name',
    '/setwelcome [msg] \u2014 Set welcome message',
    '/settings \u2014 All settings',
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

