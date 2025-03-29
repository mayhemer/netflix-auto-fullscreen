(() => {
  const observers = [];
  const kill_all_obsevers = () => {
    for (const observer of observers) {
      observer?.disconnect();
    }
    observers.length = 0;
  };

  const for_selector = (selector, next) => {
    return (root, observer) => {
      const element = root.querySelector(selector);
      if (element) {
        observer.disconnect();
        delete observers[observers.indexOf(observer)];
        next(element);
      }
    }
  };

  const start_observer = (root, action) => {
    const observer = new MutationObserver((_, observer) => action(root, observer));
    observers.push(observer);
    observer.observe(root, { subtree: true, childList: true });
  };

  let guarding = false;
  const guard_for_fs_button = () => {
    if (guarding) {
      console.log('Netflix Auto-fullscreen: already observing');
      return;
    }

    const mount_point = document.querySelector('div#appMountPoint');
    if (!mount_point) {
      console.error('Netflix Auto-fullscreen: is this Netflix?');
      return;
    }

    guarding = true;
    console.log('Netflix Auto-fullscreen: started observing');
    kill_all_obsevers();

    start_observer(mount_point, for_selector('div.watch-video--player-view', player_view => {
      start_observer(player_view, for_selector('button[data-uia="control-fullscreen-enter"]', fs_button => {
        guarding = false;
        console.log('Netflix Auto-fullscreen: entering fullscreen');
        fs_button.click();

        // this element is created after a long pause, when the video has to be restarted manually
        start_observer(player_view, for_selector('div.watch-video--autoplay-blocked', _ => {
          guard_for_fs_button();
        }));
      }))
    }));
  };

  window.addEventListener("popstate", () => {
    guard_for_fs_button();
  });
  guard_for_fs_button();
})();
