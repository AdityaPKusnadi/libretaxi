import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import RequestLocationResponse from '../../../responses/request-location-response';
import CallActionResponse from '../../../responses/call-action-response';
import Firebase from 'firebase-admin';
import Order from '../../../order';

export default class DriverStartTrip extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-start-trip' }, options));
  }

  get() {
    const order = this.user.state.currentOrder || {};
    const rideNum = order.rideNum || '##';
    const orderKey = order.orderKey;

    if (orderKey) {
      new Order({ orderKey }).load().then((loadedOrder) => {
        if (loadedOrder.state.status === 'cancelled') {
          return;
        }
      }).catch(() => {});
    }

    const response = new CompositeResponse();

    if (order.passengerKey) {
      response.add(new CallActionResponse({
        userKey: order.passengerKey,
        route: 'passenger-trip-started',
        arg: { started: true, rideNum },
      }));
    }

    response
      .add(new UserStateResponse({
        tripStatus: 'in_progress',
        tripStartedAt: Firebase.database.ServerValue.TIMESTAMP,
      }))
      .add(new TextResponse({
        message: `\u{1F7E2} Trip #${rideNum} started!\n\nWhen you arrive at the destination, tap END TRIP to share your location and complete the trip.`,
      }))
      .add(new RequestLocationResponse({
        buttonText: '\u{1F534} End Trip',
      }));

    return response;
  }

  post(value) {
    if (Array.isArray(value)) {
      return new CompositeResponse()
        .add(new UserStateResponse({ tripEndLocation: value }))
        .add(new RedirectResponse({ path: 'driver-end-trip' }));
    }
    return new TextResponse({ message: 'Please share your location to end the trip by tapping the \u{1F534} End Trip button.' });
  }
}
