chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("controller.html") })
    .catch(error => console.error("Não foi possível abrir o APC Virtual:", error));
});
