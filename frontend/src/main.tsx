import React from "react";
import ReactDOM from "react-dom/client";
import { getSession, readSession, setSession, type AuthSession } from "./auth";
import oasisLogo from "./assets/report-logo-transparent.png";
import "./index.css";
import { initializeBusinessStorage } from "./businessStorage";

declare global {
  interface Window {
    __OASIS_SESSION__?: AuthSession;
    __OASIS_PAGE__?: string;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

function AppLaunch({ App }: { App?: React.ComponentType }) {
  const [loading, setLoading] = React.useState(true);
  const overlay = React.useRef<HTMLElement>(null);
  const backdrop = React.useRef<HTMLDivElement>(null);
  const logo = React.useRef<HTMLImageElement>(null);

  React.useLayoutEffect(() => {
    if (!App || !overlay.current || !backdrop.current || !logo.current) return;
    const image = logo.current;
    if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches || !image.animate) {
      setLoading(false);
      return;
    }

    const start = getComputedStyle(image).transform;
    image.style.animation = "none";
    const box = image.getBoundingClientRect();
    if (!box.width || !box.height) {
      setLoading(false);
      return;
    }

    const target = document.querySelector("[data-loading-logo-target]")?.getBoundingClientRect();
    const frame = document.querySelector("[data-sidebar-logo]")?.getBoundingClientRect();
    const visible = target && frame && frame.left >= 0 && frame.width > 0;
    const x = visible ? target.left - box.left : 0;
    const y = visible ? target.top - box.top : 0;
    const scale = visible ? target.width / box.width : 1;
    const crop = visible ? Math.max(0, target.right - frame.right) / scale : 0;
    const duration = 680;
    const flight = image.animate(
      [
        { transform: start, clipPath: "inset(0 0px 0 0)", opacity: 1 },
        { transform: `translate(${x}px, ${y}px) scale(${scale})`, clipPath: `inset(0 ${crop}px 0 0)`, opacity: visible ? 1 : 0 },
      ],
      { duration, easing: "cubic-bezier(.22,.8,.3,1)", fill: "forwards" },
    );
    const reveal = backdrop.current.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration, fill: "forwards" },
    );
    void flight.finished.then(() => setLoading(false), () => {});
    return () => {
      flight.cancel();
      reveal.cancel();
    };
  }, [App]);

  return (
    <>
      {App && (
        <div inert={loading} data-launching={loading}>
          <React.StrictMode>
            <App />
          </React.StrictMode>
        </div>
      )}
      {loading && (
        <main ref={overlay} className="fixed inset-0 z-[100] grid place-items-center px-6 py-10 text-[#16344d]">
          <div ref={backdrop} className="absolute inset-0 bg-[#eff6fa]" />
          <div className="relative flex w-full flex-col items-center gap-8">
            <img
              ref={logo}
              src={oasisLogo}
              alt="OASIS Diagnostic & Laboratory Center"
              width={2172}
              height={724}
              className="h-auto w-full max-w-80 origin-top-left object-contain motion-safe:animate-[loading-logo-float_1.8s_ease-in-out_infinite]"
            />
            <p role="status" className={`flex items-center gap-3 text-sm ${App ? "invisible" : ""}`}>
              <span aria-hidden="true" className="size-5 rounded-full border-2 border-[#d0e3ef] border-t-[#2879ae] motion-safe:animate-spin" />
              Loading OASIS…
            </p>
          </div>
        </main>
      )}
    </>
  );
}

async function start() {
  root.render(<AppLaunch />);
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
    await initializeBusinessStorage();
    const { default: App } = await import("./App");
    root.render(<AppLaunch App={App} />);

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
