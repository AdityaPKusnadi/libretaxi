import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import OptionsResponse from '../../../responses/options-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import CallActionResponse from '../../../responses/call-action-response';
import Order from '../../../order';

export default class DriverAcceptRide extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-accept-ride' }, options));
  }

  call(args) {
    if (args && args.orderKey) {
      if (!this.user.state.pendingOrder || this.user.state.pendingOrder !== args.orderKey) {
        return new CompositeResponse()
          .add(new InterruptPromptResponse())
          .add(new TextResponse({ message: '\u23F0 This ride request has expired and was sent to another driver.' }))
          .add(new UserStateResponse({
            pendingOrder: null,
            currentOrder: null,
          }))
          .add(new RedirectResponse({ path: 'driver-index' }));
      }

      this.user.state.currentOrder = args;

      const rideNumDisplay = args.rideNum ? args.rideNum : '##';
      const driverName = this.user.state.driverName || 'Driver';
      const driverUsername = (this.user.state.identity && this.user.state.identity.username)
        ? `@${this.user.state.identity.username}`
        : this.user.state.phone || 'N/A';

      new Order({ orderKey: args.orderKey }).load().then((order) => {
        if (order.state.status !== 'new') return;
        order.setState({ status: 'accepted', acceptedBy: this.user.userKey });
        order.save();
      }).catch(() => {});

      const pickup = args.passengerLocation;
      const dropoff = args.destinationLocation;
      const pickupLink = pickup ? `https://maps.google.com/?q=${pickup[0]},${pickup[1]}` : 'N/A';
      const dropoffLink = dropoff ? `https://maps.google.com/?q=${dropoff[0]},${dropoff[1]}` : 'N/A';

      const fare = args.calculatedFare || {};
      const riderNameDisplay = args.passengerName || 'Rider';
      const riderPhone = args.passengerPhone || 'N/A';
      const riderPhoneLink = riderPhone !== 'N/A' ? `[${riderPhone}](tel:${riderPhone})` : 'N/A';
      const distanceKm = fare.distanceKm || 'N/A';
      const fareTotal = fare.totalFare ? `${fare.currencySymbol || 'LKR '}${fare.totalFare}` : 'N/A';

      const driverMsg =
        `You've accepted the ride! \u{1F389}\n\n` +
        `\u{1F464} Rider: ${riderNameDisplay}\n` +
        `\u{1F4DE} Contact: ${riderPhoneLink}\n` +
        `\u270F Distance: ${distanceKm} km\n` +
        `\u{1F4B0} Fare: ${fareTotal}\n\n` +
        `\u{1F4CD} Pickup and \u{1F3C1} Drop-off locations are shared below.\n` +
        `Tap on the locations to open in Google Maps and navigate.\n\n` +
        `\u{1F4CD} PICKUP location:\n${pickupLink}\n\n` +
        `\u{1F3C1} DROP-OFF location:\n${dropoffLink}\n\n` +
        `When you reach the rider and are ready to go, tap Start Trip:`;

      return new CompositeResponse()
        .add(new CallActionResponse({
          userKey: args.passengerKey,
          route: 'passenger-ride-accepted',
          arg: {
            rideNumDisplay,
            driverPhone: this.user.state.phone || 'N/A',
            driverKey: this.user.userKey,
            driverName,
            driverUsername,
            driverVehicle: this.user.state.vehicleType || 'Car',
            driverPlate: this.user.state.vehiclePlate || 'N/A',
          },
        }))
        .add(new UserStateResponse({
          currentOrder: args,
          menuLocation: 'driver-accept-ride',
          tripStatus: 'accepted',
          pendingOrder: null,
        }))
        .add(new TextResponse({ message: driverMsg }))
        .add(new OptionsResponse({
          rows: [
            [{ label: '\u{1F7E2} Start Trip', value: 'start-trip' }],
          ],
        }));
    }

    return super.call(args);
  }

  get() {
    const order = this.user.state.currentOrder || {};
    const pickup = order.passengerLocation;
    const dropoff = order.destinationLocation;
    const pickupLink = pickup ? `https://maps.google.com/?q=${pickup[0]},${pickup[1]}` : 'N/A';
    const dropoffLink = dropoff ? `https://maps.google.com/?q=${dropoff[0]},${dropoff[1]}` : 'N/A';

    return new CompositeResponse()
      .add(new TextResponse({
        message: `Pickup: ${pickupLink}\nDrop-off: ${dropoffLink}`,
      }))
      .add(new OptionsResponse({
        rows: [
          [{ label: '\u{1F7E2} Start Trip', value: 'start-trip' }],
        ],
      }));
  }

  post(value) {
    const isStartTrip = (value && typeof value === 'string' &&
                          (value.includes('start-trip') || value.includes('Start Trip')));

    if (isStartTrip) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '\u{1F44C} OK!' }))
        .add(new RedirectResponse({ path: 'driver-start-trip' }));
    }

    return new CompositeResponse()
      .add(new RedirectResponse({ path: 'driver-accept-ride' }));
  }
}
