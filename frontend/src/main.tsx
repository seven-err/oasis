import React from "react";
import ReactDOM from "react-dom/client";
import { getSession, readSession, setSession, type AuthSession } from "./auth";
import "./index.css";

declare global {
  interface Window {
    __OASIS_SESSION__?: AuthSession;
    __OASIS_PAGE__?: string;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

async function start() {
  try {
    if (import.meta.env.VITE_TEAM_URL) {
      const teamLogin = new URL("/login", import.meta.env.VITE_TEAM_URL);
      if (teamLogin.protocol !== "https:")
        throw new Error("The shared OASIS address must use HTTPS.");
      if (teamLogin.origin !== window.location.origin) {
        window.location.replace(teamLogin.href);
        return;
      }
    }
    const session = window.__OASIS_SESSION__ ?? (await readSession());
    if (!session) {
      window.location.replace("/login");
      return;
    }
    if (session.user.mustChangePassword) {
      window.location.replace("/change-password");
      return;
    }
    setSession(session);
    const { default: App } = await import("./App");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    let checking = false;
    const checkSession = async () => {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const current = await readSession();
        if (!current) window.location.replace("/login");
        else if (current.user.mustChangePassword) window.location.replace("/change-password");
        else if (JSON.stringify(current) !== JSON.stringify(getSession())) window.location.reload();
      } catch {
        // Preserve the current view during a temporary connection loss.
      } finally {
        checking = false;
      }
    };
    window.addEventListener("focus", checkSession);
    window.setInterval(checkSession, 30_000);
  } catch (error) {
    root.render(
      <main className="mx-auto mt-24 max-w-md rounded-xl border border-[#d0e3ef] bg-white p-8 text-[#16344d]">
        <h1 className="text-xl font-semibold">OASIS</h1>
        <p role="alert" className="my-4">
          {error instanceof Error ? error.message : "Unable to load your account."}
        </p>
        <button className="primary-btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>,
    );
  }
}

void start();
