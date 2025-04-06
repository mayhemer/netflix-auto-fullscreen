async function save_options_behavior(e) {
  e.preventDefault();
  const behavior = document.querySelector("input[name=behavior]:checked")?.value;
  await browser.storage.sync.set({
    fs_on_short_play: behavior
  });
}

async function restore_options() {
  const s = await browser.storage.sync.get({
    fs_on_short_play: "true"
  });
  const input = document.querySelector(`input[name=behavior][value=${s.fs_on_short_play}]`);
  input.checked = true;
}

document.addEventListener('DOMContentLoaded', e => {
  restore_options(e);
  document.querySelectorAll("input[name=behavior]").forEach(input => input.addEventListener('change', save_options_behavior));
});
