#!/usr/bin/env node

'use strict';

trapUncaughExceptions();

const fs = require('fs');
const markdown = require('markdown').markdown; // For Polyglot-V2 only
const AsyncLock = require('async-lock');

// Loads the appropriate Polyglot interface module.
const Polyglot = useCloud() ?
  require('pgc_interface') : // Cloud module
  require('polyinterface'); // Polyglot V2 module (On-Premise)

// If your nodeserver only supports the cloud, use pgc_interface only.

// Use logger.<debug|info|warn|error>()
// Logs to <home>/.polyglot/nodeservers/<your node server>/logs/<date>.log
// To watch logs: tail -f ~/.polyglot/nodeservers/<NodeServer>/logs/<date>.log
// All log entries prefixed with NS: Comes from your NodeServer.
// All log entries prefixed with POLY: Comes from the Polyglot interface
const logger = Polyglot.logger;
const lock = new AsyncLock({ timeout: 500 });

// Those are the node definitions that our nodeserver uses.
// You will need to edit those files.
const ControllerNode = require('./Nodes/ControllerNode.js')(Polyglot);
const HubitatDimmer = require('./Nodes/HubitatDimmer.js')(Polyglot);

// UI customParams default values. Param must have at least 1 character
const defaultParams = {
  [accessToken]: 'accessToken',
  [endpt]: 'endpt'
};

logger.info('Starting Node Server');

// Create an instance of the Polyglot interface. We need to pass all the node
// classes that we will be using.
const poly = new Polyglot.Interface([ControllerNode, HubitatDimmer]);

// Connected to MQTT, but config has not yet arrived.
poly.on('mqttConnected', function() {
  logger.info('MQTT Connection started');
});

// Config has been received
poly.on('config', function(config) {
  const nodesCount = Object.keys(config.nodes).length;
  logger.info('Config received has %d nodes', nodesCount);

  // Important config options:
  // config.nodes: Our nodes, with the node class applied
  // config.customParams: Configuration parameters from the UI
  // config.newParamsDetected: Flag which tells us that customParams changed
  // config.typedCustomData: Configuration parameters from the UI (if typed)

  // If this is the first config after a node server restart
  if (config.isInitialConfig) {

    // Removes all existing notices on startup.
    poly.removeNoticesAll();

    // Use options specific to PGC vs Polyglot-V2
    if (poly.isCloud) {
      logger.info('Running nodeserver in the cloud');

      // Will send the profile if the version is server.json is changed, or
      // if the profile has never been sent. Exists only for PGC.
      poly.updateProfileIfNew();
    } else {
      logger.info('Running nodeserver on-premises');
      // Profile files are sent automatically the first time.

      // Sets the configuration doc shown in the UI
      // Available in Polyglot V2 only
      const md = fs.readFileSync('./configdoc.md');
      poly.setCustomParamsDoc(markdown.toHTML(md.toString()));
    }

    // Sets the configuration fields in the UI
    initializeCustomParams(config.customParams);

    // If we have no nodes yet, we add the first node: a controller node which
    // holds the node server status and control buttons The first device to
    // create should always be the nodeserver controller.
    if (!nodesCount) {
      try {
        logger.info('Auto-creating controller');
        callAsync(autoCreateController());
      } catch (err) {
        logger.error('Error while auto-creating controller node:', err);
      }
    }

  // this is where we authenticate the hub and read the devices
  } else if (config.newParamsDetected) {

    logger.info('New parameters detected');
    const controllerNode = poly.getNode("controller");

    // discover or reload Hubitat nodes if user changed creds
    if (controllerNode ) {
        controllerNode.onDiscover();
    }
  }
});

// User just went through oAuth authorization. Available with PGC only.
poly.on('oauth', function(oAuth) {
  logger.info('Received OAuth code');
  // oAuth object should contain:
  // {
  //   code: "<the authorization code to use to get tokens>"
  //   state: "<the state worker you appended to the url>"
  // }
  // Use it to get access and refresh tokens
});

// This is triggered every x seconds. Frequency is configured in the UI.
poly.on('poll', function(longPoll) {
  callAsync(doPoll(longPoll));
});

poly.on('oauth', function(oaMessage) {
  // oaMessage.code: Authorization code received after authorization
  // oaMessage.state: This must be the worker ID.

  logger.info('Received oAuth message %o', oaMessage);
  // From here, we need to process the authorization token
});

// Received a 'stop' message from Polyglot. This NodeServer is shutting down
poly.on('stop', async function() {
  logger.info('Graceful stop');

  // Make a last short poll and long poll
  await doPoll(false);
  await doPoll(true);

  // Tell Interface we are stopping (Our polling is now finished)
  poly.stop();
});

// Received a 'delete' message from Polyglot. This NodeServer is being removed
poly.on('delete', function() {
  logger.info('Nodeserver is being deleted');

  // We can do some cleanup, then stop.
  poly.stop();
});

// MQTT connection ended
poly.on('mqttEnd', function() {
  logger.info('MQTT connection ended.'); // May be graceful or not.
});

// Triggered for every message received from polyglot.
poly.on('messageReceived', function(message) {
  // Only display messages other than config
  if (!message['config']) {
    logger.debug('Message Received: %o', message);
  }
});

// Triggered for every message sent to polyglot.
poly.on('messageSent', function(message) {
  logger.debug('Message Sent: %o', message);
});

// This is being triggered based on the short and long poll parameters in the UI
async function doPoll(longPoll) {
  // Prevents polling logic reentry if an existing poll is underway
  try {
    await lock.acquire('poll', function() {
      logger.info('%s', longPoll ? 'Long poll' : 'Short poll');
    });
  } catch (err) {
    logger.error('Error while polling: %s', err.message);
  }
}

// Creates the controller node
async function autoCreateController() {
  try {
    await poly.addNode(
      new ControllerNode(poly, 'controller', 'controller', 'NodeServer')
    );
  } catch (err) {
    logger.error('Error creating controller node');
  }

  // Add a notice in the UI for 5 seconds
  poly.addNoticeTemp('newController', 'Controller node initialized', 5);
}

// Sets the custom params as we want them. Keeps existing params values.
function initializeCustomParams(currentParams) {
  const defaultParamKeys = Object.keys(defaultParams);
  const currentParamKeys = Object.keys(currentParams);

  // Get orphan keys from either currentParams or defaultParams
  const differentKeys = defaultParamKeys.concat(currentParamKeys)
  .filter(function(key) {
    return !(key in defaultParams) || !(key in currentParams);
  });

  if (differentKeys.length) {
    let customParams = {};

    // Only keeps params that exists in defaultParams
    // Sets the params to the existing value, or default value.
    defaultParamKeys.forEach(function(key) {
      customParams[key] = currentParams[key] ? currentParams[key] : defaultParams[key];
    });

    poly.saveCustomParams(customParams);
  }
}

// Call Async function from a non-asynch function without waiting for result,
// and log the error if it fails
function callAsync(promise) {
  (async function() {
    try {
      await promise;
    } catch (err) {
      logger.error('Error with async function: %s %s', err.message, err.stack);
    }
  })();
}

function trapUncaughExceptions() {
  // If we get an uncaugthException...
  process.on('uncaughtException', function(err) {
    logger.error(`uncaughtException REPORT THIS!: ${err.stack}`);
  });
}

function useCloud() {
  return process.env.MQTTENDPOINT && process.env.STAGE;
}

// Starts the NodeServer!
poly.start();
