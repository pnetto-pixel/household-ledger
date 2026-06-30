import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Quando o novo service worker assume o controle (após skipWaiting),
// recarregamos a página para que os novos assets entrem em vigor
// imediatamente — sem precisar fechar/reabrir o app duas vezes.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
