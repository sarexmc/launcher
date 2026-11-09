const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sarex', {
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  on: (ch, fn) => ipcRenderer.on(ch, (_e, d) => fn(d))
});
