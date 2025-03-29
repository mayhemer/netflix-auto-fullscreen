(() => {
  const observers = [];
  
  const kill_pengin_obsevers = () => {
    const copy = Array.from(observers);
    observers.length = 0;
    for (const observer of copy) {
      observer?.disconnect();
    }
  }

  const create_callback_for = (selector, next) => {
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

  const mount_point = document.querySelector('div#appMountPoint');

  let guarding = false;
  const guard_for_fs = () => {
    if (guarding) {
      console.log('NFFS already observving');
      return;
    }
    console.log('NFFS started observving');
    guarding = true;
    kill_pengin_obsevers();

    start_observer(mount_point, create_callback_for('div.watch-video--player-view', player_view => {
      start_observer(player_view, create_callback_for('button[data-uia="control-fullscreen-enter"]', element => {
        guarding = false;
        console.log('NFFS entering fullscreen');
        element.click();

        // this element is created after a long pause, when the video has to be restarted manually
        start_observer(player_view, create_callback_for('div.watch-video--autoplay-blocked', _ => {
          guard_for_fs();
        }));
      }))
    }));
  };

  window.addEventListener("popstate", () => {
    guard_for_fs();
  });
  guard_for_fs();
})();
