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
  const username = arg.replace('@', '').trim();
  if (!username) {
    api.sendMessage(chatId, `❌ Usage: /${block ? 'block' : 'unblock'} @username`);
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
    db.ref(`users/${userKey}/blocked`).set(block);
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
        drivers.push(`• ${name} ${uname} | ${phone}`);
      } else if (u.userType === 'passenger') {
        riders.push(`• ${name} ${uname} ${phone ? '| ' + phone : ''}`);
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
    let sql = `SELECT passenger_name, driver_name, trip_distance, trip_fare, created_at FROM trip_logs`;
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
      lines.push(`${i + 1}. ${t.rider} — ${t.distance} km — LKR ${t.fare} (${t.date})`);
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
    api.sendMessage(chatId, `❌ Usage: /setgroup [group_id]\nUse /groupid in a group to get the ID.`);
    return true;
  }
  saveFareConfig({ tripLogGroupId: groupId });
  api.sendMessage(chatId, `✅ Trip log group set to: ${groupId}`);
  return true;
}
