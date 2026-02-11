const context = cast.framework.CastReceiverContext.getInstance();
const options = new cast.framework.CastReceiverOptions();
const playerManager = context.getPlayerManager();

// Specify the Shaka version from the bug report
options.shakaVersion = '4.16.15';

// Specify the DEBUG variant
if (cast.framework.ShakaVariant) {
    options.shakaVariant = cast.framework.ShakaVariant.DEBUG;
    console.log('Starting CAF with Shaka version:', options.shakaVersion, 'Variant: DEBUG');
} else {
    console.warn('cast.framework.ShakaVariant is not defined in this CAF version. Loading default Shaka variant.');
    console.log('Starting CAF with Shaka version:', options.shakaVersion);
}

// Log all CAF events for visibility
Object.keys(cast.framework.events.EventType).forEach(key => {
  playerManager.addEventListener(cast.framework.events.EventType[key], (event) => {
    console.log('CAF Event:', key, event);
  });
});

// Log errors specifically
playerManager.addEventListener(cast.framework.events.EventType.ERROR, (event) => {
  console.error('CAF ERROR Event:', event);
});

// Start the receiver context with the configured options
try {
  context.start(options);
  console.log("Receiver context started.");
} catch (e) {
  console.error("Error starting receiver context:", e);
}

// Verify Shaka Player version and type after start
setTimeout(() => {
  if (window.shaka && window.shaka.Player) {
    console.log('Detected Shaka Player version:', shaka.Player.version);
    // You can check the Network tab in DevTools to confirm that
    // 'shaka-player.compiled.debug.js' was loaded.
  } else {
    console.warn('Shaka Player not found on window object after timeout.');
  }
}, 3000); // Increased timeout to give Shaka more time to load

