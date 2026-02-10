// receiver.js
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Log events for debugging
Object.keys(cast.framework.events.EventType).forEach(key => {
  playerManager.addEventListener(cast.framework.events.EventType[key], (event) => {
    console.log('CAF Event:', key, event);
  });
});

console.log("Receiver for b/481590689 Reproduction Loaded");
context.start();
