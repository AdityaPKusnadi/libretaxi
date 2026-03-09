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

const settings = new Settings();

export default function logTrip(api, tripData) {
  const groupId = settings.LOG_GROUP_ID;
  if (!groupId) return;

  const lines = [];
  lines.push('✅ Connect — Trip Completed!');
  lines.push('');
  lines.push(`👤 Rider: ${tripData.riderName || 'Rider'}`);
  lines.push(`🚘 Driver: ${tripData.driverName || 'Driver'}`);
  lines.push(`📏 Distance: ${tripData.distance || 0} km`);
  lines.push(`💰 Total Fare: LKR ${tripData.fare || 0}`);
  lines.push(`📅 ${new Date().toLocaleString()}`);

  api.sendMessage(groupId, lines.join('\n'), { disable_notification: false })
    .catch((err) => console.log(`Trip log error: ${err}`));
}
