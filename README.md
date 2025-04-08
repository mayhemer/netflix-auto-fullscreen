Netflix Auto Fullscreen add-on for Firefox and Chrome
===

Purpose of this addon is to enter fullscreen wherever a title is played in the Netflix web player.  So one can just press the play button and then take a seat and immediately watch in fullscreen without a need to bother about the fullscreen button anymore.

## Preferences

There is a preference to enter fullscreen only one time, when you start playing a new title, or whenever you unpause the title while in a windowed player.  The default is to always enter fullscreen.

## Technicalities

The addon requests fullscreen on the player element directly and as soon as possible.  This DOM element appears in the page when a title playback is started.  We wait for this player element using DOM MutationObserver.

The `<video>` element is assigned an event listener for the 'play' event.  If configured, we request fullscreen on every unpause of the web player.

Then we wait for one of two things:
1. either appearance of the playback restart UI, or
1. appearance of the blocked play UI

After those appear, we wait for that respective UI to be removed again, which means a playback has been restarted by the user.  The cycle then continues.  Same when user navigates back to title browsing.
