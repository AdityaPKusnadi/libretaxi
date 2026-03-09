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
import loadFareConfig, { saveFareConfig } from '../fare/fare-config';
import firebaseDB from '../firebase-db';

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
      return cmdBaseRate(api, chatId, arg);
    case '/basekm':
      return cmdBaseKm(api, chatId, arg);
    case '/setrate':
      return cmdSetRate(api, chatId, arg);
    case '/rate':
      return cmdShowRate(api, chatId);
    case '/setradius':
      return cmdSetRadius(api, chatId, arg);
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
  if (isNaN(val) || val <= 0) {
    api.sendMessage(chatId, '❌ Usage: /basekm [km]\nExample: /basekm 5');
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
    const users = [];
    Object.keys(data).forEach((key) => {
      const u = data[key];
      if (userType && u.userType !== userType) return;
      const name = u.identity
        ? `${u.identity.first || ''} ${u.identity.last || ''}`.trim()
        : key;
      const uname = u.identity && u.identity.username ? `@${u.identity.username}` : '';
      const type = u.userType || 'unknown';
      users.push(`• ${name} ${uname} (${type})`);
    });

    if (users.length === 0) {
      api.sendMessage(chatId, `No ${userType || ''}users found.`);
      return;
    }

    const title = userType
      ? `📋 Registered ${userType}s (${users.length}):`
      : `📋 All users (${users.length}):`;
    api.sendMessage(chatId, `${title}\n\n${users.join('\n')}`);
  });
  return true;
}

function cmdTrips(api, chatId, arg) {
  const db = firebaseDB.config();
  const tripsRef = db.ref('trips');
  tripsRef.once('value', (snap) => {
    const data = snap.val() || {};
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let filterStart = 0;
    let filterLabel = 'All';

    const period = (arg || '').toLowerCase().trim();
    if (period === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      filterStart = todayStart.getTime();
      filterLabel = 'Today';
    } else if (period === 'week') {
      filterStart = now - 7 * day;
      filterLabel = 'This week';
    } else if (period === 'month') {
      filterStart = now - 30 * day;
      filterLabel = 'This month';
    }

    const trips = [];
    let totalRevenue = 0;
    Object.keys(data).forEach((key) => {
      const t = data[key];
      const created = t.createdAt || 0;
      if (created < filterStart) return;
      const fare = t.tripFare || t.fare || 0;
      totalRevenue += fare;
      trips.push({
        rider: t.passengerName || 'Rider',
        distance: t.tripDistance || 0,
        fare,
        date: new Date(created).toLocaleDateString(),
      });
    });

    if (trips.length === 0) {
      api.sendMessage(chatId, `No trips found (${filterLabel}).`);
      return;
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
  });
  return true;
}
