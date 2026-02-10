const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Debug Logger
const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
const LOG_TAG = "MyAPP.LOG";

castDebugLogger.setEnabled(true);
castDebugLogger.loggerLevelByEvents = {
  "cast.framework.events.category.CORE": cast.framework.LoggerLevel.INFO,
  "cast.framework.events.EventType.MEDIA_STATUS":
    cast.framework.LoggerLevel.DEBUG,
};
castDebugLogger.loggerLevelByTags = {
  LOG_TAG: cast.framework.LoggerLevel.DEBUG,
};

let shakaPlayer;
let resolveShakaPlayerReady;
const shakaPlayerReadyPromise = new Promise(resolve => {
  resolveShakaPlayerReady = resolve;
});

// 初始化 Shaka Player
function initShakaPlayer() {
  const mediaElement = playerManager.getMediaElement();

  if (!mediaElement) {
    castDebugLogger.error(LOG_TAG, "Media Element not available even after context is READY.");
    // 如果無法獲取 mediaElement，Shaka Player 無法初始化，可能需要考慮拒絕 Promise
    return;
  }
  castDebugLogger.info(LOG_TAG, "Media Element obtained successfully.");

  try {
    shaka.polyfill.installAll();
    if (shaka.Player.isBrowserSupported()) {
      shakaPlayer = new shaka.Player(mediaElement);
      castDebugLogger.info(LOG_TAG, "Shaka Player instance created.");

      shakaPlayer.addEventListener('error', onShakaError);

      shakaPlayer.configure({
        abr: {
          enabled: true
        },
        streaming: {
          bufferingGoal: 60,
        }
      });
      castDebugLogger.info(LOG_TAG, "Shaka Player configured.");
      resolveShakaPlayerReady(); // 通知等待者 Shaka Player 已就緒
    } else {
      castDebugLogger.error(LOG_TAG, "Browser not supported by Shaka Player!");
    }
  } catch (e) {
    castDebugLogger.error(LOG_TAG, "Error during Shaka Player initialization:", e);
  }
}

// Shaka Player 錯誤處理函式
function onShakaError(event) {
  const error = event.detail;
  castDebugLogger.error(LOG_TAG, 'Shaka Error code:', error.code, 'Error:', error);
  playerManager.broadcastError(
    cast.framework.messages.ErrorType.ERROR,
    cast.framework.messages.ErrorReason.GENERIC,
    error.code
  );
}

playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  async (request) => { // 將攔截器函數標記為 async
    castDebugLogger.info(LOG_TAG, "Intercepting LOAD request");

    // 等待 Shaka Player 初始化完成
    await shakaPlayerReadyPromise;
    castDebugLogger.info(LOG_TAG, "Shaka Player readiness check passed.");

    if (!shakaPlayer) {
      castDebugLogger.error(LOG_TAG, "Shaka Player not initialized even after ready promise. Check initShakaPlayer logs.");
      return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED);
    }

    if (request.media && request.media.contentUrl) {
      const manifestUri = request.media.contentUrl;
      const contentType = request.media.contentType;

      if (!contentType) {
        castDebugLogger.error(LOG_TAG, "media.contentType is required when using media.contentUrl");
        return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.INVALID_REQUEST);
      }

      castDebugLogger.info(LOG_TAG, "Loading with Shaka:", manifestUri, "Type:", contentType);

      try {
        await shakaPlayer.load(manifestUri, null, contentType);
        castDebugLogger.info(LOG_TAG, "Shaka Player load() call successful for:", manifestUri);

        request.media.contentId = request.media.contentId || manifestUri;
        request.media.streamType = cast.framework.messages.StreamType.BUFFERED;
        if (!request.media.metadata) {
          request.media.metadata = new cast.framework.messages.GenericMediaMetadata();
          request.media.metadata.title = "Unknown Title";
        }
        return request; // 返回修改後的 request
      } catch (error) {
        onShakaError({ detail: error });
        return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED);
      }
    } else {
      castDebugLogger.error(LOG_TAG, "LOAD request must contain media.contentUrl");
      return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.INVALID_REQUEST);
    }
  }
);

context.addEventListener(cast.framework.system.EventType.READY, () => {
  castDebugLogger.info(LOG_TAG, 'Cast Receiver Context READY');
  initShakaPlayer();
});

castDebugLogger.info(LOG_TAG, 'Calling context.start()');
context.start({});
castDebugLogger.info(LOG_TAG, 'context.start() called');
