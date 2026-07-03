import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openRendersFolder: () => ipcRenderer.invoke("open-renders-folder"),
  appVersion: (): Promise<string> => ipcRenderer.invoke("app-version"),
});
