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

(async () => {
  let config = {
    fs_on_short_play: true
  };

  const load_config = async () => {
    config = await browser.storage.sync.get(config);
    console.log('Netflix Auto-fullscreen: using configuration', config);
  }
  browser.storage.onChanged.addListener(load_config);
  await load_config();

  const mount_point = document.querySelector('div#appMountPoint');
  if (!mount_point) {
    console.error('Netflix Auto-fullscreen: no #appMountPoint');
    return;
  }

  let reject_running_guard = null;

  const observe_for = (root, condition) => {
    return new Promise((resolve, reject) => {
      const conclude = (observer, result) => {
        reject_running_guard = null;
        observer.disconnect();
        result ? resolve(result) : reject();
      };
      const observer = new MutationObserver(_ => {
        const result = condition(root);
        if (result) {
          conclude(observer, result);
        }
      });
      console.assert(!reject_running_guard, 'Netflix Auto-fullscreen: concurrent observers!');
      reject_running_guard = () => conclude(observer);
      observer.observe(root, { subtree: true, childList: true });
    });
  };

  const until_element = (root, selector) => observe_for(root, root => root.querySelector(selector));
  const while_element = (root, selector) => observe_for(root, root => !root.querySelector(selector));
  const until_one_of = (root, selectors) => observe_for(root, root => selectors.find(selector => root.querySelector(selector)));

  const guard_for_fullscreen_button = async (order) => {
    reject_running_guard && reject_running_guard();
    try {
      guarding: while (true) {
        console.log(`Netflix Auto-fullscreen: #${order} started observing for player view`);
        const player_view = await until_element(mount_point, 'div.watch-video--player-view');
        console.log(`Netflix Auto-fullscreen: #${order} started observing for fullscreen button`);
        const fs_button = await until_element(player_view, 'button[data-uia="control-fullscreen-enter"]');

        console.log(`Netflix Auto-fullscreen: #${order} entering fullscreen`);
        fs_button.click();

        restart: while (true) {
          let watch_video = mount_point.querySelector('div.watch-video');
          // playback-restart element is created after a long pause, when the video has to be restarted manually
          // and I want auto-fs when the video is restarted again.
          // playback-notification element is created when we play a video after a short pause, and this code
          // allows re-entering of fullscreen on that action.  It's disputable, if I want this behavior.
          const found = await until_one_of(watch_video, ['div.watch-video--playback-restart', 'div.playback-notification--play']);
          switch (found) {
            case 'div.playback-notification--play':
              await while_element(watch_video, found);
              if (config.fs_on_short_play === "true") {
                continue guarding;
              } else {
                continue restart;
              }
              break;
            case 'div.watch-video--playback-restart':
              console.log(`Netflix Auto-fullscreen: #${order} waiting for playback restart`);
              watch_video = mount_point.querySelector('div.watch-video');
              await while_element(watch_video, found);
              break;
          }
          // Having the condition here, rather than in the loop statement, to allow `continue guarding` regardless of the fullscreen state.
          if (!document.fullscreenElement) {
            break restart;
          }
        }
      }
    } catch(ex) {
      ex && console.error(ex);
    }
    console.log(`Netflix Auto-fullscreen: #${order} exited`);
  };

  let guard_counter = 0;
  window.addEventListener("popstate", _ => guard_for_fullscreen_button(++guard_counter));
  guard_for_fullscreen_button(++guard_counter);
})();
