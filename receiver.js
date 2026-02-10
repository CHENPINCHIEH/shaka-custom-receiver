const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Debug Logger
const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
const LOG_TAG = "MyAPP.LOG";

// Enable debug logger
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

// 初始化 Shaka Player
function initShakaPlayer() {
      // 在這裡取得 mediaElement，因為此時 CAF 已準備就緒
  const mediaElement = playerManager.getMediaElement();

  if (!mediaElement) {
    castDebugLogger.error(LOG_TAG, "Media Element not available even after context is READY.");
    return;
  }
  if (!mediaElement) {
    castDebugLogger.error(LOG_TAG, "Media Element not available to initialize Shaka Player.");
    return;
  }
  shaka.polyfill.installAll();
  if (shaka.Player.isBrowserSupported()) {
    shakaPlayer = new shaka.Player(mediaElement);
    castDebugLogger.info(LOG_TAG, "Shaka Player initialized.");

    // Shaka Player 錯誤事件監聽
    shakaPlayer.addEventListener('error', onShakaError);

    // 可選：設定 Shaka Player
    shakaPlayer.configure({
      abr: {
        enabled: true
      },
      streaming: {
        bufferingGoal: 60, // 緩衝目標秒數
      }
    });
  } else {
    castDebugLogger.error(LOG_TAG, "Browser not supported by Shaka Player!");
  }
}

// Shaka Player 錯誤處理函式
function onShakaError(event) {
  const error = event.detail;
  castDebugLogger.error(LOG_TAG, 'Shaka Error code:', error.code, 'Error:', error);
  // 向 CAF 廣播錯誤
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

// --- 關於 Smart Display 優化的部分 ---
// 注意：原先的 getBrowseItems 和 browseContent 設定依賴於 SAMPLE_URL。
// 由於我們不再使用 SAMPLE_URL，這些功能將無法像以前那樣運作。
// 您需要重新設計媒體瀏覽功能，使其不依賴於那個固定的 JSON 檔案。
// 例如，媒體瀏覽的項目可能需要由發送端提供，或者從您的其他後端服務獲取。

// const touchControls = cast.framework.ui.Controls.getInstance();
// const playerData = new cast.framework.ui.PlayerData();
// const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

// playerDataBinder.addEventListener(
//   cast.framework.ui.PlayerDataEventType.MEDIA_CHANGED,
//   (e) => {
//     if (!e.value) return;
//     // touchControls.setBrowseContent(browseContent); // browseContent 需要新的數據源
//     touchControls.clearDefaultSlotAssignments();
//     touchControls.assignButton(
//       cast.framework.ui.ControlsSlot.SLOT_PRIMARY_1,
//       cast.framework.ui.ControlsButton.SEEK_BACKWARD_30
//     );
//   }
// );

// 在 context 啟動後設置事件監聽器
context.addEventListener(cast.framework.system.EventType.READY, () => {
  castDebugLogger.info(LOG_TAG, 'Cast Receiver Context READY');
  // READY 事件後 mediaElement 才保證可用
  initShakaPlayer();
});

// 啟動 CAF Receiver Context
context.start({});
