// バックグラウンドスクリプト
chrome.action.onClicked.addListener((tab) => {
  // Instagram上にいるときのみ動作
  if (tab.url.includes('instagram.com')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: findAndDownloadReel
    });
  }
});

// コンテンツスクリプトからのメッセージを受け取ってダウンロード
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadReel' && message.url) {
    const filename = `instagram_reel_${Date.now()}.mp4`;
    chrome.downloads.download({
      url: message.url,
      filename: filename,
      saveAs: true
    });
    sendResponse({ status: 'downloading' });
  }
  return true;
});

// Reelを探して抽出する関数（コンテンツスクリプト内で実行される）
function findAndDownloadReel() {
  // 現在のページでReelのビデオを探す
  const videoElements = Array.from(document.querySelectorAll('video'));
  
  if (videoElements.length === 0) {
    alert('このページにはダウンロード可能なReelビデオが見つかりませんでした。');
    return;
  }
  
  // 表示されているビデオURLを取得
  let videoSources = videoElements.map(video => video.src).filter(src => src);
  
  // srcが空の場合はsourceタグを確認
  if (videoSources.length === 0) {
    videoElements.forEach(video => {
      const sources = video.querySelectorAll('source');
      sources.forEach(source => {
        if (source.src) {
          videoSources.push(source.src);
        }
      });
    });
  }
  
  // ビデオソースがまだない場合は、データ属性を確認
  if (videoSources.length === 0) {
    const possibleElements = document.querySelectorAll('[data-video-url]');
    possibleElements.forEach(el => {
      const videoUrl = el.getAttribute('data-video-url');
      if (videoUrl) {
        videoSources.push(videoUrl);
      }
    });
  }
  
  // シャドウDOMの中も検索
  if (videoSources.length === 0) {
    document.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        const shadowVideos = Array.from(el.shadowRoot.querySelectorAll('video'));
        shadowVideos.forEach(video => {
          if (video.src) {
            videoSources.push(video.src);
          }
        });
      }
    });
  }
  
  if (videoSources.length === 0) {
    // InstagramのReelsページの場合、別の方法でビデオを探す
    videoSources = extractVideoFromScripts();
  }
  
  if (videoSources.length === 0) {
    alert('ビデオソースが見つかりませんでした。Reelページにアクセスしてダウンロードしてください。');
    return;
  }
  
  // 最初に見つかったビデオをダウンロード
  chrome.runtime.sendMessage({
    action: 'downloadReel',
    url: videoSources[0]
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError);
    }
  });
}

// スクリプトタグからビデオURLを抽出する関数
function extractVideoFromScripts() {
  const videoUrls = [];
  
  // ページ内のすべてのスクリプトタグをチェック
  const scripts = document.querySelectorAll('script[type="application/json"]');
  scripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      
      // Reelのビデオデータを探す
      const extractUrls = (obj) => {
        if (!obj) return;
        
        if (typeof obj === 'object') {
          // ビデオURL用の一般的なキーを検索
          const videoKeys = ['video_url', 'video_versions', 'video_resources', 'videoUrl'];
          
          for (const key in obj) {
            if (videoKeys.includes(key) && typeof obj[key] === 'string' && obj[key].includes('http')) {
              videoUrls.push(obj[key]);
            } else if (Array.isArray(obj[key]) && key === 'video_versions') {
              // Instagramの特定の形式をチェック
              obj[key].forEach(item => {
                if (item.url) {
                  videoUrls.push(item.url);
                }
              });
            } else {
              extractUrls(obj[key]);
            }
          }
        }
      };
      
      extractUrls(data);
    } catch (e) {
      // JSON解析エラーは無視
    }
  });
  
  return videoUrls;
}
