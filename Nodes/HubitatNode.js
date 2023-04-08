'use strict';

// This is an example NodeServer Node definition.
// You need one per nodedefs.

// nodeDefId must match the nodedef id in your nodedef
const nodeDefId = 'HUBITAT_DIMMER';

module.exports = function(Polyglot) {
// Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class HubitatDimmer extends Polyglot.Node {

    // polyInterface: handle to the interface
    // address: Your node address, withouth the leading 'n999_'
    // primary: Same as address, if the node is a primary node
    // name: Your node name
    constructor(polyInterface, primary, address, name, device) {
      super(nodeDefId, polyInterface, primary, address, name);

      this.hubitat = require('../lib/hubitat.js')(Polyglot, polyInterface);

      // PGC supports setting the node hint when creating a node
      // REF: https://github.com/UniversalDevicesInc/hints
      // Must be a string in this format
      // If you don't care about the hint, just comment the line.
      this.device = device;
      this.hint = '0x01020900'; // Example for a Dimmer switch

      // Commands that this node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        DON: this.onDON,
        DOF: this.onDOF,
        // You can use the query function from the base class directly
        QUERY: this.query,
      };

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      this.drivers = {
        ST: {value: '0', uom: 51},
      };
    }

    onDON(message) {
        logger.info('DON (%s): %s',
        this.address,
        message.value ? message.value : 'No value');

        // setDrivers accepts string or number (message.value is a string)
        this.setDriver('ST', message.value ? message.value : '100');

        if ( message.value && !isNaN(parseInt(message.value)) ) {
            this.hubitat.doAction(this.device, "level", message.value)
            .then(results => {
                logger.info("DON Level results: ", results);
            });
        } else {
            this.hubitat.doAction(this.device, "switch", "on")
            .then(results => {
                logger.info("DON results: ", results);
            });
        }

    }

    onDOF() {
      logger.info('DOF (%s)', this.address);
      this.setDriver('ST', '0');
      this.hubitat.doAction(this.device, "switch", "off")
      .then(results => {
        logger.info("DOF results: ", results);
      });
    }
  };

  // Required so that the interface can find this Node class using the nodeDefId
  Hubitat.nodeDefId = nodeDefId;

  return HubitatDimmer;
};


// Those are the standard properties of every nodes:
// this.id              - Nodedef ID
// this.polyInterface   - Polyglot interface
// this.primary         - Primary address
// this.address         - Node address
// this.name            - Node name
// this.timeAdded       - Time added (Date() object)
// this.enabled         - Node is enabled?
// this.added           - Node is addeto ISY?
// this.commands        - List of allowed commands
//                        (You need to define them in your custom node)
// this.drivers         - List of drivers
//                        (You need to define them in your custom node)

// Those are the standard methods of every nodes:
// Get the driver object:
// this.getDriver(driver)

// Set a driver to a value (example set ST to 100)
// this.setDriver(driver, value, report=true, forceReport=false, uom=null)

// Send existing driver value to ISY
// this.reportDriver(driver, forceReport)

// Send existing driver values to ISY
// this.reportDrivers()

// When we get a query request for this node.
// Can be overridden to actually fetch values from an external API
// this.query()

// When we get a status request for this node.
// this.status()
