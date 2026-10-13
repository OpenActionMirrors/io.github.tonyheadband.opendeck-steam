window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  const info = JSON.parse(actionInfo);
  let saved = info.payload.settings ?? {};

  const gameSelect = document.getElementById("game");
  const artSelect = document.getElementById("art");
  const scaleInput = document.getElementById("scale");
  const scaleValue = document.getElementById("scaleValue");
  const note = document.getElementById("note");

  const ART_LABELS = { auto: "Auto", cover: "Cover", header: "Header", logo: "Logo" };
  let games = [];

  const option = (value, text) => {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = text;
    return element;
  };

  const renderArt = (wanted) => {
    const game = games.find((candidate) => candidate.appId === gameSelect.value);
    const choices = ["auto", ...(game ? game.art : ["cover", "header", "logo"])];
    artSelect.replaceChildren(...choices.map((choice) => option(choice, ART_LABELS[choice])));
    artSelect.value = choices.includes(wanted) ? wanted : "auto";
  };

  const renderScale = (wanted) => {
    const scale = Number(wanted ?? 100);
    scaleInput.value = Number.isFinite(scale) ? scale : 100;
    scaleValue.textContent = scaleInput.value;
  };

  const renderGames = () => {
    const options = [option("", "Choose a game")];
    for (const game of games) options.push(option(game.appId, game.name));
    if (saved.appid && !games.some((game) => game.appId === saved.appid)) {
      options.push(option(saved.appid, `App ${saved.appid} (not installed)`));
    }
    gameSelect.replaceChildren(...options);
    gameSelect.value = saved.appid ?? "";
    renderArt(saved.art ?? "auto");
    renderScale(saved.scale);
  };

  const socket = new WebSocket(`ws://127.0.0.1:${port}`);

  const save = () => {
    const payload = { art: artSelect.value, scale: scaleInput.value };
    if (gameSelect.value) payload.appid = gameSelect.value;
    saved = payload;
    socket.send(JSON.stringify({ event: "setSettings", context: uuid, payload }));
  };

  socket.onopen = () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    socket.send(JSON.stringify({ event: "sendToPlugin", action: info.action, context: uuid, payload: { event: "getGames" } }));
  };

  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.event !== "sendToPropertyInspector" || data.payload?.event !== "games") return;

    games = data.payload.games;
    note.textContent = data.payload.steamFound ? "" : "Steam library not found";
    renderGames();
  };

  gameSelect.addEventListener("change", () => {
    renderArt(artSelect.value);
    save();
  });
  artSelect.addEventListener("change", save);
  scaleInput.addEventListener("input", () => {
    scaleValue.textContent = scaleInput.value;
  });
  scaleInput.addEventListener("change", save);

  renderGames();
};
