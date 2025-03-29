(() => {
  const mount_point = document.querySelector('div#appMountPoint');
  if (!mount_point) {
    console.error('Netflix Auto-fullscreen: no #appMountPoint');
    return;
  }

  let reject_previous = null;
  const until_element = (root, selector, condition = e => e) => {
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(_ => {
        const element = root.querySelector(selector);
        if (condition(element)) {
          reject_previous = null;
          observer.disconnect();
          resolve(element);
        }
      });
      reject_previous = () => {
        console.log('Netflix Auto-fullscreen: previous observer killed')
        reject_previous = null;
        observer.disconnect();
        reject();
      };
      observer.observe(root, { subtree: true, childList: true });
    });
  };

  const guard_for_fs_button = async () => {
    reject_previous && reject_previous();
    console.log('Netflix Auto-fullscreen: started observing for fullscreen button');
    
    try {
      const player_view = await until_element(mount_point, 'div.watch-video--player-view');
      const fs_button = await until_element(player_view, 'button[data-uia="control-fullscreen-enter"]');

      console.log('Netflix Auto-fullscreen: entering fullscreen');
      fs_button.click();
      
      // this element is created after a long pause, when the video has to be restarted manually
      // and I want auto-fs when the video is restarted again.
      await until_element(player_view, 'div.watch-video--playback-restart');

      console.log('Netflix Auto-fullscreen: waiting for playback restart');
      await until_element(player_view, 'div.watch-video--playback-restart', e => !e);

      document.fullscreenElement || guard_for_fs_button();
    } catch(ex) {
      ex && console.error(ex);
    }
  };

  window.addEventListener("popstate", () => {
    guard_for_fs_button();
  });

  guard_for_fs_button();
})();
