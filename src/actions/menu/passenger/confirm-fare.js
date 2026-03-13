import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import SubmitOrderResponse from '../../../responses/submit-order/submit-order-response';
import CallActionResponse from '../../../responses/call-action-response';
import Firebase from 'firebase-admin';
import uuid from 'uuid';
import calculateFare from '../../../fare/fare-calculator';

export default class PassengerConfirmFare extends Action {

  constructor(options) {
    super(Object.assign({ type: 'passenger-confirm-fare' }, options));
  }

  get() {
    return this._submitOrder();
  }

  post(value) {
    return new TextResponse({ message: 'Finding nearby drivers now...' });
  }

  _submitOrder() {
    const origin = this.user.state.location;
    const destination = this.user.state.destinationLocation;

    const fare = calculateFare(origin, destination);

    const pickupLink = origin ? `https://maps.google.com/?q=${origin[0]},${origin[1]}` : '';
    const dropoffLink = destination ? `https://maps.google.com/?q=${destination[0]},${destination[1]}` : '';

    const rideNumStr = String(Math.floor(Math.random() * 100) + 1).padStart(2, '0');

    const lines = [];
    lines.push(`Ride #${rideNumStr} created \u2705`);
    lines.push('');
    lines.push(`Estimated distance: ${fare.distanceKm} km`);
    lines.push(`Estimated fare: ~${fare.currencySymbol}${fare.totalFare}`);
    lines.push('');
    if (pickupLink) lines.push(`Pickup: ${pickupLink}`);
    if (dropoffLink) lines.push(`Drop-off: ${dropoffLink}`);
    lines.push('');
    lines.push('Finding nearby drivers now...');

    const priceStr = String(fare.totalFare || 0);
    const orderKey = uuid.v4();

    return new CompositeResponse()
      .add(new UserStateResponse({
        calculatedFare: fare,
        price: priceStr,
        rideNum: rideNumStr,
      }))
      .add(new TextResponse({ message: lines.join('\n') }))
      .add(new SubmitOrderResponse({
        orderKey,
        passengerKey: this.user.userKey,
        passengerLocation: this.user.state.location,
        passengerDestination: this.user.state.destination || (destination ? `${destination[0]},${destination[1]}` : 'N/A'),
        passengerName: (this.user.state.identity && (this.user.state.identity.first || this.user.state.identity.username)) || 'Rider',
        price: priceStr,
        createdAt: Firebase.database.ServerValue.TIMESTAMP,
        requestedVehicleType: this.user.state.requestedVehicleType || 'car',
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
