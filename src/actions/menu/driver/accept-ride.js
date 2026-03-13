import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RequestUserInputResponse from '../../../responses/request-user-input-response';
import OptionsResponse from '../../../responses/options-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import CallActionResponse from '../../../responses/call-action-response';
import MapResponse from '../../../responses/map-response';
import Order from '../../../order';

export default class DriverAcceptRide extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-accept-ride' }, options));
  }

  call(args) {
    if (args && args.showLocations) {
      this.user.state.passengerProceeded = true;
      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({ passengerProceeded: true }))
        .add(this._showLocations());
    }

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

      const riderMsg = `\u2705 Ride #${rideNumDisplay} accepted!\n\n` +
        `Driver: ${driverName}\n` +
        `Contact: ${driverUsername}\n\n` +
        `Please coordinate pickup in chat.`;

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
          passengerProceeded: true,
          pendingOrder: null,
        }))
        .add(new TextResponse({ message: `\u2705 Ride #${rideNumDisplay} accepted!\n\nLoading pickup and drop-off locations...` }))
        .add(this._showLocations());
    }

    return super.call(args);
  }

  get() {
    return this._showLocations();
  }

  _showLocations() {
    const order = this.user.state.currentOrder || {};
    const pickup = order.passengerLocation;
    const dropoff = order.destinationLocation;

    const response = new CompositeResponse();

    if (pickup) {
      response.add(new MapResponse({ location: pickup }));
    }

    if (dropoff) {
      response.add(new MapResponse({ location: dropoff }));
    }

    response.add(new OptionsResponse({
      rows: [
        [{ label: '\u{1F7E2} Start Trip', value: 'start-trip' }],
      ],
    }));

    return response;
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
