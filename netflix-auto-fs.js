/**
 * Netflix fullscreen add-on.
 *
 * It very simply observers for DOM mutations using MutationObserver and
 * searches for the player element and then inside it for the fullscreen
 * button.  After found, it clicks that button to enter fullscreen.
 * Only one time, when playing a title.  Fullscreen is not rejected because
 * the source of the event is near a user interaction (pressing play button).
 * Then it waits for the "restart" element, which is added, if the
 * playback is paused for a long period of time.  User than have to restart
 * the playback manually using the "play" button again.  If fullscreen is
 * exit during this period, we reengage the auto-fullscreen mechanism to
 * bring the feature again as expexted.  The observing mechanism is also
 * reengaged when user goes back to browse titles, via the "popstate" event.
 */

(() => {
  const mount_point = document.querySelector('div#appMountPoint');
  if (!mount_point) {
    console.error('Netflix Auto-fullscreen: no #appMountPoint');
    return;
  }

  let reject_running_guard = null;

  const wait_for_element = (root, selector, condition) => {
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(_ => {
        const element = root.querySelector(selector);
        if (condition(element)) {
          reject_running_guard = null;
          observer.disconnect();
          resolve(element);
        }
      });
      console.assert(!reject_running_guard, 'Netflix Auto-fullscreen: concurrent observers!');
      reject_running_guard = () => {
        console.log('Netflix Auto-fullscreen: current observer killed')
        reject_running_guard = null;
        observer.disconnect();
        reject();
      };
      observer.observe(root, { subtree: true, childList: true });
    });
  };

  const until_element = (root, selector) => wait_for_element(root, selector, e => e != null);
  const while_element = (root, selector) => wait_for_element(root, selector, e => e == null);

  const guard_for_fullscreen_button = async () => {
    reject_running_guard && reject_running_guard();
    console.log('Netflix Auto-fullscreen: started observing for fullscreen button');

    try {
      do {
        const player_view = await until_element(mount_point, 'div.watch-video--player-view');
        const fs_button = await until_element(player_view, 'button[data-uia="control-fullscreen-enter"]');
        
        console.log('Netflix Auto-fullscreen: entering fullscreen');
        fs_button.click();
        
        // this element is created after a long pause, when the video has to be restarted manually
        // and I want auto-fs when the video is restarted again.
        await until_element(player_view, 'div.watch-video--playback-restart');
        
        console.log('Netflix Auto-fullscreen: waiting for playback restart');
        await while_element(player_view, 'div.watch-video--playback-restart');
      } while (!document.fullscreenElement);
    } catch(ex) {
      ex && console.error(ex);
    }
  };

  window.addEventListener("popstate", guard_for_fullscreen_button);
  guard_for_fullscreen_button();
})();
