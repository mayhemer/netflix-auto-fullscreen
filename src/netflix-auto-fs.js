/**
 * Netflix Auto Fullscreen add-on for Firefox and Chrome.
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

  document.addEventListener('fullscreenchange', _ => log('> in fullscreen:', !!document.fullscreenElement));


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
  const until_added_or_removed = (root, to_come, to_go) => observe_for(root, root => {
    const added = to_come.find(s => root.querySelector(s));
    const removed = to_go.find(e => !e.isConnected);
    return (added || removed) ? { added, removed } : null;
  });


  class Delay {
    #delay;
    #epoch = false;

    constructor(delay) {
      this.#delay = delay;
    }
    hit() {
      this.#epoch = Date.now();
    }
    reset() {
      this.#epoch = false;
    }
    get passed() {
      return this.#epoch && (Date.now() - this.#epoch) > this.#delay;
    }
    get pending() {
      return this.#epoch && !this.passed;
    }
  }


  const guard_for_fullscreen = async (id) => {
    reject_running_guard && reject_running_guard();

    const request_fs = (watch_video, trigger) => {
      if (!document.fullscreenElement) {
        log(id, `requesting fullscreen from`, trigger);
        watch_video.requestFullscreen();
      }
    };

    try {
      main: while (true) {
        log(id, `started observing for video player`);
        let watch_video = await until_element(mount_point, 'div.watch-video');
        // Request fullscreen ASAP to be close to the user interaction.
        request_fs(watch_video, 'direct');

        // We wait for this element to get a fresh and up-to-date playback UI.
        log(id, `started observing for player-view element`);
        await until_element(mount_point, 'div.watch-video--player-view');

        // Request fullscreen again in case the watch-video has recycled.
        watch_video = mount_point.querySelector('div.watch-video');
        request_fs(watch_video, 'direct backup');

        let added = [
          'video',
          // Appear on auto-play blocked or after a long pause.
          'div.watch-video--autoplay-blocked',
          'div.watch-video--playback-restart'
        ];
        let removed = [];

        inner: while (true) {
          log(id, `started observing for`, added, 'or removal of', removed);
          const change = await until_added_or_removed(watch_video, added, removed);
          if (change.added === 'video') {
            log(id, `assigning <video>.onplay fullscreen event handler`);
            const seek_delay = new Delay(1200);
            const pause_delay = new Delay(5 * 60 * 1000); // always fs on unpause after 5 minutes

            const video_element = watch_video.querySelector('video');
            video_element.addEventListener('play', _ => {
              if (seek_delay.pending) {
                log(id, 'play after seeking, ignored');
                return;
              }
              if (config.fs_on_short_play == "true" || pause_delay.passed) {
                pause_delay.reset();
                const watch_video = mount_point.querySelector('div.watch-video');
                request_fs(watch_video, '<video>.onplay');
              }
            });
            video_element.addEventListener('seeked', _ => seek_delay.hit());
            video_element.addEventListener('pause', _ => pause_delay.hit());
          }
          if (change.removed) {
            log(id, change.removed, `was removed`);
            // We are either no longer blocked or we jump to the next episode.
            break inner;
          }

          added = added.filter(e => e != change.added);
          removed.push(watch_video.querySelector(change.added));
        }
        // when removed, cycle again to request fs.
      }
    } catch (ex) {
      ex && err(id, ex);
    }
    log(id, `exited`);
  };

  let guard_counter = 0;
  window.addEventListener("popstate", _ => guard_for_fullscreen(++guard_counter));
  guard_for_fullscreen(++guard_counter);
})();
