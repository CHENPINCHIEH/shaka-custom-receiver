const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

//Media Sample API Values
const SAMPLE_URL =
  "https://storage.googleapis.com/cpe-sample-media/content.json";
const StreamType = {
  DASH: "application/dash+xml",
  HLS: "application/x-mpegurl",
};
const TEST_STREAM_TYPE = StreamType.DASH;

// Debug Logger
const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
const LOG_TAG = "MyAPP.LOG";

// Enable debug logger and show a 'DEBUG MODE' overlay at top left corner.
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
// CAF 管理的 media element，在 context.start() 後可用
const mediaElement = playerManager.getMediaElement();

function makeRequest(method, url) {
  return new Promise(function (resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(JSON.parse(xhr.response));
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText,
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText,
      });
    };
    xhr.send();
  });
}

// 初始化 Shaka Player
function initShakaPlayer() {
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
  (request) => {
    castDebugLogger.info(LOG_TAG, "Intercepting LOAD request for Shaka Player");

    if (!shakaPlayer) {
      castDebugLogger.error(LOG_TAG, "Shaka Player not initialized. Cannot load media.");
      return new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED);
    }

    if (request.media && request.media.entity) {
      request.media.contentId = request.media.entity;
    }

    return new Promise((resolve, reject) => {
      makeRequest("GET", SAMPLE_URL).then(function (data) {
        let item = data[request.media.contentId];
        if (!item) {
          castDebugLogger.error(LOG_TAG, "Content not found");
          reject(new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED));
          return;
        }

        let manifestUri;
        let contentType = TEST_STREAM_TYPE;

        if (TEST_STREAM_TYPE === StreamType.DASH) {
          manifestUri = item.stream.dash;
        } else if (TEST_STREAM_TYPE === StreamType.HLS) {
          manifestUri = item.stream.hls;
        } else {
           castDebugLogger.error(LOG_TAG, "Unsupported stream type for Shaka:", TEST_STREAM_TYPE);
           reject(new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.INVALID_REQUEST));
           return;
        }

        if (!manifestUri) {
            castDebugLogger.error(LOG_TAG, "Manifest URI is missing for contentId:", request.media.contentId);
            reject(new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED));
            return;
        }

        castDebugLogger.info(LOG_TAG, "Loading with Shaka Player:", manifestUri);

        // 使用 Shaka Player 載入媒體
        shakaPlayer.load(manifestUri).then(() => {
          castDebugLogger.info(LOG_TAG, "Shaka Player has started loading the content.");

          // 更新 request 物件以供 CAF 使用
          request.media.contentUrl = undefined; // 阻止 CAF 嘗試載入 URL
          request.media.contentId = manifestUri; // 使用 manifest URI 作為 contentId
          request.media.contentType = contentType;
          // Shaka Player 直接在提供的 mediaElement 上播放，是 BUFFERED 型別
          request.media.streamType = cast.framework.messages.StreamType.BUFFERED;

          // 加入媒體 metadata
          let metadata = new cast.framework.messages.GenericMediaMetadata();
          metadata.title = item.title;
          metadata.subtitle = item.author;
          if (item.poster) {
            metadata.images = [new cast.framework.messages.Image(item.poster)];
          }
          request.media.metadata = metadata;

          // 解析修改後的 request，通知 CAF 載入已處理
          resolve(request);
        }).catch((error) => {
          onShakaError({ detail: error }); // 呼叫我們的 Shaka 錯誤處理
          reject(new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED));
        });
      }).catch(err => {
        castDebugLogger.error(LOG_TAG, "Failed to fetch media samples:", err);
        reject(new cast.framework.messages.ErrorData(cast.framework.messages.ErrorType.LOAD_FAILED));
      });
    });
  }
);

// Optimizing for smart displays
const touchControls = cast.framework.ui.Controls.getInstance();
const playerData = new cast.framework.ui.PlayerData();
const playerDataBinder = new cast.framework.ui.PlayerDataBinder(playerData);

let browseItems = getBrowseItems();

function getBrowseItems() {
  let browseItems = [];
  makeRequest("GET", SAMPLE_URL).then(function (data) {
    for (let key in data) {
      let item = new cast.framework.ui.BrowseItem();
      item.entity = key;
      item.title = data[key].title;
      item.subtitle = data[key].description;
      item.image = new cast.framework.messages.Image(data[key].poster);
      item.imageType = cast.framework.ui.BrowseImageType.MOVIE;
      browseItems.push(item);
    }
  });
  return browseItems;
}

let browseContent = new cast.framework.ui.BrowseContent();
browseContent.title = "Up Next";
browseContent.items = browseItems;
browseContent.targetAspectRatio =
  cast.framework.ui.BrowseImageAspectRatio.LANDSCAPE_16_TO_9;

playerDataBinder.addEventListener(
  cast.framework.ui.PlayerDataEventType.MEDIA_CHANGED,
  (e) => {
    if (!e.value) return;
    touchControls.setBrowseContent(browseContent);
    touchControls.clearDefaultSlotAssignments();
    touchControls.assignButton(
      cast.framework.ui.ControlsSlot.SLOT_PRIMARY_1,
      cast.framework.ui.ControlsButton.SEEK_BACKWARD_30
    );
  }
);

// 在 context 啟動後設置事件監聽器
context.addEventListener(cast.framework.system.EventType.READY, () => {
  castDebugLogger.info(LOG_TAG, 'Cast Receiver Context READY');
  // READY 事件後 mediaElement 才保證可用
  initShakaPlayer();
});

// 啟動 CAF Receiver Context
context.start({
  // 可選：可以加入其他播放設定
  // playbackConfig: new cast.framework.PlaybackConfig(),
  // supportedCommands: cast.framework.messages.Command.ALL_BASIC_MEDIA,
});

