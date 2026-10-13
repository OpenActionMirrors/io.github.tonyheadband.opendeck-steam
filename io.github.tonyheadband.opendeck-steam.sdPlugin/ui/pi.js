window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  const select = document.getElementById("value");
  const key = select.dataset.setting;
  const saved = JSON.parse(actionInfo).payload.settings ?? {};
  if ([...select.options].some((option) => option.value === saved[key])) select.value = saved[key];

  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => socket.send(JSON.stringify({ event: registerEvent, uuid }));
  select.addEventListener("change", () => {
    socket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: { [key]: select.value } }));
  });
};
