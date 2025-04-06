Netflix Auto Fullscreen add-on for Firefox and Chrome
===

Purpose of this addon is to enter fullscreen wherever a title is played in the Netflix web player.  So one can just press the play button and then take a seat and immediately watch in fullscreen without a need to bother about the fullscreen button anymore.

## Preferences

There is a preference to enter fullscreen only one time, when you play the title at beginning, or whenever you unpause a title while in a windowed player.  The default is to always enter fullscreen.

## Technicalities

The addon requests fullscreen on the player element directly and as soon as possible.  This DOM element appears in the page when a title playback is started.  We wait for this player element using DOM MutationObserver.

Then, during playback being in fullscreen, we wait for one of two things:
1. either appearance of a restart button, or
1. appearance of the "play" notification

In the first case, it means the player has been paused for a long time and user now has to restart the playback by pressing the restart play button in the middle of the screen.  On that click, we re-request fullscreen immediately, if not in fullscreen already.

In case of the "play" notification hit, which happens on simply unpausing the player after a short break and when enabled by preferences, we again request fullscreen.

Cycle then loops by waiting for either the restart element or the "play" notification again.

When auto-play is blocked or when playback restart is necessary, we assign a click handler to request fullscreen on clicking the play button immediately.

## Drawbacks

There is a limitation for this extension.  Entering fullscreen successfully depends on delay between the user interaction making a title to start playback and the video player element appearing in the UI.  If the delay is too long, for instance because of slow internet connection or when the browser is busy, the fullscreen request may get rejected by the browser for security reasons.  There is nothing the addon can do about this.
