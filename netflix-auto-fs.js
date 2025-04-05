/**
 * Netflix Auto Fullscreen add-on.
 *
 * Purpose is to enter fullscreen whereever a title is played, so one can
 * just press the play button and then take a seat and immediately watch in
 * fullscreen without a need to press the fullscreen button by hand.
 *
 * Technicalities:
 * The addon requests fullscreen on the player element directly, when a title
 * playback is started.  We wait for the player element using DOM MutaionObserver.
 * 
 * When autoplay is blocked, we assign a click handler to request fullscreen
 * on clicking the play-blocked play button.
 *
 * Then, we wait for one of two things: either appearance of a restart button
 * or of the "play" notification.  In the first case, it means the player
 * has been paused for a long time and user now has to restart the playback
 * by pressing the restart play button.  After that click, we request fullscreen
 * again.
 *
 * In case of the "play" notification hit, which happens on simply unpausing
 * the player, then, when enabled by preferences, we again requst fullscreen.
 * Cycle then loops by again waiting for either the restart element or the "play"
 * notification.
 *
 * Note: there is a limitation when this extension actually works.  It depends
 * on the delay between the user interaction making a title to start playback
 * and the video player element appearing in the UI.  If the delay is too long
 * the fullscreen request made may get rejected by the browser for security reasons.
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

  const guard_for_fullscreen = async (id) => {
    reject_running_guard && reject_running_guard();

    const request_fs = watch_video => {
      if (!document.fullscreenElement) {
        log(id, `requsting fullscreen`);
        watch_video.requestFullscreen();
      }
    };

    try {
      guarding: while (true) {
        log(id, `started observing for video player`);
        let watch_video = await until_element(mount_point, 'div.watch-video');
        // Request fullscreen ASAP to be close to the user interaction.
        request_fs(watch_video);

        // This is a child element we are using to save some observer notitications overhead.
        log(id, `started observing for player-view element`);
        const player_view = await until_element(mount_point, 'div.watch-video--player-view');

        // Request fullscreen again in case the watch-video has recycled.
        watch_video = mount_point.querySelector('div.watch-video');
        request_fs(watch_video);

        log(id, `started observing for fullscreen or blocked play button`);
        const fs_or_blocked_element = await until_element_or_fs(player_view, 'button[data-uia="player-blocked-play"]');
        if (fs_or_blocked_element === document.fullscreenElement) {
          log(id, `fullscreen on!`);
        } else {
          log(id, 'will request fullscreen on player-blocked-play button click');
          fs_or_blocked_element.addEventListener('click', _ => request_fs(watch_video));
          await while_element(player_view, 'button[data-uia="player-blocked-play"]');
        }

        restart: while (true) {
          // This element is often recycled, rather re-query it here.
          watch_video = mount_point.querySelector('div.watch-video');
          // 'playback-restart' element is created after a long pause, when the video has to be restarted manually
          // and I want auto-fs when the video is restarted again.
          // 'playback-notification' element is created when we unpause a video after a short break, and this code
          // allows re-entering of fullscreen on that action.  It's disputable if I want this behavior, 
          // hence a preference was made for users to decide.
          log(id, `waiting for pause/restart`);
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
              watch_video = mount_point.querySelector('div.watch-video');

              // NOTE: This may not work, as after the restart the watch-video element is recycled.
              const restart_play_button = watch_video.querySelector('div.watch-video--playback-restart button');
              restart_play_button.addEventListener('click', _ => request_fs(watch_video));
              
              log(id, `waiting for playback restart`);
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
    log(id, `exited`);
  };

  let guard_counter = 0;
  window.addEventListener("popstate", _ => guard_for_fullscreen(++guard_counter));
  guard_for_fullscreen(++guard_counter);
})();
