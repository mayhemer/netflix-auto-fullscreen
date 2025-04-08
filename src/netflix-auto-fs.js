/**
 * Netflix Auto Fullscreen add-on for Firefox  and Chrome.
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
      while (true) {
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

        const video_element = await until_element(player_view, 'video');
        video_element.addEventListener('play', _ => {
          if (config.fs_on_short_play == "true") {
            const watch_video = mount_point.querySelector('div.watch-video');
            request_fs(watch_video);
          }
        });

        // Appear on auto-play blocked or after a long pause.
        log(id, `started observing for blocked playback`);
        const blocked = await until_one_of(watch_video, [
          'button[data-uia="player-blocked-play"]',
          'div.watch-video--playback-restart'
        ]);

        // when removed, cycle again to request fs.
        log(id, 'waiting for playback restart');
        await while_element(player_view, blocked);
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
