window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  const info = JSON.parse(actionInfo);
  let saved = info.payload.settings ?? {};

  const keyInput = document.getElementById("apiKey");
  const keyStatus = document.getElementById("keyStatus");
  const friendSelect = document.getElementById("friend");
  const flashBox = document.getElementById("flash");
  const note = document.getElementById("note");

  const STATE_LABELS = { ingame: "in game", online: "online", busy: "busy", away: "away", offline: "offline" };

  const option = (value, text) => {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = text;
    return element;
  };

  const render = (message) => {
    keyStatus.textContent = message.hasKey ? "API key saved" : "Enter your Steam Web API key";
    keyInput.placeholder = message.hasKey ? "saved (enter a new key to replace it)" : "32-character key";
    note.textContent = message.error ?? "";

    const options = [option("", "Choose a friend")];
    if (message.me) options.push(option(message.me.steamId, `Me (${message.me.name})`));
    for (const friend of message.friends) {
      options.push(option(friend.steamId, `${friend.name} - ${STATE_LABELS[friend.state] ?? friend.state}`));
    }
    if (/^[0-9]{17}$/.test(saved.steamid ?? "") && !options.some((element) => element.value === saved.steamid)) {
      options.push(option(saved.steamid, `Friend ${saved.steamid}`));
    }
    friendSelect.replaceChildren(...options);
    friendSelect.value = saved.steamid ?? "";
    flashBox.checked = saved.flash !== "off";
  };

  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const send = (payload) =>
    socket.send(JSON.stringify({ event: "sendToPlugin", action: info.action, context: uuid, payload }));

  socket.onopen = () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    send({ event: "getFriends" });
  };

  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.event === "sendToPropertyInspector" && data.payload?.event === "friends") render(data.payload);
  };

  document.getElementById("saveKey").addEventListener("click", () => {
    const value = keyInput.value.trim();
    if (!/^[0-9a-fA-F]{32}$/.test(value)) {
      note.textContent = "That does not look like a Steam Web API key (32 hex characters)";
      return;
    }
    send({ event: "setApiKey", apiKey: value });
    keyInput.value = "";
  });

  document.getElementById("clearKey").addEventListener("click", () => send({ event: "clearApiKey" }));

  const saveSettings = () => {
    saved = { flash: flashBox.checked ? "on" : "off" };
    if (friendSelect.value) saved.steamid = friendSelect.value;
    socket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: saved }));
  };

  friendSelect.addEventListener("change", saveSettings);
  flashBox.addEventListener("change", saveSettings);

  render({ hasKey: false, me: null, friends: [] });
};
