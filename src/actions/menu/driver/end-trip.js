import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import CallActionResponse from '../../../responses/call-action-response';
import { calculateFareFromDistance } from '../../../fare/fare-calculator';
import calculateDistance from '../../../fare/distance-calculator';
import Firebase from 'firebase-admin';
import { updateTripStatus } from '../../../support/oracle-logger';
import { sendGroupLog, formatDate } from '../../../support/group-log';

export default class DriverEndTrip extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-end-trip' }, options));
  }

  get() {
    const order = this.user.state.currentOrder || {};
    const fare = order.calculatedFare || {};
    const pickup = order.passengerLocation;
    const dropoff = order.destinationLocation;
    const endLocation = this.user.state.tripEndLocation;

    let distanceKm = fare.distanceKm || 0;
    let finalFare = fare;
    const tripStarted = !!this.user.state.tripStartedAt;

    if (!tripStarted) {
      distanceKm = 0;
      finalFare = calculateFareFromDistance(0);
    } else if (pickup && endLocation) {
      const dist = calculateDistance(pickup, endLocation);
      distanceKm = dist.km;
      finalFare = calculateFareFromDistance(distanceKm);
    } else if (pickup && dropoff) {
      const dist = calculateDistance(pickup, dropoff);
      distanceKm = dist.km;
      finalFare = calculateFareFromDistance(distanceKm);
    }

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
      passengerProceeded: null,
      driverKey: null,
      pendingOrder: null,
      driverArrived: null,
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
      console.log(`Error updating trip status in Oracle: ${e}`);
    });

    sendGroupLog(groupLines.join('\n'));

    return response;
  }

  post() {
    return this.get();
  }
}
