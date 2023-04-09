'use strict';

// The controller node is a regular ISY node. It must be the first node created
// by the node server. It has an ST status showing the nodeserver status, and
// optionally node statuses. It usually has a few commands on the node to
// facilitate interaction with the nodeserver from the admin console or
// ISY programs.

// nodeDefId must match the nodedef id in your nodedef
const nodeDefId = 'CONTROLLER';

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // In this example, we also need to have our custom node because we create
  // nodes from this controller. See onCreateNew
  const HubitatDimmer = require('./HubitatDimmer.js')(Polyglot);

  class Controller extends Polyglot.Node {
    // polyInterface: handle to the interface
    // address: Your node address, withouth the leading 'n999_'
    // primary: Same as address, if the node is a primary node
    // name: Your node name
    constructor(polyInterface, primary, address, name) {
      super(nodeDefId, polyInterface, primary, address, name);

      // load the lib of functions that call Groovy
      this.hubitat = require('../lib/hubitat.js')(Polyglot, polyInterface);

      // Commands that this controller node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        // CREATE_NEW: this.onCreateNew,
        DISCOVER: this.onDiscover,
        UPDATE_PROFILE: this.onUpdateProfile,
        REMOVE_NOTICES: this.onRemoveNotices,
        QUERY: this.query,
      };

      // Status that this controller node has.
      // Should match the 'sts' section of the nodedef.
      this.drivers = {
        ST: { value: '1', uom: 2 }, // uom 2 = Boolean. '1' is True.
      };

      this.isController = true;
    }

    // Here you could discover devices from a 3rd party API
    // use this to discover all devices available in HousePanel.groovy
    async onDiscover() {
      logger.info('Discovering');
      const that = this;

      var mydevices = await this.hubitat.getDevices();
      var num = Object.keys(mydevices).length;
      logger.info("Obtained %s devices from Hubitat hub", num);

      // add the device nodes
      // for now, limit to switches
      for (var deviceid in mydevices) {
        var device = mydevices[deviceid];
        
        if ( key_exists("switch", device.pvalue) ) {
          const address = "HE_" + deviceid;
          const newDevice = new HubitatDimmer(that.polyInterface, address, address, device.name, device);

          const result = await that.polyInterface.addNode(newDevice);

          logger.info('Device added: %s', result);
          this.polyInterface.addNoticeTemp(
            'newDevice-' + address,
            'New node created: ' + device.name + " (" + device.devicetype + ")",
            5
          );
        }
      }
    }

    // Sends the profile files to ISY
    onUpdateProfile() {
      this.polyInterface.updateProfile();
    }

    // Removes notices from the Polyglot UI
    onRemoveNotices() {
      this.polyInterface.removeNoticesAll();
    }
  };

  // Required so that the interface can find this Node class using the nodeDefId
  Controller.nodeDefId = nodeDefId;

  return Controller;
};


// Those are the standard properties of every nodes:
// this.id              - Nodedef ID
// this.polyInterface   - Polyglot interface
// this.primary         - Primary address
// this.address         - Node address
// this.name            - Node name
// this.timeAdded       - Time added (Date() object)
// this.enabled         - Node is enabled?
// this.added           - Node is added to ISY?
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
