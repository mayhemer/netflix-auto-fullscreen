/**
 * Netflix Auto Fullscreen add-on.
 *
 * Purpose is to enter fullscreen whereever a title is played, so one can
 * just press the play button and then take a seat and immediately watch in
 * fullscreen without a need to press the fullscreen button by hand.
 *
 * Technicalities:
 * The addon click()s the fullscreen button directly in the player UI to enter
 * the fullscreen mode, when a title is played. We wait for this button using
 * DOM MutaionObserver.  After it's found, it's clicked, and if the event is
 * processed soon enough after the user interaction, fullscreen is entered.
 *
 * Then, we wait for one of two things: either appearance of a restart button
 * or of the "play" notification.  In the first case, it means the player
 * has been paused for a long time and user now has to restart the playback
 * by pressing the restart play button.  After that click, we again start
 * waiting for the fullscreen button.
 *
 * In case of the "play" notification hit, what happens on simply unpausing
 * the player, then, when enabled by preferences, we again look for
 * the fullscreen button to click() it.  Cycle then loops by again waiting
 * for either the restart element or the "play" notification.
 *
 * Note: there is a limitation when this extension actually works.  It depends
 * on the delay between the user interaction making a title to start playback
 * and the fullscreen button appearing in the UI.  If the delay is too long
 * the fullscreen request made by the Netflix code behind the fullscreen button
 * is rejected by the browser for security reasons.
 * For this reason we try to request fullscreen as soon as the base player 
 * element appears, same way as the Netflix code does itself.
 */

(async () => {
  const log = (...args) => console.log(`Netflix Auto-fullscreen:`, ...args);

  let config = {
    fs_on_short_play: "true"
  };

  const load_config = async () => {
    config = await browser.storage.sync.get(config);
    log('using configuration', config);
  }
  browser.storage.onChanged.addListener(load_config);
  await load_config();

  const mount_point = document.querySelector('div#appMountPoint');
  if (!mount_point) {
    log('no #appMountPoint');
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
  const until_element_or_fs = (root, selector) => observe_for(root, root => root.querySelector(selector) || document.fullscreenElement);
  const while_element = (root, selector) => observe_for(root, root => !root.querySelector(selector));
  const until_one_of = (root, selectors) => observe_for(root, root => selectors.find(selector => root.querySelector(selector)));

  const guard_for_fullscreen_button = async (order) => {
    reject_running_guard && reject_running_guard();

    try {
      guarding: while (true) {
        log(order, `started observing for video`);
        let watch_video = await until_element(mount_point, 'div.watch-video');

        // Request fullscreen ASAP to be close to the user interaction
        if (!document.fullscreenElement) {
          log(order, `requsting fullscreen`);
          watch_video.requestFullscreen();
        }

        log(order, `started observing for player-view`);
        const player_view = await until_element(mount_point, 'div.watch-video--player-view');

        // In case forcing fullscreen on the watch-video element, try again with the fullscreen button as a fallback.
        log(order, `started observing for fullscreen button or fullscreen state`);
        const fs_element = await until_element_or_fs(player_view, 'button[data-uia="control-fullscreen-enter"]');
        if (fs_element == document.fullscreenElement) {
          log(order, `fullscreen on!`);
        } else {
          log(order, `clicking the fullscreen button`);
          fs_element.click();
        }

        restart: while (true) {
          // This element is recreated after restart, need to re-query it here.
          watch_video = mount_point.querySelector('div.watch-video');
          // playback-restart element is created after a long pause, when the video has to be restarted manually
          // and I want auto-fs when the video is restarted again.
          // playback-notification element is created when we play a video after a short pause, and this code
          // allows re-entering of fullscreen on that action.  It's disputable, if I want this behavior.
          log(order, `waiting for pause/restart`);
          const found = await until_one_of(watch_video, ['div.watch-video--playback-restart', 'div.playback-notification--play']);
          switch (found) {
            case 'div.playback-notification--play':
              await while_element(watch_video, found);
              if (config.fs_on_short_play == "true") {
                continue guarding;
              } else {
                continue restart;
              }
              break;
            case 'div.watch-video--playback-restart':
              log(order, `waiting for playback restart`);
              watch_video = mount_point.querySelector('div.watch-video');
              await while_element(watch_video, found);
              break;
          }
          // Having the condition here, rather than in the loop statement, to allow `continue restart` regardless of the fullscreen state.
          if (!document.fullscreenElement) {
            break restart;
          }
        }
      }
    } catch(ex) {
      ex && console.error(ex);
    }
    log(order, `exited`);
  };

  let guard_counter = 0;
  window.addEventListener("popstate", _ => guard_for_fullscreen_button(++guard_counter));
  guard_for_fullscreen_button(++guard_counter);
})();
