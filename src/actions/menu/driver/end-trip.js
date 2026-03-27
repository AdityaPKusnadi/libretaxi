import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import CallActionResponse from '../../../responses/call-action-response';
import PromiseResponse from '../../../responses/promise-response';
import { calculateRoadDistance, calculateFareFromDistance } from '../../../fare/distance-calculator';
import calculateDistance from '../../../fare/distance-calculator';
import Firebase from 'firebase-admin';
import { updateTripStatus } from '../../../support/oracle-logger';
import { sendGroupLog, formatDate } from '../../../support/group-log';
import log from '../../../log';

export default class DriverEndTrip extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-end-trip' }, options));
  }

  get() {
    const order = this.user.state.currentOrder || {};
    const startLocation = this.user.state.tripStartLocation;
    const endLocation = this.user.state.tripEndLocation;
    const tripStarted = !!this.user.state.tripStartedAt;
    const vehicleType = (order.requestedVehicleType || this.user.state.vehicleType || 'car');

    const trackedDistance = this.user.state.tripTrackedDistance || 0;
    const lastLocation = this.user.state.tripLastLocation;

    log.debug(`END_TRIP: driver=${this.user.userKey}, started=${tripStarted}, startGPS=[${startLocation}], endGPS=[${endLocation}], vehicle=${vehicleType}, tracked=${trackedDistance} km`);

    if (!tripStarted || !startLocation || !endLocation) {
      log.debug('END_TRIP: missing data, using fallback 0 km');
      const fallbackFare = calculateFareFromDistance(0, vehicleType);
      return this._buildResponse(order, 0, fallbackFare, vehicleType);
    }

    // If we have live-tracked distance, add the final segment and use cumulative distance
    if (trackedDistance > 0 && lastLocation) {
      const lastSegment = calculateDistance(lastLocation, endLocation);
      const lastSegmentKm = lastSegment.km || 0;
      const totalKm = Math.round((trackedDistance + lastSegmentKm) * 100) / 100;
      log.debug(`END_TRIP: using tracked distance = ${trackedDistance} + last segment ${lastSegmentKm} = ${totalKm} km`);
      const finalFare = calculateFareFromDistance(totalKm, vehicleType);
      return this._buildResponse(order, totalKm, finalFare, vehicleType);
    }

    // Fallback: no live tracking data, use OSRM road distance between start and end
    log.debug('END_TRIP: no live tracking data, using OSRM start→end distance');
    return new PromiseResponse({
      promise: calculateRoadDistance(startLocation, endLocation),
      cb: (dist) => {
        const distanceKm = dist.km || 0;
        log.debug(`END_TRIP: road distance = ${distanceKm} km (estimate=${dist.isEstimate || false})`);
        const finalFare = calculateFareFromDistance(distanceKm, vehicleType);
        return this._buildResponse(order, distanceKm, finalFare, vehicleType);
      },
      errCb: (err) => {
        log.debug(`END_TRIP: OSRM promise failed (${err.message}), using Haversine fallback`);
        const fallback = calculateDistance(startLocation, endLocation);
        const distanceKm = fallback.km || 0;
        const finalFare = calculateFareFromDistance(distanceKm, vehicleType);
        return this._buildResponse(order, distanceKm, finalFare, vehicleType);
      },
    });
  }

  post() {
    return this.get();
  }

  _buildResponse(order, distanceKm, finalFare, vehicleType) {
    const riderName = order.passengerName || 'Rider';
    const riderUsernameTag = order.passengerUsername ? `@${order.passengerUsername}` : null;
    const riderChatDisplay = riderUsernameTag || riderName;
    const riderGroupDisplay = riderUsernameTag || riderName;
    const driverUsername = (this.user.state.identity && this.user.state.identity.username)
      ? `@${this.user.state.identity.username}`
      : (this.user.state.driverName || this.user.state.phone || 'Driver');

    const rateDesc = finalFare.rateDescription || `First 3.0 km = LKR 300, then LKR 100/km`;
    const fareAmount = finalFare.totalFare || 0;
    const currencySymbol = finalFare.currencySymbol || 'LKR ';
    const rideNum = order.rideNum || '##';

    log.debug(`END_TRIP_RESULT: rideNum=${rideNum}, distance=${distanceKm}, fare=${fareAmount}, vehicle=${vehicleType}`);

    const chatLines = [
      `\u2705 Connect \u2014 Trip #${rideNum} Completed!`,
      '',
      `\u{1F464} Rider: ${riderChatDisplay}`,
      `\u{1F698} Driver: ${driverUsername}`,
      `\u{1F4CF} Distance: ${distanceKm} km`,
      `\u{1F4B5} Rate: ${rateDesc}`,
      `\u{1F4B0} Total Fare: ${currencySymbol}${fareAmount}`,
      '',
      'Thank you for using Connect!',
    ];
    const chatMessage = chatLines.join('\n');

    const groupLines = [
      `\u2705 Connect \u2014 Trip #${rideNum} Completed!`,
      '',
      `\u{1F464} Rider: ${riderGroupDisplay}`,
      `\u{1F698} Driver: ${driverUsername}`,
      `\u{1F4CF} Distance: ${distanceKm} km`,
      `\u{1F4B5} Rate: ${rateDesc}`,
      `\u{1F4B0} Total Fare: ${currencySymbol}${fareAmount}`,
      '',
      formatDate(),
    ];

    const response = new CompositeResponse();

    response.add(new UserStateResponse({
      tripStatus: null,
      tripCompletedAt: Firebase.database.ServerValue.TIMESTAMP,
      tripDistance: distanceKm,
      tripFare: fareAmount,
      currentOrder: null,
      currentOrderKey: null,
      tripStartLocation: null,
      tripEndLocation: null,
      tripStartedAt: null,
      tripTrackedDistance: null,
      tripLastLocation: null,
      passengerProceeded: null,
      driverKey: null,
      pendingOrder: null,
      driverArrived: null,
      menuLocation: 'driver-index',
    }));

    response.add(new TextResponse({ message: chatMessage }));

    if (order.passengerKey) {
      response.add(new CallActionResponse({
        userKey: order.passengerKey,
        route: 'show-message',
        arg: {
          expectedState: {},
          message: chatMessage,
          path: 'passenger-rate-driver',
        },
      }));
    }

    response.add(new RedirectResponse({ path: 'driver-index' }));

    updateTripStatus(rideNum, {
      status: 'completed',
      driverName: driverUsername,
      driverPhone: this.user.state.phone || 'N/A',
      tripDistance: distanceKm,
      tripFare: fareAmount,
      rateDescription: rateDesc,
    }).catch((e) => {
      log.debug(`END_TRIP: Oracle update error: ${e.message}`);
    });

    sendGroupLog(groupLines.join('\n'));

    return response;
  }
}
