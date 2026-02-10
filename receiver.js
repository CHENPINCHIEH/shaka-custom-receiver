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

// 初始化 Shaka Player 實例
function initShakaPlayer() {
  castDebugLogger.info(LOG_TAG, "initShakaPlayer called");
  const mediaElement = playerManager.getMediaElement();

  if (!mediaElement) {
    castDebugLogger.error(LOG_TAG, "Media Element not available even after context is READY.");
    return;
  }
  castDebugLogger.info(LOG_TAG, "Media Element obtained successfully.");

  // 確認 CAF 提供的 Shaka 是否存在
  if (typeof shaka === 'undefined') {
    castDebugLogger.error(LOG_TAG, "shaka namespace not found! CAF did not load Shaka Player.");
    return;
  }
  castDebugLogger.info(LOG_TAG, `Shaka Player version provided by CAF: ${shaka.Player.version}`);

  try {
    shaka.polyfill.installAll();
    if (shaka.Player.isBrowserSupported()) {
      shakaPlayer = new shaka.Player(mediaElement);
      castDebugLogger.info(LOG_TAG, "Shaka Player instance created.");

      shakaPlayer.addEventListener('error', onShakaError);

      // 基本的 Shaka Player 設定
      shakaPlayer.configure({
        abr: {
          enabled: true
        },
        // 您可以根據需要添加更多配置
      });
      castDebugLogger.info(LOG_TAG, "Shaka Player configured.");
      resolveShakaPlayerReady(); // 通知 Shaka Player 已就緒
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

// LOAD 訊息攔截器 (用於直接 URL 載入)
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  async (request) => {
    castDebugLogger.info(LOG_TAG, "Intercepting LOAD request");
    await shakaPlayerReadyPromise;

    if (!shakaPlayer) {
      castDebugLogger.error(LOG_TAG, "Shaka Player not initialized.");
      return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED);
    }

    if (request.media && request.media.contentUrl) {
      const manifestUri = request.media.contentUrl;
      const contentType = request.media.contentType;

      if (!contentType) {
        castDebugLogger.error(LOG_TAG, "media.contentType is required for LOAD");
        return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.INVALID_REQUEST);
      }

      castDebugLogger.info(LOG_TAG, "Loading with Shaka:", manifestUri, "Type:", contentType);
      try {
        await shakaPlayer.load(manifestUri, null, contentType);
        castDebugLogger.info(LOG_TAG, "Shaka load() successful for:", manifestUri);
        request.media.streamType = cast.framework.messages.StreamType.BUFFERED;
        return request;
      } catch (error) {
        onShakaError({ detail: error });
        return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED);
      }
    } else {
      castDebugLogger.warn(LOG_TAG, "LOAD request without media.contentUrl, passing through.");
      return request; // 或者返回錯誤，取決於您是否允許沒有 contentUrl 的 LOAD
    }
  }
);

// 等待 CAF 環境準備就緒
context.addEventListener(cast.framework.system.EventType.READY, () => {
  castDebugLogger.info(LOG_TAG, 'Cast Receiver Context READY');
  initShakaPlayer();
});

castDebugLogger.info(LOG_TAG, 'Calling context.start()');
context.start({});
castDebugLogger.info(LOG_TAG, 'context.start() called');
