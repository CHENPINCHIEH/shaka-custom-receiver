const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
let shakaPlayer;
const videoElement = document.getElementById('myVideoElement');

// 初始化您自己的 Shaka Player 實例
function initShakaPlayer() {
  if (!window.shaka) {
    console.error("Shaka Player library not loaded!");
    return;
  }
  shaka.polyfill.installAll();
  if (shaka.Player.isBrowserSupported()) {
    shakaPlayer = new shaka.Player(videoElement);
    console.log("My custom Shaka Player version:", shaka.Player.version);
    // 在這裡設定您的 Shaka Player 配置
    // shakaPlayer.configure({...});
    shakaPlayer.addEventListener('error', onShakaError);
  } else {
    console.error('Shaka Player not supported by this browser.');
  }
}

function onShakaError(event) {
  console.error('Shaka Player Error:', event.detail);
  // 處理錯誤
}

// 攔截 LOAD 請求
playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  loadRequestData => {
    console.log('LOAD interceptor', loadRequestData);
    if (!shakaPlayer) {
      console.error("Shaka Player not initialized!");
      return new cast.framework.messages.ErrorData(
        cast.framework.messages.ErrorType.LOAD_FAILED
      );
    }

    const media = loadRequestData.media;
    const url = media.contentId || media.contentUrl;

    if (url) {
      // 使用您自己的 Shaka Player 實例播放
      return shakaPlayer.load(url).then(() => {
        console.log('Media loaded by my custom Shaka Player');
        videoElement.play();
        // 可以選擇性地廣播狀態，但媒體控制權在您手中
        // 返回 null 或一個解析後的 Promise 以阻止 CAF 進行預設處理
        return null;
      }).catch(error => {
        console.error('My Shaka Player load error:', error);
        return new cast.framework.messages.ErrorData(
          cast.framework.messages.ErrorType.LOAD_FAILED
        );
      });
    } else {
      return new cast.framework.messages.ErrorData(
        cast.framework.messages.ErrorType.INVALID_REQUEST
      );
    }
  }
);

context.start();
initShakaPlayer();
