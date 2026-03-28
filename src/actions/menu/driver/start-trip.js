import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import RequestLocationResponse from '../../../responses/request-location-response';
import CallActionResponse from '../../../responses/call-action-response';
import Firebase from 'firebase-admin';
import Order from '../../../order';
import calculateDistance from '../../../fare/distance-calculator';
import log from '../../../log';

export default class DriverStartTrip extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-start-trip' }, options));
  }

  get() {
    if (this.user.state.tripStartLocation) {
      return this._showEndTripButton();
    }

    return new CompositeResponse()
      .add(new TextResponse({
        message: '\u{1F4CD} Please share your current GPS location to START the trip.',
      }))
      .add(new RequestLocationResponse({
        buttonText: '\u{1F4CD} Share Location to Start',
      }));
  }

  post(value) {
    if (!Array.isArray(value) || value.length < 2) {
      return new TextResponse({
        message: 'Please share your GPS location by tapping the button below.',
      });
    }

    const lat = value[0];
    const lng = value[1];
    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
      log.debug(`START_TRIP: invalid GPS coords received: ${JSON.stringify(value)}`);
      return new TextResponse({
        message: 'Invalid location received. Please try sharing your GPS location again.',
      });
    }

    if (!this.user.state.tripStartLocation) {
      return this._handleStartLocation(value);
    }

    return this._handleEndLocation(value);
  }

  _handleStartLocation(location) {
    const order = this.user.state.currentOrder || {};
    const rideNum = order.rideNum || '##';
    const orderKey = order.orderKey;

    log.debug(`START_TRIP: driver=${this.user.userKey}, rideNum=${rideNum}, GPS=[${location}]`);

    if (orderKey) {
      new Order({ orderKey }).load().then((loadedOrder) => {
        if (loadedOrder.state.status === 'cancelled') return;
        loadedOrder.setState({ status: 'in_progress' });
        loadedOrder.save();
      }).catch((e) => {
        log.debug(`START_TRIP: order update error: ${e.message}`);
      });
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
        tripStartLocation: location,
        tripEndLocation: null,
        tripTrackedDistance: 0,
        tripLastLocation: location,
      }))
      .add(new TextResponse({
        message: `\u{1F7E2} Trip #${rideNum} started!\n\nWhen you arrive at the destination, tap END TRIP to share your location and complete the trip.\n\n\u{1F4CD} For accurate distance: tap \u{1F4CE} \u2192 Location \u2192 Share My Live Location for 1 hour.`,
      }))
      .add(new RequestLocationResponse({
        buttonText: '\u{1F534} End Trip',
      }));

    return response;
  }

  _handleEndLocation(location) {
    // Accumulate distance from last tracked point to end location
    const lastLoc = this.user.state.tripLastLocation || this.user.state.tripStartLocation;
    const currentTracked = this.user.state.tripTrackedDistance || 0;
    let newTracked = currentTracked;

    if (lastLoc) {
      const segment = calculateDistance(lastLoc, location);
      const segmentKm = segment.km || 0;
      if (segmentKm >= 0.01) {
        newTracked = Math.round((currentTracked + segmentKm) * 100) / 100;
      }
    }

    log.debug(`END_TRIP_LOCATION: driver=${this.user.userKey}, end_GPS=[${location}], start_GPS=[${this.user.state.tripStartLocation}], accumulated=${newTracked} km`);

    return new CompositeResponse()
      .add(new UserStateResponse({
        tripEndLocation: location,
        tripTrackedDistance: newTracked,
        tripLastLocation: location,
      }))
      .add(new RedirectResponse({ path: 'driver-end-trip' }));
  }

  _showEndTripButton() {
    const order = this.user.state.currentOrder || {};
    const rideNum = order.rideNum || '##';
    return new CompositeResponse()
      .add(new TextResponse({
        message: `\u{1F7E2} Trip #${rideNum} is in progress.\n\nWhen you arrive at the destination, tap END TRIP to share your location and complete the trip.`,
      }))
      .add(new RequestLocationResponse({
        buttonText: '\u{1F534} End Trip',
      }));
  }
}
