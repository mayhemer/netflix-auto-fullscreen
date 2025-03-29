/**
 * Netflix fullscreen add-on.
 * 
 * It very simply observers for DOM mutations using MutationObserver
 * and searches for the player and then for the fullscreen button.
 * After found, it clicks the button.  Only one time, when playing a title.
 * Then it waits for the "restart" element, which is added after the
 * playback is paused for a long period of time.  User than have to restart
 * the playback manually using the "play" button.  If fullscreen is
 * exit during this break time, we reengage the auto-fullscreen mechanism.
 * It's also reengaged when user goes back to browse titles.
 */

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

  const while_element = (root, selector) => until_element(root, selector, e => !e);

  const guard_for_fullscreen_button = async () => {
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
      await while_element(player_view, 'div.watch-video--playback-restart');

      document.fullscreenElement || guard_for_fullscreen_button();
    } catch(ex) {
      ex && console.error(ex);
    }
  };

  window.addEventListener("popstate", () => {
    guard_for_fullscreen_button();
  });

  guard_for_fullscreen_button();
})();
