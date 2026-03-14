import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import SubmitOrderResponse from '../../../responses/submit-order/submit-order-response';
import CallActionResponse from '../../../responses/call-action-response';
import OptionsResponse from '../../../responses/options-response';
import PromiseResponse from '../../../responses/promise-response';
import Firebase from 'firebase-admin';
import uuid from 'uuid';
import { calculateFareAsync } from '../../../fare/fare-calculator';
import { logTripToOracle } from '../../../support/oracle-logger';
import { sendGroupLog, formatDate } from '../../../support/group-log';

const VEHICLE_EMOJI = { car: '\u{1F697}', tuk: '\u{1F6FA}', bike: '\u{1F3CD}\uFE0F', van: '\u{1F690}' };

export default class PassengerConfirmFare extends Action {

  constructor(options) {
    super(Object.assign({ type: 'passenger-confirm-fare' }, options));
  }

  get() {
    const origin = this.user.state.location;
    const destination = this.user.state.destinationLocation;
    const vehicleType = this.user.state.requestedVehicleType || 'car';

    return new PromiseResponse({
      promise: calculateFareAsync(origin, destination, vehicleType),
      cb: (fare) => {
        const vEmoji = VEHICLE_EMOJI[vehicleType] || '\u{1F697}';
        const vName = vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);

        const lines = [
          '\u{1F695} Connect Taxi \u2014 Fare Estimate',
          '',
          '\u{1F4CD} Pickup: Location set',
          '\u{1F3C1} Drop-off: Location set',
          `${vEmoji} Vehicle: ${vName}`,
          `\u270F Distance: ${fare.distanceKm} km`,
          `\u{1F4B0} Rate: ${fare.rateDescription}`,
          `\u{1F4B0} Total Fare: ${fare.currencySymbol}${fare.totalFare}`,
          '',
          'Confirm your ride to notify nearby drivers.',
        ];

        return new CompositeResponse()
          .add(new UserStateResponse({ calculatedFare: fare }))
          .add(new TextResponse({ message: lines.join('\n') }))
          .add(new OptionsResponse({
            rows: [
              [
                { label: '\u2705 Confirm ride', value: 'confirm' },
                { label: '\u274C Cancel', value: 'cancel' },
              ],
            ],
          }));
      },
    });
  }

  post(value) {
    if (value === 'cancel' || (typeof value === 'string' && value.includes('Cancel'))) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '\u274C Ride request cancelled.' }))
        .add(new RedirectResponse({ path: 'select-user-type' }));
    }

    if (value === 'confirm' || (typeof value === 'string' && value.includes('Confirm'))) {
      return this._submitOrder();
    }

    return this.get();
  }

  _submitOrder() {
    const origin = this.user.state.location;
    const destination = this.user.state.destinationLocation;
    const fare = this.user.state.calculatedFare || {};
    const vehicleType = this.user.state.requestedVehicleType || 'car';

    const rideNumStr = String(Math.floor(Math.random() * 100) + 1).padStart(2, '0');

    const riderName = (this.user.state.identity && (this.user.state.identity.first || this.user.state.identity.username)) || 'Rider';
    const riderUsername = (this.user.state.identity && this.user.state.identity.username) || null;
    const riderDisplay = riderUsername ? `@${riderUsername}` : riderName;

    const pickupLink = origin ? `https://maps.google.com/?q=${origin[0]},${origin[1]}` : '';
    const dropoffLink = destination ? `https://maps.google.com/?q=${destination[0]},${destination[1]}` : '';

    const lines = [];
    lines.push(`Ride #${rideNumStr} created \u2705`);
    lines.push('');
    lines.push(`Estimated distance: ${fare.distanceKm || 0} km`);
    lines.push(`Estimated fare: ~${fare.currencySymbol || 'LKR '}${fare.totalFare || 0}`);
    lines.push('');
    if (pickupLink) lines.push(`Pickup: ${pickupLink}`);
    if (dropoffLink) lines.push(`Drop-off: ${dropoffLink}`);
    lines.push('');
    lines.push('Finding nearby drivers now...');

    const priceStr = String(fare.totalFare || 0);
    const orderKey = uuid.v4();

    logTripToOracle({
      rideNum: rideNumStr,
      passengerName: riderName,
      passengerUsername: riderUsername,
      driverName: 'N/A',
      driverPhone: 'N/A',
      tripDistance: fare.distanceKm || 0,
      tripFare: fare.totalFare || 0,
      rateDescription: fare.rateDescription || '',
      status: 'pending',
    }).catch(() => {});

    const groupLines = [
      `\u23F3 Connect \u2014 Ride #${rideNumStr} Pending`,
      '',
      `\u{1F464} Rider: ${riderDisplay}`,
      `\u{1F4CF} Est. Distance: ${fare.distanceKm || 0} km`,
      `\u{1F4B0} Est. Fare: ${fare.currencySymbol || 'LKR '}${fare.totalFare || 0}`,
      `\u{1F697} Vehicle: ${vehicleType}`,
      '',
      formatDate(),
    ];
    sendGroupLog(groupLines.join('\n'));

    return new CompositeResponse()
      .add(new UserStateResponse({
        price: priceStr,
        rideNum: rideNumStr,
      }))
      .add(new TextResponse({ message: lines.join('\n') }))
      .add(new SubmitOrderResponse({
        orderKey,
        passengerKey: this.user.userKey,
        passengerLocation: this.user.state.location,
        passengerDestination: this.user.state.destination || (destination ? `${destination[0]},${destination[1]}` : 'N/A'),
        passengerName: riderName,
        passengerUsername: riderUsername,
        passengerPhone: this.user.state.phone || 'N/A',
        price: priceStr,
        createdAt: Firebase.database.ServerValue.TIMESTAMP,
        requestedVehicleType: vehicleType,
        calculatedFare: fare,
        destinationLocation: this.user.state.destinationLocation,
        rideNum: rideNumStr,
      }))
      .add(new CallActionResponse({
        userKey: this.user.userKey,
        route: 'show-message',
        arg: {
          expectedState: {
            menuLocation: 'order-submitted',
            currentOrderKey: orderKey,
          },
          message: 'Seems like you\'ve been waiting for a while? Sorry about that. If you haven\'t found a ride, we recommend trying again later.',
          path: 'select-user-type',
        },
        delay: 20 * 60 * 1000,
      }))
      .add(new RedirectResponse({ path: 'blank-screen' }));
  }
}
