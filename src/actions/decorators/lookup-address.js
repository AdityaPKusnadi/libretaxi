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

import Action from '../../action';
import PromiseResponse from '../../responses/promise-response';
import CompositeResponse from '../../responses/composite-response';
import MapResponse from '../../responses/map-response';
import OptionsResponse from '../../responses/options-response';
import TextResponse from '../../responses/text-response';
import UserStateResponse from '../../responses/user-state-response';
import Settings from '../../../settings';

export default class LookupAddress extends Action {

  constructor(options, origin, settings) {
    super(Object.assign({ type: origin.type }, options));
    this.origin = origin;
    this.settings = settings || new Settings();
  }

  get() {
    if (this.user.state.pendingSearchResults) {
      const results = this.user.state.pendingSearchResults;
      const rows = results.map((r, i) => [{ label: `${i + 1}. ${r.name}`, value: `loc_${i}` }]);
      rows.push([{ label: '❌ Cancel', value: 'cancel_search' }]);
      return new CompositeResponse()
        .add(new TextResponse({ message: '📍 Select a location:' }))
        .add(new OptionsResponse({ rows }));
    }
    return this.origin.get();
  }

  post(address) {
    if (this.user.state.pendingSearchResults) {
      const results = this.user.state.pendingSearchResults;

      if (address === 'cancel_search') {
        return new CompositeResponse()
          .add(new UserStateResponse({ pendingSearchResults: null }))
          .add(new TextResponse({ message: '❌ Search cancelled.' }))
          .add(this.origin.get());
      }

      if (typeof address === 'string' && address.startsWith('loc_')) {
        const idx = parseInt(address.replace('loc_', ''), 10);
        if (idx >= 0 && idx < results.length) {
          const chosen = results[idx];
          const coords = [chosen.lat, chosen.lon];
          return new CompositeResponse()
            .add(new UserStateResponse({ pendingSearchResults: null }))
            .add(new MapResponse({ location: coords }))
            .add(this.origin.post(coords));
        }
      }

      if (Array.isArray(address)) {
        return new CompositeResponse()
          .add(new UserStateResponse({ pendingSearchResults: null }))
          .add(this.origin.post(address));
      }
    }

    if (Array.isArray(address)) {
      return this.origin.post(address);
    }

    if (typeof address === 'string') {
      const cb = (result) => {
        if (!result || result.length === 0) {
          return new CompositeResponse()
            .add(new TextResponse({ message: `❌ No results found for "${address}". Try a different name or share your GPS location.` }))
            .add(this.origin.get());
        }

        if (result.length === 1) {
          const coords = [result[0].lat, result[0].lon];
          return new CompositeResponse()
            .add(new TextResponse({ message: `📍 Found: ${result[0].name}` }))
            .add(new MapResponse({ location: coords }))
            .add(this.origin.post(coords));
        }

        const rows = result.map((r, i) => [{ label: `${i + 1}. ${r.name}`, value: `loc_${i}` }]);
        rows.push([{ label: '❌ Cancel', value: 'cancel_search' }]);

        return new CompositeResponse()
          .add(new UserStateResponse({ pendingSearchResults: result }))
          .add(new TextResponse({ message: `📍 Found ${result.length} results for "${address}":` }))
          .add(new OptionsResponse({ rows }));
      };

      return new PromiseResponse({
        promise: this.searchNominatim(address),
        cb: cb.bind(this),
      });
    }

    return this.origin.post(address);
  }

  searchNominatim(query) {
    const https = require('https');
    const encodedQuery = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=5&addressdetails=1&accept-language=en`;

    return new Promise((resolve) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'ConnectTaxiBot/1.0' },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = json.map((item) => ({
              name: item.display_name.length > 60
                ? item.display_name.substring(0, 57) + '...'
                : item.display_name,
              fullName: item.display_name,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
            }));
            resolve(results);
          } catch (e) {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.setTimeout(10000, () => { req.abort(); resolve([]); });
    });
  }

  call(arg) {
    if (arg) {
      return this.post(arg);
    }
    return this.get();
  }

  t(...args) {
    return this.origin.t(...args);
  }

  gt(...args) {
    return this.origin.gt(...args);
  }
}
