# Manual smoke test (OpenDeck)

Run after `scripts/install` and an OpenDeck restart. Each item must pass.

1. The "Steam" category lists all four actions (Status, Open View, Launch Game, Friend), with icons, in the action list.
2. Drag Steam Status to a key. The key shows the green Online icon without touching settings.
3. Change the dropdown to Away, Invisible, Offline, back to Online. The icon updates each time and never goes blank.
4. Press the key with Steam running. Your Steam chat status changes to match.
5. Drag Open Steam View to a key. It shows the Library (gamepad) icon by default.
6. Cycle all five views. Icons update; pressing the key opens that view in Steam.
7. Quit and restart OpenDeck. Both keys keep their icons and settings.
8. Quit Steam, press a key. Steam launches or the key flashes an alert; OpenDeck stays up.
9. Check `~/.local/share/opendeck/logs/plugins/io.github.tonyheadband.opendeck-steam.sdPlugin.log` and `io.github.tonyheadband.opendeck-steam.sdPlugin/logs/` have no errors.
10. Remove the old Steam Status Update keys once the new ones work.

## Launch Steam Game (M2)

11. "Launch Steam Game" appears in the Steam category with the dim gamepad icon.
12. Drag it to a key. The key shows the dim gamepad icon and pressing it flashes an alert (no game chosen yet).
13. Open its settings panel. The Game dropdown lists your installed games, most recently played first, with no Proton or runtime entries. Art shows Auto plus only the art that game has.
14. Choose a game. The key shows that game's art, cropped to fill the key. Try Cover, Header and Logo; each redraws the key, Logo on a dark tile.
15. Press the key. The game starts through Steam.
16. Restart OpenDeck. The key keeps its game and art; the panel shows the same selection.
17. A game whose name contains quotes or angle brackets shows as plain text in the dropdown.
18. Rename Steam's folder temporarily (or run with Steam absent): the panel shows "Steam library not found" and the key still works for a saved game.

## Steam Friend (M3)

19. "Steam Friend" appears in the Steam category with the "?" placeholder icon.
20. Drag it to a key. The key shows "?" and pressing it flashes an alert.
21. Open its settings panel. It says "Enter your Steam Web API key". Paste your key into the field and press Save key. The field empties, the status reads "API key saved", and the key itself is never shown again.
22. The Friend dropdown lists "Me (...)" first, then online and in-game friends, then the rest, each with a state. Choose a friend: within about a minute the key shows their avatar in a ring (blue online, green in game, amber away, red busy, dimmed grey offline).
23. Press the key. A Steam chat with that friend opens.
24. Restart OpenDeck. The key keeps its friend and shows their state again within about a minute; the panel still says the key is saved.
25. Clear key in the panel. The key goes back to "?" within a minute; pressing it still opens the chat (no API key needed). Saving a key restores the avatar and ring.
    Friends with non-public profiles may read as offline even when online (a Steam API limit).
26. A friend whose name contains quotes, angle brackets or very long text appears as plain text in the dropdown.
27. Disconnect the network for two minutes: the key keeps its last state; reconnecting updates it within a minute.
28. `~/.config/opendeck/settings/io.github.tonyheadband.opendeck-steam.sdPlugin.json` holds the key in plain text (expected); it must appear nowhere in the plugin logs.

## Friend flash (M4)

29. The friend panel has a "Flash when this friend comes online" checkbox, ticked by default; it survives reopening the panel and an OpenDeck restart, and choosing a friend keeps it.
30. With a pinned friend offline, have them come online (or use a friend who regularly does): within about a minute their key flashes (white ring on and off) for about six seconds, then settles on the normal icon. It does not flash again until they go offline and come back.
31. Untick the box: the same friend coming online no longer flashes the key (it still updates its ring).
32. Restart OpenDeck or switch profiles and back: no flash on return.

## Friends list toggle (M4)

33. Open Steam View set to Friends: with the friends list closed, pressing it opens the list.
34. Press it again with the list open: the list window closes. Press once more: it opens again.
35. With Steam running but no friends list, and with `wmctrl` temporarily renamed (or Steam closed): pressing still opens the list or starts Steam, and the key does not flash an alert.
36. The other views (Library, Account, Downloads, Settings) toggle the main Steam window: the first press opens that page, a second press closes the main window. Launch, status and friend keys never close anything.

## Running ring (M4)

37. Launch Steam Game with a game chosen: start that game (from the key or from Steam): within about five seconds a green ring appears around the key's art. Quit the game: the ring disappears.
38. A launch key for a different game shows no ring while another game runs.
