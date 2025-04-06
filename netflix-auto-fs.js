/**
 * Netflix Auto Fullscreen add-on for Firefox.
 * 
 * For details see README.md
 */

(async () => {
  const log = (...args) => console.log(`Netflix Auto-fullscreen:`, ...args);
  const err = (...args) => console.error(`Netflix Auto-fullscreen:`, ...args);
  const assert = (condition, ...args) => console.assert(condition, `Netflix Auto-fullscreen:`, ...args);

  const mount_point = document.querySelector('div#appMountPoint');
  if (!mount_point) {
    err('no #appMountPoint');
    return;
  }

  let config = {
    fs_on_short_play: "true"
  };
  const load_config = async () => {
    config = await browser.storage.sync.get(config);
    log('using configuration', config);
  }
  browser.storage.onChanged.addListener(load_config);
  await load_config();

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
      assert(!reject_running_guard, 'concurrent observers!');
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
        log(id, `requesting fullscreen`);
        watch_video.requestFullscreen();
      }
    };

    try {
      guarding: while (true) {
        log(id, `started observing for video player`);
        let watch_video = await until_element(mount_point, 'div.watch-video');
        // Request fullscreen ASAP to be close to the user interaction.
        request_fs(watch_video);

        // This is a child element we are using to save some observer notifications overhead.
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
      ex && err(id, ex);
    }
    log(id, `exited`);
  };

  let guard_counter = 0;
  window.addEventListener("popstate", _ => guard_for_fullscreen(++guard_counter));
  guard_for_fullscreen(++guard_counter);
})();
